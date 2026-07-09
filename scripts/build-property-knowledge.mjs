import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const rootDir = process.cwd();
const _require = createRequire(import.meta.url);
const _eco = _require('../ecosystem.config.js');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || _eco.apps[0].env.OPENAI_API_KEY;
const corpusFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-knowledge-corpus.json');
const existingKbFile = path.join(rootDir, 'admin-ui', 'lib', 'knowledge-base.json');
const outputFile = path.join(rootDir, 'admin-ui', 'lib', 'knowledge-base.json');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';
const MAX_CHAT_CHARS = 9000;
const MIN_CHAT_CHARS = 180;
const VALID_CATEGORIES = new Set(['amenities', 'transport', 'food', 'services', 'neighborhood', 'checkin', 'checkout', 'payment', 'safety', 'experiences', 'house-rules', 'property']);
const BOILERPLATE_PATTERNS = [
  /all you need\. all in one\. all yours/iu,
  /welcome to korea/iu,
  /welcome to coze/iu,
  /my name is gaya/iu,
  /invite your family to join/iu,
  /personalized service just for you/iu,
  /thank you for staying/iu,
  /if you need anything, just message us/iu,
];
const VAGUE_FACT_PATTERNS = [
  /^coze (?:helps|provides|offers|supports|curates)/iu,
  /guest experience/iu,
  /personalized service/iu,
  /local friends/iu,
  /wonderful stay/iu,
];
const SENSITIVE_PATTERN = /\b(?:wifi|wi-fi|password|passcode|pin|keybox|key box|door code|gate code|front door pin|main gate pin|smartlock|smart lock)\b/iu;

function toPosixRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

async function callLLM(system, user) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 2000,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

function parseJsonFromResponse(text) {
  const clean = text.replace(/^```json\s*/iu, '').replace(/```\s*$/iu, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = text.match(/\[[\s\S]*\]/u);
    if (!match) return [];
    try { return JSON.parse(match[0]); } catch { return []; }
  }
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function normalizeText(text) {
  return String(text).normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function isBoilerplate(text) {
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text));
}

