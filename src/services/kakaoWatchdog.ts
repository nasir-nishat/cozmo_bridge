import { sendAlert } from './notify';

let lastHeartbeat = 0;

const ALERT_THRESHOLD_MS =  5 * 60 * 1000; // alert if silent for 5 min (dequeue polls every 500ms)
const ALERT_COOLDOWN_MS  = 30 * 60 * 1000; // re-alert at most every 30 min
let lastAlertAt = 0;

export function recordKakaoHeartbeat(): void {
    lastHeartbeat = Date.now();
}

export function getLastKakaoHeartbeat(): number {
    return lastHeartbeat;
}

export async function checkKakaoHeartbeat(): Promise<void> {
    if (lastHeartbeat === 0) return; // no heartbeat ever received — skip until first ping
    const now = Date.now();
    const age = now - lastHeartbeat;
    if (age < ALERT_THRESHOLD_MS) return;
    if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
    lastAlertAt = now;

    const minutes = Math.round(age / 60_000);
    console.warn(`⚠️ KakaoTalk heartbeat missing — last seen ${minutes} min ago`);
    await sendAlert(
        `📵 <b>KakaoTalk Bot Unresponsive</b>\n─────────────────\n` +
        `⏱️ <b>Last heartbeat:</b> ${minutes} min ago\n` +
        `⚠️ <b>Action:</b> Restart MessengerBot R in LDPlayer\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    );
}
