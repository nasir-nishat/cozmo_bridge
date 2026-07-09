#!/usr/bin/env node
// scripts/kb-cleanup.mjs
// Cleans knowledge-base.json: removes noise, merges duplicates via GPT-4o
// Run: node scripts/kb-cleanup.mjs

import fs from 'fs';
import path from 'path';

const KB_PATH    = path.resolve('src/knowledge/knowledge-base.json');
const BACKUP     = `${KB_PATH}.bak`;

// ── OpenAI key ────────────────────────────────────────────────────────────────
function getKey() {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    const eco = fs.readFileSync(path.resolve('ecosystem.config.js'), 'utf-8');
    const m   = eco.match(/OPENAI_API_KEY:\s*'([^']+)'/);
    if (m) return m[1];
    throw new Error('OPENAI_API_KEY not found');
}

async function gpt(entries, instruction) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` },
        body: JSON.stringify({
            model: 'gpt-4o',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user',   content: instruction + '\n\n' + JSON.stringify(entries, null, 2) },
            ],
        }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    return JSON.parse((await res.json()).choices[0].message.content);
}

const SYSTEM = `You are cleaning a hospitality knowledge base for COZE, a Seoul short-term rental company.
When asked to MERGE entries:
- Combine into the MINIMUM number of clean, useful entries
- ONE "ALL" entry if facts are essentially the same across properties
- ONE "ALL" + property-specific entries ONLY if a property has genuinely DIFFERENT prices, times, or procedures
- Deduplicate near-identical facts. Keep only concrete actionable facts: KRW amounts, times, procedures, counts, links
- Remove vague filler: "check Naver Map", "contact our team", "more info at link", generic app advice
- Combine all triggers, deduplicated. Keep all real links.
- source: "merged", sensitive: false
- Return JSON: { "entries": [ { id, propertyCode, category, title, triggers, facts, links, sensitive, source } ] }`;

// ── Step 1: hard delete — noise, one-offs, confirmed exact duplicates ─────────
const DELETE = new Set([
    'air-conditioner-repair',          // "repair next Wednesday" — past one-off
    'complimentary-van-service',       // "tomorrow's van" — one guest
    'private-mini-bus-service',        // invoice line items for one booking
    'luggage-drop-off-service',        // invoice for one booking
    'airport-van-service-jt',          // exact dupe of jt-airport-van-service
    'bs-airport-van-service',          // exact dupe of airport-van-service-guide
    'breakfast-grocery-delivery-ht',   // dupe of ht-breakfast-grocery-option
    'bs-breakfast-grocery-option',     // dupe of breakfast-grocery-option (BS)
    'jt-payment-options',              // dupe of jt-payment-methods
    'l9-address',                      // dupe of l9-property-address
    'ht-luggage-drop-service',         // 1 fact, covered by driver-assisted
    'ht-driver-assisted-luggage-service', // 1 fact, covered by driver-assisted-luggage-service
    'sj-neighborhood-map',             // 1 fact: "naver map link" — vague
    'bs-neighborhood-map',             // 1 fact: "naver map link" — vague
    'jts-naver-map-recommendation',    // 1 fact: "download Naver Map" — vague
    'local-experience-contents',       // 1 fact: a link only
    'l9-neighborhood-info',            // 1 fact: "naver map" — vague
    'sg-neighborhood-info',            // 2 facts: both vague map advice
    'complimentary-airport-vans',      // 1 fact: covered in ht-airport-van-service
    'departure-hall-meeting-point',    // 1 fact: covered in driver-assisted-luggage-service
    'airport-luggage-service',         // 1 fact: covered
    'check-out-procedure',             // 1 fact: covered in checkout (ALL)
    'pickup-van-service',              // 1 fact: covered
    'ht-private-tour',                 // 1 fact: covered by private-van-tour (ALL)
    'luggage-storage-after-checkout',  // 1 fact: covered
    'sj-luggage-storage',              // 1 fact: covered
    'l9-luggage-storage',              // 1 fact: covered
    'luggage-service-ht',              // 1 fact: covered
    'complimentary-breakfast-details', // 1 fact: covered
    'sj-breakfast-delivery',           // 1 fact: covered by breakfast-grocery (ALL)
    'sg-breakfast-delivery',           // 1 fact: covered
    'sg-breakfast-options',            // 1 fact: covered
    'free-breakfast-service',          // 1 fact: covered
    'sj-food-delivery',                // 1 fact: trivial
    'luggage-transport-rate',          // 1 fact: covered
    'sj-airport-support-service',      // 1 fact: covered
    'sj-checkin-time',                 // 1 fact: covered by check-in-time (BS) pattern
    'jt-check-in-time',                // 1 fact: covered
    'yt-checkin-time',                 // 1 fact: covered
    'l9-checkin-time',                 // 1 fact: covered
    'early-check-in-late-check-out',   // 1 fact: covered by late-checkout-policy
    'l9-late-checkout',                // 1 fact: covered
    'neighborhood-map-link',           // 2 facts: both vague
    'easy-drop-service-hongdae',       // 1 fact: too specific
    'taxi-payment',                    // 1 fact: trivial
    'no-steps-subway-ht',              // 1 fact: trivial
    'domestic-travel-insurance-ht',    // 1 fact: one-off
    'insurance-upgrade-options-ht',    // 1 fact: one-off
    'minibus-transport-cost',          // 1 fact: covered in transport group
    'starlia-transport-cost',          // 1 fact: covered in transport group
    'guest-phone-availability',        // 1 fact: trivial
    'grocery-store-nearby',            // 1 fact: trivial
    'invoice-details',                 // 1 fact: accounting noise
    'bs-local-bus-stop',               // 1 fact: too specific
    'bs-gyeongbokgung-station',        // 1 fact: covered by naver-map-local-guide
    'bs-premium-taxi',                 // 1 fact: covered by taxi-matching
    'dmz-tour-recommendation',         // 1 fact: covered by dmz-tour-schedule
    'vehicle-rental-rates',            // 1 fact: covered
    'jt-esim-discount',                // 1 fact: minor promo
    'restaurant-break-time-sa',        // 1 fact: one-off
    'free-cancellation-policy',        // 1 fact: trivial
    'suwon-hwaseong-fortress-night-visit', // 1 fact: single activity
    'suwon-local-food-experience',     // 1 fact: too specific
    'flying-suwon-activity',           // 1 fact: too specific
    'sg-master-bedroom-ensuite',       // 1 fact: too thin
    'sg-bathroom-bidet-types',         // 1 fact: too thin
    'hair-dryers-availability-jt',     // 1 fact: covered by amenities
    'yt-nearby-seven-eleven',          // 1 fact: trivial
    'yt-parking-availability',         // 1 fact: trivial
    'neighborhood-information',        // 2 facts: vague (Naver Map advice)
    'universal-power-strip-in-bedrooms', // 1 fact: covered by universal-power-strip
    'van-service-promotions',          // 2 facts: covered in airport van group
    'payment-settlement-process',      // 3 facts: merge into payment-settlement (ALL)
    'dmz-tour-vehicle-rates',          // merge into dmz group
    'dmz-tour-admission-fees',         // merge into dmz group
]);

// ── Step 2: GPT-4o merge groups ───────────────────────────────────────────────
// [ [ids to merge], result_id, note ]
// Manual-curation entries listed first — GPT uses them as the authoritative base
const MERGE_GROUPS = [
    {
        ids: [
            // Base (manual, keep as-is foundation)
            'airport-van',
            // Property-specific — extract any unique facts then consolidate
            'airport-van-service',          // B9, 69 facts!
            'airport-van-service-guide',    // BS, 12f
            'ht-airport-van-service',       // HT, 18f
            'airport-van-service-details',  // YT, 19f
            'jt-airport-van-service',       // JT, 18f
            'airport-van-service-rates',    // HTB, 7f
            'airport-van-promotions',       // HTB, 4f
            'airport-van-additional-services', // HTB, 6f
            'l9-airport-van-service',       // L9, 5f
            'sg-airport-van-service',       // SG, 4f
            'sg-complimentary-airport-transfer', // SG, 4f
            'airport-van-service-sa',       // SA, 6f
            'sj-airport-van-service',       // SJ, 5f
            'sj-airport-transfer-van',      // SJ, 2f
            'complimentary-airport-transfer', // BS, 2f
            'additional-transport-services', // L9, 12f
            'meeting-your-driver',          // BS, 2f
            'driver-meeting-procedure',     // SJ, 4f
            'driver-assisted-luggage-service', // JT, 11f
        ],
        note: 'airport van and driver service',
    },
    {
        ids: [
            'payment-settlement',           // ALL, manual base
            'payment-methods',              // JTS, 42f
            'payment-settlement-options',   // FB, 21f
            'payment-methods-and-fees',     // SJ, 21f
            'payment-settlement-system',    // BS, 6f
            'ht-payment-methods',           // HT, 5f
            'jt-payment-methods',           // JT, 5f
            'payment-methods-sa',           // SA, 5f
            'payment-timing-options',       // FB, 2f
            'split-payment-option',         // FB, 2f
            'payment-options',              // BS, 2f
            'wise-vs-credit-card',          // BS, 2f
            'vrbo-payment-process',         // FB, 2f
            'dynamic-pricing-policy',       // ALL, 2f
        ],
        note: 'payment methods and settlement',
    },
    {
        ids: [
            'breakfast-grocery',            // ALL, manual base
            'breakfast-grocery-option',     // BS, 15f
            'ht-breakfast-grocery-option',  // HT, 3f
            'coze-breakfast-grocery-option', // YT, 4f
            'breakfast-grocery-delivery',   // HTA, 3f
            'jt-breakfast-delivery',        // JT, 2f
            'complimentary-breakfast',      // FB, 2f
        ],
        note: 'breakfast and grocery delivery',
    },
    {
        ids: [
            'taxi-matching',                // ALL, manual base
            'taxi-matching-service',        // JT, 15f
            'coze-taxi-matching-service',   // ALL, 3f
            'ht-taxi-matching-service',     // HT, 4f
            'ht-k-ride-taxi-app',           // HT, 2f
            'k-ride-taxi-app',              // JT, 2f
            'sg-taxi-app-k-ride',           // SG, 3f
            'bs-k-ride-app',               // BS, 6f
        ],
        note: 'K-RIDE taxi app and matching service',
    },
    {
        ids: [
            'private-van-tour',             // ALL, manual base
            'private-tour-service',         // JT, 2f
            'private-tour-with-tour-host',  // SJ, 3f
        ],
        note: 'private van tour and tour host',
    },
    {
        ids: [
            'dmz-tour-schedule',            // FB, 7f — base
            'dmz-tour-options',             // FB, 5f
            'dmz-tour-pricing',             // YT, 2f
        ],
        note: 'DMZ tour',
    },
    {
        ids: [
            'luggage-drop-service',         // JT, 6f — base
            'luggage-storage-service',      // B9, 3f
            'luggage-storage',              // F9, 3f
            'luggage-service-options',      // BS, 3f
            'jt-luggage-storage',           // JT, 2f
            'luggage-drop-at-home',         // HTB, 1f
            'city-check-in-locations',      // ALL, 2f
        ],
        note: 'luggage storage and drop service',
    },
    {
        ids: [
            'korean-climate-comfort',       // JT, 9f — base
            'korean-climate-control',       // BS, 5f
            'korean-heating-cooling-tips',  // JT, 2f
            'ht-air-conditioning-and-heating', // HT, 2f
        ],
        note: 'Korean climate control and HVAC',
    },
    {
        ids: [
            'karaoke-room-options',         // HT, 5f — base
            'karaoke-room-pricing',         // HT, 2f
            'karaoke-payment-process',      // HT, 2f
        ],
        note: 'karaoke rooms',
    },
    {
        ids: [
            'naver-map-local-guide',        // ALL, manual base
            'jt-neighborhood-info',         // JT, 4f
            'neighborhood-info',            // L9, 5f (has real local facts)
            'jts-neighborhood-info',        // JTS, 3f
            'ht-neighborhood-guide',        // HT, 2f
            'yeonnam-dong-neighborhood',    // FB, 2f
            'location-highlights',          // FB, 3f
            'haebangchon-neighborhood',     // HTA, 2f
        ],
        note: 'neighborhood info and local guide',
    },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const kb       = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'));
    const original = kb.entries.length;

    fs.copyFileSync(KB_PATH, BACKUP);
    console.log(`\n📚 Loaded ${original} entries. Backup → ${BACKUP}`);

    // Step 1: hard deletes
    const byId  = new Map(kb.entries.map(e => [e.id, e]));
    let deleted = 0;
    for (const id of DELETE) {
        if (byId.delete(id)) deleted++;
    }
    console.log(`\n🗑️  Hard-deleted ${deleted} noise/thin/dupe entries`);

    // Step 2: GPT-4o merges
    let mergeCount = 0;
    for (const group of MERGE_GROUPS) {
        const groupEntries = group.ids
            .map(id => byId.get(id))
            .filter(Boolean);

        if (groupEntries.length === 0) {
            console.log(`  ⚠️  "${group.note}" — no entries found, skipping`);
            continue;
        }

        console.log(`\n🤖 Merging "${group.note}" (${groupEntries.length} entries)...`);
        try {
            const result = await gpt(
                groupEntries,
                `Merge these ${groupEntries.length} entries about "${group.note}" into the minimum clean set.`
            );
            const merged = result.entries ?? [];

            // Remove all originals from map
            for (const e of groupEntries) byId.delete(e.id);

            // Add merged results
            for (const e of merged) {
                byId.set(e.id, { ...e, sensitive: false });
            }

            const saved = groupEntries.length - merged.length;
            mergeCount += saved;
            console.log(`  ✅ ${groupEntries.length} → ${merged.length} entries (saved ${saved})`);
        } catch (err) {
            console.error(`  ✗ merge failed: ${err.message} — keeping originals`);
        }
    }

    // Step 3: rebuild
    const final = [...byId.values()];
    const cleanedKB = {
        ...kb,
        generatedAt: new Date().toISOString(),
        source:      'src/knowledge/knowledge-base.json',
        entryCount:  final.length,
        propertyCodes: [...new Set(final.map(e => e.propertyCode))].sort(),
        categories:    [...new Set(final.map(e => e.category))].sort(),
        entries: final,
    };

    fs.writeFileSync(KB_PATH, JSON.stringify(cleanedKB, null, 2));

    console.log(`\n✅ Done`);
    console.log(`   Before : ${original} entries`);
    console.log(`   After  : ${final.length} entries`);
    console.log(`   Removed: ${original - final.length} entries`);
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
