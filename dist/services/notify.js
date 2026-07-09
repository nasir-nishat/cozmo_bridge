"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAlert = sendAlert;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
const jandi_1 = require("./jandi");
const alertStore_1 = require("./alertStore");
// Enforce 1 msg/sec to the same chat (Telegram hard limit)
let lastTelegramSendAt = 0;
async function sendTelegramWithRetry(message, maxRetries = 3) {
    const MIN_INTERVAL_MS = 1100;
    const now = Date.now();
    const gap = now - lastTelegramSendAt;
    if (gap < MIN_INTERVAL_MS)
        await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - gap));
    lastTelegramSendAt = Date.now();
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await axios_1.default.post(`https://api.telegram.org/bot${constants_1.CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: constants_1.CONFIG.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
            });
            return;
        }
        catch (e) {
            const status = e?.response?.status;
            const retryAfter = e?.response?.data?.parameters?.retry_after;
            if (status === 429) {
                // Rate limited — respect retry_after from Telegram, else exponential backoff
                const waitMs = retryAfter ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30000);
                console.warn(`⚠️ Telegram rate limited — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxRetries})`);
                await new Promise(r => setTimeout(r, waitMs));
            }
            else {
                // Non-retriable error (403, 400, etc.)
                console.error(`❌ Telegram alert failed [${status}]:`, e?.response?.data?.description || e.message);
                return;
            }
        }
    }
    console.error('❌ Telegram alert gave up after max retries');
}
async function sendAlert(message, options = {}) {
    const plainText = message.replace(/<[^>]+>/g, '');
    (0, alertStore_1.pushAlert)(message, options.platform);
    await sendTelegramWithRetry(message);
    const isError = plainText.trimStart().startsWith('⚠️');
    if (constants_1.CONFIG.ENABLE_JANDI && !constants_1.CONFIG.TG_ONLY_ALERTS && !isError && !options.telegramOnly) {
        const useTestWebhook = constants_1.CONFIG.USE_TEST_JANDI_WEBHOOK ||
            options.useTestJandi ||
            (options.platform === 'LINE' && constants_1.CONFIG.LINE_USE_TEST_JANDI_WEBHOOK) ||
            (options.platform === 'WECHAT' && constants_1.CONFIG.WECHAT_USE_TEST_JANDI_WEBHOOK);
        if (useTestWebhook)
            console.log('🧪 JANDI routed to test webhook');
        const propertyWebhook = options.propertyCode
            ? constants_1.CONFIG.JANDI_PROPERTY_WEBHOOKS[options.propertyCode]
            : undefined;
        if (propertyWebhook && !useTestWebhook) {
            await (0, jandi_1.sendJandi)(plainText, propertyWebhook);
        }
        else {
            const globalWebhook = useTestWebhook ? constants_1.CONFIG.JANDI_WEBHOOK_URL_TEST : undefined;
            await (0, jandi_1.sendJandi)(plainText, globalWebhook);
        }
    }
}
