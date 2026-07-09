import { chromium } from 'playwright';

const EMAIL = 'cozmo@coze.care';
const PASSWORD = 'cosecare2023#*';
const TEAM_URL = 'https://cose.jandi.com';
const ROOM_ID = '35436954';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${TEAM_URL}/app`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="nocheck"]', PASSWORD);
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
await page.goto(`${TEAM_URL}/app/#!/room/${ROOM_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);

// Get fileUrl from most recent image message
const fileUrl = await page.evaluate(() => {
    const items = document.querySelectorAll('.msg-item.filegroup[message-id]');
    if (!items.length) return null;
    const item = items[items.length - 1];
    const attachmentEl = item.querySelector('[selected-attachment]');
    if (!attachmentEl) return null;
    try {
        const raw = attachmentEl.getAttribute('selected-attachment') || '{}';
        const a = JSON.parse(raw);
        return a?.content?.fileUrl || null;
    } catch { return null; }
});

console.log('fileUrl:', fileUrl);
if (!fileUrl) { console.log('No fileUrl found'); await browser.close(); process.exit(1); }

// Try 1: tab.goto()
console.log('\n--- Attempt 1: tab.goto() ---');
const tab = await context.newPage();
try {
    const res = await tab.goto(fileUrl, { timeout: 20000 });
    console.log('status:', res?.status());
    console.log('ok:', res?.ok());
    console.log('content-type:', res?.headers()['content-type']);
    const body = await res?.body();
    console.log('body size:', body?.length, 'bytes');
} catch (e) {
    console.log('FAILED:', e.message);
} finally {
    await tab.close().catch(() => {});
}

// Try 2: page.request.get() with explicit cookies
console.log('\n--- Attempt 2: context.request.get() ---');
try {
    const cookies = await context.cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const res2 = await context.request.get(fileUrl, {
        headers: { cookie: cookieStr, referer: TEAM_URL },
        timeout: 20000
    });
    console.log('status:', res2.status());
    console.log('ok:', res2.ok());
    const body = await res2.body();
    console.log('body size:', body?.length, 'bytes');
} catch (e) {
    console.log('FAILED:', e.message);
}

// Try 3: check what URL the img tag actually uses
console.log('\n--- Attempt 3: actual <img> src in DOM ---');
const imgSrc = await page.evaluate(() => {
    const items = document.querySelectorAll('.msg-item.filegroup[message-id]');
    if (!items.length) return null;
    const item = items[items.length - 1];
    const img = item.querySelector('img');
    return img?.src || img?.getAttribute('src') || null;
});
console.log('img src:', imgSrc);

await browser.close();
