import { Router } from 'express';
import { ALERT_EVENTS, CONFIG } from '../config/constants';
import { buildBookingGroupName, propertyCodeFromName } from '../platforms/whatsapp/groupNaming';
import { removeBooking, upsertBooking } from '../services/bookingStore';
import { syncBookingToCalendar } from '../services/calendar';
import { getGroupIdByLeadUid } from '../services/groupLeads';
import { fetchActiveLeads, fetchLead, fetchProperty, noteCache } from '../services/hostfully';
import { sendAlert } from '../services/notify';
import { enqueueGroupCreation, hasQueuedGroupCreation } from '../services/pendingGroupCreation';
import { enqueueHfMessage } from '../services/pendingHfMessages';
import { checkTelegramPhone } from '../services/telegram-client';
import { formatSeoulDate, guestName } from '../utils/format';
import { groupCreationEnabled, waClient } from './whatsapp';

const CALENDAR_SYNC_EVENTS = new Set([
    'NEW_BOOKING',
    'BOOKING_UPDATED',
    'BOOKING_CANCELLED',
]);

function syncCalendar(lead: any, property: any, eventType: string) {
    if (!CALENDAR_SYNC_EVENTS.has(eventType)) return;
    syncBookingToCalendar(lead, property, eventType).catch((e: any) =>
        console.warn(`⚠️ Calendar sync (${eventType}):`, e?.message)
    );
}

const recentAlerts = new Map<string, number>();

let bookingFallbackRunning = false;
let bookingFallbackBackoffUntil = 0;

const router = Router();

async function getLead(lead_uid: string) {
    try { return await fetchLead(lead_uid); } catch { return null; }
}

async function getProperty(property_uid: string) {
    try { return await fetchProperty(property_uid); } catch { return null; }
}

const resolvePropertyName = (lead: any, property: any) => {
    const raw = property?.name || lead?.propertyName || 'Unknown';
    return raw.replace(/\s*\((?:USD|MASTER|KRW)\)\s*$/i, '').trim();
};

const resolvePropertyCode = (lead: any, property: any) =>
    propertyCodeFromName(resolvePropertyName(lead, property)) || undefined;

