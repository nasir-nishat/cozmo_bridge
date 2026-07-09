import { chromium } from 'playwright';

const EMAIL = 'cozmo@coze.care';
const PASSWORD = 'cosecare2023#*';
const TEAM_URL = 'https://cose.jandi.com';
const ROOM_ID = '35436954';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${TEAM_URL}/app`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="nocheck"]', PASSWORD);
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
await page.goto(`${TEAM_URL}/app/#!/room/${ROOM_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);

const result = await page.evaluate(() => {
    const items = document.querySelectorAll('.msg-item.filegroup[message-id]');
    if (!items.length) return { count: 0, bodySnippet: document.body.innerHTML.slice(0, 300) };

    const item = items[items.length - 1];
    const msgId = item.getAttribute('message-id');

    // All elements inside the file message item
    const innerEls = Array.from(item.querySelectorAll('*')).slice(0, 20).map(el => ({
        tag: el.tagName,
        cls: el.className,
        text: el.textContent?.trim()?.slice(0, 50)
    }));

    // Walk up to 5 ancestor levels — find anything that looks like a name
    const ancestors = [];
    let cursor = item.parentElement;
    for (let i = 0; i < 5 && cursor; i++) {
        const nameEl = cursor.querySelector('[class*="name"], [class*="author"], [class*="writer"], [class*="user"]');
        if (nameEl) {
            ancestors.push({ level: i, cls: nameEl.className, text: nameEl.textContent?.trim()?.slice(0, 50) });
        }
        cursor = cursor.parentElement;
    }

    // Raw outer HTML of the file item (first 600 chars)
    const rawHtml = item.outerHTML.slice(0, 600);

    return { count: items.length, msgId, innerEls, ancestors, rawHtml };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
