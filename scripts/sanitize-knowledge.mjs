/**
 * Sanitizes knowledge-base.json after extraction:
 * 1. Removes actual Wi-Fi SSIDs and keybox PINs from facts
 * 2. Marks all check-in/door-code entries as sensitive
 * 3. Fixes property codes for entries wrongly tagged as ALL
 * 4. Lowercases all triggers
 * 5. Removes low-value marketing boilerplate entries
 *
 * Usage: node scripts/sanitize-knowledge.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const kbFile = path.join(rootDir, 'admin-ui', 'lib', 'knowledge-base.json');
const kb = JSON.parse(fs.readFileSync(kbFile, 'utf8'));

let modified = 0;
function mark(id, reason) {
  console.log(`  ✏️  [${id}] ${reason}`);
  modified++;
}

// ─── 1. Scrub actual credentials from facts ──────────────────────────────────

// Patterns that should never appear in any fact
const SCRUB_PATTERNS = [
  // Wi-Fi SSID patterns (ISP prefixes used in Korea)
  { pattern: /\bKT_GiGA_\S+/g, replace: '[SSID removed]' },
  { pattern: /\bKT-GiGA_\S+/g, replace: '[SSID removed]' },
  { pattern: /\bjoyhasla_sg_\S+/g, replace: '[SSID removed]' },
  { pattern: /\bSK_\S{4,}/g, replace: '[SSID removed]' },
  { pattern: /\bU\+\S{4,}/g, replace: '[SSID removed]' },
  // Keybox PINs — 4-digit codes preceded by "pin" or "key box" context
  // Only remove when the 4-digit code appears in a context like "pin 0805" or "requires the pin 0805"
  { pattern: /\bpin\s+(\d{4})\b/gi, replace: 'pin [removed]' },
  { pattern: /\bkey box pin\s+(\d{4})\b/gi, replace: 'key box pin [removed]' },
  { pattern: /\brequires the pin (\d{4})\b/gi, replace: 'requires the pin [removed]' },
  // Specific leaked values found in this KB
  { pattern: /\b0805\b/g, replace: '[removed]' },
  { pattern: /\b3388\b/g, replace: '[removed]' },
];

for (const entry of kb.entries) {
  for (const { pattern, replace } of SCRUB_PATTERNS) {
    for (let i = 0; i < entry.facts.length; i++) {
      const original = entry.facts[i];
      const cleaned = original.replace(pattern, replace);
      if (cleaned !== original) {
        entry.facts[i] = cleaned;
        mark(entry.id, `Scrubbed credential pattern from fact`);
      }
    }
  }
}

// ─── 2. Mark all checkin/access entries as sensitive ────────────────────────

// Use full phrases only — 'pin' alone false-positives on "shopping", "dumping", "naver pin"
const SENSITIVE_TRIGGERS = [
  'door code', 'key box', 'key pin', 'box pin', 'gate pin', 'wifi password',
  'access code', 'gate code', 'yymmdd',
];

const SENSITIVE_FACT_PATTERNS = [
  /yymmdd/i,
  /door.{0,10}code/i,
  /key.{0,5}box/i,
  /access.{0,10}code/i,
  /check.{0,5}in.{0,15}code/i,
];

for (const entry of kb.entries) {
  if (entry.sensitive) continue; // already marked
  const allText = [...entry.triggers, ...entry.facts, entry.title].join(' ').toLowerCase();
  const hasSensitiveTrigger = SENSITIVE_TRIGGERS.some((t) => allText.includes(t));
  const hasSensitiveFact = SENSITIVE_FACT_PATTERNS.some((p) => entry.facts.some((f) => p.test(f)));
  if (hasSensitiveTrigger || hasSensitiveFact) {
    entry.sensitive = true;
    mark(entry.id, `Marked sensitive (contains access/door code reference)`);
  }
}

// ─── 3. Fix wrong property codes ─────────────────────────────────────────────

// Entries from the FB chat that describe Yeonnam-dong/Mapo-gu are FB-specific, not ALL
const PROPERTY_FIXES = {
  // FB chat → Yeonnam-dong, Mapo-gu
  'mapo-gu-seongmisanro': 'FB',
  'kitchen-amenities': 'FB',
  'food-delivery-and-waste': 'FB',
  'transportation-and-parking': 'FB',
  'check-in-and-access': 'FB',
};

for (const entry of kb.entries) {
  if (entry.id in PROPERTY_FIXES && entry.propertyCode === 'ALL') {
    const correct = PROPERTY_FIXES[entry.id];
    entry.propertyCode = correct;
    mark(entry.id, `Fixed propertyCode: ALL → ${correct} (source-based correction)`);
  }
}

// ─── 4. Lowercase all triggers ───────────────────────────────────────────────

for (const entry of kb.entries) {
  const lowered = entry.triggers.map((t) => t.toLowerCase());
  if (lowered.some((t, i) => t !== entry.triggers[i])) {
    entry.triggers = lowered;
    mark(entry.id, `Lowercased triggers`);
  }
}

// ─── 5. Remove low-value marketing boilerplate entries ───────────────────────
// These are "COZE is great" marketing copy repeated from every welcome message.
// They add no factual value for RAG — the facts are too vague to answer any guest question.

const REMOVE_IDS = new Set([
  'coze-gaya-welcome',        // BS: "COZE curates the Korean experience" boilerplate
  'coze-curated-experience',  // SA: same boilerplate
  'coze-experience',          // ALL: same boilerplate from L9
  'coze-hospitality-3-0',     // ALL: same boilerplate from FB
  'coze-local-experiences',   // ALL: "COZE curates local experiences" — too vague
  'travel-tips',              // ALL: "minimize jet lag by sleeping" — not property-specific
]);

const before = kb.entries.length;
kb.entries = kb.entries.filter((e) => {
  if (REMOVE_IDS.has(e.id)) {
    mark(e.id, `Removed (low-value marketing boilerplate)`);
    return false;
  }
  return true;
});

// ─── 6. Rebuild metadata ─────────────────────────────────────────────────────

kb.entryCount = kb.entries.length;
kb.propertyCodes = ['ALL', ...new Set(
  kb.entries.map((e) => e.propertyCode).filter((c) => c && c !== 'ALL')
).values()].sort((a, b) => a === 'ALL' ? -1 : b === 'ALL' ? 1 : a.localeCompare(b));
kb.categories = [...new Set(kb.entries.map((e) => e.category).filter(Boolean))].sort();
kb.generatedAt = new Date().toISOString();

fs.writeFileSync(kbFile, `${JSON.stringify(kb, null, 2)}\n`, 'utf8');

console.log(`\n✅ Sanitization complete`);
console.log(`   Changes: ${modified}`);
console.log(`   Entries: ${before} → ${kb.entries.length} (removed ${before - kb.entries.length})`);
console.log(`   Properties: ${kb.propertyCodes.join(', ')}`);
