import fs   from 'fs';
import path from 'path';
import axios from 'axios';
import { CONFIG } from '../config/constants';
import type { RouterResult } from './router';
import type { KBEntry, KnowledgeContext } from './knowledgeLoader';

// ─── QA Examples (few-shot style from real Gaya/Ricky chats) ─────────────────

interface QAExample {
    id: string;
    category: string;
    propertyCode: string;
    question: string;
    answer: string;
}

let _qaExamples: QAExample[] | null = null;

function loadQAExamples(): QAExample[] {
    if (_qaExamples) return _qaExamples;
    try {
        const p = path.resolve(__dirname, '..', '..', 'src', 'knowledge', 'qa-examples.json');
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        _qaExamples = (raw.examples || []) as QAExample[];
    } catch {
        _qaExamples = [];
    }
    return _qaExamples;
}

// Template-style sign-offs that indicate a canned message, not a personal reply
const TEMPLATE_SIGNS = /guest care team|coze hospitality 3\.0|rocket delivery|concierge service|how to order|quick look/i;

function pickQAExamples(query: string, category?: string, limit = 3): QAExample[] {
    const examples = loadQAExamples();
    const lower = query.toLowerCase();

    // Only short, personal replies (not template messages)
    const scored = examples
        .filter(e => e.answer && e.answer.length >= 10 && e.answer.length <= 300 && !TEMPLATE_SIGNS.test(e.answer))
        .map(e => {
            let score = 0;
            if (category && e.category === category) score += 3;
            const qLower = e.question.toLowerCase();
            lower.split(/\s+/).filter(w => w.length >= 4).forEach(w => {
                if (qLower.includes(w)) score += 1;
            });
            return { e, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.e);

    return scored;
}

interface KBMatch {
    entry: KBEntry;
    score: number;
    reasons: string[];
}

const STOPWORDS = new Set([
    'what', 'are', 'the', 'how', 'does', 'did', 'is', 'it', 'in', 'at',
    'to', 'for', 'of', 'and', 'or', 'my', 'can', 'do', 'we', 'you', 'an',
    'be', 'was', 'will', 'have', 'has', 'this', 'that', 'any', 'some',
    'get', 'use', 'give', 'tell', 'me', 'about', 'with', 'from', 'need',
]);

const SEMANTIC_ALIASES: Record<string, string[]> = {
    'airport pickup': ['airport van', 'airport transfer', 'airport transport', 'incheon', 'gimpo'],
    bbq: ['barbecue', 'grill', 'weber'],
    breakfast: ['grocery', 'groceries', 'morning food'],
    checkout: ['check out', 'departure', 'leave'],
    checkin: ['check in', 'arrival'],
    parking: ['car', 'vehicle', 'park'],
    trash: ['garbage', 'waste', 'recycling'],
    food: ['delivery', 'coupang', 'restaurant', 'meal'],
    taxi: ['ride', 'mpv', 'van taxi', 'naver pin'],
    wifi: ['wi-fi', 'internet', 'password', 'wifi password'],
    door: ['door code', 'gate code', 'pin', 'key box'],
};

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .normalize('NFKC')
        .split(/[\s"'`~!@#$%^&*()_+\-=[\]{};:,.<>/?\\|]+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

function expandQuery(query: string): string[] {
    const lower = query.toLowerCase().normalize('NFKC');
    const terms = new Set(tokenize(lower));

    for (const [canonical, aliases] of Object.entries(SEMANTIC_ALIASES)) {
        const candidates = [canonical, ...aliases];
        if (candidates.some(term => lower.includes(term.toLowerCase()))) {
            for (const term of candidates) {
                for (const token of tokenize(term)) terms.add(token);
            }
        }
    }

    return Array.from(terms);
}

function scoreEntry(entry: KBEntry, query: string, terms: string[], propertyCode?: string): KBMatch {
    const title = entry.title.toLowerCase();
    const category = entry.category.toLowerCase();
    const triggers = entry.triggers.map(t => t.toLowerCase());
    const facts = entry.facts.map(f => f.toLowerCase());
    const haystack = [title, category, ...triggers, ...facts].join('\n');
    const lowerQuery = query.toLowerCase();

    let score = 0;
    const reasons = new Set<string>();

    if (propertyCode && entry.propertyCode === propertyCode) {
        score += 4;
        reasons.add(`property:${propertyCode}`);
    } else if (entry.propertyCode === 'ALL') {
        score += 1;
        reasons.add('cross-property');
    }

    if (title && lowerQuery.includes(title)) {
        score += 8;
        reasons.add('title phrase');
    }

    for (const term of terms) {
        if (title.includes(term)) {
            score += 4;
            reasons.add('title');
        }
        if (triggers.some(t => t.includes(term) || term.includes(t))) {
            score += 3;
            reasons.add('trigger');
        }
        if (category.includes(term)) {
            score += 2;
            reasons.add('category');
        }
        if (facts.some(f => f.includes(term))) {
            score += 1;
            reasons.add('fact');
        }
        if (haystack.includes(term)) score += 0.25;
    }

    return { entry, score, reasons: Array.from(reasons) };
}

function searchRelevantEntries(query: string, entries: KBEntry[], propertyCode?: string): KBEntry[] {
    const terms = expandQuery(query);
    if (!terms.length) return [];

    return entries
        .filter(e => !e.sensitive)
        .filter(e => !propertyCode || e.propertyCode === 'ALL' || e.propertyCode === propertyCode)
        .map(e => scoreEntry(e, query, terms, propertyCode))
        .filter(({ score }) => score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.entry.title.localeCompare(b.entry.title);
        })
        .slice(0, 5)
        .map(({ entry }) => entry);
}

function buildFactsBlock(routerResult: RouterResult, ctx: KnowledgeContext): string {
    const latest = ctx.chatHistory[ctx.chatHistory.length - 1]?.text ?? '';
    const ranked = searchRelevantEntries(latest, ctx.entries, ctx.propertyCode);
    const prioritized = [...routerResult.matchedEntries, ...ranked];
    const seen = new Set<string>();
    const allEntries = prioritized.filter(entry => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
    }).slice(0, 5);

    if (!allEntries.length) return '';
    const lines: string[] = [];
    for (const entry of allEntries) {
        lines.push(`### ${entry.title}${entry.propertyCode !== 'ALL' ? ` (${entry.propertyCode})` : ''}`);
        entry.facts.forEach(f => { lines.push(`- ${f}`); });
        if (entry.links.length) lines.push(`Link: ${entry.links[0]}`);
        lines.push('');
    }
    return lines.join('\n').trim();
}

function buildHistoryBlock(ctx: KnowledgeContext): string {
    const recent = ctx.chatHistory.slice(-8);
    if (!recent.length) return '';
    const guestFirst = ctx.guestName?.split(' ')[0]?.toLowerCase();
    return recent.map(m => {
        const senderLower = m.sender.toLowerCase();
        const role = (guestFirst && senderLower.includes(guestFirst)) ? `Guest (${m.sender})` : `Staff (${m.sender})`;
        return `[${role}]: ${m.text}`;
    }).join('\n');
}

function buildQAExamplesBlock(routerResult: RouterResult, ctx: KnowledgeContext): string {
    const last = ctx.chatHistory[ctx.chatHistory.length - 1];
    if (!last?.text) return '';
    const examples = pickQAExamples(last.text, routerResult.category);
    if (!examples.length) return '';
    const lines = examples.map(e => `Q: "${e.question}"\nA: "${e.answer}"`);
    return `REAL TEAM REPLY EXAMPLES (copy this tone and format — facts may differ for this guest):\n${lines.join('\n\n')}`;
}

function buildUserPrompt(routerResult: RouterResult, ctx: KnowledgeContext): string {
    const facts = buildFactsBlock(routerResult, ctx);
    const history = buildHistoryBlock(ctx);
    const qaExamples = buildQAExamplesBlock(routerResult, ctx);
    const last = ctx.chatHistory[ctx.chatHistory.length - 1];

    return [
        facts ? `FACTS (use these to answer; do not invent beyond them):\n${facts}` : 'FACTS: none',
        qaExamples,
        history ? `Recent conversation (Guest vs Staff labeled):\n${history}` : '',
        `Guest's latest message: "${last?.text ?? '[unknown]'}"`,
    ].filter(Boolean).join('\n\n');
}

// Real Gaya/Ricky/COZE team style examples — injected to teach the LLM the actual vibe.
const STYLE_EXAMPLES = `
HOW OUR TEAM ACTUALLY REPLIES (style reference only — use KB FACTS for this guest's actual details):
• "Sure! We'll dispatch the van for you. Let's say 14:00 — does that work? 😊"
• "Yes! There's a Bluetooth speaker on the rooftop garden 🎵"
• "Of course! 😊 Choose your items and send us a screenshot — we'll place the order."
• "Got it ✅ I'll drop it off for you. Just let us know when you're back!"
• "Check-in complete ✅ If you need anything, just message us here — we're happy to help 😊"
• "That's at Seoul Station or COEX — easy by subway from here 🚇"
• "Sure! 🙏 We'll get that sorted for you right away."
`.trim();

function buildSystem(vibeGuide: string): string {
    return `You are a warm, human member of the COZE Hospitality guest-care team replying directly to a guest in a WhatsApp 1:1 chat. Reply the way Gaya or Ricky would — friendly, direct, warm.

${vibeGuide}

${STYLE_EXAMPLES}

RULES:
- Sound exactly like a real team member texting a guest, not like an AI assistant or a support bot.
- Make the reply feel personal: reference the guest's specific need, timing, or detail when it is present.
- Use only the KB facts in the FACTS section. Do not invent prices, policies, procedures, locations, or availability.
- If the facts do not have the answer, say the team will check and follow up. Do not pad with unrelated facts.
- Do not upsell unrelated services unless directly useful to the guest's question.
- Never write check-in, checkout, welcome, farewell, bill, or pre-payment messages. Those come from the automation workflow.
- For credentials or access-code questions, say: "Our team will send that to you right away! 🙏"
- Never reveal door codes, Wi-Fi passwords, gate PINs, private staff contacts, or internal details unless they are explicitly in the FACTS for this guest.
- Never claim to be a specific staff member (Gaya, Ricky, etc.) or mention being an AI.
- The chat history shows who is Guest and who is Staff. Use it to answer in context and avoid repeating what staff already said.
- Keep it short — 2-4 sentences, aim for under 100 words. Use bullets only for multi-step info or lists.
- Use 1-3 emojis placed naturally — 😊 ✅ 🙏 🥰 🙌 are team favourites. Place them where they fit, not all at the end.
- Directly answer first, then the single most useful next step.
- If the KB has a relevant link, include it in one short sentence.
- Reply in the same language the guest used.`;
}

async function callOpenAI(system: string, userMsg: string): Promise<string | null> {
    const apiKey = CONFIG.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('replyAgent: OPENAI_API_KEY not set');
        return null;
    }

    try {
        const res = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userMsg },
            ],
            max_tokens: 1500,
            temperature: 0.4,
        }, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 30000,
        });
        return (res.data.choices?.[0]?.message?.content || '').trim() || null;
    } catch (e: any) {
        console.error('replyAgent: OpenAI error:', e?.response?.status || e?.message);
        return null;
    }
}

export async function generateReply(
    routerResult: RouterResult,
    knowledgeContext: KnowledgeContext,
    vibeGuide: string
): Promise<string | 'ESCALATE'> {
    // Always escalate if router flagged it (emergency/complaint/high-risk).
    if (routerResult.escalate) return 'ESCALATE';

    // Need at least one message to reply to.
    if (!knowledgeContext.chatHistory.length) return 'ESCALATE';

    // No KB entries at all means nothing reliable to draw from.
    if (!knowledgeContext.entries.length && !routerResult.matchedEntries.length) return 'ESCALATE';

    const system = buildSystem(vibeGuide);
    const userMsg = buildUserPrompt(routerResult, knowledgeContext);
    const raw = await callOpenAI(system, userMsg);

    if (!raw) return 'ESCALATE';
    if (raw.trim().toUpperCase() === 'ESCALATE') return 'ESCALATE';

    return raw;
}
