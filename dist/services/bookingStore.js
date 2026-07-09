"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertBooking = upsertBooking;
exports.removeBooking = removeBooking;
exports.getBookingsCheckingOut = getBookingsCheckingOut;
exports.getBookingsCheckingIn = getBookingsCheckingIn;
exports.getAllBookings = getAllBookings;
exports.getBookingByLeadUid = getBookingByLeadUid;
exports.getBookingByPhone = getBookingByPhone;
exports.isLeadExpired = isLeadExpired;
exports.backfillBookingStore = backfillBookingStore;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const hostfully_1 = require("./hostfully");
const FILE = path_1.default.join(process.cwd(), 'src/data/active-bookings.json');
function load() {
    try {
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function save(entries) {
    // Sort by checkIn ascending so the file is easy to read
    entries.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    try {
        fs_1.default.writeFileSync(FILE, JSON.stringify(entries, null, 2));
    }
    catch (e) {
        console.error('❌ bookingStore save:', e?.message);
    }
}
function toKSTDate(iso) {
    if (!iso)
        return '';
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
function upsertBooking(lead, property) {
    const info = lead?.guestInformation || {};
    const entry = {
        leadUid: lead.uid,
        guestName: [info.firstName, info.lastName].filter(Boolean).join(' ') || 'Unknown',
        property: (property?.name || lead?.propertyName || 'Unknown').replace(/\s*\((?:USD|MASTER|KRW)\)\s*$/i, '').trim(),
        checkIn: toKSTDate(lead.checkInLocalDateTime),
        checkOut: toKSTDate(lead.checkOutLocalDateTime),
        nationality: (info.countryCode || '').toUpperCase(),
        adults: lead.adultsCount ?? lead.adultCount ?? lead.adults ?? 0,
        children: lead.childrenCount ?? lead.childCount ?? lead.children ?? 0,
        infants: lead.infantsCount ?? lead.infantCount ?? lead.infants ?? 0,
        status: lead.status || '',
        source: lead.type || 'DIRECT',
        phone: info.phoneNumber || info.cellPhoneNumber || '',
        updatedAt: new Date().toISOString(),
    };
    const entries = load();
    const idx = entries.findIndex(e => e.leadUid === lead.uid);
    if (idx >= 0) {
        entries[idx] = entry;
    }
    else {
        entries.push(entry);
    }
    save(entries);
    console.log(`📋 bookingStore upserted: ${entry.guestName} @ ${entry.property} (${entry.checkIn} → ${entry.checkOut})`);
}
function removeBooking(leadUid) {
    const entries = load().filter(e => e.leadUid !== leadUid);
    save(entries);
    console.log(`📋 bookingStore removed: ${leadUid}`);
}
function getBookingsCheckingOut(dateStr) {
    return load().filter(e => e.checkOut === dateStr);
}
function getBookingsCheckingIn(dateStr) {
    return load().filter(e => e.checkIn === dateStr);
}
function getAllBookings() {
    return load();
}
function getBookingByLeadUid(leadUid) {
    return load().find(b => b.leadUid === leadUid);
}
function normalizePhoneDigits(value) {
    const digits = (value || '').replace(/\D/g, '');
    if (!digits)
        return '';
    if (digits.startsWith('00'))
        return digits.slice(2);
    if (digits.startsWith('0'))
        return `82${digits.slice(1)}`;
    return digits;
}
function bookingSortTime(booking) {
    const activeNow = booking.checkIn <= toKSTDate(new Date().toISOString()) &&
        booking.checkOut >= toKSTDate(new Date().toISOString());
    if (activeNow)
        return 0;
    return Math.abs(new Date(`${booking.checkIn}T00:00:00+09:00`).getTime() - Date.now());
}
function getBookingByPhone(phoneOrJid) {
    const phone = normalizePhoneDigits(phoneOrJid.replace(/@.*$/, ''));
    if (!phone)
        return undefined;
    const matches = load()
        .filter(b => normalizePhoneDigits(b.phone) === phone)
        .filter(b => !isLeadExpired(b.leadUid))
        .sort((a, b) => bookingSortTime(a) - bookingSortTime(b));
    return matches[0];
}
// Returns true if the booking's checkout was more than 7 days ago.
// If no booking found, returns false (safer to keep processing than silence a live guest).
function isLeadExpired(leadUid) {
    const booking = getBookingByLeadUid(leadUid);
    if (!booking)
        return false;
    const expiryMs = new Date(booking.checkOut + 'T23:59:59+09:00').getTime() + 7 * 24 * 60 * 60 * 1000;
    return Date.now() > expiryMs;
}
// MAX_SYNC_PAGES: how many pages of recently-updated leads to scan per daily sync.
// The list API returns leads sorted by most-recently-updated first, so the first
// 10 pages (200 leads) covers all bookings created or modified in the past week.
// Webhooks handle real-time updates; this is just a safety net for missed events.
const MAX_SYNC_PAGES = 2;
async function backfillBookingStore() {
    const today = toKSTDate(new Date().toISOString());
    const KEEP = new Set(['BOOKED', 'PAID_IN_FULL', 'CHECKED_IN']);
    const propCache = new Map();
    const getProperty = async (uid) => {
        if (!uid)
            return null;
        if (!propCache.has(uid)) {
            try {
                propCache.set(uid, await (0, hostfully_1.fetchProperty)(uid));
            }
            catch {
                propCache.set(uid, null);
            }
        }
        return propCache.get(uid);
    };
    console.log(`📋 bookingStore sync (last ${MAX_SYNC_PAGES} pages)...`);
    let cursor;
    let page = 0;
    let scanned = 0;
    let upserted = 0;
    while (true) {
        let result;
        try {
            result = await (0, hostfully_1.fetchLeadsPage)(cursor);
        }
        catch (e) {
            console.error('❌ bookingStore sync: fetchLeadsPage failed:', e?.message);
            break;
        }
        page++;
        for (const slim of result.leads) {
            scanned++;
            const checkOut = toKSTDate(slim.checkOutLocalDateTime || slim.checkOutZonedDateTime);
            if (!checkOut || checkOut < today)
                continue;
            try {
                const lead = await (0, hostfully_1.fetchLead)(slim.uid);
                if (!KEEP.has(lead?.status))
                    continue;
                const property = await getProperty(lead.propertyUid || lead.propertyUidLegacy || '');
                upsertBooking(lead, property);
                upserted++;
            }
            catch { /* skip individual failures */ }
        }
        if (!result.nextCursor || page >= MAX_SYNC_PAGES)
            break;
        cursor = result.nextCursor ?? undefined;
    }
    console.log(`📋 bookingStore sync complete: scanned ${scanned} leads, upserted ${upserted}`);
}
