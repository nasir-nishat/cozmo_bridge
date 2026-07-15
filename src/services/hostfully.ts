import axios from 'axios';
import { CONFIG } from '../config/constants';
import { sendAlert } from './notify';
import { guestName as formatGuestName, formatSeoulDate } from '../utils/format';
import { getBookingMsg, getBookingMsgKr, getPrePaymentMsg } from './sheets';

const headers = { 'X-HOSTFULLY-APIKEY': CONFIG.HOSTFULLY_API_KEY };
const HOSTFULLY_AGENCY_UID = CONFIG.HOSTFULLY_AGENCY_UID?.trim();

function requireAgencyUid() {
    if (!HOSTFULLY_AGENCY_UID) {
        const msg = 'HOSTFULLY_AGENCY_UID is missing in CONFIG; refusing Hostfully request';
        console.error(`❌ ${msg}`);
        throw new Error(msg);
    }
    return HOSTFULLY_AGENCY_UID;
}

async function hostfullyGet(path: string, params: Record<string, any> = {}) {
    const agencyUid = requireAgencyUid();
    return axios.get(`${CONFIG.HOSTFULLY_API_URL}${path}`, {
        headers,
        params: { ...params, agencyUid },
    });
}

export async function fetchLead(leadUid: string) {
    try {
        const res = await hostfullyGet(`/leads/${leadUid}`);
        return res.data.lead;
    } catch (e: any) {
        const status = e.response?.status;
        if (status === 404) throw Object.assign(new Error('Lead not found'), { status: 404 });
        console.error('❌ fetchLead error:', status, e.response?.data || e.message);
        throw e;
    }
}

export async function fetchProperty(propertyUid: string) {
    try {
        const res = await hostfullyGet(`/properties/${propertyUid}`);
        return res.data.property;
    } catch (e: any) {
        const status = e.response?.status;
        if (status === 404) return null;
        console.error('❌ fetchProperty error:', status, e.response?.data || e.message);
        throw e;
    }
}

export async function lookupLeadByPhone(phone: string) {
    const res = await hostfullyGet('/leads', { phone });
    return res.data.leads?.[0] || null;
}

