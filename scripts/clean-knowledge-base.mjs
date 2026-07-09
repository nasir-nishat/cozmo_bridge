/**
 * One-shot cleanup for knowledge-base.json:
 *   1. Merge 16 hand-curated seed entries from wa-knowledge-data.json (seeds win on propertyCode/title)
 *   2. Remove 5 encoding-corrupted entries
 *   3. Remove per-property cooking-class, hanbok, waste-disposal entries (seeds cover them)
 *   4. Consolidate all celebration/party-styling entries into one ALL entry
 *   5. Merge explicit duplicate pairs
 *
 * No API calls. Writes a .bak before touching the original.
 */
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const kbFile  = path.join(rootDir, 'admin-ui', 'lib', 'knowledge-base.json');
const wkdFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-knowledge-data.json');

const kb  = JSON.parse(fs.readFileSync(kbFile,  'utf8'));
const wkd = JSON.parse(fs.readFileSync(wkdFile, 'utf8'));

// ── Convert wa-knowledge-data entries to KB format ──────────────────────────
function convertSeed(entry) {
  const propertyCode = (entry.propertyCodes?.length === 1) ? entry.propertyCodes[0] : 'ALL';
  return {
    id:           entry.id,
    propertyCode,
    category:     entry.category,
    title:        entry.title,
    triggers:     entry.triggers  ?? [],
    facts:        (entry.facts   ?? []).filter(f => String(f).trim().length >= 25),
    links:        entry.links    ?? [],
    sensitive:    entry.sensitive ?? false,
    source:       'manual-curation',
  };
}

const seeds   = wkd.entries.map(convertSeed);
const seedIds = new Set(seeds.map(e => e.id));

// ── Rules ────────────────────────────────────────────────────────────────────

// 1. Encoding-corrupted entries → delete
const CORRUPTED = new Set([
  'property-address', 'jts-korean-address',
  'nearest-supermarket', 'nearest-pork-bbq', 'bs-address',
]);

// 2. Topics fully covered by seeds → remove all AI versions
//    Seeds: cooking-class, hanbok-photo-shoot, waste-disposal (all tagged ALL)
const SEED_TOPIC_RE = [
  /cooking[_-]class|korean[_-]cooking|kimchi[_-]class|cooking[_-]experience/i,
  /hanbok/i,
  /waste[_-]dispos|waste[_-]sort|garbage[_-]separ|seoul[_-]waste|[_-]garbage[_-]|[_-]waste[_-]/i,
];
function matchesSeedTopic(id) {
  return SEED_TOPIC_RE.some(re => re.test(id));
}

// 3. Celebration entries → consolidate into one ALL entry
const CELEBRATION_RE = /celebrat|party[_-]styl|in[_-]room[_-]party/i;

// 4. Explicit duplicate merge groups: [survivor, ...others to absorb then delete]
const MERGE_GROUPS = [
  ['ht-airport-van-service',   'airport-van-service-ht'],
  ['sj-airport-van-service',   'sj-van-service-rates', 'van-service-rates'],
  ['sj-airport-transfer-van',  'complimentary-van-transfer'],
  ['payment-methods-and-fees', 'sj-payment-methods'],
  ['complimentary-breakfast',  'complimentary-breakfast-delivery'],
  ['jt-seoul-station-pickup',  'seoul-station-pickup'],
];

// ── Filter AI entries ─────────────────────────────────────────────────────────
const celebrationEntries = [];
const keptAiEntries      = [];

for (const entry of kb.entries) {
  if (CORRUPTED.has(entry.id))       { continue; }
  if (matchesSeedTopic(entry.id))    { continue; }
  if (CELEBRATION_RE.test(entry.id)) { celebrationEntries.push(entry); continue; }
  keptAiEntries.push(entry);
}

