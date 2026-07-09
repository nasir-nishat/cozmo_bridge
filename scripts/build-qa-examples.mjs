import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const inputFile = path.join(rootDir, 'admin-ui', 'lib', 'wa-knowledge-corpus.json');
const outputFile = path.join(rootDir, 'admin-ui', 'lib', 'qa-examples.json');

const QUESTION_PATTERN = /[?？]|^(?:can|could|do|does|is|are|what|where|when|how|may|would|should|please)\b/iu;
const RESERVED_ACCESS_PATTERN = /\b(?:wifi|wi-fi|password|passcode|pin|keybox|key box|door code|gate code|front door pin|main gate pin|smartlock|smart lock)\b/iu;
const PRIVATE_CONTACT_PATTERN = /(?:\+\d[\d\s().-]{7,}\d)|(?:\b010[-\s]?\d{4}[-\s]?\d{4}\b)|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const WEAK_ANSWER_PATTERN = /^(?:ok|okay|sure|yes|no|noted|thanks|thank you|got it|done|welcome|one moment|hold on)[.!🙏😊✅\s]*$/iu;
const FILE_ATTACHMENT_LINE_PATTERN = /^.*\.(?:jpe?g|png|webp|gif|pdf|mp4|mov|webm|heic|xlsx?|docx?|pptx?)\s+\(file attached\)\s*$/gimu;
const INFO_SIGNAL_PATTERN = /https?:\/\/|(?:krw|won|₩|\$|usd|jpy|yen|cny|rmb|sgd|hkd|eur|gbp|\d[\d,.]*\s*(?:k|만원|원))|\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)\b/iu;
const DIRECT_REPLY_PATTERN = /^(?:yes|no|sure|of course|we can|you can|please|hi|hello|thanks|thank you|it is|it will|i checked)\b/iu;
const STOP_WORDS = new Set(['about', 'after', 'also', 'and', 'able', 'before', 'can', 'check', 'could', 'does', 'from', 'have', 'hello', 'here', 'how', 'just', 'like', 'need', 'please', 'should', 'some', 'that', 'thank', 'thanks', 'there', 'this', 'time', 'what', 'when', 'where', 'will', 'with', 'would', 'your']);

const CATEGORY_PATTERNS = [
  ['checkin', /\b(?:check.?in|arrival|early check|late check|access code|door code|key box)\b/iu],
  ['checkout', /\b(?:check.?out|leaving|departure|settlement|final bill)\b/iu],
  ['amenities', /\b(?:pool|jacuzzi|fire.?pit|sauna|washer|dryer|kitchen|bed|amenity|bbq|barbecue|rooftop)\b/iu],
  ['food', /\b(?:food|delivery|coupang|breakfast|grocery|restaurant|meal)\b/iu],
  ['payment', /\b(?:payment|pay|cash|card|transfer|vat|fee|deposit|refund)\b/iu],
  ['house-rules', /\b(?:trash|garbage|waste|recycling|noise|smoking|rule|shoes|quiet hours)\b/iu],
  ['neighborhood', /\b(?:nearby|naver|map|address|station|market|store|atm|hospital|clinic)\b/iu],
  ['services', /\b(?:tour|class|hanbok|shopping|reservation|booking|service)\b/iu],
  ['transport', /\b(?:airport|van|taxi|pickup|driver|staria|incheon|gimpo|luggage|transport|dmz)\b/iu],
];

function toPosixRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function loadCorpus() {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Missing ${toPosixRelative(inputFile)}. Run scripts/build-knowledge-corpus.mjs first.`);
  }
  return JSON.parse(fs.readFileSync(inputFile, 'utf8'));
}

function categoryFor(text, hints = []) {
  const hinted = hints.find((hint) => hint !== 'access');
  if (hinted) return hinted;
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'general';
}

function categoriesFor(text, hints = []) {
  return [...new Set([
    ...hints.filter((hint) => hint !== 'access'),
    ...CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([category]) => category),
  ])];
}

function cleanExampleText(text) {
  return text.replace(FILE_ATTACHMENT_LINE_PATTERN, '').replace(/\n{3,}/gu, '\n\n').trim();
}

function meaningfulTokens(text) {
  return new Set(text.toLowerCase().match(/[a-z0-9가-힣]{4,}/giu)?.filter((token) => !STOP_WORDS.has(token)) ?? []);
}

function hasTokenOverlap(questionText, answerText) {
  const qTokens = meaningfulTokens(questionText);
  const aTokens = meaningfulTokens(answerText);
  return [...qTokens].some((token) => aTokens.has(token));
}

function isQuestionLike(message) {
  const text = cleanExampleText(message.text);
  return message.role === 'guest' && text.length >= 12 && QUESTION_PATTERN.test(text);
}

function isSafeText(text) {
  return !RESERVED_ACCESS_PATTERN.test(text) && !PRIVATE_CONTACT_PATTERN.test(text);
}

function isStrongAnswer(message) {
  const text = message.text.trim();
  if (message.role !== 'staff') return false;
  if (!isSafeText(text)) return false;
  if (WEAK_ANSWER_PATTERN.test(text)) return false;
  if (text.length < 20) return false;
  return text.length >= 45 || INFO_SIGNAL_PATTERN.test(text) || categoriesFor(text, message.categoryHints).length > 0;
}

function flattenSources(corpus) {
  const rows = [];
  for (const message of corpus.messages ?? []) {
    for (const source of message.sources ?? []) {
      rows.push({
        corpusId: message.id, role: message.role, text: message.text,
        categoryHints: message.categoryHints ?? [],
        chatId: source.chatId, chatTitle: source.chatTitle,
        sourceTextFile: source.sourceTextFile,
        propertyCode: source.propertyCode,
        messageId: Number(source.messageId),
        timestamp: source.timestamp, sender: source.sender,
      });
    }
  }
  return rows.sort((a, b) => {
    const chatCompare = a.chatId.localeCompare(b.chatId);
    if (chatCompare !== 0) return chatCompare;
    return a.messageId - b.messageId;
  });
}

function groupByChat(rows) {
  const byChat = new Map();
  for (const row of rows) {
    if (!byChat.has(row.chatId)) byChat.set(row.chatId, []);
    byChat.get(row.chatId).push(row);
  }
  return byChat;
}

function buildExamples(corpus) {
  const rowsByChat = groupByChat(flattenSources(corpus));
  const examples = [];
  const seen = new Set();
  for (const rows of rowsByChat.values()) {
    for (let i = 0; i < rows.length; i += 1) {
      const question = rows[i];
      if (!isQuestionLike(question) || !isSafeText(question.text)) continue;
      const questionText = cleanExampleText(question.text);
      if (!questionText) continue;
      const questionCategories = categoriesFor(questionText, question.categoryHints);
      const answer = rows.slice(i + 1, i + 6).find((candidate) => {
        if (!isStrongAnswer(candidate)) return false;
        const gap = candidate.messageId - question.messageId;
        if (gap > 3) return false;
        const answerCategories = categoriesFor(candidate.text, candidate.categoryHints);
        const overlaps = questionCategories.some((category) => answerCategories.includes(category));
        return (overlaps && (DIRECT_REPLY_PATTERN.test(candidate.text) || hasTokenOverlap(questionText, candidate.text)))
          || (gap === 1 && DIRECT_REPLY_PATTERN.test(candidate.text));
      });
      if (!answer) continue;
      const gap = answer.messageId - question.messageId;
      if (gap <= 0 || gap > 3) continue;
      const answerText = cleanExampleText(answer.text);
      const key = `${questionText.toLowerCase()}::${answerText.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const combinedText = `${questionText}\n${answerText}`;
      const category = categoryFor(combinedText, [...question.categoryHints, ...answer.categoryHints]);
      examples.push({
        id: `qa-${String(examples.length + 1).padStart(4, '0')}`,
        category, propertyCode: question.propertyCode ?? answer.propertyCode ?? null,
        chatId: question.chatId, chatTitle: question.chatTitle,
        question: questionText, answer: answerText,
        source: {
          sourceTextFile: question.sourceTextFile, questionCorpusId: question.corpusId, answerCorpusId: answer.corpusId,
          questionMessageId: String(question.messageId),
          answerMessageId: String(answer.messageId),
          questionSender: question.sender, answerSender: answer.sender,
          questionTimestamp: question.timestamp, answerTimestamp: answer.timestamp,
        },
        quality: { messageGap: gap, questionLength: question.text.length, answerLength: answer.text.length },
      });
    }
  }
  return examples.sort((a, b) => {
    const categoryCompare = a.category.localeCompare(b.category);
    if (categoryCompare !== 0) return categoryCompare;
    return a.chatId.localeCompare(b.chatId) || Number(a.source.questionMessageId) - Number(b.source.questionMessageId);
  }).map((example, index) => ({
    ...example,
    id: `qa-${String(index + 1).padStart(4, '0')}`,
  }));
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item) ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, filePath);
}

const corpus = loadCorpus();
const examples = buildExamples(corpus);
const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'src/knowledge/wa-knowledge-corpus.json',
  policy: {
    purpose: 'Few-shot style examples from real WhatsApp guest questions and staff answers.',
    excludes: ['reserved access credentials', 'private contacts', 'weak acknowledgements', 'media-only replies'],
    useRule: 'Use only as style and interaction examples. Facts still require KB, Sheets, or approved property/access sources.',
  },
  stats: {
    corpusMessages: corpus.stats?.keptUniqueMessages ?? corpus.messages?.length ?? 0,
    exampleCount: examples.length,
    byCategory: countBy(examples, (example) => example.category),
    byProperty: countBy(examples, (example) => example.propertyCode),
  },
  examples,
};

writeJsonAtomic(outputFile, payload);

console.log(`Wrote ${toPosixRelative(outputFile)}`);
console.log(`Examples: ${examples.length}`);
console.log(`Categories: ${Object.keys(payload.stats.byCategory).join(', ')}`);
