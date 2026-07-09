"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initJandiWatcher = initJandiWatcher;
const playwright_1 = require("playwright");
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
const expenses_1 = require("./expenses");
const jandi_1 = require("./jandi");
let _openai = null;
function getOpenAI() {
    if (!_openai)
        _openai = new openai_1.default({ apiKey: constants_1.CONFIG.OPENAI_API_KEY });
    return _openai;
}
const CARD_PATTERN = /\b(jy|jn|rc|cy|gy|cz)\b/i;
const CARD_NAMES = { jy: 'Joyhasla', jn: 'Jin', rc: 'Ricky', cy: 'Cyrus', gy: 'Gaya', cz: 'COZMO' };
// Maps Jandi display name (lowercase, partial match) → card code
const SENDER_CARD_MAP = {
    'nishat': 'cz',
    'ricky': 'rc',
    'jin': 'jn',
    'cyrus': 'cy',
    'gaya': 'gy',
    'joyhasla': 'jy',
};
const seenMessageIds = new Set();
let browser = null;
let page = null;
let isRunning = false;
async function login() {
    if (browser)
        await browser.close().catch(() => { });
    browser = await playwright_1.chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
    await page.goto(`${constants_1.CONFIG.JANDI_TEAM_URL}/app`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('input[name="email"]', constants_1.CONFIG.JANDI_EMAIL);
    await page.fill('input[name="nocheck"]', constants_1.CONFIG.JANDI_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
    await page.goto(`${constants_1.CONFIG.JANDI_TEAM_URL}/app/#!/room/${constants_1.CONFIG.JANDI_WATCH_ROOM_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('✅ Jandi watcher: logged in');
    return page;
}
async function getImageMessages(page) {
    return page.evaluate(() => {
        const items = document.querySelectorAll('.msg-item.filegroup[message-id]');
        const results = [];
        items.forEach(item => {
            const msgId = item.getAttribute('message-id') || '';
            const attachmentEl = item.querySelector('[selected-attachment]');
            if (!attachmentEl)
                return;
            try {
                const raw = attachmentEl.getAttribute('selected-attachment') || '{}';
                const attachment = JSON.parse(raw);
                const mimeType = attachment?.content?.type || '';
                if (!mimeType.startsWith('image/'))
                    return;
                // Use the <img> src — jandi-box.com CDN, reachable directly from Node
                const imgUrl = item.querySelector('img')?.src || '';
                if (!imgUrl)
                    return;
                const caption = (item.querySelector('.msg-text-box')?.textContent || '').trim();
                // Sender name is in ._user element on the parent message group, not inside the item
                let sender = '';
                let cur = item.parentElement;
                for (let i = 0; i < 5 && cur && !sender; i++) {
                    const u = cur.querySelector('._user');
                    const text = u?.textContent?.trim();
                    if (text)
                        sender = text;
                    cur = cur.parentElement;
                }
                results.push({ msgId, imgUrl, mimeType, caption, sender });
            }
            catch { }
        });
        return results;
    });
}
async function downloadImage(url) {
    try {
        const res = await axios_1.default.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const mimeType = (String(res.headers['content-type'] || 'image/jpeg')).split(';')[0];
        return { buffer: Buffer.from(res.data), mimeType };
    }
    catch {
        return null;
    }
}
async function parseReceipt(buffer, mimeType) {
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
    if (!match)
        return null;
    try {
        const parsed = JSON.parse(match[0]);
        if (parsed.error || !parsed.item || !parsed.amount_krw)
            return null;
        return { item: String(parsed.item), amount_krw: parseInt(parsed.amount_krw, 10) };
    }
    catch {
        return null;
    }
}
async function processImage(page, msg) {
    const webhookUrl = constants_1.CONFIG.JANDI_EXPENSE_WEBHOOK || constants_1.CONFIG.JANDI_WEBHOOK_EXPENSE;
    // Caption override takes priority, then auto-detect from sender name
    const captionCard = msg.caption.match(CARD_PATTERN)?.[1]?.toLowerCase() || null;
    const senderKey = msg.sender.toLowerCase();
    const senderCard = Object.entries(SENDER_CARD_MAP).find(([k]) => senderKey.includes(k))?.[1] ?? null;
    const card = captionCard || senderCard;
    if (!card) {
        await (0, jandi_1.sendJandi)(`❌ Unknown sender "${msg.sender}". Add card code as caption:\njy · jn · rc · cy · gy · cz`, webhookUrl).catch(() => { });
        return;
    }
    try {
        const img = await downloadImage(msg.imgUrl);
        if (!img) {
            await (0, jandi_1.sendJandi)(`❌ Could not download image. Log manually:\n/exp ${card} [amount] [item]`, webhookUrl).catch(() => { });
            return;
        }
        const parsed = await parseReceipt(img.buffer, img.mimeType);
        if (!parsed) {
            await (0, jandi_1.sendJandi)(`❌ Could not read receipt. Log manually:\n/exp ${card} [amount] [item]`, webhookUrl).catch(() => { });
            return;
        }
        const sender = msg.sender || 'Staff';
        await (0, expenses_1.logJandiReceipt)(constants_1.CONFIG.JANDI_WATCH_ROOM_ID, 'Expenses', parsed.item, parsed.amount_krw, sender, card);
        const fmt = (n) => n.toLocaleString('en-US');
        await (0, jandi_1.sendJandiRich)(`Receipt scanned - Logged`, [{ title: `${parsed.item}  KRW ${fmt(parsed.amount_krw)}`, description: `${CARD_NAMES[card] ?? card} card - ${sender}` }], webhookUrl).catch(() => { });
        console.log(`✅ Jandi receipt: ${parsed.item} ₩${parsed.amount_krw} by ${sender}`);
    }
    catch (e) {
        console.error('❌ Jandi receipt process failed:', e?.message);
        await (0, jandi_1.sendJandi)(`❌ Scan failed. Log manually:\n/exp ${card} [amount] [item]`, webhookUrl).catch(() => { });
    }
}
async function poll(seedOnly = false) {
    if (!page)
        return;
    try {
        const messages = await getImageMessages(page);
        for (const msg of messages) {
            if (seenMessageIds.has(msg.msgId))
                continue;
            seenMessageIds.add(msg.msgId);
            if (seedOnly)
                continue;
            console.log(`🖼️ New Jandi image: msgId=${msg.msgId} sender="${msg.sender}" caption="${msg.caption}"`);
            await processImage(page, msg);
        }
    }
    catch (e) {
        console.error('❌ Jandi watcher poll error:', e?.message);
        try {
            page = await login();
        }
        catch { }
    }
}
async function initJandiWatcher() {
    if (!constants_1.CONFIG.ENABLE_JANDI_WATCHER)
        return;
    if (isRunning)
        return;
    isRunning = true;
    try {
        page = await login();
        await poll(true); // seed — mark existing messages seen, don't process
        setInterval(poll, 10000);
        console.log('👁️ Jandi watcher started — polling every 10s');
    }
    catch (e) {
        console.error('❌ Jandi watcher failed to start:', e?.message);
        isRunning = false;
    }
}
