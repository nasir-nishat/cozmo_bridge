"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const openai_1 = __importDefault(require("openai"));
const constants_1 = require("../config/constants");
const jandi_1 = require("../services/jandi");
const expenses_1 = require("../services/expenses");
const aiReply_1 = require("../services/aiReply");
const router = (0, express_1.Router)();
let _openai = null;
function getOpenAI() {
    if (!_openai)
        _openai = new openai_1.default({ apiKey: constants_1.CONFIG.OPENAI_API_KEY });
    return _openai;
}
const CARD_NAMES = { jy: 'Joyhasla', jn: 'Jin', rc: 'Ricky', cy: 'Cyrus', gy: 'Gaya', cz: 'COZMO' };
const CARD_PATTERN = /\/exp\s+(jy|jn|rc|cy|gy|cz)/i;
function extractCard(text) {
    const match = text.match(CARD_PATTERN);
    return match ? match[1].toLowerCase() : null;
}
async function parseReceiptImage(imageUrl) {
    const imgRes = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const base64 = Buffer.from(imgRes.data).toString('base64');
    const mime = String(imgRes.headers['content-type'] || 'image/jpeg').split(';')[0];
    const res = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
                    { type: 'text', text: 'Parse this receipt. Return ONLY JSON: {"item":"brief English description","amount_krw":50000}. Use the final total amount. If unreadable respond: {"error":"cannot parse"}.' }
                ]
            }],
        max_tokens: 80,
    });
    const content = res.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (!jsonMatch)
        return null;
    try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.error || !parsed.item || !parsed.amount_krw)
            return null;
        return { item: String(parsed.item), amount_krw: parseInt(parsed.amount_krw, 10) };
    }
    catch {
        return null;
    }
}
router.post('/jandi/ask', async (req, res) => {
    res.sendStatus(200);
    if (!constants_1.CONFIG.ENABLE_JANDI_AI_REPLY)
        return;
    const payload = req.body;
    if (constants_1.CONFIG.JANDI_ASK_TOKEN && payload.token !== constants_1.CONFIG.JANDI_ASK_TOKEN) {
        console.warn('❌ Jandi ask: invalid token');
        return;
    }
    const text = payload.text || payload.data || '';
    const roomName = payload.roomName || 'Jandi';
    console.log('📨 Jandi ask payload:', JSON.stringify({ text, roomName, keys: Object.keys(payload) }));
    try {
        const question = text.replace(/^\/cozmo\s*/i, '').replace(/@COZMO(\s+AI)?\s*/i, '').trim() || text;
        const { reply } = await (0, aiReply_1.generateAiReply)(question, 'team', undefined, roomName);
        const upper = roomName.toUpperCase();
        const propertyWebhook = Object.entries(constants_1.CONFIG.JANDI_PROPERTY_WEBHOOKS)
            .sort((a, b) => b[0].length - a[0].length)
            .find(([code]) => upper.includes(code))?.[1];
        const webhookUrl = propertyWebhook ?? constants_1.CONFIG.JANDI_WEBHOOK_URL_TEST;
        await (0, jandi_1.sendJandi)(reply, webhookUrl).catch(() => { });
        console.log(`🤖 Jandi AI reply → ${roomName}: "${reply.slice(0, 80)}"`);
    }
    catch (e) {
        console.error('❌ Jandi ask failed:', e?.message);
    }
});
router.post('/jandi/receipt', async (req, res) => {
    res.sendStatus(200);
    const payload = req.body;
    if (constants_1.CONFIG.JANDI_OUTGOING_TOKEN && payload.token !== constants_1.CONFIG.JANDI_OUTGOING_TOKEN) {
        console.warn('❌ Jandi receipt: invalid token');
        return;
    }
    const text = payload.text || payload.data || '';
    const sender = payload.writer?.name || 'Unknown';
    const roomName = payload.roomName || 'Jandi';
    const fileSharing = payload.file_sharing || payload.fileSharing;
    // No image attached — silently ignore
    if (!fileSharing?.download_url)
        return;
    const card = extractCard(text);
    if (!card) {
        await (0, jandi_1.sendJandi)(`❌ No card specified. Post receipt image with caption:\n/exp [card]  (e.g. /exp jy)\n\nCards: jy · jn · rc · cy · gy · cz`, constants_1.CONFIG.JANDI_WEBHOOK_EXPENSE).catch(() => { });
        return;
    }
    try {
        const parsed = await parseReceiptImage(fileSharing.download_url);
        if (!parsed) {
            await (0, jandi_1.sendJandi)(`❌ Could not read receipt. Log manually:\n/exp ${card} [amount] [item]`, constants_1.CONFIG.JANDI_WEBHOOK_EXPENSE).catch(() => { });
            return;
        }
        await (0, expenses_1.logJandiReceipt)(roomName, roomName, parsed.item, parsed.amount_krw, sender, card);
        const fmt = (n) => n.toLocaleString('en-US');
        await (0, jandi_1.sendJandiRich)(`🧾 Receipt scanned · ✅ Logged`, [{ title: `${parsed.item}  ₩${fmt(parsed.amount_krw)}`, description: `${CARD_NAMES[card] ?? card}'s card · ${sender}` }], constants_1.CONFIG.JANDI_WEBHOOK_EXPENSE).catch(() => { });
        console.log(`✅ Jandi receipt logged: ${parsed.item} ₩${parsed.amount_krw} by ${sender}`);
    }
    catch (e) {
        console.error('❌ Jandi receipt scan failed:', e?.message);
        await (0, jandi_1.sendJandi)(`❌ Scan failed. Log manually:\n/exp ${card} [amount] [item]`, constants_1.CONFIG.JANDI_WEBHOOK_EXPENSE).catch(() => { });
    }
});
exports.default = router;
