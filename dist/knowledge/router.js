"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeGuestMessage = routeGuestMessage;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
const kb_1 = require("./kb");
const INTENTS = ['booking', 'checkin', 'pricing', 'complaint', 'emergency', 'faq', 'other'];
const RISKS = ['low', 'medium', 'high'];
// ─── Category → Intent mapping ────────────────────────────────────────────────
const CATEGORY_INTENT = {
    checkin: 'checkin',
    checkout: 'booking',
    payment: 'pricing',
    safety: 'faq', // standard safety info, not necessarily emergency
    amenities: 'faq',
    food: 'faq',
    neighborhood: 'faq',
    services: 'faq',
    transport: 'faq',
    experiences: 'faq',
    property: 'faq',
    'house-rules': 'faq',
};
// ─── Emergency / complaint override regexes ───────────────────────────────────
const EMERGENCY_RE = /\b(fire|flood|leak|stuck|emergency|accident|injury|help us|help me|unsafe|danger)\b/i;
const COMPLAINT_RE = /\b(broken|dirty|smell|noise|complaint|unhappy|disappointed|refund|not working)\b/i;
const INTERNAL_SECRET_RE = /\b(api key|apikey|token|webhook|secret|bearer|private key|openai key|hostfully api|telegram bot token|jandi webhook)\b/i;
// ─── LLM callers (local only — mirrors llm.ts internal pattern) ───────────────
const LLM_SYSTEM = `You are COZMO AI, a guest message router for a Seoul short-term rental company.
Classify the guest message. Output ONLY compact JSON on a single line, no markdown:
{"intent":"booking|checkin|pricing|complaint|emergency|faq|other","risk":"low|medium|high","confidence":0.0,"reason":"brief reason"}

INTENTS: booking=reservation/dates, checkin=access/arrival, pricing=costs/payment, complaint=dissatisfaction, emergency=safety/urgent, faq=amenities/info/general, other=greetings/small-talk
RISK: high=emergency/safety/legal, medium=unresolved issue/complaint, low=general inquiry`;
async function callLLMClassify(message) {
    try {
        const res = await axios_1.default.post(constants_1.CONFIG.LM_STUDIO_URL, {
            model: constants_1.CONFIG.LM_MODEL,
            messages: [
                { role: 'system', content: LLM_SYSTEM },
                { role: 'user', content: `Message: "${message}"` },
            ],
            max_tokens: 100,
            temperature: 0.1,
        }, { timeout: 18000 });
        const raw = (res.data.choices?.[0]?.message?.content || '').trim();
        let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        if (!s.startsWith('{')) {
            const m = s.match(/\{[\s\S]*?\}/);
            if (m)
                s = m[0];
        }
        const p = JSON.parse(s);
        const intent = INTENTS.includes(p.intent) ? p.intent : 'other';
        const risk = RISKS.includes(p.risk) ? p.risk : 'low';
        const confidence = Math.max(0, Math.min(1, Number(p.confidence) || 0.6));
        const escalate = risk === 'high' || intent === 'emergency' ||
            (intent === 'complaint' && risk !== 'low');
        return { intent, category: 'unknown', matchedEntries: [], risk, confidence, escalate, reason: String(p.reason || '').slice(0, 200) };
    }
    catch {
        return null;
    }
}
// ─── Main export ──────────────────────────────────────────────────────────────
async function routeGuestMessage(payload) {
    const { message, propertyCode } = payload;
    // Internal credentials never reach reply generation.
    if (INTERNAL_SECRET_RE.test(message)) {
        return {
            intent: 'other',
            category: 'safety',
            matchedEntries: (0, kb_1.getSensitiveEntries)(),
            risk: 'high',
            confidence: 1,
            escalate: true,
            reason: 'Internal credential request',
        };
    }
    // 1. Trigger-based KB match (fast, no LLM)
    const matchedEntries = (0, kb_1.searchKBEntries)(message, propertyCode);
    if (matchedEntries.length > 0) {
        const topCategory = matchedEntries[0].category;
        const intent = CATEGORY_INTENT[topCategory] ?? 'faq';
        // Override for clear emergency/complaint signals even when KB matched
        const finalIntent = EMERGENCY_RE.test(message) ? 'emergency' :
            COMPLAINT_RE.test(message) ? 'complaint' : intent;
        const risk = finalIntent === 'emergency' ? 'high' : 'low';
        const escalate = finalIntent === 'emergency' || finalIntent === 'complaint';
        console.log(`✅ KB trigger match | entries=${matchedEntries.length} | category=${topCategory} | intent=${finalIntent}`);
        return {
            intent: finalIntent, category: topCategory, matchedEntries,
            risk, confidence: 0.9, escalate,
            reason: `KB trigger match: "${matchedEntries[0].title}"`,
        };
    }
    // 2. No KB match — use LLM to classify
    console.log('🔄 No KB trigger match — falling back to LLM classification');
    const llm = await callLLMClassify(message);
    if (llm)
        return { ...llm, matchedEntries: [] };
    // 3. Total fallback
    console.warn('⚠️ router: LLM classification failed, using safe fallback');
    return {
        intent: 'other', category: 'unknown', matchedEntries: [],
        risk: 'low', confidence: 0.1, escalate: false,
        reason: 'Unable to classify',
    };
}
