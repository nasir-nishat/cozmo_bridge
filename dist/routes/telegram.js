"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollBookingAutoGroupFallback = pollBookingAutoGroupFallback;
const express_1 = require("express");
const constants_1 = require("../config/constants");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const bookingStore_1 = require("../services/bookingStore");
const calendar_1 = require("../services/calendar");
const groupLeads_1 = require("../services/groupLeads");
const hostfully_1 = require("../services/hostfully");
const notify_1 = require("../services/notify");
const pendingGroupCreation_1 = require("../services/pendingGroupCreation");
const pendingHfMessages_1 = require("../services/pendingHfMessages");
const telegram_client_1 = require("../services/telegram-client");
const format_1 = require("../utils/format");
const whatsapp_1 = require("./whatsapp");
const CALENDAR_SYNC_EVENTS = new Set([
    'NEW_BOOKING',
    'BOOKING_UPDATED',
    'BOOKING_CANCELLED',
]);
function syncCalendar(lead, property, eventType) {
    if (!CALENDAR_SYNC_EVENTS.has(eventType))
        return;
    (0, calendar_1.syncBookingToCalendar)(lead, property, eventType).catch((e) => console.warn(`⚠️ Calendar sync (${eventType}):`, e?.message));
}
const recentAlerts = new Map();
let bookingFallbackRunning = false;
let bookingFallbackBackoffUntil = 0;
const router = (0, express_1.Router)();
async function getLead(lead_uid) {
    try {
        return await (0, hostfully_1.fetchLead)(lead_uid);
    }
    catch {
        return null;
    }
}
async function getProperty(property_uid) {
    try {
        return await (0, hostfully_1.fetchProperty)(property_uid);
    }
    catch {
        return null;
    }
}
const resolvePropertyName = (lead, property) => {
    const raw = property?.name || lead?.propertyName || 'Unknown';
    return raw.replace(/\s*\((?:USD|MASTER|KRW)\)\s*$/i, '').trim();
};
const resolvePropertyCode = (lead, property) => (0, groupNaming_1.propertyCodeFromName)(resolvePropertyName(lead, property)) || undefined;
async function checkPlatforms(phone, guest_name, propertyCode) {
    const cleanPhone = phone.replace(/\D/g, '');
    const [onTelegram, onWhatsApp] = await Promise.all([
        (0, telegram_client_1.checkTelegramPhone)(phone).catch(() => false),
        whatsapp_1.waClient.isRegisteredUser(`${cleanPhone}@c.us`).catch(() => false),
    ]);
    await (0, notify_1.sendAlert)(`📱 <b>Platform Check</b>\n─────────────────\n` +
        `👤 <b>Guest:</b> ${guest_name}\n` +
        `📞 <b>Phone:</b> ${phone}\n` +
        `💬 <b>WhatsApp:</b> ${onWhatsApp ? '✅ Found' : '❌ Not found'}\n` +
        `📩 <b>Telegram:</b> ${onTelegram ? '✅ Found' : '❌ Not found'}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode });
    return { onTelegram, onWhatsApp };
}
async function processBookingAutoGroup(lead_uid, property_uid, event_type) {
    const lead = await getLead(lead_uid);
    const property = await getProperty(property_uid);
    if (!lead)
        return;
    const info = lead.guestInformation;
    const guest_name = (0, format_1.guestName)(info, 'Unknown');
    const phone = info.phoneNumber || info.cellPhoneNumber;
    const status = lead.status || '';
    if (!['BOOKED', 'PAID_IN_FULL'].includes(status)) {
        console.log(`⏭️ Skip booking group (${lead_uid}): status=${status}`);
        return;
    }
    const existingGroupId = (0, groupLeads_1.getGroupIdByLeadUid)(lead_uid);
    if (existingGroupId) {
        console.log(`⏭️ Skip booking group (${lead_uid}): already linked to ${existingGroupId}`);
        return;
    }
    if ((0, pendingGroupCreation_1.hasQueuedGroupCreation)(lead_uid)) {
        console.log(`⏭️ Skip booking group (${lead_uid}): group creation already queued`);
        return;
    }
    const propertyCode = resolvePropertyCode(lead, property);
    await (0, notify_1.sendAlert)(`🏨 <b>New Booking</b>\n─────────────────\n` +
        `👤 <b>Guest:</b> ${guest_name}\n` +
        `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
        `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead.checkInLocalDateTime)}\n` +
        `🔚 <b>Check-out:</b> ${(0, format_1.formatSeoulDate)(lead.checkOutLocalDateTime)}\n` +
        `🌐 <b>Source:</b> ${(lead.type || 'DIRECT').replace(/_/g, ' ')}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode });
    // Alert if new booking already has notes
    const notes = (lead.notes || '').trim();
    if (notes && !hostfully_1.noteCache.has(lead_uid)) {
        hostfully_1.noteCache.set(lead_uid, notes);
        await (0, notify_1.sendAlert)(`📝 <b>Guest Note (New Booking)</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead.checkInLocalDateTime)}\n` +
            `📝 <b>New Note:</b> ${notes.split('\n').filter(Boolean).pop()}\n` +
            `─────────────────\n<i>via COZMO · Hostfully Platform</i>`, { propertyCode });
    }
    if (!phone) {
        console.log(`⏭️ Skip group creation (${lead_uid}): no phone number`);
        await (0, notify_1.sendAlert)(`⚠️ <b>No Phone — Group Skipped</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead.checkInLocalDateTime)}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode });
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
    const propCode = (0, groupNaming_1.propertyCodeFromName)(resolvePropertyName(lead, property));
    const step1LangMap = { KR: 'KO', JP: 'JA', CN: 'ZH', TW: 'ZH' };
    const step1Lang = step1LangMap[effectiveNationality] ?? 'EN';
    const step2Country = (['KR', 'JP', 'TW', 'CN'].includes(effectiveNationality) ? effectiveNationality : 'OTHER');
    const suggestedGroupName = (0, groupNaming_1.buildBookingGroupName)(lead, property, guest_name);
    const PLATFORM_SKIP = {
        KR: '🇰🇷 Korean Guest — KakaoTalk',
        CN: '🇨🇳 Chinese Guest — WeChat',
        TW: '🇹🇼 Taiwanese Guest — LINE',
        JP: '🇯🇵 Japanese Guest — LINE',
    };
    if (PLATFORM_SKIP[effectiveNationality]) {
        if (constants_1.CONFIG.SEND_INBOX_MESSAGE) {
            (0, pendingHfMessages_1.enqueueHfMessage)({
                leadUid: lead_uid, guestName: guest_name, step: 1,
                langCode: step1Lang, propertyCode: propCode, leadType,
                fireAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
            });
            (0, pendingHfMessages_1.enqueueHfMessage)({
                leadUid: lead_uid, guestName: guest_name, step: 'pre_payment',
                langCode: step1Lang, leadType,
                fireAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
            });
            (0, pendingHfMessages_1.enqueueHfMessage)({
                leadUid: lead_uid, guestName: guest_name, step: 2,
                country: step2Country, leadType,
                fireAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            });
        }
        console.log(`⏭️ Manual messenger required (${lead_uid}): ${PLATFORM_SKIP[effectiveNationality]}`);
        const skipParts = PLATFORM_SKIP[effectiveNationality].split(' ');
        const skipFlag = skipParts[0];
        const skipText = skipParts.slice(1).join(' ');
        await (0, notify_1.sendAlert)(`${skipFlag} <b>${skipText} — Manual Connect Required</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead.checkInLocalDateTime)}\n` +
            `📱 <b>Platform:</b> ${PLATFORM_SKIP[effectiveNationality].split(' — ').pop()}\n` +
            `💬 <b>Suggested Group Name:</b> <code>${suggestedGroupName}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode });
        return;
    }
    // WA check must happen before step-2 timeout so we schedule the right message
    const { onWhatsApp } = await checkPlatforms(phone, guest_name, propertyCode);
    if (constants_1.CONFIG.SEND_INBOX_MESSAGE) {
        (0, pendingHfMessages_1.enqueueHfMessage)({
            leadUid: lead_uid, guestName: guest_name, step: 1,
            langCode: step1Lang, propertyCode: propCode, leadType,
            fireAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        });
        (0, pendingHfMessages_1.enqueueHfMessage)({
            leadUid: lead_uid, guestName: guest_name, step: 'pre_payment',
            langCode: step1Lang, leadType,
            fireAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
        });
        (0, pendingHfMessages_1.enqueueHfMessage)({
            leadUid: lead_uid, guestName: guest_name,
            step: onWhatsApp ? 2 : 'no_wa',
            country: step2Country, leadType,
            fireAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
    }
    if (!whatsapp_1.groupCreationEnabled) {
        console.log(`⏸️ Group creation disabled (${lead_uid})`);
        return;
    }
    const groupName = (0, groupNaming_1.buildBookingGroupName)(lead, property, `${info.firstName} ${info.lastName}`.trim());
    const propName = property?.name || lead?.propertyName || 'COZE Property';
    // Queue group creation to fire after Step 2 HF inbox is sent (~30 min)
    // flushPendingGroupCreations will also verify Step 2 is marked sent before proceeding
    (0, pendingGroupCreation_1.enqueueGroupCreation)({
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
        const senderType = (req.body.senderType || req.body.sender_type || 'GUEST').toUpperCase();
        if (senderType !== 'GUEST')
            return;
        if (!messageBody) {
            console.log('📨 NEW_INBOX_MESSAGE skipped: empty body');
            return;
        }
        const [lead, property] = await Promise.all([getLead(lead_uid), getProperty(property_uid)]);
        const info = lead?.guestInformation;
        const guest_name = (0, format_1.guestName)(info, 'Unknown');
        await (0, notify_1.sendAlert)(`💬 <b>Guest Note / Message</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead?.checkInLocalDateTime)}\n` +
            `📝 <b>Message:</b> ${messageBody}\n` +
            `─────────────────\n<i>via COZMO · Hostfully Platform</i>`, { propertyCode: resolvePropertyCode(lead, property) });
        return;
    }
    if (constants_1.ALERT_EVENTS[event_type]) {
        const lead = await getLead(lead_uid);
        const property = await getProperty(property_uid);
        if (!lead) {
            await (0, notify_1.sendAlert)(`${constants_1.ALERT_EVENTS[event_type]}\n─────────────────\n⚠️ Lead: <code>${lead_uid}</code>`);
            return;
        }
        const info = lead.guestInformation;
        // NEW_BLOCKED_DATES — no alert needed, booking alert covers it
        if (event_type === 'NEW_BLOCKED_DATES') {
            syncCalendar(lead, property, event_type);
            return;
        }
        const guest_name = (0, format_1.guestName)(info, 'Unknown');
        const propCode = resolvePropertyCode(lead, property);
        await (0, notify_1.sendAlert)(`${constants_1.ALERT_EVENTS[event_type]}\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
            `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead.checkInLocalDateTime)}\n` +
            `🔚 <b>Check-out:</b> ${(0, format_1.formatSeoulDate)(lead.checkOutLocalDateTime)}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode: propCode });
        if (event_type === 'BOOKING_CANCELLED') {
            (0, bookingStore_1.removeBooking)(lead_uid);
        }
        else {
            (0, bookingStore_1.upsertBooking)(lead, property);
        }
        syncCalendar(lead, property, event_type);
        if (event_type === 'BOOKING_UPDATED') {
            const notes = (lead.notes || '').trim();
            const prev = hostfully_1.noteCache.get(lead_uid);
            hostfully_1.noteCache.set(lead_uid, notes);
            const lastAlert = recentAlerts.get(lead_uid);
            if (lastAlert && Date.now() - lastAlert < 10000)
                return;
            recentAlerts.set(lead_uid, Date.now());
            if (notes && notes !== prev) {
                await (0, notify_1.sendAlert)(`📝 <b>Guest Note Updated (Hostfully)</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${guest_name}\n` +
                    `🏠 <b>Property:</b> ${resolvePropertyName(lead, property)}\n` +
                    `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead.checkInLocalDateTime)}\n` +
                    `📝 <b>New Note:</b> ${notes.split('\n').filter(Boolean).pop()}\n` +
                    `─────────────────\n<i>via COZMO · Hostfully Platform</i>`, { propertyCode: propCode });
            }
            // Group creation is intentionally NOT triggered here — BOOKING_UPDATED fires
            // repeatedly (status changes, check-in date, etc.) and would cause duplicate groups.
            // Groups are only ever created on NEW_BOOKING.
        }
        return;
    }
    if (event_type !== 'NEW_BOOKING')
        return;
    const [lead, property] = await Promise.all([getLead(lead_uid), getProperty(property_uid)]);
    if (lead) {
        (0, bookingStore_1.upsertBooking)(lead, property);
        syncCalendar(lead, property, event_type);
    }
    await processBookingAutoGroup(lead_uid, property_uid, event_type);
});
async function pollBookingAutoGroupFallback() {
    if (!constants_1.CONFIG.BOOKING_FALLBACK_ENABLED)
        return;
    if (bookingFallbackRunning)
        return;
    if (Date.now() < bookingFallbackBackoffUntil)
        return;
    bookingFallbackRunning = true;
    try {
        const leads = await (0, hostfully_1.fetchActiveLeads)();
        const now = Date.now();
        const eligible = leads.filter((lead) => {
            if (!lead?.uid || !lead?.status)
                return false;
            if (!['BOOKED', 'PAID_IN_FULL'].includes(lead.status))
                return false;
            if ((0, groupLeads_1.getGroupIdByLeadUid)(lead.uid))
                return false;
            const updatedRaw = lead.updatedUtcDateTime || lead.updatedDateTime || lead.createdUtcDateTime || lead.createdDateTime;
            const updatedTs = updatedRaw ? new Date(updatedRaw).getTime() : 0;
            if (!updatedTs || Number.isNaN(updatedTs))
                return false;
            return now - updatedTs <= constants_1.CONFIG.BOOKING_FALLBACK_LOOKBACK_MS;
        });
        if (!eligible.length)
            return;
        console.log(`🔁 Booking fallback poll: ${eligible.length} eligible lead(s)`);
        for (const lead of eligible) {
            const leadUid = lead.uid;
            const propertyUid = (lead.propertyUid || lead.propertyUidLegacy || '');
            await processBookingAutoGroup(leadUid, propertyUid, 'BOOKING_FALLBACK_POLL');
        }
    }
    catch (e) {
        const status = e?.response?.status;
        if (status === 429) {
            bookingFallbackBackoffUntil = Date.now() + 60 * 60 * 1000;
            console.warn('⚠️ Booking fallback poll rate-limited (429). Backing off for 1 hour.');
        }
        else {
            console.error('❌ Booking fallback poll error:', e?.message || e);
        }
    }
    finally {
        bookingFallbackRunning = false;
    }
}
exports.default = router;