export async function prependGuestNote(leadUid: string, block: string): Promise<boolean> {
    const lead = await fetchLead(leadUid);
    const existing: string = lead.notes || '';
    const combined = `${block}\n${existing}`.trim().slice(0, 2000);
    const res = await axios.patch(
        `${CONFIG.HOSTFULLY_API_URL}/leads/${leadUid}`,
        { notes: combined },
        { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    return res.status === 200;
}

export async function saveGuestNote(leadUid: string, newNote: string): Promise<boolean> {
    const lead = await fetchLead(leadUid);
    const existing: string = lead.notes || '';
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
    const appended = `${existing}\n[${timestamp}] ${newNote}`.trim();
    const truncated = appended.slice(-256);

    const res = await axios.patch(
        `${CONFIG.HOSTFULLY_API_URL}/leads/${leadUid}`,
        { notes: truncated },
        { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    return res.status === 200;
}

// Track last known notes per lead
export const noteCache = new Map<string, string>();
const noteAlertCooldown = new Map<string, number>();

async function fetchLeadsByStatus(status: string): Promise<any[]> {
    const res = await hostfullyGet('/leads', { status, limit: 200 });
    return res.data.leads || [];
}

export async function fetchActiveLeads() {
    const [booked, paid] = await Promise.all([
        fetchLeadsByStatus('BOOKED'),
        fetchLeadsByStatus('PAID_IN_FULL'),
    ]);
    return [...booked, ...paid];
}

export async function fetchLeadsPage(cursor?: string, limit?: number): Promise<{ leads: any[]; nextCursor: string | null }> {
    const params: Record<string, any> = {};
    if (cursor) params._cursor = cursor;
    if (limit) params.limit = limit;
    const res = await hostfullyGet('/leads', params);
    return {
        leads: res.data.leads || [],
        nextCursor: res.data._paging?._nextCursor || null,
    };
}

export async function fetchPropertiesPage(cursor?: string): Promise<{ properties: any[]; nextCursor: string | null }> {
    const params: Record<string, any> = { limit: 100 };
    if (cursor) params._cursor = cursor;
    const res = await hostfullyGet('/properties', params);
    return {
        properties: res.data.properties || [],
        nextCursor: res.data._paging?._nextCursor || null,
    };
}

export async function fetchLeadsCheckingOut(dateStr: string): Promise<any[]> {
    const after = `${dateStr}T00:00:00`;
    const before = `${dateStr}T23:59:59`;
    const [booked, paid] = await Promise.all([
        hostfullyGet('/leads', { status: 'BOOKED', checkOutAfter: after, checkOutBefore: before, limit: 200 }),
        hostfullyGet('/leads', { status: 'PAID_IN_FULL', checkOutAfter: after, checkOutBefore: before, limit: 200 }),
    ]);
    return [...(booked.data.leads || []), ...(paid.data.leads || [])];
}

export async function resolvePropertyNameForLead(lead: any): Promise<string> {
    if (lead?.propertyName) return lead.propertyName;
    const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy;
    if (!propertyUid) return 'Unknown';
    try {
        const property = await fetchProperty(propertyUid);
        return property?.name || 'Unknown';
    } catch {
        return 'Unknown';
    }
}

const HF_EMAIL_FALLBACK_SUBJECT = 'A Message from COZE Hospitality — Guest Care';

async function sendHfInboxMessage(leadUid: string, text: string, label: string, emailSubject: string = HF_EMAIL_FALLBACK_SUBJECT): Promise<void> {
    const msgUrl = CONFIG.HOSTFULLY_API_URL.replace(/\/api\/v3.*$/, '/api/v3.3/messages');
    const post = (body: Record<string, any>) =>
        axios.post(msgUrl, body, { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 15_000 });
    try {
        const res = await post({ type: 'DIRECT_MESSAGE', leadUid, content: { text } });
        console.log(`✅ HF inbox [${label}] → lead ${leadUid} (status: ${res.data?.message?.status})`);
        return;
    } catch (e: any) {
        // Manually-created leads (source HOSTFULLY_UI) reject DIRECT_MESSAGE — fall back to EMAIL
        const apiMsg: string = e?.response?.data?.apiErrorMessage || '';
        const sourceBlocked = e?.response?.status === 400 && /not supported for this lead due to its source/i.test(apiMsg);
        if (!sourceBlocked) throw e;

        const lead = await fetchLead(leadUid);
        const email = lead?.guestInformation?.email;
        if (!email) {
            await sendAlert(
                `🚨 <b>HF Message Undeliverable</b>\n─────────────────\n` +
                `👤 <b>Lead:</b> ${leadUid}\n` +
                `📋 <b>Message:</b> ${label}\n` +
                `📝 <b>Reason:</b> lead source blocks DIRECT_MESSAGE and guest has no email\n` +
                `─────────────────\n<i>Send manually via Hostfully · COZMO</i>`,
                { useTestJandi: true }
            ).catch(() => { });
            throw e;
        }
        const res = await post({ type: 'EMAIL', leadUid, content: { subject: emailSubject, text } });
        console.log(`✅ HF inbox [${label}] → lead ${leadUid} via EMAIL fallback (status: ${res.data?.message?.status})`);
        await sendAlert(
            `🚨 <b>HF Inbox → EMAIL Fallback Used</b>\n─────────────────\n` +
            `👤 <b>Lead:</b> ${leadUid}\n` +
            `📋 <b>Message:</b> ${label}\n` +
            `📧 <b>Sent to:</b> ${email}\n` +
            `📝 <b>Reason:</b> lead source blocks DIRECT_MESSAGE (manual booking)\n` +
            `─────────────────\n<i>via COZMO · Hostfully</i>`,
            { useTestJandi: true }
        ).catch(() => { });
    }
}

function applyGuestName(template: string, guestFullName: string): string {
    const firstName = guestFullName.split(/\s+/)[0] || guestFullName;
    return template
        .replace(/\[\$GUEST_NAME\$\]/g, guestFullName)
        .replace(/\[\$GUEST_FIRST_NAME\$\]/g, firstName);
}

export async function sendInboxMessage(
    leadUid: string,
    guestFullName: string,
    langCode: 'EN' | 'JA' | 'ZH' | 'KO' = 'EN',
    leadType: string = 'DIRECT',
    propertyCode?: string
): Promise<void> {
    if (leadType === 'DIRECT') {
        console.log(`⏭️ sendInboxMessage skipped for DIRECT booking (${leadUid}) — using messenger channel instead`);
        return;
    }
    let template: string;
    if (langCode === 'KO' && propertyCode) {
        template = await getBookingMsgKr(propertyCode);
        if (!template) template = await getBookingMsg('booking_confirmation', 'EN');
    } else {
        template = await getBookingMsg('booking_confirmation', langCode);
    }
    if (!template) {
        console.warn(`⚠️ No booking_confirmation template (lang=${langCode}, property=${propertyCode})`);
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), `step1 ${langCode}`, 'Your Booking Confirmation — COZE Hospitality');
}

const STEP2_KEY: Record<string, { key: string; lang: string }> = {
    CN: { key: 'request_contact_point_wechat', lang: 'ZH-CN' },
    TW: { key: 'request_contact_point_line', lang: 'ZH-CN' },
    JP: { key: 'request_contact_point_line', lang: 'JA' },
    KR: { key: 'auto_group_chat_notification_kr', lang: 'KR' },
    OTHER: { key: 'auto_group_chat_notification_eng', lang: 'EN' },
};

export async function sendStep2Message(
    leadUid: string,
    guestFullName: string,
    country: 'KR' | 'JP' | 'TW' | 'CN' | 'OTHER',
    leadType: string
): Promise<void> {
    if (leadType === 'DIRECT') {
        console.log(`⏭️ sendStep2Message skipped for DIRECT booking (${leadUid})`);
        return;
    }
    const { key, lang } = STEP2_KEY[country] ?? STEP2_KEY.OTHER;
    const template = await getBookingMsg(key, lang);
    if (!template) {
        console.warn(`⚠️ No step2 template (key=${key}, lang=${lang})`);
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), `step2 ${country}`, 'Your COZE Concierge Group Chat — COZE Hospitality');
}

export async function sendWaInviteFallbackMessage(leadUid: string, guestFullName: string): Promise<void> {
    const template = await getBookingMsg('request_wa_invitaion_en', 'EN');
    if (!template) {
        console.warn('⚠️ No request_wa_invitaion_en template in sheet');
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), 'fallback 3.1 wa-invite', 'Your WhatsApp Concierge Channel — COZE Hospitality');
}

// Sends the actual WA group invite link via HF inbox — used for both privacy-blocked and no-WA guests
export async function sendHfInviteLink(leadUid: string, guestFullName: string, inviteLink: string): Promise<void> {
    const template = await getBookingMsg('request_wa_invitaion_en', 'EN');
    const base = template ? applyGuestName(template, guestFullName) : `Hi ${guestFullName}, your WhatsApp group is ready.`;
    await sendHfInboxMessage(leadUid, `${base}\n\n${inviteLink}`, 'wa-invite-link', 'Your WhatsApp Group Invite — COZE Hospitality');
}

export async function sendNoWaFallbackMessage(leadUid: string, guestFullName: string): Promise<void> {
    const template = await getBookingMsg('request_contact_point_messenger_en', 'EN');
    if (!template) {
        console.warn('⚠️ No request_contact_point_messenger_en template in sheet');
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), 'fallback 3.2 no-wa', 'Stay Connected with COZE — COZE Hospitality');
}

