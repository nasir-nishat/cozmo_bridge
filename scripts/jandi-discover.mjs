import { chromium } from 'playwright';
import fs from 'fs';

const EMAIL = 'cozmo@coze.care';
const PASSWORD = 'cosecare2023#*';
const TEAM_URL = 'https://cose.jandi.com';
const ROOM_ID = '35436954';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(`${TEAM_URL}/app`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="nocheck"]', PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);

    await page.goto(`${TEAM_URL}/app/#!/room/${ROOM_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'scripts/jandi-room-now.png' });

    // Dump the full message list HTML
    const msgHtml = await page.evaluate(() => {
        const container = document.querySelector('.message-list, .msg-list, [class*="message-list"], [class*="chat-list"], .contents, .thread-content, #messageList, .fd-app-message-list');
        if (container) return container.innerHTML.slice(0, 3000);

        // fallback — find any element containing file/image
        const imgs = document.querySelectorAll('img[src*="jandi-box"], img[src*="files"]');
        return Array.from(imgs).map(i => i.closest('[class]')?.outerHTML?.slice(0, 500)).join('\n---\n');
    });
    console.log('Message HTML:\n', msgHtml);

    // Find all file/attachment related elements
    const fileEls = await page.evaluate(() => {
        const els = document.querySelectorAll('[class*="file"], [class*="attach"], [class*="image"], [class*="photo"]');
        return Array.from(els).slice(0, 10).map(e => ({
            class: e.className,
            tag: e.tagName,
            html: e.outerHTML.slice(0, 300)
        }));
    });
    console.log('File elements:', JSON.stringify(fileEls, null, 2));

    // Dump full page HTML for analysis
    const html = await page.content();
    fs.writeFileSync('scripts/jandi-dom.html', html);
    console.log('Full DOM saved to scripts/jandi-dom.html');

    await browser.close();
})();
