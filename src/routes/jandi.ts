import { Router } from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import { CONFIG } from '../config/constants';
import { sendJandi, sendJandiRich } from '../services/jandi';
import { logJandiReceipt } from '../services/expenses';
import { generateAiReply } from '../services/aiReply';

const router = Router();
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
    if (!_openai) _openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
    return _openai;
}

const CARD_NAMES: Record<string, string> = { jy: 'Joyhasla', jn: 'Jin', rc: 'Ricky', cy: 'Cyrus', gy: 'Gaya', cz: 'COZMO' };
const CARD_PATTERN = /\/exp\s+(jy|jn|rc|cy|gy|cz)/i;

function extractCard(text: string): string | null {
    const match = text.match(CARD_PATTERN);
    return match ? match[1].toLowerCase() : null;
}


async function parseReceiptImage(imageUrl: string): Promise<{ item: string; amount_krw: number } | null> {
    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
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
    if (!jsonMatch) return null;

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.error || !parsed.item || !parsed.amount_krw) return null;
        return { item: String(parsed.item), amount_krw: parseInt(parsed.amount_krw, 10) };
    } catch {
        return null;
    }
}

router.post('/jandi/ask', async (req, res) => {
    res.sendStatus(200);
    if (!CONFIG.ENABLE_JANDI_AI_REPLY) return;

    const payload = req.body;
    if (CONFIG.JANDI_ASK_TOKEN && payload.token !== CONFIG.JANDI_ASK_TOKEN) {
        console.warn('❌ Jandi ask: invalid token');
        return;
    }

    const text: string = payload.text || payload.data || '';
    const roomName: string = payload.roomName || 'Jandi';
    console.log('📨 Jandi ask payload:', JSON.stringify({ text, roomName, keys: Object.keys(payload) }));

    try {
        const question = text.replace(/^\/cozmo\s*/i, '').replace(/@COZMO(\s+AI)?\s*/i, '').trim() || text;
        const { reply } = await generateAiReply(question, 'team', undefined, roomName);
        const upper = roomName.toUpperCase();
        const propertyWebhook = Object.entries(CONFIG.JANDI_PROPERTY_WEBHOOKS)
            .sort((a, b) => b[0].length - a[0].length)
            .find(([code]) => upper.includes(code))?.[1];
        const webhookUrl = propertyWebhook ?? CONFIG.JANDI_WEBHOOK_URL_TEST;
        await sendJandi(reply, webhookUrl).catch(() => {});
        console.log(`🤖 Jandi AI reply → ${roomName}: "${reply.slice(0, 80)}"`);
    } catch (e: any) {
        console.error('❌ Jandi ask failed:', e?.message);
    }
});

router.post('/jandi/receipt', async (req, res) => {
    res.sendStatus(200);

    const payload = req.body;

    if (CONFIG.JANDI_OUTGOING_TOKEN && payload.token !== CONFIG.JANDI_OUTGOING_TOKEN) {
        console.warn('❌ Jandi receipt: invalid token');
        return;
    }

    const text: string = payload.text || payload.data || '';
    const sender: string = payload.writer?.name || 'Unknown';
    const roomName: string = payload.roomName || 'Jandi';
    const fileSharing = payload.file_sharing || payload.fileSharing;

    // No image attached — silently ignore
    if (!fileSharing?.download_url) return;

    const card = extractCard(text);
    if (!card) {
        await sendJandi(
            `❌ No card specified. Post receipt image with caption:\n/exp [card]  (e.g. /exp jy)\n\nCards: jy · jn · rc · cy · gy · cz`,
            CONFIG.JANDI_WEBHOOK_EXPENSE
        ).catch(() => {});
        return;
    }

    try {
        const parsed = await parseReceiptImage(fileSharing.download_url);
        if (!parsed) {
            await sendJandi(
                `❌ Could not read receipt. Log manually:\n/exp ${card} [amount] [item]`,
                CONFIG.JANDI_WEBHOOK_EXPENSE
            ).catch(() => {});
            return;
        }

        await logJandiReceipt(roomName, roomName, parsed.item, parsed.amount_krw, sender, card);

        const fmt = (n: number) => n.toLocaleString('en-US');
        await sendJandiRich(
            `🧾 Receipt scanned · ✅ Logged`,
            [{ title: `${parsed.item}  ₩${fmt(parsed.amount_krw)}`, description: `${CARD_NAMES[card] ?? card}'s card · ${sender}` }],
            CONFIG.JANDI_WEBHOOK_EXPENSE
        ).catch(() => {});

        console.log(`✅ Jandi receipt logged: ${parsed.item} ₩${parsed.amount_krw} by ${sender}`);
    } catch (e: any) {
        console.error('❌ Jandi receipt scan failed:', e?.message);
        await sendJandi(
            `❌ Scan failed. Log manually:\n/exp ${card} [amount] [item]`,
            CONFIG.JANDI_WEBHOOK_EXPENSE
        ).catch(() => {});
    }
});

export default router;