// ── Build celebration ALL entry ───────────────────────────────────────────────
let celebrationEntry = null;
if (celebrationEntries.length > 0) {
  const allFacts    = [...new Set(celebrationEntries.flatMap(e => e.facts))];
  const allTriggers = [...new Set(celebrationEntries.flatMap(e => e.triggers))];
  const allLinks    = [...new Set(celebrationEntries.flatMap(e => e.links))];
  celebrationEntry = {
    id:           'celebration-party-styling',
    propertyCode: 'ALL',
    category:     'services',
    title:        'In-room celebration and party styling',
    triggers:     allTriggers.length > 0 ? allTriggers : ['celebration', 'party', 'balloons', 'flowers', 'birthday', 'anniversary'],
    facts:        allFacts,
    links:        allLinks,
    sensitive:    false,
    source:       'consolidated',
  };
}

// ── Merge explicit duplicate groups ──────────────────────────────────────────
const byId = new Map(keptAiEntries.map(e => [e.id, { ...e }]));

for (const [survivorId, ...mergeIds] of MERGE_GROUPS) {
  const survivor = byId.get(survivorId);
  if (!survivor) continue;
  for (const mid of mergeIds) {
    const other = byId.get(mid);
    if (!other) continue;
    survivor.facts    = [...new Set([...survivor.facts,    ...other.facts])];
    survivor.triggers = [...new Set([...survivor.triggers, ...other.triggers])];
    survivor.links    = [...new Set([...survivor.links,    ...other.links])];
    byId.delete(mid);
  }
}

// ── Combine: seeds first, then celebration, then cleaned AI entries ───────────
const finalEntries = [];
const usedIds      = new Set();

for (const seed of seeds) {
  finalEntries.push(seed);
  usedIds.add(seed.id);
}

if (celebrationEntry && !usedIds.has(celebrationEntry.id)) {
  finalEntries.push(celebrationEntry);
  usedIds.add(celebrationEntry.id);
}

for (const entry of byId.values()) {
  if (usedIds.has(entry.id)) {
    // Same ID as a seed → merge unique facts in, seed's metadata wins
    const existing = finalEntries.find(e => e.id === entry.id);
    if (existing) {
      existing.facts    = [...new Set([...existing.facts,    ...entry.facts])];
      existing.triggers = [...new Set([...existing.triggers, ...entry.triggers])];
      existing.links    = [...new Set([...existing.links,    ...entry.links])];
    }
  } else {
    finalEntries.push(entry);
    usedIds.add(entry.id);
  }
}

// ── Write output ──────────────────────────────────────────────────────────────
const payload = {
  ...kb,
  generatedAt: new Date().toISOString(),
  entryCount:    finalEntries.length,
  propertyCodes: ['ALL', ...new Set(finalEntries.map(e => e.propertyCode).filter(c => c && c !== 'ALL'))].sort(),
  categories:    [...new Set(finalEntries.map(e => e.category).filter(Boolean))].sort(),
  entries:       finalEntries,
};

// Backup first — never lose the gpt-4o data
fs.copyFileSync(kbFile, kbFile + '.bak');
fs.writeFileSync(kbFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');

const removedCorrupted    = [...CORRUPTED].filter(id => kb.entries.some(e => e.id === id)).length;
const removedSeedTopics   = kb.entries.filter(e => matchesSeedTopic(e.id)).length;
const celebConsolidated   = celebrationEntries.length;

console.log(`Backup written to knowledge-base.json.bak`);
console.log(`\nBefore: ${kb.entryCount} entries`);
console.log(`After:  ${payload.entryCount} entries`);
console.log(`\nRemoved:`);
console.log(`  Encoding-corrupted:          ${removedCorrupted}`);
console.log(`  Seed-topic duplicates:       ${removedSeedTopics}`);
console.log(`  Celebration consolidated:    ${celebConsolidated} → 1`);
console.log(`  Explicit duplicate merges:   ${MERGE_GROUPS.reduce((n, g) => n + (g.slice(1).filter(id => kb.entries.some(e => e.id === id)).length), 0)}`);
console.log(`\nSeeds added from wa-knowledge-data: ${seeds.length}`);
