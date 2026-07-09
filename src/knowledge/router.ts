import axios from 'axios';
import { CONFIG } from '../config/constants';
import { searchKBEntries, getSensitiveEntries, KBEntry } from './kb';

const INTENTS = ['booking', 'checkin', 'pricing', 'complaint', 'emergency', 'faq', 'other'] as const;
const RISKS   = ['low', 'medium', 'high'] as const;

export type Intent = typeof INTENTS[number];
export type Risk   = typeof RISKS[number];

export interface RouterPayload {
    message:      string;
    chatHistory?: Array<{ sender: string; text: string; ts: number }>;
    platform:     string;
    lang:         string;
    propertyCode?: string;   // if known; used to scope KB trigger search
}

export interface RouterResult {
    intent:         Intent;
    category:       string;       // raw KB category, or 'unknown'
    matchedEntries: KBEntry[];    // KB entries matched via triggers (may be empty)
    risk:           Risk;
    confidence:     number;       // 0–1
    escalate:       boolean;
    reason:         string;
}

// ─── Category → Intent mapping ────────────────────────────────────────────────

const CATEGORY_INTENT: Record<string, Intent> = {
    checkin:      'checkin',
    checkout:     'booking',
    payment:      'pricing',
    safety:       'faq',           // standard safety info, not necessarily emergency
    amenities:    'faq',
    food:         'faq',
    neighborhood: 'faq',
    services:     'faq',
    transport:    'faq',
    experiences:  'faq',
    property:     'faq',
    'house-rules':'faq',
};

// ─── Emergency / complaint override regexes ───────────────────────────────────
const EMERGENCY_RE = /\b(fire|flood|leak|stuck|emergency|accident|injury|help us|help me|unsafe|danger)\b/i;
const COMPLAINT_RE = /\b(broken|dirty|smell|noise|complaint|unhappy|disappointed|refund|not working)\b/i;
const INTERNAL_SECRET_RE =
    /\b(api key|apikey|token|webhook|secret|bearer|private key|openai key|hostfully api|telegram bot token|jandi webhook)\b/i;

// ─── LLM callers (local only — mirrors llm.ts internal pattern) ───────────────
const LLM_SYSTEM = `You are COZMO AI, a guest message router for a Seoul short-term rental company.
Classify the guest message. Output ONLY compact JSON on a single line, no markdown:
{"intent":"booking|checkin|pricing|complaint|emergency|faq|other","risk":"low|medium|high","confidence":0.0,"reason":"brief reason"}

INTENTS: booking=reservation/dates, checkin=access/arrival, pricing=costs/payment, complaint=dissatisfaction, emergency=safety/urgent, faq=amenities/info/general, other=greetings/small-talk
RISK: high=emergency/safety/legal, medium=unresolved issue/complaint, low=general inquiry`;

async function callLLMClassify(message: string): Promise<RouterResult | null> {
    try {
        const res = await axios.post(CONFIG.LM_STUDIO_URL, {
            model:       CONFIG.LM_MODEL,
            messages:    [
                { role: 'system', content: LLM_SYSTEM },
                { role: 'user',   content: `Message: "${message}"` },
            ],
            max_tokens:  100,
            temperature: 0.1,
        }, { timeout: 18000 });

        const raw = (res.data.choices?.[0]?.message?.content || '').trim();
        let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        if (!s.startsWith('{')) { const m = s.match(/\{[\s\S]*?\}/); if (m) s = m[0]; }

        const p = JSON.parse(s);
        const intent:     Intent = INTENTS.includes(p.intent) ? p.intent : 'other';
        const risk:       Risk   = RISKS.includes(p.risk)     ? p.risk   : 'low';
        const confidence: number = Math.max(0, Math.min(1, Number(p.confidence) || 0.6));
        const escalate: boolean  = risk === 'high' || intent === 'emergency' ||
                                   (intent === 'complaint' && risk !== 'low');
        return { intent, category: 'unknown', matchedEntries: [], risk, confidence, escalate, reason: String(p.reason || '').slice(0, 200) };
    } catch {
        return null;
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function routeGuestMessage(payload: RouterPayload): Promise<RouterResult> {
    const { message, propertyCode } = payload;

    // Internal credentials never reach reply generation.
    if (INTERNAL_SECRET_RE.test(message)) {
        return {
            intent: 'other',
            category: 'safety',
            matchedEntries: getSensitiveEntries(),
            risk: 'high',
            confidence: 1,
            escalate: true,
            reason: 'Internal credential request',
        };
    }

    // 1. Trigger-based KB match (fast, no LLM)
    const matchedEntries = searchKBEntries(message, propertyCode);

    if (matchedEntries.length > 0) {
        const topCategory = matchedEntries[0].category;
        const intent: Intent = CATEGORY_INTENT[topCategory] ?? 'faq';

        // Override for clear emergency/complaint signals even when KB matched
        const finalIntent: Intent =
            EMERGENCY_RE.test(message) ? 'emergency' :
            COMPLAINT_RE.test(message) ? 'complaint'  : intent;
        const risk: Risk = finalIntent === 'emergency' ? 'high' : 'low';
        const escalate   = finalIntent === 'emergency' || finalIntent === 'complaint';

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
    if (llm) return { ...llm, matchedEntries: [] };

    // 3. Total fallback
    console.warn('⚠️ router: LLM classification failed, using safe fallback');
    return {
        intent: 'other', category: 'unknown', matchedEntries: [],
        risk: 'low', confidence: 0.1, escalate: false,
        reason: 'Unable to classify',
    };
}
