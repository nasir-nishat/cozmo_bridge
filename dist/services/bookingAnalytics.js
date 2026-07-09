"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingAnalytics = getBookingAnalytics;
exports.getPropertyList = getPropertyList;
const hostfully_1 = require("./hostfully");
const PAGE_LIMIT = 200;
// Hard wall-clock budget so a deep multi-year scan can never hang a request past
// the Cloudflare Tunnel / proxy timeout — it just reports truncated and a resume cursor.
const SCAN_TIME_BUDGET_MS = 45000;
function toKSTDateKey(utcNoZone) {
    if (!utcNoZone)
        return '';
    const iso = utcNoZone.endsWith('Z') ? utcNoZone : `${utcNoZone}Z`;
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
function eachDateKey(from, to) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    const keys = [];
    for (let t = Date.UTC(fy, fm - 1, fd); t <= Date.UTC(ty, tm - 1, td); t += 24 * 60 * 60 * 1000) {
        const dt = new Date(t);
        keys.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`);
    }
    return keys;
}
async function getBookingAnalytics(opts) {
    const { propertyUid, from, to, cursor: startCursor } = opts;
    const buckets = new Map();
    for (const key of eachDateKey(from, to))
        buckets.set(key, { date: key, newCount: 0, cancelledCount: 0 });
    const startedAt = Date.now();
    let cursor = startCursor;
    let scanned = 0;
    let truncated = false;
    let nextCursor = null;
    while (true) {
        let result;
        try {
            result = await (0, hostfully_1.fetchLeadsPage)(cursor, PAGE_LIMIT);
        }
        catch (e) {
            console.error('❌ bookingAnalytics: fetchLeadsPage failed:', e?.message);
            break;
        }
        let pageOldestUpdated = '';
        for (const lead of result.leads) {
            scanned++;
            if (propertyUid && lead.propertyUid !== propertyUid && lead.propertyUidLegacy !== propertyUid)
                continue;
            const createdKey = toKSTDateKey(lead.metadata?.createdUtcDateTime);
            if (createdKey && buckets.has(createdKey))
                buckets.get(createdKey).newCount++;
            const updatedKey = toKSTDateKey(lead.metadata?.updatedUtcDateTime);
            if (lead.status === 'CANCELLED' && updatedKey && buckets.has(updatedKey))
                buckets.get(updatedKey).cancelledCount++;
            if (updatedKey && (!pageOldestUpdated || updatedKey < pageOldestUpdated))
                pageOldestUpdated = updatedKey;
        }
        // Leads are sorted by most-recently-updated first — once a page's oldest
        // update predates the requested range, nothing further can fall inside it.
        if (pageOldestUpdated && pageOldestUpdated < from) {
            nextCursor = null;
            break;
        }
        if (!result.nextCursor) {
            nextCursor = null;
            break;
        }
        cursor = result.nextCursor;
        if (Date.now() - startedAt > SCAN_TIME_BUDGET_MS) {
            truncated = true;
            nextCursor = cursor;
            break;
        }
    }
    return { ok: true, days: [...buckets.values()], scannedLeads: scanned, truncated, nextCursor };
}
let propertyCache = null;
let propertyCacheAt = 0;
const PROPERTY_CACHE_TTL_MS = 30 * 60 * 1000;
async function getPropertyList() {
    if (propertyCache && Date.now() - propertyCacheAt < PROPERTY_CACHE_TTL_MS)
        return propertyCache;
    const all = [];
    let cursor;
    while (true) {
        const { properties, nextCursor } = await (0, hostfully_1.fetchPropertiesPage)(cursor);
        for (const p of properties) {
            if (p.isActive === false)
                continue;
            const name = (p.name || 'Unknown').replace(/\s*\((?:USD|MASTER|KRW)\)\s*$/i, '').trim();
            all.push({ uid: p.uid, name });
        }
        if (!nextCursor)
            break;
        cursor = nextCursor;
    }
    all.sort((a, b) => a.name.localeCompare(b.name));
    propertyCache = all;
    propertyCacheAt = Date.now();
    return all;
}
