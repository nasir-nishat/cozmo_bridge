import axios from 'axios';
import { CONFIG } from '../config/constants';
import { sendJandi } from './jandi';
import { pushAlert as storeAlert } from './alertStore';

type AlertOptions = {
    platform?: 'LINE' | 'WHATSAPP' | 'KAKAO' | 'WECHAT' | 'HOSTFULLY' | 'GENERAL';
    useTestJandi?: boolean;
    telegramOnly?: boolean;
    propertyCode?: string;
};

// Enforce 1 msg/sec to the same chat (Telegram hard limit)
let lastTelegramSendAt = 0;

async function sendTelegramWithRetry(message: string, maxRetries = 3): Promise<void> {
    const MIN_INTERVAL_MS = 1100;
    const now = Date.now();
    const gap = now - lastTelegramSendAt;
    if (gap < MIN_INTERVAL_MS) await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - gap));
    lastTelegramSendAt = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: CONFIG.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
            });
            return;
        } catch (e: any) {
            const status = e?.response?.status;
            const retryAfter = e?.response?.data?.parameters?.retry_after;

            if (status === 429) {
                // Rate limited — respect retry_after from Telegram, else exponential backoff
                const waitMs = retryAfter ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30000);
                console.warn(`⚠️ Telegram rate limited — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxRetries})`);
                await new Promise(r => setTimeout(r, waitMs));
            } else {
                // Non-retriable error (403, 400, etc.)
                console.error(`❌ Telegram alert failed [${status}]:`, e?.response?.data?.description || e.message);
                return;
            }
        }
    }
    console.error('❌ Telegram alert gave up after max retries');
}

export async function sendAlert(message: string, options: AlertOptions = {}): Promise<void> {
    const plainText = message.replace(/<[^>]+>/g, '');
    storeAlert(message, options.platform);
    await sendTelegramWithRetry(message);
    const isError = plainText.trimStart().startsWith('⚠️');
    if (CONFIG.ENABLE_JANDI && !CONFIG.TG_ONLY_ALERTS && !isError && !options.telegramOnly) {
        const useTestWebhook = CONFIG.USE_TEST_JANDI_WEBHOOK ||
            options.useTestJandi ||
            (options.platform === 'LINE' && CONFIG.LINE_USE_TEST_JANDI_WEBHOOK) ||
            (options.platform === 'WECHAT' && CONFIG.WECHAT_USE_TEST_JANDI_WEBHOOK);
        if (useTestWebhook) console.log('🧪 JANDI routed to test webhook');
        const propertyWebhook = options.propertyCode
            ? CONFIG.JANDI_PROPERTY_WEBHOOKS[options.propertyCode]
            : undefined;
        if (propertyWebhook && !useTestWebhook) {
            await sendJandi(plainText, propertyWebhook);
        } else {
            const globalWebhook = useTestWebhook ? CONFIG.JANDI_WEBHOOK_URL_TEST : undefined;
            await sendJandi(plainText, globalWebhook);
        }
    }
}
