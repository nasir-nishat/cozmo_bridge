// Fetch ALL future bookings from Hostfully (cursor pagination) and write active-bookings.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_URL = 'https://platform.hostfully.com/api/v3';
const API_KEY = 'Jtzt22PhP4yGHb00';
const AGENCY_UID = 'daa492e4-e5c5-4fb5-b223-1a5a10f5f563';
const FILE = path.join(__dirname, '../src/data/active-bookings.json');
const KEEP_STATUSES = new Set(['BOOKED', 'PAID_IN_FULL', 'CHECKED_IN']);

function toKSTDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function todayKST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

async function get(endpoint, params = {}) {
    const url = new URL(`${API_URL}${endpoint}`);
    url.searchParams.set('agencyUid', AGENCY_UID);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url.toString(), {
        headers: { 'X-HOSTFULLY-APIKEY': API_KEY, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`Hostfully ${endpoint}: ${res.status} ${res.statusText}`);
    return res.json();
}

// Paginate using cursor, return all leads with a future checkout
async function fetchAllFutureLeadUids() {
    const today = todayKST();
    const uids = [];
    const seen = new Set();
    let cursor = null;
    let page = 0;

    while (true) {
        const params = cursor ? { _cursor: cursor } : {};
        const data = await get('/leads', params);
        const leads = data.leads || [];
        page++;

        for (const l of leads) {
            const uid = l.uid || l.leadUid;
            if (!uid || seen.has(uid)) continue;
            seen.add(uid);
            const checkOut = toKSTDate(l.checkOutLocalDateTime || l.checkOutZonedDateTime);
            if (checkOut && checkOut >= today) uids.push(uid);
        }

        const nextCursor = data._paging?._nextCursor;
        process.stdout.write(`\r  Page ${page}: ${seen.size} leads scanned, ${uids.length} future found`);

        if (!nextCursor || leads.length === 0) break;
        // Stop if cursor didn't change (infinite loop guard)
        if (nextCursor === cursor) break;
        cursor = nextCursor;
    }

    console.log('');
    return uids;
}

async function fetchFullLead(uid) {
    const data = await get(`/leads/${uid}`);
    return data.lead || data;
}

async function fetchProperty(uid) {
    if (!uid) return null;
    try {
        const data = await get(`/properties/${uid}`);
        return data.property || null;
    } catch { return null; }
}

async function main() {
    console.log('Scanning all Hostfully leads via cursor pagination...');
    const uids = await fetchAllFutureLeadUids();
    console.log(`Found ${uids.length} leads with future checkout — fetching full details...\n`);

    const propCache = new Map();
    const getProperty = async (uid) => {
        if (!uid) return null;
        if (!propCache.has(uid)) propCache.set(uid, await fetchProperty(uid));
        return propCache.get(uid);
    };

    const map = new Map();
    let skipped = 0;

    for (const uid of uids) {
        let lead;
        try { lead = await fetchFullLead(uid); }
        catch (e) { console.warn(`  ⚠️ ${uid}: ${e.message}`); continue; }

        if (!KEEP_STATUSES.has(lead.status)) { skipped++; continue; }

        const propertyUid = lead.propertyUid || lead.propertyUidLegacy || '';
        const property = await getProperty(propertyUid);
        const info = lead.guestInformation || {};

        const entry = {
            leadUid: lead.uid,
            guestName: [info.firstName, info.lastName].filter(Boolean).join(' ') || 'Unknown',
            property: (property?.name || lead.propertyName || 'Unknown').replace(/\s*\((?:USD|MASTER|KRW)\)\s*$/i, '').trim(),
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

        map.set(lead.uid, entry);
        console.log(`  ✅ ${entry.guestName} @ ${entry.property} (${entry.checkIn} → ${entry.checkOut}) [${lead.status}]`);
    }

    const entries = [...map.values()].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    fs.writeFileSync(FILE, JSON.stringify(entries, null, 2));
    console.log(`\n✅ Done — ${entries.length} bookings written (${skipped} blocked/cancelled skipped)`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