function isUsefulFact(fact) {
  const text = normalizeText(fact);
  if (text.length < 25) return false;
  if (SENSITIVE_PATTERN.test(text)) return false;
  if (VAGUE_FACT_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return true;
}

function loadExistingEntries() {
  if (!fs.existsSync(existingKbFile)) return [];
  const kb = JSON.parse(fs.readFileSync(existingKbFile, 'utf8'));
  return (kb.entries ?? []).map((entry) => ({
    id: entry.id,
    propertyCode: entry.propertyCode ?? (entry.propertyCodes?.length === 1 ? entry.propertyCodes[0] : 'ALL'),
    category: entry.category,
    title: entry.title,
    triggers: entry.triggers ?? [],
    facts: entry.facts ?? [],
    links: entry.links ?? [],
    sensitive: entry.sensitive ?? false,
    source: entry.source ?? 'knowledge-base',
  }));
}

function buildChatInputs(corpus) {
  const byChat = new Map();
  for (const message of corpus.messages ?? []) {
    if (message.role !== 'staff' || isBoilerplate(message.text) || SENSITIVE_PATTERN.test(message.text)) continue;
    for (const source of message.sources ?? []) {
      if (!byChat.has(source.chatId)) {
        byChat.set(source.chatId, { chatId: source.chatId, title: source.chatTitle, propertyCode: source.propertyCode ?? 'ALL', messages: [] });
      }
      byChat.get(source.chatId).messages.push({ messageId: source.messageId, sender: source.sender, text: message.text });
    }
  }

  return [...byChat.values()].map((chat) => ({
    ...chat,
    messages: chat.messages
      .sort((a, b) => Number(a.messageId) - Number(b.messageId))
      .filter((message, index, arr) => arr.findIndex((item) => item.text === message.text) === index),
  })).filter((chat) => chat.messages.map((message) => message.text).join('\n').length >= MIN_CHAT_CHARS);
}

const KNOWN_PROPERTY_CODES = 'BS, SG, SJ, SA, SWA, JT, JTS, HT, HTA, HTB, B9, F9, L9, FB, YT, GK, GKA, GKB';

const SYSTEM_PROMPT = `Extract only reusable, concrete hospitality facts from cleaned COZE staff messages.

Reject greetings, thank-you text, marketing copy, generic service claims, and one-off booking logistics.
Never include Wi-Fi credentials, door codes, key-box pins, gate codes, phone numbers, or emails.

Known property codes: ${KNOWN_PROPERTY_CODES}
Use the exact property code from the source chat header. Use "ALL" only if the fact applies to every property.

Return ONLY a JSON array. Each object must match:
{
  "id": "kebab-case-slug",
  "propertyCode": "one of the known codes above, or ALL",
  "category": "amenities|transport|food|services|neighborhood|checkin|checkout|payment|safety|experiences|house-rules|property",
  "title": "short factual title",
  "triggers": ["guest keyword"],
  "facts": ["specific reusable fact with exact price/time/address/rule/process when present"],
  "links": ["https://..."],
  "sensitive": false
}`;

async function extractFromChat(chat) {
  const body = chat.messages.map((message) => `[${message.sender} #${message.messageId}]: ${message.text}`).join('\n\n');
  const truncated = body.length > MAX_CHAT_CHARS ? `${body.slice(0, MAX_CHAT_CHARS)}\n...(truncated)` : body;
  const prompt = `Property: ${chat.propertyCode}
Source chat: ${chat.title}
Source chat ID: ${chat.chatId}

Clean staff messages:

${truncated}`;
  const entries = parseJsonFromResponse(await callLLM(SYSTEM_PROMPT, prompt));
  if (!Array.isArray(entries)) return [];

  return entries.map((entry) => {
    const facts = (entry.facts ?? []).filter(isUsefulFact);
    return {
      id: entry.id ? slugify(entry.id) : slugify(entry.title),
      propertyCode: entry.propertyCode ?? chat.propertyCode,
      category: VALID_CATEGORIES.has(entry.category) ? entry.category : 'services',
      title: entry.title,
      triggers: (entry.triggers ?? []).map((trigger) => normalizeText(trigger)).filter(Boolean),
      facts,
      links: (entry.links ?? []).filter((link) => /^https?:\/\//iu.test(link)),
      sensitive: false, source: chat.title,
    };
  }).filter((entry) => entry.id && entry.title && entry.facts.length > 0);
}

function dedupEntries(entries) {
  const byId = new Map();
  for (const entry of entries) {
    const id = entry.id || slugify(entry.title);
    if (!byId.has(id)) {
      byId.set(id, { ...entry, id });
      continue;
    }
    const existing = byId.get(id);
    existing.facts = [...new Set([...existing.facts, ...entry.facts])];
    existing.triggers = [...new Set([...existing.triggers, ...entry.triggers])];
    existing.links = [...new Set([...existing.links, ...entry.links])];
  }
  return [...byId.values()];
}

const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
const chatInputs = buildChatInputs(corpus);
const existingEntries = loadExistingEntries();
console.log(`Loaded ${chatInputs.length} clean chat inputs from ${toPosixRelative(corpusFile)}`);
console.log(`Loaded ${existingEntries.length} existing cross-property entries`);

const newEntries = [];
for (const chat of chatInputs) {
  console.log(`\nProcessing: ${chat.title}`);
  try {
    const extracted = await extractFromChat(chat);
    console.log(`   -> ${extracted.length} entries extracted`);
    newEntries.push(...extracted);
  } catch (err) {
    console.error(`   -> extraction failed: ${err.message}`);
  }
}

const entries = dedupEntries([...existingEntries, ...newEntries]);
const payload = {
  version: 3,
  generatedAt: new Date().toISOString(),
  source: 'src/knowledge/wa-knowledge-corpus.json',
  entryCount: entries.length,
  propertyCodes: ['ALL', ...new Set(entries.map((entry) => entry.propertyCode).filter((code) => code && code !== 'ALL'))].sort(),
  categories: [...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort(),
  entries,
};

fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`\nWrote ${toPosixRelative(outputFile)}`);
console.log(`Entries: ${payload.entryCount}`);
