import fs from 'fs';
import path from 'path';
import { fetchLeadsPage, fetchLead, fetchProperty } from './hostfully';

const FILE = path.join(process.cwd(), 'src/data/active-bookings.json');

export interface BookingEntry {
    leadUid: string;
    guestName: string;
    property: string;
    checkIn: string;   // YYYY-MM-DD KST
    checkOut: string;  // YYYY-MM-DD KST
    nationality: string;
    adults: number;
    children: number;
    infants: number;
    status: string;
    source: string;    // AIRBNB, BOOKING_COM, DIRECT, etc.
    phone: string;
    updatedAt: string;
}

function load(): BookingEntry[] {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
    catch { return []; }
}

function save(entries: BookingEntry[]): void {
    // Sort by checkIn ascending so the file is easy to read
    entries.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    try { fs.writeFileSync(FILE, JSON.stringify(entries, null, 2)); }
    catch (e: any) { console.error('❌ bookingStore save:', e?.message); }
}

function toKSTDate(iso: string | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export function upsertBooking(lead: any, property: any): void {
    const info = lead?.guestInformation || {};
    const entry: BookingEntry = {
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
    } else {
        entries.push(entry);
    }
    save(entries);
    console.log(`📋 bookingStore upserted: ${entry.guestName} @ ${entry.property} (${entry.checkIn} → ${entry.checkOut})`);
}

export function removeBooking(leadUid: string): void {
    const entries = load().filter(e => e.leadUid !== leadUid);
    save(entries);
    console.log(`📋 bookingStore removed: ${leadUid}`);
}

export function getBookingsCheckingOut(dateStr: string): BookingEntry[] {
    return load().filter(e => e.checkOut === dateStr);
}

export function getBookingsCheckingIn(dateStr: string): BookingEntry[] {
    return load().filter(e => e.checkIn === dateStr);
}

export function getAllBookings(): BookingEntry[] {
    return load();
}

export function getBookingByLeadUid(leadUid: string): BookingEntry | undefined {
    return load().find(b => b.leadUid === leadUid);
}

function normalizePhoneDigits(value: string): string {
    const digits = (value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('0')) return `82${digits.slice(1)}`;
    return digits;
}

function bookingSortTime(booking: BookingEntry): number {
    const activeNow =
        booking.checkIn <= toKSTDate(new Date().toISOString()) &&
        booking.checkOut >= toKSTDate(new Date().toISOString());
    if (activeNow) return 0;
    return Math.abs(new Date(`${booking.checkIn}T00:00:00+09:00`).getTime() - Date.now());
}

export function getBookingByPhone(phoneOrJid: string): BookingEntry | undefined {
    const phone = normalizePhoneDigits(phoneOrJid.replace(/@.*$/, ''));
    if (!phone) return undefined;

    const matches = load()
        .filter(b => normalizePhoneDigits(b.phone) === phone)
        .filter(b => !isLeadExpired(b.leadUid))
        .sort((a, b) => bookingSortTime(a) - bookingSortTime(b));

    return matches[0];
}

// Returns true if the booking's checkout was more than 7 days ago.
// If no booking found, returns false (safer to keep processing than silence a live guest).
export function isLeadExpired(leadUid: string): boolean {
    const booking = getBookingByLeadUid(leadUid);
    if (!booking) return false;
    const expiryMs = new Date(booking.checkOut + 'T23:59:59+09:00').getTime() + 7 * 24 * 60 * 60 * 1000;
    return Date.now() > expiryMs;
}

// MAX_SYNC_PAGES: how many pages of recently-updated leads to scan per daily sync.
// The list API returns leads sorted by most-recently-updated first, so the first
// 10 pages (200 leads) covers all bookings created or modified in the past week.
// Webhooks handle real-time updates; this is just a safety net for missed events.
const MAX_SYNC_PAGES = 2;

export async function backfillBookingStore(): Promise<void> {
    const today = toKSTDate(new Date().toISOString());
    const KEEP = new Set(['BOOKED', 'PAID_IN_FULL', 'CHECKED_IN']);
    const propCache = new Map<string, any>();

    const getProperty = async (uid: string) => {
        if (!uid) return null;
        if (!propCache.has(uid)) {
            try { propCache.set(uid, await fetchProperty(uid)); }
            catch { propCache.set(uid, null); }
        }
        return propCache.get(uid);
    };

    console.log(`📋 bookingStore sync (last ${MAX_SYNC_PAGES} pages)...`);

    let cursor: string | undefined;
    let page = 0;
    let scanned = 0;
    let upserted = 0;

    while (true) {
        let result: { leads: any[]; nextCursor: string | null };
        try {
            result = await fetchLeadsPage(cursor);
        } catch (e: any) {
            console.error('❌ bookingStore sync: fetchLeadsPage failed:', e?.message);
            break;
        }

        page++;
        for (const slim of result.leads) {
            scanned++;
            const checkOut = toKSTDate(slim.checkOutLocalDateTime || slim.checkOutZonedDateTime);
            if (!checkOut || checkOut < today) continue;

            try {
                const lead = await fetchLead(slim.uid);
                if (!KEEP.has(lead?.status)) continue;
                const property = await getProperty(lead.propertyUid || lead.propertyUidLegacy || '');
                upsertBooking(lead, property);
                upserted++;
            } catch { /* skip individual failures */ }
        }

        if (!result.nextCursor || page >= MAX_SYNC_PAGES) break;
        cursor = result.nextCursor ?? undefined;
    }

    console.log(`📋 bookingStore sync complete: scanned ${scanned} leads, upserted ${upserted}`);
}
