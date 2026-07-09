// Fetches all active bookings from Hostfully and creates missing Google Calendar events.
// Fixes any bookings that only had a Blocked event (now deleted) with no real booking event.
// Run: node scripts/backfill-calendar.js [--dry-run] [--from=YYYY-MM-DD] [--prop=CODE]
// --prop=CODE filters by property code (e.g. F9, B9, GKA). For bundle props use the
//   bundle code (e.g. FB) to backfill both constituent calendars in one pass.

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ─── Google Auth ──────────────────────────────────────────────────────────────
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-credentials.json'), 'utf-8'));
const { client_id, client_secret } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-token.json'), 'utf-8')));
const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

// ─── Hostfully ────────────────────────────────────────────────────────────────
const HF_URL = 'https://platform.hostfully.com/api/v3';
const HF_KEY = 'Jtzt22PhP4yGHb00';
const AGENCY_UID = 'daa492e4-e5c5-4fb5-b223-1a5a10f5f563';

async function hfGet(endpoint, params = {}) {
    const url = new URL(`${HF_URL}${endpoint}`);
    url.searchParams.set('agencyUid', AGENCY_UID);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: { 'X-HOSTFULLY-APIKEY': HF_KEY, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HF ${endpoint}: ${res.status} ${await res.text()}`);
    return res.json();
}

// ─── Calendar ID routing (direct units only) ──────────────────────────────────
const CALENDAR_ID_MAP = {
    BS:  'c_2ddeccdfea7e000f6b32fc95fb004137328fcb2c50b63117979c81e03b494a5f@group.calendar.google.com',
    SG:  'c_87e7823790fa13e4d263fef4e7a06ef92f0917e7d24bcca4e820f368bb3fe0b6@group.calendar.google.com',
    SJ:  'c_4443eac1e5d60c2395e37286795a6dc3eeef3a4dc4ab09a3311e66436c3b45cf@group.calendar.google.com',
    SA:  'c_1d9805dc455148f2e9bffd9851d900fdbda88c5d01a7d0b68bff342e1f77a06b@group.calendar.google.com',
    JT:  'c_fa90a7dd8ad9dd4786830c2e0c6667e9901279bc955390eaeac6ac30bdbaca47@group.calendar.google.com',
    JTS: 'c_956f36c3db6c819f3152e76ace480c23eed06cb81701b1b3dac6123b4fe0a43a@group.calendar.google.com',
    B9:  'c_fb607805afb605221dc4c9d40e766441788ccf666853567afb0e32e35ea71580@group.calendar.google.com',
    L9:  'c_f2f65f4ded0e7adb3d6e6415bcaf528acee8911317798681ed1568ad682d86c2@group.calendar.google.com',
    F9:  'c_dd6641674c5a738fc1b451b37187872a1934d8bc2b4b8057eafb1d11ed79ba8e@group.calendar.google.com',
    GKA: 'c_662da96f4a4826fc28a46fcd1c4ba393b8883894530c50e09eca34b97a5d4783@group.calendar.google.com',
    GKB: 'c_bc6dcb5385a648323a5f3b792cac2d4897c7842b79b8a02255a43e62ec9c0918@group.calendar.google.com',
    HTA: 'c_b735387dbb7894c08e3f9416e93557bff79513adf1aa0189f037aacc88205b89@group.calendar.google.com',
    HTB: 'c_9e850106c89c5e3a2f2061971dbc5ba8544c93efe05dfe29c5346e6a4e329ef9@group.calendar.google.com',
};
function resolveCalendarId(code) { return CALENDAR_ID_MAP[code] || 'primary'; }

// Bundle properties fan out to constituent sub-unit calendars
const FANOUT_MAP = {
    FB: ['F9', 'B9'],
    YT: ['L9', 'F9', 'B9'],
    GK: ['GKA', 'GKB'],
    HT: ['HTA', 'HTB'],
};

// ─── Property code mapping (mirrors groupNaming.ts PROPERTY_CODE_MAP) ─────────
const PROP_CODES = {
    'BS_JOYHASLA': 'BS', 'SG_JOYHASLA': 'SG', 'SJ_JOYHASLA': 'SJ',
    'SA_ACHAE': 'SA',
    'JT_TEVA': 'JT', 'JTS_TEVA': 'JTS',
    'HT_TEVA RETREAT': 'HT', 'HTA_TEVA WELLNESS': 'HTA', 'HTB_TEVA AERIS GARDEN': 'HTB',
    'YT_LOTUS_09': 'L9', 'YT_FISH_09': 'F9', 'YT_BIRD_09': 'B9',
    'YT_FISH_BIRD': 'FB', 'YT_LOTUS_FISH_BIRD': 'YT',
    'GK_KELLY LUXURY': 'GK', 'GKA_KELLY ANANDA': 'GKA', 'GKB_KELLY PRANA': 'GKB',
};
function propCodeFromName(name) {
    if (!name) return 'UNK';
    const clean = name.replace(/\s*\((?:USD|MASTER|KRW)\)\s*$/i, '').trim().toUpperCase();
    for (const [k, v] of Object.entries(PROP_CODES)) {
        if (clean === k.toUpperCase() || clean.startsWith(k.toUpperCase())) return v;
    }
    return clean.split(/[\s_]/)[0] || 'UNK';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SOURCE_MAP = { AIRBNB: 'AB', BOOKING_COM: 'BK', DIRECT: 'DR', HOMEAWAY: 'VR', VRBO: 'VR', EXPEDIA: 'EX', TRIPADVISOR: 'TR' };
function sourceCode(lead) { return SOURCE_MAP[(lead?.type || '').toUpperCase()] || 'DR'; }

function toSeoulDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
function guestName(info) {
    const n = [(info?.firstName || '').trim(), (info?.lastName || '').trim()].filter(Boolean).join(' ');
    return n || 'Guest';
}
function occupancy(lead) {
    const gi = lead.guestInformation || {};
    const a = lead.adultsCount ?? lead.adultCount ?? lead.adults ?? lead.numberOfAdults ??
              gi.adultsCount ?? gi.adultCount ?? gi.adults ?? gi.numberOfAdults ?? 0;
    const k = lead.childrenCount ?? lead.childCount ?? lead.children ?? lead.numberOfChildren ??
              gi.childrenCount ?? gi.childCount ?? gi.children ?? gi.numberOfChildren ?? 0;
    const i = lead.infantsCount ?? lead.infantCount ?? lead.infants ?? lead.numberOfInfants ??
              gi.infantsCount ?? gi.infantCount ?? gi.infants ?? gi.numberOfInfants ?? 0;
    const p = lead.petsCount ?? lead.petCount ?? lead.pets ?? lead.numberOfPets ??
              gi.petsCount ?? gi.petCount ?? gi.pets ?? gi.numberOfPets ?? 0;
    return [a && `${a}A`, k && `${k}K`, i && `${i}I`, p && `${p}P`].filter(Boolean).join('');
}

// ─── Calendar lookup by leadUid extended property ─────────────────────────────
async function findEventByLeadUid(calendarId, leadUid) {
    try {
        const res = await calendar.events.list({
            calendarId,
            privateExtendedProperty: [`hostfullyLeadUid=${leadUid}`],
            maxResults: 1,
            singleEvents: true,
        });
        return res.data.items?.[0]?.id || null;
    } catch { return null; }
}

// ─── Upsert one unit's calendar event ────────────────────────────────────────
async function upsertUnit(calendarId, unitCode, leadUid, lead, dryRun, counters) {
    const checkIn  = toSeoulDate(lead.checkInLocalDateTime);
    const checkOut = toSeoulDate(lead.checkOutLocalDateTime);
    if (!checkIn || !checkOut) { counters.skipped++; return; }

    const info    = lead.guestInformation || {};
    const occ     = occupancy(lead);
    const summary = `${unitCode}/${sourceCode(lead)}/${guestName(info)}${occ ? ` ${occ}` : ''}`;
    const status  = (lead.status || '').toUpperCase();
    const phone   = info.phoneNumber || info.cellPhoneNumber || '';
    const notes   = (lead.notes || '').trim();
    const description = [
        `Hostfully: ${leadUid}`,
        `Status: ${status}`,
        phone ? `Phone: ${phone}` : '',
        notes ? `Notes: ${notes.slice(0, 800)}` : '',
        'Synced via COZMO · BACKFILL',
    ].filter(Boolean).join('\n');

    const requestBody = {
        summary, description,
        start: { date: checkIn,   timeZone: 'Asia/Seoul' },
        end:   { date: checkOut,  timeZone: 'Asia/Seoul' },
        extendedProperties: { private: { hostfullyLeadUid: leadUid } },
    };

    const existingId = await findEventByLeadUid(calendarId, leadUid);
    const calLabel = calendarId === 'primary' ? 'primary' : unitCode;

    if (existingId) {
        console.log(`  🔄 ${summary}  (${checkIn} → ${checkOut})  [patch → ${calLabel}]`);
        if (!dryRun) {
            try {
                await calendar.events.patch({ calendarId, eventId: existingId, requestBody });
                counters.created++;
            } catch (e) { console.warn(`    ❌ patch failed: ${e.message}`); counters.failed++; }
        } else { counters.created++; }
    } else {
        console.log(`  ➕ ${summary}  (${checkIn} → ${checkOut})  [→ ${calLabel}]`);
        if (!dryRun) {
            try {
                await calendar.events.insert({ calendarId, requestBody });
                counters.created++;
            } catch (e) { console.warn(`    ❌ insert failed: ${e.message}`); counters.failed++; }
        } else { counters.created++; }
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const DRY_RUN  = process.argv.includes('--dry-run');
const FROM_ARG = process.argv.find(a => a.startsWith('--from='))?.split('=')[1] || null;
// --prop filters by propCode (bundle or direct). E.g. --prop=FB backfills F9+B9, --prop=F9 backfills direct F9 only.
const PROP_ARG = process.argv.find(a => a.startsWith('--prop='))?.split('=')[1]?.toUpperCase() || null;
const KEEP = new Set(['BOOKED', 'PAID_IN_FULL', 'CHECKED_IN']);

async function main() {
    const fromDate = FROM_ARG || toSeoulDate(new Date().toISOString());
    console.log(`📅 Calendar backfill${DRY_RUN ? ' [DRY RUN]' : ''}${PROP_ARG ? ` — prop: ${PROP_ARG}` : ''} — from: ${fromDate}\n`);

    const propCache = new Map();

    // Paginate all leads, collect matching ones
    const targets = [];
    let cursor = null, page = 0;
    do {
        const data = await hfGet('/leads', cursor ? { _cursor: cursor } : {});
        for (const l of (data.leads || [])) {
            const checkOut = toSeoulDate(l.checkOutLocalDateTime || l.checkOutZonedDateTime);
            if (checkOut && checkOut >= fromDate && KEEP.has(l.status)) targets.push(l.uid || l.leadUid);
        }
        cursor = data._paging?._nextCursor;
        process.stdout.write(`\r  Scanned page ${++page}, ${targets.length} leads found...`);
    } while (cursor);
    console.log(`\n  → ${targets.length} leads to check\n`);

    const counters = { created: 0, skipped: 0, failed: 0 };

    for (const leadUid of targets) {
        let lead;
        try {
            const data = await hfGet(`/leads/${leadUid}`);
            lead = data.lead || data;
        } catch (e) { console.warn(`  ⚠️ ${leadUid}: ${e.message}`); counters.failed++; continue; }

        if (!KEEP.has(lead.status)) { counters.skipped++; continue; }

        const checkOut = toSeoulDate(lead.checkOutLocalDateTime);
        if (!checkOut) { counters.skipped++; continue; }

        const propUid = lead.propertyUid || lead.propertyUidLegacy;
        if (propUid && !propCache.has(propUid)) {
            try { const d = await hfGet(`/properties/${propUid}`); propCache.set(propUid, d.property || null); }
            catch { propCache.set(propUid, null); }
        }
        const property = propCache.get(propUid) || null;

        const propCode = propCodeFromName(property?.name || lead.propertyName || '');
        if (PROP_ARG && propCode !== PROP_ARG) { counters.skipped++; continue; }

        const subCodes = FANOUT_MAP[propCode];
        if (subCodes) {
            for (const subCode of subCodes) {
                await upsertUnit(resolveCalendarId(subCode), subCode, leadUid, lead, DRY_RUN, counters);
            }
        } else {
            await upsertUnit(resolveCalendarId(propCode), propCode, leadUid, lead, DRY_RUN, counters);
        }
    }

    console.log(`\n✅ Done. ${counters.created} event(s) ${DRY_RUN ? 'would be' : ''} upserted | ${counters.skipped} skipped | ${counters.failed} failed`);
}

main().catch(console.error);
