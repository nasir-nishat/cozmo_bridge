"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkWaConnection = checkWaConnection;
const evoClient_1 = require("./evoClient");
const notify_1 = require("../../services/notify");
const groupCreation_1 = require("./groupCreation");
const replyWatchdog_1 = require("../../services/replyWatchdog");
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
let lastDisconnectAlertAt = 0;
async function checkWaConnection() {
    try {
        const res = await evoClient_1.evoApi.get(`/instance/connectionState/${evoClient_1.INSTANCE}`);
        const state = res.data?.instance?.state || res.data?.state || '';
        const isConnected = state === 'open';
        if (isConnected) {
            if (!(0, evoClient_1.isWaReady)()) {
                (0, evoClient_1.setWaReady)(true);
                console.log('✅ WA reconnected — waReady restored');
                await (0, notify_1.sendAlert)(`✅ <b>WhatsApp Reconnected</b>\n─────────────────\n` +
                    `📡 <b>State:</b> ${state}\n` +
                    `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
                (0, groupCreation_1.flushPendingMessages)().catch(e => console.error('❌ flushPendingMessages (watchdog) error:', e?.message));
            }
            (0, replyWatchdog_1.checkReplyWatchdog)().catch(e => console.error('❌ checkReplyWatchdog error:', e?.message));
            return;
        }
        (0, evoClient_1.setWaReady)(false);
        const now = Date.now();
        if (now - lastDisconnectAlertAt < ALERT_COOLDOWN_MS)
            return;
        lastDisconnectAlertAt = now;
        console.warn(`📵 WA disconnected | state="${state}"`);
        await (0, notify_1.sendAlert)(`📵 <b>WhatsApp Disconnected</b>\n─────────────────\n` +
            `📡 <b>State:</b> ${state || 'unknown'}\n` +
            `👤 <b>Action needed:</b> Please notify the developer\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
    }
    catch (e) {
        console.error('❌ WA connection check error:', e?.message);
    }
}
