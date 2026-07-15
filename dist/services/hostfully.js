"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.noteCache = void 0;
exports.fetchLead = fetchLead;
exports.fetchProperty = fetchProperty;
exports.lookupLeadByPhone = lookupLeadByPhone;
exports.prependGuestNote = prependGuestNote;
exports.saveGuestNote = saveGuestNote;
exports.fetchActiveLeads = fetchActiveLeads;
exports.fetchLeadsPage = fetchLeadsPage;
exports.fetchPropertiesPage = fetchPropertiesPage;
exports.fetchLeadsCheckingOut = fetchLeadsCheckingOut;
exports.resolvePropertyNameForLead = resolvePropertyNameForLead;
exports.sendInboxMessage = sendInboxMessage;
exports.sendStep2Message = sendStep2Message;
exports.sendWaInviteFallbackMessage = sendWaInviteFallbackMessage;
exports.sendHfInviteLink = sendHfInviteLink;
exports.sendNoWaFallbackMessage = sendNoWaFallbackMessage;
exports.sendPrePaymentMessage = sendPrePaymentMessage;
exports.pollLeadNotes = pollLeadNotes;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
const notify_1 = require("./notify");
const format_1 = require("../utils/format");
const sheets_1 = require("./sheets");
const headers = { 'X-HOSTFULLY-APIKEY': constants_1.CONFIG.HOSTFULLY_API_KEY };
const HOSTFULLY_AGENCY_UID = constants_1.CONFIG.HOSTFULLY_AGENCY_UID?.trim();
function requireAgencyUid() {
    if (!HOSTFULLY_AGENCY_UID) {
        const msg = 'HOSTFULLY_AGENCY_UID is missing in CONFIG; refusing Hostfully request';
        console.error(`❌ ${msg}`);
        throw new Error(msg);
    }
    return HOSTFULLY_AGENCY_UID;
}
async function hostfullyGet(path, params = {}) {
    const agencyUid = requireAgencyUid();
    return axios_1.default.get(`${constants_1.CONFIG.HOSTFULLY_API_URL}${path}`, {
        headers,
        params: { ...params, agencyUid },
    });
}
async function fetchLead(leadUid) {
    try {
        const res = await hostfullyGet(`/leads/${leadUid}`);
        return res.data.lead;
    }
    catch (e) {
        const status = e.response?.status;
        if (status === 404)
            throw Object.assign(new Error('Lead not found'), { status: 404 });
        console.error('❌ fetchLead error:', status, e.response?.data || e.message);
        throw e;
    }
}
async function fetchProperty(propertyUid) {
    try {
        const res = await hostfullyGet(`/properties/${propertyUid}`);
        return res.data.property;
    }
    catch (e) {
        const status = e.response?.status;
        if (status === 404)
            return null;
        console.error('❌ fetchProperty error:', status, e.response?.data || e.message);
        throw e;
    }
}
async function lookupLeadByPhone(phone) {
    const res = await hostfullyGet('/leads', { phone });
    return res.data.leads?.[0] || null;
}
async function prependGuestNote(leadUid, block) {
    const lead = await fetchLead(leadUid);
    const existing = lead.notes || '';
    const combined = `${block}\n${existing}`.trim().slice(0, 2000);
    const res = await axios_1.default.patch(`${constants_1.CONFIG.HOSTFULLY_API_URL}/leads/${leadUid}`, { notes: combined }, { headers: { ...headers, 'Content-Type': 'application/json' } });
    return res.status === 200;
}
async function saveGuestNote(leadUid, newNote) {
    const lead = await fetchLead(leadUid);
    const existing = lead.notes || '';
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
    const appended = `${existing}\n[${timestamp}] ${newNote}`.trim();
    const truncated = appended.slice(-256);
    const res = await axios_1.default.patch(`${constants_1.CONFIG.HOSTFULLY_API_URL}/leads/${leadUid}`, { notes: truncated }, { headers: { ...headers, 'Content-Type': 'application/json' } });
    return res.status === 200;
}
// Track last known notes per lead
exports.noteCache = new Map();
const noteAlertCooldown = new Map();
async function fetchLeadsByStatus(status) {
    const res = await hostfullyGet('/leads', { status, limit: 200 });
    return res.data.leads || [];
}
async function fetchActiveLeads() {
    const [booked, paid] = await Promise.all([
        fetchLeadsByStatus('BOOKED'),
        fetchLeadsByStatus('PAID_IN_FULL'),
    ]);
    return [...booked, ...paid];
}
async function fetchLeadsPage(cursor, limit) {
    const params = {};
    if (cursor)
        params._cursor = cursor;
    if (limit)
        params.limit = limit;
    const res = await hostfullyGet('/leads', params);
    return {
        leads: res.data.leads || [],
        nextCursor: res.data._paging?._nextCursor || null,
    };
}
async function fetchPropertiesPage(cursor) {
    const params = { limit: 100 };
    if (cursor)
        params._cursor = cursor;
    const res = await hostfullyGet('/properties', params);
    return {
        properties: res.data.properties || [],
        nextCursor: res.data._paging?._nextCursor || null,
    };
}
async function fetchLeadsCheckingOut(dateStr) {
    const after = `${dateStr}T00:00:00`;
    const before = `${dateStr}T23:59:59`;
    const [booked, paid] = await Promise.all([
        hostfullyGet('/leads', { status: 'BOOKED', checkOutAfter: after, checkOutBefore: before, limit: 200 }),
        hostfullyGet('/leads', { status: 'PAID_IN_FULL', checkOutAfter: after, checkOutBefore: before, limit: 200 }),
    ]);
    return [...(booked.data.leads || []), ...(paid.data.leads || [])];
}
async function resolvePropertyNameForLead(lead) {
    if (lead?.propertyName)
        return lead.propertyName;
    const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy;
    if (!propertyUid)
        return 'Unknown';
    try {
        const property = await fetchProperty(propertyUid);
        return property?.name || 'Unknown';
    }
    catch {
        return 'Unknown';
    }
}
const HF_EMAIL_FALLBACK_SUBJECT = 'A Message from COZE Hospitality — Guest Care';
async function sendHfInboxMessage(leadUid, text, label, emailSubject = HF_EMAIL_FALLBACK_SUBJECT) {
    const msgUrl = constants_1.CONFIG.HOSTFULLY_API_URL.replace(/\/api\/v3.*$/, '/api/v3.3/messages');
    const post = (body) => axios_1.default.post(msgUrl, body, { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 15000 });
    try {
        const res = await post({ type: 'DIRECT_MESSAGE', leadUid, content: { text } });
        console.log(`✅ HF inbox [${label}] → lead ${leadUid} (status: ${res.data?.message?.status})`);
        return;
    }
    catch (e) {
        // Manually-created leads (source HOSTFULLY_UI) reject DIRECT_MESSAGE — fall back to EMAIL
        const apiMsg = e?.response?.data?.apiErrorMessage || '';
        const sourceBlocked = e?.response?.status === 400 && /not supported for this lead due to its source/i.test(apiMsg);
        if (!sourceBlocked)
            throw e;
        const lead = await fetchLead(leadUid);
        const email = lead?.guestInformation?.email;
        if (!email) {
            await (0, notify_1.sendAlert)(`🚨 <b>HF Message Undeliverable</b>\n─────────────────\n` +
                `👤 <b>Lead:</b> ${leadUid}\n` +
                `📋 <b>Message:</b> ${label}\n` +
                `📝 <b>Reason:</b> lead source blocks DIRECT_MESSAGE and guest has no email\n` +
                `─────────────────\n<i>Send manually via Hostfully · COZMO</i>`, { useTestJandi: true }).catch(() => { });
            throw e;
        }
        const res = await post({ type: 'EMAIL', leadUid, content: { subject: emailSubject, text } });
        console.log(`✅ HF inbox [${label}] → lead ${leadUid} via EMAIL fallback (status: ${res.data?.message?.status})`);
        await (0, notify_1.sendAlert)(`🚨 <b>HF Inbox → EMAIL Fallback Used</b>\n─────────────────\n` +
            `👤 <b>Lead:</b> ${leadUid}\n` +
            `📋 <b>Message:</b> ${label}\n` +
            `📧 <b>Sent to:</b> ${email}\n` +
            `📝 <b>Reason:</b> lead source blocks DIRECT_MESSAGE (manual booking)\n` +
            `─────────────────\n<i>via COZMO · Hostfully</i>`, { useTestJandi: true }).catch(() => { });
    }
}
function applyGuestName(template, guestFullName) {
    const firstName = guestFullName.split(/\s+/)[0] || guestFullName;
    return template
        .replace(/\[\$GUEST_NAME\$\]/g, guestFullName)
        .replace(/\[\$GUEST_FIRST_NAME\$\]/g, firstName);
}
async function sendInboxMessage(leadUid, guestFullName, langCode = 'EN', leadType = 'DIRECT', propertyCode) {
    if (leadType === 'DIRECT') {
        console.log(`⏭️ sendInboxMessage skipped for DIRECT booking (${leadUid}) — using messenger channel instead`);
        return;
    }
    let template;
    if (langCode === 'KO' && propertyCode) {
        template = await (0, sheets_1.getBookingMsgKr)(propertyCode);
        if (!template)
            template = await (0, sheets_1.getBookingMsg)('booking_confirmation', 'EN');
    }
    else {
        template = await (0, sheets_1.getBookingMsg)('booking_confirmation', langCode);
    }
    if (!template) {
        console.warn(`⚠️ No booking_confirmation template (lang=${langCode}, property=${propertyCode})`);
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), `step1 ${langCode}`, 'Your Booking Confirmation — COZE Hospitality');
}
const STEP2_KEY = {
    CN: { key: 'request_contact_point_wechat', lang: 'ZH-CN' },
    TW: { key: 'request_contact_point_line', lang: 'ZH-CN' },
    JP: { key: 'request_contact_point_line', lang: 'JA' },
    KR: { key: 'auto_group_chat_notification_kr', lang: 'KR' },
    OTHER: { key: 'auto_group_chat_notification_eng', lang: 'EN' },
};
async function sendStep2Message(leadUid, guestFullName, country, leadType) {
    if (leadType === 'DIRECT') {
        console.log(`⏭️ sendStep2Message skipped for DIRECT booking (${leadUid})`);
        return;
    }
    const { key, lang } = STEP2_KEY[country] ?? STEP2_KEY.OTHER;
    const template = await (0, sheets_1.getBookingMsg)(key, lang);
    if (!template) {
        console.warn(`⚠️ No step2 template (key=${key}, lang=${lang})`);
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), `step2 ${country}`, 'Your COZE Concierge Group Chat — COZE Hospitality');
}
async function sendWaInviteFallbackMessage(leadUid, guestFullName) {
    const template = await (0, sheets_1.getBookingMsg)('request_wa_invitaion_en', 'EN');
    if (!template) {
        console.warn('⚠️ No request_wa_invitaion_en template in sheet');
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), 'fallback 3.1 wa-invite', 'Your WhatsApp Concierge Channel — COZE Hospitality');
}
// Sends the actual WA group invite link via HF inbox — used for both privacy-blocked and no-WA guests
async function sendHfInviteLink(leadUid, guestFullName, inviteLink) {
    const template = await (0, sheets_1.getBookingMsg)('request_wa_invitaion_en', 'EN');
    const base = template ? applyGuestName(template, guestFullName) : `Hi ${guestFullName}, your WhatsApp group is ready.`;
    await sendHfInboxMessage(leadUid, `${base}\n\n${inviteLink}`, 'wa-invite-link', 'Your WhatsApp Group Invite — COZE Hospitality');
}
async function sendNoWaFallbackMessage(leadUid, guestFullName) {
    const template = await (0, sheets_1.getBookingMsg)('request_contact_point_messenger_en', 'EN');
    if (!template) {
        console.warn('⚠️ No request_contact_point_messenger_en template in sheet');
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), 'fallback 3.2 no-wa', 'Stay Connected with COZE — COZE Hospitality');
}
const PRE_PAYMENT_KEY = {
    BOOKING_COM: 'pre_payment_msg_notice_booking',
    VRBO: 'pre_payment_msg_notice_vrbo',
    HOMEAWAY: 'pre_payment_msg_notice_vrbo',
};
async function sendPrePaymentMessage(leadUid, guestFullName, langCode, leadType) {
    const key = PRE_PAYMENT_KEY[leadType];
    if (!key) {
        console.log(`⏭️ sendPrePaymentMessage skipped — leadType=${leadType} not eligible`);
        return;
    }
    const template = await (0, sheets_1.getPrePaymentMsg)(key, langCode);
    if (!template) {
        console.warn(`⚠️ No pre_payment template (key=${key}, lang=${langCode})`);
        return;
    }
    await sendHfInboxMessage(leadUid, applyGuestName(template, guestFullName), `pre_payment ${leadType} ${langCode}`, 'Payment Notice — COZE Hospitality');
}
async function pollLeadNotes() {
    console.log('🔍 Polling Hostfully notes...');
    try {
        const leads = await fetchActiveLeads();
        console.log(`📋 Active leads fetched: ${leads.length}`);
        for (const lead of leads) {
            const uid = lead.uid;
            const currentNotes = lead.notes || '';
            const lastNotes = exports.noteCache.get(uid);
            if (lastNotes === undefined) {
                console.log(`🌱 Seeding cache for lead: ${uid}`);
                exports.noteCache.set(uid, currentNotes);
                continue;
            }
            if (currentNotes !== lastNotes) {
                console.log(`📝 Note changed for lead: ${uid} — cache updated`);
                exports.noteCache.set(uid, currentNotes);
                if (!currentNotes)
                    continue;
                // Dual-confirmation alert path: if webhook misses, polling still notifies.
                const lastAlertAt = noteAlertCooldown.get(uid) || 0;
                if (Date.now() - lastAlertAt < 30000)
                    continue;
                noteAlertCooldown.set(uid, Date.now());
                const info = lead.guestInformation || {};
                const guestName = (0, format_1.guestName)(info, 'Unknown');
                const checkIn = (0, format_1.formatSeoulDate)(lead.checkInLocalDateTime);
                const propertyName = await resolvePropertyNameForLead(lead);
                await (0, notify_1.sendAlert)(`📝 <b>Guest Note Updated (Polling)</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${guestName}\n` +
                    `🏠 <b>Property:</b> ${propertyName}\n` +
                    `📅 <b>Check-in:</b> ${checkIn}\n` +
                    `📝 <b>Note:</b> ${currentNotes}\n` +
                    `─────────────────\n<i>via COZMO · Hostfully Poller</i>`);
            }
        }
    }
    catch (e) {
        console.error('❌ pollLeadNotes error:', e?.message || e);
    }
}
