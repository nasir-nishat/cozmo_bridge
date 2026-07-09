import axios from 'axios';
import { CONFIG } from '../config/constants';

const JANDI_HEADERS = {
    'Accept': 'application/vnd.tosslab.jandi-v2+json',
    'Content-Type': 'application/json',
};

export async function sendJandi(message: string, webhookUrl?: string): Promise<void> {
    if (!CONFIG.ENABLE_JANDI) return;
    try {
        if (CONFIG.USE_TEST_JANDI_WEBHOOK) {
            console.log('🧪 JANDI test webhook enabled');
        }
        await axios.post(webhookUrl || CONFIG.JANDI_WEBHOOK_URL, { body: message }, { headers: JANDI_HEADERS });
    } catch (e: any) {
        console.error('❌ Jandi alert failed:', e.message);
    }
}

export async function sendJandiRich(
    body: string,
    connectInfo: { title: string; description: string }[],
    webhookUrl?: string,
    color = '#00C73C'
): Promise<void> {
    if (!CONFIG.ENABLE_JANDI) return;
    try {
        await axios.post(webhookUrl || CONFIG.JANDI_WEBHOOK_URL, {
            body,
            connectColor: color,
            connectInfo,
        }, { headers: JANDI_HEADERS });
    } catch (e: any) {
        console.error('❌ Jandi rich alert failed:', e.message);
    }
}
