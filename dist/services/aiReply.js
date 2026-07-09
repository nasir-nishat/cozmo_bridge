"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAiReply = generateAiReply;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
const knowledgeBase_1 = require("./knowledgeBase");
const PROPERTY_LIST = 'Joyhasla(BS/SG/SJ) · Achae(SA) · Leeha(SWA) · Teva(JT/JTS/HT/HTA/HTB) · Yeonnam(B9/F9/L9) · Kelly(GK/GKA/GKB)';
function fmtDate(d) {
    if (!d)
        return '';
    try {
        return new Date(d + 'T12:00:00+09:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    catch {
        return d;
    }
}
function stayContext(ctx) {
    if (!ctx?.propertyName)
        return '';
    const parts = [`staying at ${ctx.propertyName}`];
    if (ctx.checkInDate)
        parts.push(`checking in ${fmtDate(ctx.checkInDate)}`);
    if (ctx.checkOutDate)
        parts.push(`checking out ${fmtDate(ctx.checkOutDate)}`);
    return (ctx.guestName ? `${ctx.guestName} is ` : 'Guest is ') + parts.join(', ') + '.';
}
function buildGuestSystem(ctx) {
    const stay = stayContext(ctx);
    const kbFacts = (0, knowledgeBase_1.buildSystemKB)(ctx?.propertyCode);
    return `You are a team member at COZE Hospitality in Seoul — a boutique short-term rental company. Properties: ${PROPERTY_LIST}. Check-in 15:00, check-out 11:00 KST.
${stay ? `\n${stay}\n` : ''}
${kbFacts ? `WHAT YOU KNOW — answer only from these facts, never add anything not listed here:\n${kbFacts}\n` : ''}
Tone (match our real team voice):
- Short and direct. Maximum 3 lines per reply.
- Warm but never gushing. Start with a quick confirm: "Sure! 😊", "Of course!", "Got it! ✅", "Noted! 🙏"
- One emoji per reply max — on the opening confirm word only.
- Quote exact figures from the facts above. Never round, estimate, or invent anything not listed.
- Reply in the exact same language the guest used.

When to hand off to the team (use these exact phrases so staff gets notified):
- Nightly stay rates, availability, booking inquiries → "Our team will have that for you right away! 🙏"
- WiFi password, door code, PIN → "Our team will send that to you right away! 🙏"
- Anything not in the facts above → "Our team will be right with you! 🙏"

Never say: "Just a moment", "Please hold", "I'll check", "I'll confirm", "I'll follow up".
Never mention AI, COZMO, or automation. No sign-offs.`;
}
function buildGroupSystem(ctx) {
    const stay = stayContext(ctx);
    const kbFacts = (0, knowledgeBase_1.buildSystemKB)(ctx?.propertyCode);
    return `You are a team member at COZE Hospitality in Seoul, active in this guest group chat. Properties: ${PROPERTY_LIST}. Check-in 15:00, check-out 11:00 KST.
${stay ? `\n${stay}\n` : ''}
${kbFacts ? `WHAT YOU KNOW — answer only from these facts, never add anything not listed here:\n${kbFacts}\n` : ''}
Tone: short, direct, warm. Max 3 lines. Start with a confirm: "Sure! 😊", "Of course!", "Noted! ✅". One emoji max.
- Reply in the guest's language.
- Quote exact figures from the facts above. Never invent prices or deals.
- WiFi/codes: "Our team will send that to you right away! 🙏"
- Anything not in the facts, or needing action → "Our team will reach out to you shortly! 🙏"
- Never say "Just a moment", "I'll check", "I'll confirm". Never mention AI or COZMO. No sign-offs.`;
}
function buildTeamSystem() {
    return `You are COZMO, the internal ops assistant for COZE Hospitality Seoul — a 300-property STR operation across WhatsApp, LINE, KakaoTalk, and WeChat. Properties: ${PROPERTY_LIST}.

Reply in the language the staff used (English or Korean). Be direct and brief — no filler, no "Sure, I'd be happy to help."

You can help with: guest request summaries, property ops questions, Korean↔English drafting, scheduling, and general ops.

If greeted with no clear question: reply "무엇을 도와드릴까요?" (Korean) or "What do you need?" (English).
If asked to draft something: produce the draft with no preamble.
If asked about a guest: summarize clearly and concisely.`;
}
const conversationHistories = new Map();
const MAX_HISTORY = 8;
function getHistory(key) {
    return conversationHistories.get(key) || [];
}
function appendHistory(key, userMsg, assistantMsg) {
    const h = conversationHistories.get(key) || [];
    h.push({ role: 'user', content: userMsg });
    h.push({ role: 'assistant', content: assistantMsg });
    if (h.length > MAX_HISTORY)
        h.splice(0, h.length - MAX_HISTORY);
    conversationHistories.set(key, h);
}
async function tryLocal(system, userMsg, history) {
    try {
        const res = await axios_1.default.post(constants_1.CONFIG.LM_STUDIO_URL, {
            model: constants_1.CONFIG.LM_MODEL,
            messages: [
                { role: 'system', content: system },
                ...history,
                { role: 'user', content: userMsg },
            ],
            max_tokens: 400,
            temperature: 0.7,
        }, { timeout: 30000 });
        const text = (res.data.choices[0]?.message?.content || '').trim();
        return text.length > 10 ? text : null;
    }
    catch (e) {
        console.error('⚠️ Local LLM unavailable:', e?.code || e?.message);
        return null;
    }
}
async function callOpenAI(system, userMsg, maxTokens, history) {
    const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: system },
            ...history,
            { role: 'user', content: userMsg },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
    }, {
        headers: { Authorization: `Bearer ${constants_1.CONFIG.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000,
    });
    return (res.data.choices[0]?.message?.content || '').trim();
}
const ESCALATION_REGEX = /team member|reach out|sort that|get in touch|connect you|arrange that|one of our team|our team will|someone will|will take care|team will (help|send|handle|be)/i;
async function generateAiReply(question, persona, ctx, conversationKey) {
    const system = persona === 'team' ? buildTeamSystem() :
        persona === 'group' ? buildGroupSystem(ctx) :
            buildGuestSystem(ctx);
    const maxTokens = persona === 'team' ? 250 : 350;
    try {
        const history = conversationKey ? getHistory(conversationKey) : [];
        let reply;
        let usedLocal = false;
        try {
            reply = await callOpenAI(system, question, maxTokens, history);
        }
        catch (e) {
            console.error('⚠️ OpenAI failed, trying local LLM:', e?.message);
            reply = (await tryLocal(system, question, history)) ?? "Sorry about that — our team will get back to you shortly.";
            usedLocal = true;
        }
        if (conversationKey)
            appendHistory(conversationKey, question, reply);
        const escalate = persona !== 'team' && ESCALATION_REGEX.test(reply);
        console.log(`🤖 AI reply [${usedLocal ? 'local' : 'openai'}/${persona}]: "${reply.slice(0, 80)}"`);
        return { reply, escalate };
    }
    catch (e) {
        console.error('❌ generateAiReply failed:', e?.message);
        return { reply: "Sorry about that — our team will get back to you shortly.", escalate: false };
    }
}
