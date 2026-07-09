"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSeoulDateOnly = toSeoulDateOnly;
exports.syncBookingToCalendar = syncBookingToCalendar;
const googleapis_1 = require("googleapis");
const google_auth_1 = __importDefault(require("./google-auth"));
const constants_1 = require("../config/constants");
const format_1 = require("../utils/format");
const calendarEvents_1 = require("./calendarEvents");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const SOURCE_MAP = {
    AIRBNB: 'AB',
    BOOKING_COM: 'BK',
    BOOKING: 'BK',
    DIRECT: 'DR',
    HOMEAWAY: 'VR',
    VRBO: 'VR',
    EXPEDIA: 'EX',
    TRIPADVISOR: 'TR',
};
function sourceCode(lead) {
    return SOURCE_MAP[(lead?.type || '').toUpperCase()] || 'DR';
}
const calendar = googleapis_1.google.calendar({ version: 'v3', auth: google_auth_1.default });
// Direct-unit calendars only — bundle properties are handled by FANOUT_MAP below
const CALENDAR_ID_MAP = {
    BS: process.env.CALENDAR_ID_BS,
    JT: process.env.CALENDAR_ID_JT,
    JTS: process.env.CALENDAR_ID_JTS,
    SA: process.env.CALENDAR_ID_SA,
    SG: process.env.CALENDAR_ID_SG,
    SJ: process.env.CALENDAR_ID_SJ,
    B9: process.env.CALENDAR_ID_B9,
    L9: process.env.CALENDAR_ID_L9,
    F9: process.env.CALENDAR_ID_F9,
    GKA: process.env.CALENDAR_ID_GKA,
    GKB: process.env.CALENDAR_ID_GKB,
    HTA: process.env.CALENDAR_ID_HTA,
    HTB: process.env.CALENDAR_ID_HTB,
};
// Bundle properties with no standalone calendar — bookings fan out to each constituent unit.
// FB = F9 + B9, YT = L9 + F9 + B9, GK = GKA + GKB, HT = HTA + HTB
const FANOUT_MAP = {
    FB: ['F9', 'B9'],
    YT: ['L9', 'F9', 'B9'],
    GK: ['GKA', 'GKB'],
    HT: ['HTA', 'HTB'],
};
function resolveCalendarId(propCode) {
    return CALENDAR_ID_MAP[propCode] ?? constants_1.CONFIG.GOOGLE_CALENDAR_ID;
}
const BOOKED_STATUSES = new Set(['BOOKED', 'PAID_IN_FULL']);
// In-memory dedup for concurrent NEW_BLOCKED_DATES webhooks arriving within the same second
const recentBlockedCreates = new Map();
/** YYYY-MM-DD in Asia/Seoul */
function toSeoulDateOnly(iso) {
    if (!iso)
        return null;
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
function resolvePropertyName(lead, property) {
    return property?.name || lead?.propertyName || 'Unknown';
}
async function findEventByLeadUid(calendarId, leadUid) {
    try {
        const res = await calendar.events.list({
            calendarId,
            privateExtendedProperty: [`hostfullyLeadUid=${leadUid}`],
            maxResults: 1,
            singleEvents: true,
        });
        return res.data.items?.[0]?.id || null;
    }
    catch {
        return null;
    }
}
async function findExistingBlockedEvent(calendarId, propCode, checkIn) {
    try {
        const res = await calendar.events.list({
            calendarId,
            timeMin: `${checkIn}T00:00:00Z`,
            timeMax: `${checkIn}T23:59:59Z`,
            singleEvents: true,
            maxResults: 20,
        });
        return res.data.items?.find(e => e.summary === `${propCode}/Blocked`)?.id ?? null;
    }
    catch {
        return null;
    }
}
// trackingKey = leadUid for direct units, or "${leadUid}:${subCode}" for fan-out units.
// originalLeadUid is the raw HF leadUid used to search calendar extended properties.
async function deleteCalendarEvent(trackingKey, calendarId, originalLeadUid) {
    let eventId = (0, calendarEvents_1.getCalendarEventId)(trackingKey);
    if (!eventId)
        eventId = await findEventByLeadUid(calendarId, originalLeadUid ?? trackingKey);
    if (!eventId)
        return;
    try {
        await calendar.events.delete({ calendarId, eventId });
        console.log(`📅 Calendar event deleted: ${trackingKey}`);
    }
    catch (e) {
        if (e?.code !== 404 && e?.response?.status !== 404) {
            console.warn(`⚠️ Calendar delete failed (${trackingKey}):`, e?.message);
        }
    }
    (0, calendarEvents_1.removeCalendarEventId)(trackingKey);
}
// Upsert (create or patch) a calendar event for one specific unit.
// propCode here is always the display unit (e.g. "F9", not "FB").
async function upsertUnit(trackingKey, calendarId, propCode, leadUid, lead, eventType) {
    const checkIn = toSeoulDateOnly(lead.checkInLocalDateTime);
    const checkOut = toSeoulDateOnly(lead.checkOutLocalDateTime);
    if (!checkIn || !checkOut) {
        console.warn(`⚠️ Calendar skip (${trackingKey}): missing check-in/out dates`);
        return;
    }
    const isBlocked = eventType === 'NEW_BLOCKED_DATES';
    const status = (lead.status || '').toUpperCase();
    if (!isBlocked && !BOOKED_STATUSES.has(status)) {
        console.log(`⏭️ Calendar skip (${trackingKey}): status=${status}`);
        return;
    }
    if (isBlocked && (lead.notes || '').includes('automatically removed')) {
        console.log(`⏭️ Calendar skip (${trackingKey}): temp OTA block`);
        return;
    }
    const info = lead.guestInformation || {};
    let summary;
    if (isBlocked) {
        summary = `${propCode}/Blocked`;
    }
    else {
        const guest = (0, format_1.guestName)(info, 'Guest');
        const occupancy = (0, groupNaming_1.extractOccupancyCode)(lead);
        const src = sourceCode(lead);
        summary = `${propCode}/${src}/${guest}${occupancy ? ` ${occupancy}` : ''}`;
    }
    const phone = info.phoneNumber || info.cellPhoneNumber || '';
    const notes = (lead.notes || '').trim();
    const description = [
        `Hostfully: ${leadUid}`,
        status ? `Status: ${status}` : '',
        phone ? `Phone: ${phone}` : '',
        notes ? `Notes: ${notes.slice(0, 800)}` : '',
        `Synced via COZMO · ${eventType}`,
    ].filter(Boolean).join('\n');
    const requestBody = {
        summary,
        description,
        start: { date: checkIn, timeZone: 'Asia/Seoul' },
        end: { date: checkOut, timeZone: 'Asia/Seoul' },
        extendedProperties: { private: { hostfullyLeadUid: leadUid } },
    };
    // Remove any temp block for the same property+dates when a real booking arrives
    if (!isBlocked) {
        const blockedEventId = await findExistingBlockedEvent(calendarId, propCode, checkIn);
        if (blockedEventId) {
            try {
                await calendar.events.delete({ calendarId, eventId: blockedEventId });
                console.log(`📅 Removed temp block for ${propCode} ${checkIn} (superseded by booking ${leadUid})`);
            }
            catch (e) {
                if (e?.code !== 404 && e?.response?.status !== 404) {
                    console.warn(`⚠️ Failed to delete temp block (${propCode} ${checkIn}):`, e?.message);
                }
            }
        }
    }
    let eventId = (0, calendarEvents_1.getCalendarEventId)(trackingKey);
    if (!eventId)
        eventId = await findEventByLeadUid(calendarId, leadUid);
    if (isBlocked && !eventId) {
        const dedupKey = `${calendarId}:${propCode}:${checkIn}`;
        const claimedAt = recentBlockedCreates.get(dedupKey);
        if (claimedAt && Date.now() - claimedAt < 300000) {
            console.log(`⏭️ Calendar skip blocked duplicate (${trackingKey}): ${summary} already in-flight`);
            return;
        }
        recentBlockedCreates.set(dedupKey, Date.now());
        const existingId = await findExistingBlockedEvent(calendarId, propCode, checkIn);
        if (existingId) {
            (0, calendarEvents_1.setCalendarEventId)(trackingKey, existingId);
            console.log(`⏭️ Calendar skip blocked duplicate (${trackingKey}): ${summary} already exists`);
            return;
        }
    }
    try {
        if (eventId) {
            await calendar.events.patch({ calendarId, eventId, requestBody });
            (0, calendarEvents_1.setCalendarEventId)(trackingKey, eventId);
            console.log(`📅 Calendar event updated: ${summary}`);
        }
        else {
            const res = await calendar.events.insert({ calendarId, requestBody });
            const newId = res.data.id;
            if (newId) {
                (0, calendarEvents_1.setCalendarEventId)(trackingKey, newId);
                console.log(`📅 Calendar event created: ${summary}`);
            }
        }
    }
    catch (e) {
        const httpStatus = e?.response?.status;
        if (httpStatus === 404 && eventId) {
            (0, calendarEvents_1.removeCalendarEventId)(trackingKey);
            const res = await calendar.events.insert({ calendarId, requestBody });
            if (res.data.id)
                (0, calendarEvents_1.setCalendarEventId)(trackingKey, res.data.id);
            return;
        }
        console.error(`❌ Calendar sync failed (${trackingKey}):`, e?.message || e);
    }
}
async function syncBookingToCalendar(lead, property, eventType) {
    if (!constants_1.CONFIG.ENABLE_GOOGLE_CALENDAR || !constants_1.CONFIG.GOOGLE_CALENDAR_ID)
        return;
    const leadUid = lead?.uid;
    if (!leadUid)
        return;
    const propertyName = resolvePropertyName(lead, property);
    const propCode = (0, groupNaming_1.propertyCodeFromName)(propertyName);
    const subCodes = FANOUT_MAP[propCode];
    if (eventType === 'BOOKING_CANCELLED') {
        if (subCodes) {
            for (const subCode of subCodes) {
                await deleteCalendarEvent(`${leadUid}:${subCode}`, resolveCalendarId(subCode), leadUid);
            }
            // Clean up any legacy event written to primary before fan-out was introduced
            await deleteCalendarEvent(leadUid, constants_1.CONFIG.GOOGLE_CALENDAR_ID);
        }
        else {
            await deleteCalendarEvent(leadUid, resolveCalendarId(propCode));
        }
        return;
    }
    if (subCodes) {
        for (const subCode of subCodes) {
            await upsertUnit(`${leadUid}:${subCode}`, resolveCalendarId(subCode), subCode, leadUid, lead, eventType);
        }
    }
    else {
        await upsertUnit(leadUid, resolveCalendarId(propCode), propCode, leadUid, lead, eventType);
    }
}
