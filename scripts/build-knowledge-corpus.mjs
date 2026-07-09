import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const inputFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-chat-data.json');
const outputFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-knowledge-corpus.json');

const STAFF_SENDER_PATTERN = /^COZE_/u;
const BOT_SENDER_PATTERN = /^COZMO AI$/u;
const URL_PATTERN = /https?:\/\/\S+/iu;
const MONEY_PATTERN = /(?:krw|won|₩|\$|usd|jpy|yen|cny|rmb|sgd|hkd|eur|gbp|\d[\d,.]*\s*(?:k|만원|원))/iu;
const TIME_PATTERN = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:hours?|hrs?)\b/iu;
const QUESTION_PATTERN = /[?？]|^(?:can|could|do|does|is|are|what|where|when|how|may|will|would|should|please)\b/iu;
const FILE_ATTACHMENT_PATTERN = /\.(?:jpe?g|png|webp|gif|pdf|mp4|mov|webm|heic|xlsx?|docx?|pptx?)\s+\(file attached\)$/iu;
const PHONE_PATTERN = /(?:\+\d[\d\s().-]{7,}\d)|(?:\b010[-\s]?\d{4}[-\s]?\d{4}\b)/u;
const ACCESS_KEYWORDS_PATTERN = /\b(?:door|gate|keybox|key box|wifi|wi-fi|password|passcode|pin|lock|smartlock|smart lock)\b/iu;
const RESERVED_ACCESS_PATTERN = /\b(?:wifi|wi-fi|password|passcode|pin code|keybox|key box|door code|gate code|front door pin|main gate pin|smartlock|smart lock)\b/iu;
const CODELIKE_PATTERN = /\b(?:\d{4,8}|[A-Z0-9]{6,})\b/u;
const SPACED_CODE_PATTERN = /(?:^|[^\d])(?:\d\s+){3,}\d(?:\s*\*)?(?:$|[^\d])/u;
const PASSWORD_VALUE_PATTERN = /\b(?:ps|pw|password|passcode)\b\s*[:#-]?\s*\S{4,}/iu;

const ACKS = new Set([
  'ok',
  'okay',
  'okk',
  'yes',
  'yeah',
  'yep',
  'no',
  'nope',
  'sure',
  'thanks',
  'thank you',
  'thankyou',
  'ty',
  'noted',
  'got it',
  'great',
  'perfect',
  'nice',
  'cool',
  'alright',
  'all right',
  'done',
  'welcome',
  '감사합니다',
  '네',
  '넵',
  '예',
  '아니요',
]);

const OPERATIONAL_PATTERNS = [
  /^\d{3,5}\s*\/\s*(?:taxi|van|clean|cleaning|laundry|driver|pickup|eta)\b/iu,
  /^(?:taxi|van|driver|pickup|eta)\s*\/\s*\d+/iu,
  /^plate number\b.*\/.*\b(?:van|taxi|min|paid)\b/iu,
  /^\d+\s*(?:min|mins|minutes)\b/iu,
  /^\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-/]\s*/iu,
];

const CATEGORY_HINTS = [
  ['transport', /\b(?:airport|van|taxi|pickup|driver|staria|incheon|gimpo|luggage|transport)\b/iu],
  ['food', /\b(?:food|delivery|coupang|breakfast|grocery|restaurant|meal|bbq|barbecue)\b/iu],
  ['checkout', /\b(?:checkout|check-out|leaving|departure|settlement|final bill)\b/iu],
  ['checkin', /\b(?:checkin|check-in|arrival|early check|late check)\b/iu],
  ['house-rules', /\b(?:trash|garbage|waste|recycling|noise|smoking|parking|rule)\b/iu],
  ['neighborhood', /\b(?:nearby|naver|map|address|station|market|store|atm|hospital|clinic)\b/iu],
  ['services', /\b(?:tour|class|hanbok|shopping|reservation|booking|service)\b/iu],
  ['access', ACCESS_KEYWORDS_PATTERN],
  ['payment', /\b(?:payment|pay|cash|card|transfer|vat|fee|deposit|refund)\b/iu],
  ['amenities', /\b(?:pool|jacuzzi|fire pit|firepit|sauna|washer|dryer|kitchen|bed|amenity)\b/iu],
];

function toPosixRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function hashText(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

function normalizeText(text) {
  return text
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .replace(/\u00a0/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .trim()
    .toLowerCase();
}

function cleanedText(text) {
  return text
    .replace(/\r\n?/gu, '\n')
    .replace(/\u00a0/gu, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function wordCount(text) {
  return text.split(/\s+/u).filter(Boolean).length;
}

function inferRole(sender) {
  if (!sender) return 'system';
  if (BOT_SENDER_PATTERN.test(sender)) return 'bot';
  if (STAFF_SENDER_PATTERN.test(sender)) return 'staff';
  return 'guest';
}

function categoryHints(text) {
  return CATEGORY_HINTS
    .filter(([, pattern]) => pattern.test(text))
    .map(([category]) => category);
}

function isLikelyAck(normalized, words) {
  if (ACKS.has(normalized)) return true;
  if (words <= 2 && !hasInformationSignal(normalized)) return true;
  return false;
}

function isOperationalTracker(text) {
  return OPERATIONAL_PATTERNS.some((pattern) => pattern.test(text));
}

function hasInformationSignal(text) {
  return URL_PATTERN.test(text)
    || MONEY_PATTERN.test(text)
    || TIME_PATTERN.test(text)
    || QUESTION_PATTERN.test(text)
    || CATEGORY_HINTS.some(([, pattern]) => pattern.test(text));
}

function hasSensitiveAccessValue(text, role) {
  if (!RESERVED_ACCESS_PATTERN.test(text)) return false;
  if (role === 'staff') return true;
  return CODELIKE_PATTERN.test(text) || SPACED_CODE_PATTERN.test(text) || PASSWORD_VALUE_PATTERN.test(text);
}

function shouldKeepMessage(message, role) {
  const text = cleanedText(message.text ?? '');
  const normalized = normalizeText(text);
  const words = wordCount(normalized);
  const tags = [];

  if (!text) return { keep: false, reason: 'empty', tags };
  if (role === 'system') return { keep: false, reason: 'system_event', tags };
  if (role === 'bot') return { keep: false, reason: 'bot_message', tags };
  if (message.hasMediaPlaceholder || text.includes('<Media omitted>') || FILE_ATTACHMENT_PATTERN.test(text)) {
    return { keep: false, reason: 'media_or_attachment', tags };
  }
  if (PHONE_PATTERN.test(text)) {
    return { keep: false, reason: 'private_contact', tags };
  }
  if (hasSensitiveAccessValue(text, role)) {
    return { keep: false, reason: 'sensitive_access_value', tags };
  }
  if (isOperationalTracker(text)) {
    return { keep: false, reason: 'operational_tracker', tags };
  }
  if (isLikelyAck(normalized, words)) {
    return { keep: false, reason: 'acknowledgement', tags };
  }

  if (URL_PATTERN.test(text)) tags.push('has_link');
  if (MONEY_PATTERN.test(text)) tags.push('has_price');
  if (TIME_PATTERN.test(text)) tags.push('has_time');
  if (QUESTION_PATTERN.test(text)) tags.push('question');

  const hints = categoryHints(text);
  tags.push(...hints.map((hint) => `category:${hint}`));

  if (role === 'staff') {
    if (text.length >= 25 || hasInformationSignal(text)) {
      return { keep: true, reason: 'staff_informational', tags };
    }
    return { keep: false, reason: 'short_staff_noise', tags };
  }

  if (role === 'guest') {
    if (QUESTION_PATTERN.test(text) || text.length >= 30 || hasInformationSignal(text)) {
      return { keep: true, reason: 'guest_context', tags };
    }
    return { keep: false, reason: 'short_guest_noise', tags };
  }

  return { keep: false, reason: 'unknown_role', tags };
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedObjectFromMap(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function loadArchive() {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Missing ${toPosixRelative(inputFile)}. Run scripts/build-wa-chat-data.mjs first.`);
  }
  return JSON.parse(fs.readFileSync(inputFile, 'utf8'));
}

function buildCorpus(archive) {
  const byNormalizedText = new Map();
  const excludedByReason = new Map();
  const keptByRole = new Map();
  const keptByProperty = new Map();
  const sourceChatsByProperty = new Map();

  for (const chat of archive.chats ?? []) {
    if (chat.propertyCode) addCount(sourceChatsByProperty, chat.propertyCode, 0);

    for (const message of chat.messages ?? []) {
      const role = inferRole(message.sender);
      const decision = shouldKeepMessage(message, role);

      if (!decision.keep) {
        addCount(excludedByReason, decision.reason);
        continue;
      }

      const text = cleanedText(message.text);
      const normalizedText = normalizeText(text);
      const textHash = hashText(normalizedText);
      const source = {
        chatId: chat.id,
        chatTitle: chat.title,
        sourceTextFile: chat.sourceTextFile,
        propertyCode: chat.propertyCode ?? null,
        guestName: chat.guestName ?? null,
        messageId: message.id,
        timestamp: message.timestamp ?? null,
        sender: message.sender,
      };

      if (!byNormalizedText.has(normalizedText)) {
        byNormalizedText.set(normalizedText, {
          id: `corpus-${String(byNormalizedText.size + 1).padStart(5, '0')}`,
          textHash,
          role,
          text,
          normalizedText,
          categoryHints: categoryHints(text),
          qualityTags: [...new Set(decision.tags)].sort(),
          sourceCount: 0,
          propertyCodes: [],
          sources: [],
        });
      }

      const entry = byNormalizedText.get(normalizedText);
      entry.sourceCount += 1;
      entry.sources.push(source);
      if (chat.propertyCode && !entry.propertyCodes.includes(chat.propertyCode)) entry.propertyCodes.push(chat.propertyCode);

      addCount(keptByRole, role);
      if (chat.propertyCode) addCount(keptByProperty, chat.propertyCode);
      if (chat.propertyCode) addCount(sourceChatsByProperty, chat.propertyCode);
    }
  }

  const messages = [...byNormalizedText.values()].map((entry) => ({
    ...entry,
    propertyCodes: entry.propertyCodes.sort(),
    sources: entry.sources.sort((a, b) => {
      const chatCompare = a.chatId.localeCompare(b.chatId);
      if (chatCompare !== 0) return chatCompare;
      return Number(a.messageId) - Number(b.messageId);
    }),
  }));

  messages.sort((a, b) => {
    const aFirst = a.sources[0]?.timestamp ?? '';
    const bFirst = b.sources[0]?.timestamp ?? '';
    return aFirst.localeCompare(bFirst) || a.id.localeCompare(b.id);
  });

  messages.forEach((entry, index) => {
    entry.id = `corpus-${String(index + 1).padStart(5, '0')}`;
  });

  return {
    messages,
    stats: {
      inputChats: archive.chatCount ?? archive.chats?.length ?? 0,
      inputMessages: archive.messageCount ?? 0,
      keptUniqueMessages: messages.length,
      keptSourceMessages: messages.reduce((total, message) => total + message.sourceCount, 0),
      duplicateSourceMessages: messages.reduce((total, message) => total + Math.max(0, message.sourceCount - 1), 0),
      excludedByReason: sortedObjectFromMap(excludedByReason),
      keptByRole: sortedObjectFromMap(keptByRole),
      keptByProperty: sortedObjectFromMap(keptByProperty),
    },
  };
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, filePath);
}

const archive = loadArchive();
const { messages, stats } = buildCorpus(archive);
const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'src/knowledge/wa-chat-data.json',
  policy: {
    purpose: 'Clean reusable WhatsApp corpus for offline KB and Q&A extraction.',
    includes: ['informational staff replies', 'guest questions and context', 'source chat/message references'],
    excludes: ['system events', 'media-only messages', 'short acknowledgements', 'operational trackers', 'private contacts', 'obvious access credentials'],
    useRule: 'Use for offline extraction only. Guest-facing scheduled/welcome/check-in/checkout messages still come from Google Sheets.',
  },
  stats,
  messages,
};

writeJsonAtomic(outputFile, payload);

console.log(`Wrote ${toPosixRelative(outputFile)}`);
console.log(`Input chats: ${stats.inputChats}`);
console.log(`Input messages: ${stats.inputMessages}`);
console.log(`Kept unique messages: ${stats.keptUniqueMessages}`);
console.log(`Kept source messages: ${stats.keptSourceMessages}`);
console.log(`Duplicate source messages removed: ${stats.duplicateSourceMessages}`);
console.log(`Excluded: ${JSON.stringify(stats.excludedByReason)}`);