async function checkPlatforms(phone: string, guest_name: string, propertyCode?: string) {
    const cleanPhone = phone.replace(/\D/g, '');
    const [onTelegram, onWhatsApp] = await Promise.all([
        checkTelegramPhone(phone).catch(() => false),
        waClient.isRegisteredUser(`${cleanPhone}@c.us`).catch(() => false),
    ]);
    await sendAlert(
        `📱 <b>Platform Check</b>\n─────────────────\n` +
        `👤 <b>Guest:</b> ${guest_name}\n` +
        `📞 <b>Phone:</b> ${phone}\n` +
        `💬 <b>WhatsApp:</b> ${onWhatsApp ? '✅ Found' : '❌ Not found'}\n` +
        `📩 <b>Telegram:</b> ${onTelegram ? '✅ Found' : '❌ Not found'}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { propertyCode }
    );
    return { onTelegram, onWhatsApp };
}

async function processBookingAutoGroup(lead_uid: string, property_uid: string, event_type: string) {
    const lead = await getLead(lead_uid);
    const property = await getProperty(property_uid);
    if (!lead) return;


    const info = lead.guestInformation;
    const guest_name = guestName(info, 'Unknown');
    const phone = info.phoneNumber || info.cellPhoneNumber;
    const status = lead.status || '';

    if (!['BOOKED', 'PAID_IN_FULL'].includes(status)) {
        console.log(`⏭️ Skip booking group (${lead_uid}): status=${status}`);
        return;
    }
    const existingGroupId = getGroupIdByLeadUid(lead_uid);
    if (existingGroupId) {
        console.log(`⏭️ Skip booking group (${lead_uid}): already linked to ${existingGroupId}`);
        return;
    }
    if (hasQueuedGroupCreation(lead_uid)) {
        console.log(`⏭️ Skip booking group (${lead_uid}): group creation already queued`);
        return;
    }

    const propertyCode = resolvePropertyCode(lead, property);
    await sendAlert(
        `🏨 <b>New Booking</b>\n─────────────────\n` +
        `👤 <b>Guest:</b> ${guest_name}\n` +
        `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
        `📅 <b>Check-in:</b> ${formatSeoulDate(lead.checkInLocalDateTime)}\n` +
        `🔚 <b>Check-out:</b> ${formatSeoulDate(lead.checkOutLocalDateTime)}\n` +
        `🌐 <b>Source:</b> ${(lead.type || 'DIRECT').replace(/_/g, ' ')}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { propertyCode }
    );

    // Alert if new booking already has notes
    const notes = (lead.notes || '').trim();
    if (notes && !noteCache.has(lead_uid)) {
        noteCache.set(lead_uid, notes);
        await sendAlert(
            `📝 <b>Guest Note (New Booking)</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${formatSeoulDate(lead.checkInLocalDateTime)}\n` +
            `📝 <b>New Note:</b> ${notes.split('\n').filter(Boolean).pop()}\n` +
            `─────────────────\n<i>via COZMO · Hostfully Platform</i>`,
            { propertyCode }
        );
    }

    if (!phone) {
        console.log(`⏭️ Skip group creation (${lead_uid}): no phone number`);
        await sendAlert(
            `⚠️ <b>No Phone — Group Skipped</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${formatSeoulDate(lead.checkInLocalDateTime)}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { propertyCode }
        );
        return;
    }

    const nationality = (info.countryCode || '').toUpperCase();
    const cleanPhone = (phone || '').replace(/\D/g, '');
    // Fall back to phone prefix when Hostfully countryCode is missing (e.g. some Airbnb bookings)
    const phoneNat = cleanPhone.startsWith('886') ? 'TW'
        : cleanPhone.startsWith('82') ? 'KR'
            : cleanPhone.startsWith('81') ? 'JP'
                : cleanPhone.startsWith('86') ? 'CN' : '';
    const effectiveNationality = nationality || phoneNat;
    const leadType = lead.type || 'DIRECT';
    const propCode = propertyCodeFromName(resolvePropertyName(lead, property));
    const step1LangMap: Record<string, 'EN' | 'JA' | 'ZH' | 'KO'> = { KR: 'KO', JP: 'JA', CN: 'ZH', TW: 'ZH' };
    const step1Lang = step1LangMap[effectiveNationality] ?? 'EN';
    const step2Country = (['KR', 'JP', 'TW', 'CN'].includes(effectiveNationality) ? effectiveNationality : 'OTHER') as 'KR' | 'JP' | 'TW' | 'CN' | 'OTHER';

    const suggestedGroupName = buildBookingGroupName(lead, property, guest_name);

    const PLATFORM_SKIP: Record<string, string> = {
        KR: '🇰🇷 Korean Guest — KakaoTalk',
        CN: '🇨🇳 Chinese Guest — WeChat',
        TW: '🇹🇼 Taiwanese Guest — LINE',
        JP: '🇯🇵 Japanese Guest — LINE',
    };
    if (PLATFORM_SKIP[effectiveNationality]) {
        if (CONFIG.SEND_INBOX_MESSAGE) {
            enqueueHfMessage({
                leadUid: lead_uid, guestName: guest_name, step: 1,
                langCode: step1Lang, propertyCode: propCode, leadType,
                fireAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
            });
            enqueueHfMessage({
                leadUid: lead_uid, guestName: guest_name, step: 'pre_payment',
                langCode: step1Lang, leadType,
                fireAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
            });
            enqueueHfMessage({
                leadUid: lead_uid, guestName: guest_name, step: 2,
                country: step2Country, leadType,
                fireAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            });
        }
        console.log(`⏭️ Manual messenger required (${lead_uid}): ${PLATFORM_SKIP[effectiveNationality]}`);
        const skipParts = PLATFORM_SKIP[effectiveNationality].split(' ');
        const skipFlag = skipParts[0];
        const skipText = skipParts.slice(1).join(' ');
        await sendAlert(
            `${skipFlag} <b>${skipText} — Manual Connect Required</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${formatSeoulDate(lead.checkInLocalDateTime)}\n` +
            `📱 <b>Platform:</b> ${PLATFORM_SKIP[effectiveNationality].split(' — ').pop()}\n` +
            `💬 <b>Suggested Group Name:</b> <code>${suggestedGroupName}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { propertyCode }
        );
        return;
    }

    // WA check must happen before step-2 timeout so we schedule the right message
    const { onWhatsApp } = await checkPlatforms(phone, guest_name, propertyCode);

    if (CONFIG.SEND_INBOX_MESSAGE) {
        enqueueHfMessage({
            leadUid: lead_uid, guestName: guest_name, step: 1,
            langCode: step1Lang, propertyCode: propCode, leadType,
            fireAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        });
        enqueueHfMessage({
            leadUid: lead_uid, guestName: guest_name, step: 'pre_payment',
            langCode: step1Lang, leadType,
            fireAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
        });
        enqueueHfMessage({
            leadUid: lead_uid, guestName: guest_name,
            step: onWhatsApp ? 2 : 'no_wa',
            country: step2Country, leadType,
            fireAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
    }

    if (!groupCreationEnabled) {
        console.log(`⏸️ Group creation disabled (${lead_uid})`);
        return;
    }

    const groupName = buildBookingGroupName(lead, property, `${info.firstName} ${info.lastName}`.trim());
    const propName = property?.name || lead?.propertyName || 'COZE Property';

    // Queue group creation to fire after Step 2 HF inbox is sent (~30 min)
    // flushPendingGroupCreations will also verify Step 2 is marked sent before proceeding
    enqueueGroupCreation({
        leadUid: lead_uid,
        propertyUid: property_uid,
        guestName: `${info.firstName} ${info.lastName}`,
        phone: onWhatsApp ? (phone || '') : '',
        property: propName,
        checkIn: lead.checkInLocalDateTime,
        checkOut: lead.checkOutLocalDateTime,
        nationality: effectiveNationality || 'US',
        leadStatus: status,
        leadType: lead.type || 'DIRECT',
        groupName,
        onWhatsApp,
        fireAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
}

router.post('/webhook', async (req, res) => {
    const { lead_uid, property_uid, event_type } = req.body;
    res.json({ success: true });

    if (!lead_uid) {
        console.log('📥 Webhook (no lead):', event_type);
        return;
    }
    console.log('📥 Webhook:', event_type, '| Lead:', lead_uid);

    if (event_type === 'NEW_INBOX_MESSAGE') {
        console.log('📨 Inbox message raw payload:', JSON.stringify(req.body));
        const messageBody = (req.body.messageBody || req.body.body || req.body.message || req.body.content || '').trim();
        const senderType: string = (req.body.senderType || req.body.sender_type || 'GUEST').toUpperCase();
        if (senderType !== 'GUEST') return;
        if (!messageBody) {
            console.log('📨 NEW_INBOX_MESSAGE skipped: empty body');
            return;
        }

        const [lead, property] = await Promise.all([getLead(lead_uid), getProperty(property_uid)]);
        const info = lead?.guestInformation;
        const guest_name = guestName(info, 'Unknown');

        await sendAlert(
            `💬 <b>Guest Note / Message</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${formatSeoulDate(lead?.checkInLocalDateTime)}\n` +
            `📝 <b>Message:</b> ${messageBody}\n` +
            `─────────────────\n<i>via COZMO · Hostfully Platform</i>`,
            { propertyCode: resolvePropertyCode(lead, property) }
        );
        return;
    }

    if (ALERT_EVENTS[event_type]) {
        const lead = await getLead(lead_uid);
        const property = await getProperty(property_uid);
        if (!lead) {
            await sendAlert(`${ALERT_EVENTS[event_type]}\n─────────────────\n⚠️ Lead: <code>${lead_uid}</code>`);
            return;
        }
        const info = lead.guestInformation;

        // NEW_BLOCKED_DATES — no alert needed, booking alert covers it
        if (event_type === 'NEW_BLOCKED_DATES') {
            syncCalendar(lead, property, event_type);
            return;
        }

        const guest_name = guestName(info, 'Unknown');
        const propCode = resolvePropertyCode(lead, property);
        await sendAlert(
            `${ALERT_EVENTS[event_type]}\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${formatSeoulDate(lead.checkInLocalDateTime)}\n` +
            `🔚 <b>Check-out:</b> ${formatSeoulDate(lead.checkOutLocalDateTime)}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { propertyCode: propCode }
        );
        if (event_type === 'BOOKING_CANCELLED') {
            removeBooking(lead_uid);
        } else {
            upsertBooking(lead, property);
        }
        syncCalendar(lead, property, event_type);

        if (event_type === 'BOOKING_UPDATED') {
            const notes = (lead.notes || '').trim();
            const prev = noteCache.get(lead_uid);
            noteCache.set(lead_uid, notes);
            const lastAlert = recentAlerts.get(lead_uid);
            if (lastAlert && Date.now() - lastAlert < 10_000) return;
            recentAlerts.set(lead_uid, Date.now());
            if (notes && notes !== prev) {
                await sendAlert(
                    `📝 <b>Guest Note Updated (Hostfully)</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${guest_name}\n` +
                    `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
                    `📅 <b>Check-in:</b> ${formatSeoulDate(lead.checkInLocalDateTime)}\n` +
                    `📝 <b>New Note:</b> ${notes.split('\n').filter(Boolean).pop()}\n` +
                    `─────────────────\n<i>via COZMO · Hostfully Platform</i>`,
                    { propertyCode: propCode }
                );
            }
            // Group creation is intentionally NOT triggered here — BOOKING_UPDATED fires
            // repeatedly (status changes, check-in date, etc.) and would cause duplicate groups.
            // Groups are only ever created on NEW_BOOKING.
        }
        return;
    }

    if (event_type !== 'NEW_BOOKING') return;
    const [lead, property] = await Promise.all([getLead(lead_uid), getProperty(property_uid)]);
    if (lead) {
        upsertBooking(lead, property);
        syncCalendar(lead, property, event_type);
    }
    await processBookingAutoGroup(lead_uid, property_uid, event_type);
});

export async function pollBookingAutoGroupFallback() {
    if (!CONFIG.BOOKING_FALLBACK_ENABLED) return;
    if (bookingFallbackRunning) return;
    if (Date.now() < bookingFallbackBackoffUntil) return;
    bookingFallbackRunning = true;
    try {
        const leads = await fetchActiveLeads();
        const now = Date.now();
        const eligible = leads.filter((lead: any) => {
            if (!lead?.uid || !lead?.status) return false;
            if (!['BOOKED', 'PAID_IN_FULL'].includes(lead.status)) return false;
            if (getGroupIdByLeadUid(lead.uid)) return false;
            const updatedRaw = lead.updatedUtcDateTime || lead.updatedDateTime || lead.createdUtcDateTime || lead.createdDateTime;
            const updatedTs = updatedRaw ? new Date(updatedRaw).getTime() : 0;
            if (!updatedTs || Number.isNaN(updatedTs)) return false;
            return now - updatedTs <= CONFIG.BOOKING_FALLBACK_LOOKBACK_MS;
        });
        if (!eligible.length) return;
        console.log(`🔁 Booking fallback poll: ${eligible.length} eligible lead(s)`);
        for (const lead of eligible) {
            const leadUid = lead.uid as string;
            const propertyUid = (lead.propertyUid || lead.propertyUidLegacy || '') as string;
            await processBookingAutoGroup(leadUid, propertyUid, 'BOOKING_FALLBACK_POLL');
        }
    } catch (e: any) {
        const status = e?.response?.status;
        if (status === 429) {
            bookingFallbackBackoffUntil = Date.now() + 60 * 60 * 1000;
            console.warn('⚠️ Booking fallback poll rate-limited (429). Backing off for 1 hour.');
        } else {
            console.error('❌ Booking fallback poll error:', e?.message || e);
        }
    } finally {
        bookingFallbackRunning = false;
    }
}

export default router;