const PRE_PAYMENT_KEY: Record<string, string> = {
    BOOKING_COM: 'pre_payment_msg_notice_booking',
    VRBO: 'pre_payment_msg_notice_vrbo',
    HOMEAWAY: 'pre_payment_msg_notice_vrbo',
};

export async function sendPrePaymentMessage(
    leadUid: string,
    guestFullName: string,
    langCode: string,
    leadType: string
): Promise<void> {
    const key = PRE_PAYMENT_KEY[leadType];
    if (!key) {
        console.log(`⏭️ sendPrePaymentMessage skipped — leadType=${leadType} not eligible`);
        return;
    }
    const template = await getPrePaymentMsg(key, langCode);
    if (!template) {
        console.warn(`⚠️ No pre_payment template (key=${key}, lang=${langCode})`);
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), `pre_payment ${leadType} ${langCode}`, 'Payment Notice — COZE Hospitality');
}

export async function pollLeadNotes() {
    console.log('🔍 Polling Hostfully notes...');
    try {
        const leads = await fetchActiveLeads();
        console.log(`📋 Active leads fetched: ${leads.length}`);
        for (const lead of leads) {
            const uid = lead.uid;
            const currentNotes: string = lead.notes || '';
            const lastNotes = noteCache.get(uid);
            if (lastNotes === undefined) {
                console.log(`🌱 Seeding cache for lead: ${uid}`);
                noteCache.set(uid, currentNotes);
                continue;
            }
            if (currentNotes !== lastNotes) {
                console.log(`📝 Note changed for lead: ${uid} — cache updated`);
                noteCache.set(uid, currentNotes);
                if (!currentNotes) continue;

                // Dual-confirmation alert path: if webhook misses, polling still notifies.
                const lastAlertAt = noteAlertCooldown.get(uid) || 0;
                if (Date.now() - lastAlertAt < 30_000) continue;
                noteAlertCooldown.set(uid, Date.now());

                const info = lead.guestInformation || {};
                const guestName = formatGuestName(info, 'Unknown');
                const checkIn = formatSeoulDate(lead.checkInLocalDateTime);
                const propertyName = await resolvePropertyNameForLead(lead);

                await sendAlert(
                    `📝 <b>Guest Note Updated (Polling)</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${guestName}\n` +
                    `🏠 <b>Property:</b> ${propertyName}\n` +
                    `📅 <b>Check-in:</b> ${checkIn}\n` +
                    `📝 <b>Note:</b> ${currentNotes}\n` +
                    `─────────────────\n<i>via COZMO · Hostfully Poller</i>`
                );
            }
        }
    } catch (e: any) {
        console.error('❌ pollLeadNotes error:', e?.message || e);
    }
}