import { evoApi, INSTANCE, isWaReady, setWaReady } from './evoClient';
import { sendAlert } from '../../services/notify';
import { flushPendingMessages } from './groupCreation';
import { checkReplyWatchdog } from '../../services/replyWatchdog';

const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
let lastDisconnectAlertAt = 0;

export async function checkWaConnection(): Promise<void> {
    try {
        const res = await evoApi.get(`/instance/connectionState/${INSTANCE}`);
        const state: string = res.data?.instance?.state || res.data?.state || '';
        const isConnected = state === 'open';

        if (isConnected) {
            if (!isWaReady()) {
                setWaReady(true);
                console.log('✅ WA reconnected — waReady restored');
                await sendAlert(
                    `✅ <b>WhatsApp Reconnected</b>\n─────────────────\n` +
                    `📡 <b>State:</b> ${state}\n` +
                    `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                    { telegramOnly: true }
                );
                flushPendingMessages().catch(e => console.error('❌ flushPendingMessages (watchdog) error:', e?.message));
            }
            checkReplyWatchdog().catch(e => console.error('❌ checkReplyWatchdog error:', e?.message));
            return;
        }

        setWaReady(false);
        const now = Date.now();
        if (now - lastDisconnectAlertAt < ALERT_COOLDOWN_MS) return;
        lastDisconnectAlertAt = now;

        console.warn(`📵 WA disconnected | state="${state}"`);
        await sendAlert(
            `📵 <b>WhatsApp Disconnected</b>\n─────────────────\n` +
            `📡 <b>State:</b> ${state || 'unknown'}\n` +
            `👤 <b>Action needed:</b> Please notify the developer\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { telegramOnly: true }
        );
    } catch (e: any) {
        console.error('❌ WA connection check error:', e?.message);
    }
}
