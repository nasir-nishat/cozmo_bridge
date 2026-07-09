import { chromium, Browser, Page } from 'playwright';
import OpenAI from 'openai';
import axios from 'axios';
import { CONFIG } from '../config/constants';
import { logJandiReceipt } from './expenses';
import { sendJandi, sendJandiRich } from './jandi';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
    if (!_openai) _openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
    return _openai;
}
const CARD_PATTERN = /\b(jy|jn|rc|cy|gy|cz)\b/i;
const CARD_NAMES: Record<string, string> = { jy: 'Joyhasla', jn: 'Jin', rc: 'Ricky', cy: 'Cyrus', gy: 'Gaya', cz: 'COZMO' };

// Maps Jandi display name (lowercase, partial match) → card code
const SENDER_CARD_MAP: Record<string, string> = {
    'nishat': 'cz',
    'ricky': 'rc',
    'jin': 'jn',
    'cyrus': 'cy',
    'gaya': 'gy',
    'joyhasla': 'jy',
};
const seenMessageIds = new Set<string>();
let browser: Browser | null = null;
let page: Page | null = null;
let isRunning = false;

async function login(): Promise<Page> {
    if (browser) await browser.close().catch(() => {});
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    await page.goto(`${CONFIG.JANDI_TEAM_URL}/app`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('input[name="email"]', CONFIG.JANDI_EMAIL);
    await page.fill('input[name="nocheck"]', CONFIG.JANDI_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);

    await page.goto(`${CONFIG.JANDI_TEAM_URL}/app/#!/room/${CONFIG.JANDI_WATCH_ROOM_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('✅ Jandi watcher: logged in');
    return page;
}

async function getImageMessages(page: Page): Promise<Array<{ msgId: string; imgUrl: string; mimeType: string; caption: string; sender: string }>> {
    return page.evaluate(() => {
        const items = document.querySelectorAll('.msg-item.filegroup[message-id]');
        const results: Array<{ msgId: string; imgUrl: string; mimeType: string; caption: string; sender: string }> = [];

        items.forEach(item => {
            const msgId = item.getAttribute('message-id') || '';
            const attachmentEl = item.querySelector('[selected-attachment]');
            if (!attachmentEl) return;

            try {
                const raw = attachmentEl.getAttribute('selected-attachment') || '{}';
                const attachment = JSON.parse(raw);
                const mimeType: string = attachment?.content?.type || '';
                if (!mimeType.startsWith('image/')) return;

                // Use the <img> src — jandi-box.com CDN, reachable directly from Node
                const imgUrl: string = item.querySelector('img')?.src || '';
                if (!imgUrl) return;

                const caption = (item.querySelector('.msg-text-box')?.textContent || '').trim();

                // Sender name is in ._user element on the parent message group, not inside the item
                let sender = '';
                let cur: Element | null = item.parentElement;
                for (let i = 0; i < 5 && cur && !sender; i++) {
                    const u = cur.querySelector('._user');
                    const text = u?.textContent?.trim();
                    if (text) sender = text;
                    cur = cur.parentElement;
                }

                results.push({ msgId, imgUrl, mimeType, caption, sender });
            } catch { }
        });
        return results;
    });
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const mimeType = (String(res.headers['content-type'] || 'image/jpeg')).split(';')[0];
        return { buffer: Buffer.from(res.data), mimeType };
    } catch {
        return null;
    }
}

async function parseReceipt(buffer: Buffer, mimeType: string): Promise<{ item: string; amount_krw: number } | null> {
    const base64 = buffer.toString('base64');
    const res = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                { type: 'text', text: 'Parse this receipt. Return ONLY JSON: {"item":"brief English description","amount_krw":50000}. Use final total. If unreadable: {"error":"cannot parse"}.' }
            ]
        }],
        max_tokens: 80,
    });

    const content = res.choices[0]?.message?.content?.trim() || '';
    const match = content.match(/\{[^}]+\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        if (parsed.error || !parsed.item || !parsed.amount_krw) return null;
        return { item: String(parsed.item), amount_krw: parseInt(parsed.amount_krw, 10) };
    } catch { return null; }
}

async function processImage(page: Page, msg: { msgId: string; imgUrl: string; mimeType: string; caption: string; sender: string; }): Promise<void> {
    const webhookUrl = CONFIG.JANDI_EXPENSE_WEBHOOK || CONFIG.JANDI_WEBHOOK_EXPENSE;

    // Caption override takes priority, then auto-detect from sender name
    const captionCard = msg.caption.match(CARD_PATTERN)?.[1]?.toLowerCase() || null;
    const senderKey = msg.sender.toLowerCase();
    const senderCard = Object.entries(SENDER_CARD_MAP).find(([k]) => senderKey.includes(k))?.[1] ?? null;
    const card = captionCard || senderCard;

    if (!card) {
        await sendJandi(`❌ Unknown sender "${msg.sender}". Add card code as caption:\njy · jn · rc · cy · gy · cz`, webhookUrl).catch(() => {});
        return;
    }

    try {
        const img = await downloadImage(msg.imgUrl);
        if (!img) {
            await sendJandi(`❌ Could not download image. Log manually:\n/exp ${card} [amount] [item]`, webhookUrl).catch(() => {});
            return;
        }
        const parsed = await parseReceipt(img.buffer, img.mimeType);

        if (!parsed) {
            await sendJandi(`❌ Could not read receipt. Log manually:\n/exp ${card} [amount] [item]`, webhookUrl).catch(() => {});
            return;
        }

        const sender = msg.sender || 'Staff';
        await logJandiReceipt(CONFIG.JANDI_WATCH_ROOM_ID, 'Expenses', parsed.item, parsed.amount_krw, sender, card);

        const fmt = (n: number) => n.toLocaleString('en-US');
        await sendJandiRich(
            `Receipt scanned - Logged`,
            [{ title: `${parsed.item}  KRW ${fmt(parsed.amount_krw)}`, description: `${CARD_NAMES[card] ?? card} card - ${sender}` }],
            webhookUrl
        ).catch(() => {});

        console.log(`✅ Jandi receipt: ${parsed.item} ₩${parsed.amount_krw} by ${sender}`);
    } catch (e: any) {
        console.error('❌ Jandi receipt process failed:', e?.message);
        await sendJandi(`❌ Scan failed. Log manually:\n/exp ${card} [amount] [item]`, webhookUrl).catch(() => {});
    }
}

async function poll(seedOnly = false): Promise<void> {
    if (!page) return;
    try {
        const messages = await getImageMessages(page);
        for (const msg of messages) {
            if (seenMessageIds.has(msg.msgId)) continue;
            seenMessageIds.add(msg.msgId);
            if (seedOnly) continue;
            console.log(`🖼️ New Jandi image: msgId=${msg.msgId} sender="${msg.sender}" caption="${msg.caption}"`);
            await processImage(page, msg);
        }
    } catch (e: any) {
        console.error('❌ Jandi watcher poll error:', e?.message);
        try { page = await login(); } catch { }
    }
}

export async function initJandiWatcher(): Promise<void> {
    if (!CONFIG.ENABLE_JANDI_WATCHER) return;
    if (isRunning) return;
    isRunning = true;

    try {
        page = await login();
        await poll(true); // seed — mark existing messages seen, don't process
        setInterval(poll, 10_000);
        console.log('👁️ Jandi watcher started — polling every 10s');
    } catch (e: any) {
        console.error('❌ Jandi watcher failed to start:', e?.message);
        isRunning = false;
    }
}
