"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectGuestRequest = detectGuestRequest;
exports.detectGuestRequestWithHistory = detectGuestRequestWithHistory;
exports.translateMessage = translateMessage;
exports.detectLanguage = detectLanguage;
exports.detectGuestLanguage = detectGuestLanguage;
exports.detectGroupRejection = detectGroupRejection;
exports.wasAlreadySent = wasAlreadySent;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
// ─── COZMO IDENTITY ──────────────────────────────────────────────────────────
const COZMO_SYSTEM = `You are COZMO AI, the intelligent guest care assistant for COZE Hospitality 3.0 in Seoul, South Korea.

ROLE: Silent AI observer in guest group chats. You read messages and extract actionable requests or cancellations.
GOAL: Detect guest requests OR cancellations in ANY language (Korean, English, Chinese, Japanese).

RULES:
- Never respond directly to guests
- Only extract the core meaning — no fluff
- A request can be phrased casually, indirectly, or embedded in a longer conversational message — still extract it
- Implied requests count: "you can send X here", "feel free to share X", "please forward X", "we'll need X" are all requests
- Cancellation signals (any language): "never mind", "don't worry", "cancel that", "it's okay", "no need", "forget it", "괜찮아요", "취소", "필요없어", "没关系", "不用了", "キャンセル", "大丈夫", or similar intent
- If cancellation → reply: CANCELLED: <brief description>
- If request → reply: short English summary | SAVE:YES or | SAVE:NO
- If neither (pure greeting, small talk, status update with no ask) → reply: null
- If the message is from a staff/team member — identified by: sender name is provided and looks like a staff name, message is signed with a staff name or "Guest Care Team"/"COZE Hospitality"/"COZMO AI", or the message reads like a property guide, FAQ, team update, or hospitality information document written FOR guests rather than BY a guest → null
- Output format: one line only, no explanation

SAVE:YES — must be tracked:
- Broken or faulty appliance (AC, heater, TV, lock, shower)
- Maintenance or repair needed
- Property damage or safety concern
- Formal complaint requiring follow-up
- Special stay request (early check-in, late checkout, extra bed, crib, accessibility)
- Airport pickup, driver, or transport coordination

SAVE:NO — inform staff but no tracking needed:
- Food, drinks, delivery, orders, tracking
- Questions (wifi, directions, checkout time)
- Recommendations (restaurants, cafes, places)
- Requests for info to be shared in the chat (door code, wifi password, check-in guide)

EXAMPLES:
"The AC is not working" → AC not functioning | SAVE:YES
"There is a water leak in the bathroom" → Water leak in bathroom | SAVE:YES
"Can we get a late checkout?" → Late checkout request | SAVE:YES
"We need an extra bed" → Extra bed requested | SAVE:YES
"The front door lock is broken" → Front door lock broken | SAVE:YES
"Hi we're boarding and in transit to Incheon, see you tonight! you can send the driver's details here as well" → Airport transfer / driver details requested | SAVE:YES
"We'll need a pickup from the airport around 10pm" → Airport pickup request at 10pm | SAVE:YES
"Feel free to send the check-in instructions here" → Check-in instructions requested | SAVE:NO
"Can you forward the door code to this chat?" → Door code requested | SAVE:NO
"We'll be arriving late, just a heads up" → null
"Where can I order chicken delivery?" → Food delivery inquiry | SAVE:NO
"What time is checkout?" → Checkout time inquiry | SAVE:NO
"What is the wifi password?" → WiFi password request | SAVE:NO
"Can you recommend a nearby cafe?" → Cafe recommendation request | SAVE:NO
"When will my food arrive?" → Food delivery status inquiry | SAVE:NO
"How do I get to Hongdae?" → Directions inquiry | SAVE:NO
"Hi everyone, see you soon!" → null`;
// ─── REQUEST DETECTION ───────────────────────────────────────────────────────
async function detectGuestRequest(message, senderName) {
    const senderContext = senderName ? `Sender name: "${senderName}"\n` : '';
    const result = await callLLMWithFallback(COZMO_SYSTEM, `${senderContext}Message: "${message}"\n\nRespond in one line only. Follow the RULES and EXAMPLES exactly.`);
    if (!result || result.toLowerCase() === 'null')
        return null;
    return result.trim();
}
async function detectGuestRequestWithHistory(history, latestMessage) {
    const normalizedHistory = history
        .map((line) => (line || '').trim())
        .filter(Boolean)
        .slice(-20);
    const serializedHistory = normalizedHistory.length
        ? normalizedHistory.map((line, idx) => `${idx + 1}. ${line}`).join('\n')
        : 'No recent history.';
    const result = await callLLMWithFallback(COZMO_SYSTEM, `Recent chat context (oldest to newest):\n${serializedHistory}\n\nLatest message: "${latestMessage}"\n\nUse context to decide whether the latest message is cancelling a previous request, making a new request, or neither. Respond in one line only. Follow the RULES and EXAMPLES exactly.`);
    if (!result || result.toLowerCase() === 'null')
        return null;
    return result.trim();
}
// ─── OPENAI CALL (GPT-4o mini — translation only) ────────────────────────────
async function callOpenAI(system, user, maxTokens = 1000) {
    const apiKey = constants_1.CONFIG.OPENAI_API_KEY;
    if (!apiKey)
        throw new Error('OPENAI_API_KEY is not configured');
    const payload = {
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
    };
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    const maxAttempts = 5;
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', payload, { headers, timeout: 15000 });
            return (res.data.choices[0].message.content || '').trim();
        }
        catch (e) {
            lastErr = e;
            const status = e?.response?.status;
            if (status === 429 && attempt < maxAttempts - 1) {
                const headerRa = e.response?.headers?.['retry-after'];
                const retryAfterSec = Number(headerRa);
                const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
                    ? retryAfterSec * 1000
                    : Math.min(12000, 800 * 2 ** attempt) + Math.floor(Math.random() * 400);
                await new Promise((r) => setTimeout(r, backoffMs));
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
}
// ─── TRANSLATION ─────────────────────────────────────────────────────────────
const TRANSLATION_SYSTEM = `You are a professional hospitality translator for COZE Hospitality 3.0, a premium short-term rental service in Seoul, South Korea.

CONTEXT: You translate chat messages between COZE staff (Korean team) and international guests staying at COZE properties.

TONE RULES — strictly follow per language:
- Traditional Chinese (繁體): Use 您 (never 你), 請, 麻煩您. Polite guest-service register.
- Simplified Chinese (简体): Same as above — 您, 请, 麻烦您.
- Japanese: Always use です/ます/ございます form. Never casual/plain form. Example: ございます, いただけますか, よろしくお願いいたします.
- Thai: Always end sentences with ค่ะ. Polite formal register. Never omit ค่ะ.
- English: Natural, everyday conversational tone. Simple words only. No formal or stiff phrases. Write like a friendly person texting, not a business letter.

RULES:
- Output ONLY the translated text. No labels, no explanations, no quotes.
- Preserve all emojis exactly as-is.
- Do NOT translate: names, property names (COZE, LOTUS, JOYHASLA etc), pin codes, passwords, URLs, phone numbers, prices (₩30,000 etc).
- If the message is already in the target language — output it unchanged.
- If the text is a sound, exclamation, slang, or informal expression that has no clear translation — output the original text unchanged.
- Match the length and tone of the original. Short casual message → short casual translation. Long formal message → long formal translation.
- NEVER add words, greetings, or context that are not in the original message.
- Translate ONLY what is written. Nothing more, nothing less.
- CRITICAL: Never add emojis that are not in the original message. If original has no emoji, output has no emoji. Zero exceptions.`;
// ─── Persistent translation cache ────────────────────────────────────────────
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CACHE_FILE = path_1.default.join(process.cwd(), 'src/data/translation-cache.json');
function loadCache() {
    try {
        const raw = fs_1.default.readFileSync(CACHE_FILE, 'utf-8');
        return new Map(Object.entries(JSON.parse(raw)));
    }
    catch {
        return new Map();
    }
}
function saveCache(cache) {
    try {
        fs_1.default.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2));
    }
    catch (e) {
        console.error('❌ translation cache save failed:', e?.message);
    }
}
const translationCache = loadCache();
console.log(`📦 Translation cache loaded: ${translationCache.size} entries`);
async function translateMessage(text, targetLang) {
    const cacheKey = `${targetLang}:${text}`;
    if (translationCache.has(cacheKey))
        return translationCache.get(cacheKey);
    const langLabel = {
        'ZH-TW': 'Traditional Chinese (繁體中文)',
        'ZH-CN': 'Simplified Chinese (简体中文)',
        'JA': 'Japanese (日本語) — always use です/ます/ございます form',
        'TH': 'Thai — always end sentences with ค่ะ',
        'EN': 'English — warm hospitality tone',
    };
    const prompt = `Translate the following message to ${langLabel[targetLang]}:\n\n${text}`;
    let result;
    try {
        result = await callOpenAI(TRANSLATION_SYSTEM, prompt, 16000);
    }
    catch (e) {
        const status = e?.response?.status;
        console.warn(`⚠️ OpenAI translation failed${status ? ` (${status})` : ''}, trying local LLM: ${e?.message}`);
        try {
            result = await callLLM(TRANSLATION_SYSTEM, prompt, 4000);
        }
        catch (localErr) {
            console.error(`Local translation fallback failed: ${localErr?.message}`);
            return text;
        }
    }
    const translated = result.trim();
    translationCache.set(cacheKey, translated);
    saveCache(translationCache);
    return translated;
}
async function detectLanguage(text) {
    const system = 'You are a language detector. Respond with ONLY one of these codes: ZH-TW, ZH-CN, JA, TH, EN, KO, OTHER. No explanation.';
    const user = `Detect the language of this text: "${text.slice(0, 200)}"`;
    let result;
    try {
        result = await callOpenAI(system, user);
    }
    catch (e) {
        const status = e?.response?.status;
        console.warn(`⚠️ OpenAI language detection failed${status ? ` (${status})` : ''}, trying local LLM: ${e?.message}`);
        try {
            result = await callLLM(system, user, 20);
        }
        catch (localErr) {
            console.error(`Local language detection fallback failed: ${localErr?.message}`);
            return 'OTHER';
        }
    }
    const code = result.trim().toUpperCase();
    const valid = ['ZH-TW', 'ZH-CN', 'JA', 'TH', 'EN', 'KO', 'OTHER'];
    return valid.includes(code) ? code : 'OTHER';
}
// ─── GUEST LANGUAGE DETECTION ────────────────────────────────────────────────
const LANG_SELECTOR_SYSTEM = `You are COZE Hospitality 3.0's guest messenger language selector.

Your job is to recommend the most suitable default communication language for the guest's first messenger screen.

Do not confirm the guest's nationality.
Do not infer ethnicity, race, religion, or identity.
Only recommend the most likely communication language for customer convenience.

Important principle:
The guest name is usually stronger than the phone country code for detecting the general language group.
However, for Chinese-speaking guests, the phone country code must be used to decide whether to use Simplified Chinese or Traditional Chinese.

Priority order:
1. Guest name language pattern
2. Phone country code
3. English fallback

General rules:
1. Never output a confirmed nationality.
2. Name is the strongest signal for Japanese names.
3. Phone country code should not override a strongly Japanese name.
4. For Chinese-speaking names, use the phone country code to choose the Chinese variant.
5. If the name looks Chinese but the phone country code is unclear, choose English first.
6. If signals are mixed or uncertain, choose English as the safest default.
7. Always provide confidence: High, Medium, or Low.

Japanese handling:
- Strongly Japanese names → Japanese, even if phone is from Korea, US, or Singapore.
- Romanized examples: Hiroaki Hasegawa, Yuki Tanaka, Ayaka Sato, Keisuke Yamamoto.
- Kanji name examples: 藪 裕太朗, 田中 裕子, 山本 健太, 佐藤 美咲, 鈴木 一郎.
- Kanji-only names: If the name is written entirely in Kanji and contains Japanese-typical given name patterns, treat as Japanese.
  - Japanese male given name suffixes: 朗 (ろう/rō), 郎 (ろう), 太 (た/ta), 男 (お/o), 輝 (てる/teru), 哉 (や/ya).
  - Japanese female given name suffixes: 子 (こ/ko), 美 (み/mi), 香 (か/ka), 恵 (え/e).
  - Common Japanese surnames: 田, 山, 藤, 木, 中, 島, 川, 村, 本, 橋, 藪, 渡, 佐, 鈴.
- If phone is +81 (Japan) → Japanese, High confidence.
- If name is Kanji with clearly Japanese structure and phone is unknown → Japanese, Medium confidence.

Chinese handling:
- +86 China → Simplified Chinese
- +886 Taiwan → Traditional Chinese
- +852 Hong Kong → Traditional Chinese
- +65 Singapore → English
- +60 Malaysia → English
- Unknown → English

Korean handling:
- Hangul name → Korean
- Romanized full Korean name (Minji Kim, Jisoo Park) → Korean or English depending on signals
- Korean-American style (Alex Kim, Daniel Park, Grace Lee) → English
- Korean surname only → do not assume Korean

English handling:
- Clearly English-style names (John Smith, Emily Brown, Diana Wilson) → English, even if phone is Korean.

Output ONLY valid JSON, nothing else:
{
  "recommended_default_language": "English|Korean|Japanese|Simplified Chinese|Traditional Chinese",
  "confidence": "High|Medium|Low",
  "reason": "one sentence"
}`;
async function detectGuestLanguage(guestName, phone) {
    try {
        const raw = await callOpenAI(LANG_SELECTOR_SYSTEM, `Guest name: "${guestName}"\nPhone number: "+${phone.replace(/^\+/, '')}"`, 200);
        const json = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim());
        const confidence = (json.confidence || '').toLowerCase();
        if (confidence === 'low') {
            console.log(`🌐 detectGuestLanguage: low confidence for "${guestName}" — falling back to EN`);
            return 'EN';
        }
        const lang = (json.recommended_default_language || 'English').toLowerCase();
        if (lang.includes('japanese'))
            return 'JA';
        if (lang.includes('korean'))
            return 'KR';
        if (lang.includes('simplified'))
            return 'ZH-CN';
        if (lang.includes('traditional'))
            return 'ZH-TW';
        return 'EN';
    }
    catch (e) {
        console.error('❌ detectGuestLanguage failed:', e?.message);
        return 'EN';
    }
}
// ─── GROUP REJECTION DETECTION ───────────────────────────────────────────────
async function detectGroupRejection(message) {
    const result = await callLLM(`You are analyzing a WhatsApp message from a hotel guest.
Determine if the guest is saying they do NOT want to add other people (family, friends, travel companions) to this group chat.
Rejection examples: "I am alone", "don't worry about them", "I am in charge", "no need to add anyone", "just me", "I'll handle it", "they won't come", "we're only two", "no need".
Respond ONLY with YES or NO.`, `Message: "${message}"`, 5);
    return result.trim().toUpperCase().startsWith('YES');
}
// ─── CORE LLM CALL WITH OPENAI FALLBACK ─────────────────────────────────────
// Tries local Gemma first. Falls back to OpenAI if local returns null or throws.
async function callLLMWithFallback(system, user, maxTokens) {
    let localResult = '';
    try {
        localResult = await callLLM(system, user, maxTokens);
        if (localResult && localResult.toLowerCase() !== 'null')
            return localResult;
        console.log('🔄 LLM fallback: local returned null — retrying with OpenAI');
    }
    catch (e) {
        console.log(`🔄 LLM fallback: local failed (${e?.message}) — retrying with OpenAI`);
    }
    try {
        return await callOpenAI(system, user, maxTokens ?? 1000);
    }
    catch (e) {
        const status = e?.response?.status;
        console.warn(`OpenAI fallback failed${status ? ` (${status})` : ''}: ${e?.message}`);
        return localResult || 'null';
    }
}
// Returns true if any recent message in the group matches the template at ~70%+ similarity.
// Used by catchup logic to skip auto-send if a team member already sent it manually.
async function wasAlreadySent(groupKey, templateText, sinceMinutes = 120) {
    const { getRecentMessages } = await Promise.resolve().then(() => __importStar(require('./messageBuffer')));
    const messages = getRecentMessages(groupKey, sinceMinutes);
    if (messages.length === 0)
        return false;
    const history = messages.map(m => `[${m.sender}]: ${m.text}`).join('\n');
    const result = await callLLM('You are checking if a scheduled message was already sent manually in a group chat. Reply with YES or NO only.', `Template message:\n"${templateText}"\n\nRecent group messages:\n${history}\n\nDoes any message match the template at 70% or more similarity? Reply YES or NO only.`, 5).catch(() => 'NO');
    return result.trim().toUpperCase().startsWith('YES');
}
async function callLLM(system, user, maxTokens) {
    const res = await axios_1.default.post(constants_1.CONFIG.LM_STUDIO_URL, {
        model: constants_1.CONFIG.LM_MODEL,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        max_tokens: maxTokens ?? constants_1.CONFIG.LLM_MAX_TOKENS,
        temperature: constants_1.CONFIG.LLM_TEMPERATURE,
    }, { timeout: 60000 });
    const raw = res.data.choices[0].message;
    return (raw.content || '').trim();
}
