"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const events_1 = require("events");
events_1.EventEmitter.defaultMaxListeners = 50;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("./config/constants");
const whatsapp_1 = __importStar(require("./routes/whatsapp"));
const watchdog_1 = require("./platforms/whatsapp/watchdog");
const groupReminders_1 = require("./services/groupReminders");
const telegram_1 = __importStar(require("./routes/telegram"));
const guest_1 = __importDefault(require("./routes/guest"));
const line_1 = __importDefault(require("./routes/line"));
const kakao_1 = __importDefault(require("./routes/kakao"));
const bot_1 = require("./platforms/wechat/bot");
const wechat_1 = __importDefault(require("./routes/wechat"));
const hostfully_1 = require("./services/hostfully");
const staffCache_1 = require("./services/staffCache");
const notify_1 = require("./services/notify");
const checkoutReminder_1 = require("./services/checkoutReminder");
const checkinReminder_1 = require("./services/checkinReminder");
const bookingStore_1 = require("./services/bookingStore");
const expenses_1 = require("./services/expenses");
const pendingHfMessages_1 = require("./services/pendingHfMessages");
const pendingGroupCreation_1 = require("./services/pendingGroupCreation");
const groupCreation_1 = require("./platforms/whatsapp/groupCreation");
const stepWatcher_1 = require("./services/stepWatcher");
const node_cron_1 = __importDefault(require("node-cron"));
const messageBuffer_1 = require("./services/messageBuffer");
const kakaoWatchdog_1 = require("./services/kakaoWatchdog");
const jandi_1 = __importDefault(require("./routes/jandi"));
const jandiWatcher_1 = require("./services/jandiWatcher");
const adminKakao_1 = __importDefault(require("./routes/adminKakao"));
const adminDashboard_1 = __importDefault(require("./routes/adminDashboard"));
const adminTasks_1 = __importDefault(require("./routes/adminTasks"));
const adminKb_1 = __importDefault(require("./routes/adminKb"));
const adminSchedule_1 = __importDefault(require("./routes/adminSchedule"));
const adminAnalytics_1 = __importDefault(require("./routes/adminAnalytics"));
// ─── Global error guards — prevent silent process exit ────────────────────────
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    // Suppress Puppeteer DevTools disconnect noise — not fatal
    if (msg.includes('Target closed') || msg.includes('Protocol error')) {
        console.warn('⚠️ Puppeteer protocol error (ignored):', msg);
        return;
    }
    console.error('🔥 Unhandled Rejection:', msg);
});
process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err?.message || err);
});
const app = (0, express_1.default)();
app.use('/assets', express_1.default.static(path_1.default.resolve(__dirname, '../../assets')));
app.use(express_1.default.json({
    limit: '50mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));
// Catch-all request logger — shows every hit before routing (skip noisy poll endpoints)
app.use((req, _res, next) => {
    if (req.path !== '/kakao/dequeue')
        console.log(`📡 Incoming: ${req.method} ${req.path}`);
    next();
});
console.log('🔍 ENABLE_WHATSAPP:', constants_1.CONFIG.ENABLE_WHATSAPP, '| raw env:', process.env.ENABLE_WHATSAPP);
if (constants_1.CONFIG.ENABLE_WHATSAPP) {
    app.use(whatsapp_1.default);
    (0, whatsapp_1.initWhatsApp)();
    setTimeout(watchdog_1.checkWaConnection, 30000);
    setInterval(watchdog_1.checkWaConnection, 5 * 60 * 1000);
    setInterval(() => (0, groupReminders_1.checkAndFireReminders)().catch(e => console.error('❌ checkAndFireReminders:', e?.message)), 2 * 60 * 1000);
    if (constants_1.CONFIG.ENABLE_CHECKOUT_REMINDER)
        (0, checkoutReminder_1.initCheckoutReminder)();
    if (constants_1.CONFIG.ENABLE_CHECKIN_REMINDER)
        (0, checkinReminder_1.initCheckinReminder)();
}
else {
    console.log('⏸️ WhatsApp routes disabled by ENABLE_WHATSAPP=false');
}
app.use(telegram_1.default);
app.use(guest_1.default);
app.use(adminKakao_1.default);
app.use(adminDashboard_1.default);
app.use(adminTasks_1.default);
app.use(adminKb_1.default);
app.use(adminSchedule_1.default);
app.use(adminAnalytics_1.default);
if (constants_1.CONFIG.ENABLE_JANDI_RECEIPT_SCAN) {
    app.use(jandi_1.default);
}
else {
    console.log('⏸️ Jandi receipt scan disabled by ENABLE_JANDI_RECEIPT_SCAN=false');
}
if (constants_1.CONFIG.ENABLE_LINE) {
    app.use('/line', line_1.default);
}
else {
    console.log('⏸️ LINE routes disabled by ENABLE_LINE=false');
}
if (constants_1.CONFIG.ENABLE_KAKAO) {
    app.use('/kakao', kakao_1.default);
    setInterval(() => (0, kakaoWatchdog_1.checkKakaoHeartbeat)().catch(e => console.error('❌ checkKakaoHeartbeat:', e?.message)), 5 * 60 * 1000);
}
else {
    console.log('⏸️ KAKAO routes disabled by ENABLE_KAKAO=false');
}
if (constants_1.CONFIG.ENABLE_WECHAT) {
    app.use('/wechat', wechat_1.default);
}
else {
    console.log('⏸️ WeChat routes disabled by ENABLE_WECHAT=false');
}
app.listen(constants_1.CONFIG.PORT, () => {
    console.log(`🚀 COZE Bridge on http://localhost:${constants_1.CONFIG.PORT}`);
    console.log(`🧭 App mode: ${constants_1.CONFIG.APP_MODE} (${constants_1.CONFIG.TG_ONLY_ALERTS ? 'TG-only alerts' : 'TG + JANDI alerts'})`);
    console.log(`🕒 Hostfully note poll interval: ${Math.round(constants_1.CONFIG.NOTE_POLL_INTERVAL_MS / 1000)}s`);
    (0, notify_1.sendAlert)(`✅ <b>COZMO Bridge Online</b>\n─────────────────\n` +
        `🧭 <b>Mode:</b> ${constants_1.CONFIG.APP_MODE}\n` +
        `🔌 <b>WhatsApp:</b> ${constants_1.CONFIG.ENABLE_WHATSAPP ? 'enabled' : 'disabled'}\n` +
        `💬 <b>LINE:</b> ${constants_1.CONFIG.ENABLE_LINE ? 'enabled' : 'disabled'}\n` +
        `💚 <b>WeChat:</b> ${constants_1.CONFIG.ENABLE_WECHAT ? 'enabled' : 'disabled'}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true }).catch(() => { });
    // Note polling disabled — webhook handles note changes reliably now
    // Re-enable with NOTE_POLL_INTERVAL_MS env var if webhook proves unreliable
    (0, staffCache_1.loadStaffNames)().catch(e => console.warn('⚠️ loadStaffNames failed:', e?.message));
    if (constants_1.CONFIG.NOTE_POLL_INTERVAL_MS > 0) {
        setTimeout(hostfully_1.pollLeadNotes, 10000);
        setInterval(hostfully_1.pollLeadNotes, constants_1.CONFIG.NOTE_POLL_INTERVAL_MS);
    }
    setTimeout(telegram_1.pollBookingAutoGroupFallback, 20000);
    setInterval(telegram_1.pollBookingAutoGroupFallback, constants_1.CONFIG.NOTE_POLL_INTERVAL_MS);
    setTimeout(() => (0, pendingHfMessages_1.flushPendingHfMessages)().catch(e => console.error('❌ flushPendingHfMessages:', e?.message)), 10000);
    setTimeout(() => (0, groupCreation_1.flushPendingMessages)().catch(e => console.error('❌ flushPendingMessages:', e?.message)), 20000);
    // Startup catch-up must respect the same kill switches as the daily crons — otherwise setting
    // ENABLE_*_REMINDER=false would NOT stop sending after a restart (mass-message risk).
    setTimeout(() => {
        if (constants_1.CONFIG.ENABLE_CHECKIN_REMINDER)
            (0, checkinReminder_1.catchUpCheckin)();
        if (constants_1.CONFIG.ENABLE_CHECKOUT_REMINDER)
            (0, checkoutReminder_1.catchUpCheckout)();
    }, 30000);
    setInterval(() => (0, pendingHfMessages_1.flushPendingHfMessages)().catch(e => console.error('❌ flushPendingHfMessages:', e?.message)), 2 * 60 * 1000);
    setInterval(() => (0, pendingGroupCreation_1.flushPendingGroupCreations)().catch(e => console.error('❌ flushPendingGroupCreations:', e?.message)), 2 * 60 * 1000);
    setInterval(() => (0, pendingHfMessages_1.checkForStuckHfMessages)().catch(e => console.error('❌ checkForStuckHfMessages:', e?.message)), 30 * 60 * 1000);
    setInterval(() => (0, pendingGroupCreation_1.checkForStuckGroupCreations)().catch(e => console.error('❌ checkForStuckGroupCreations:', e?.message)), 30 * 60 * 1000);
    setInterval(() => (0, groupCreation_1.flushPendingMessages)().catch(e => console.error('❌ flushPendingMessages:', e?.message)), 5 * 60 * 1000);
    // Step watcher backstop sweep — catches human-completed steps the real-time trigger may have missed
    setInterval(() => (0, stepWatcher_1.sweepStepWatcher)().catch(e => console.error('❌ sweepStepWatcher:', e?.message)), 10 * 60 * 1000);
    // Light sync on startup — scans only the 2 most recent pages (~40 leads)
    // Full backfill is done manually via scripts/backfill-bookings.mjs when needed
    setTimeout(() => (0, bookingStore_1.backfillBookingStore)()
        .catch(e => console.error('❌ bookingStore sync:', e?.message)), 15000);
    // Same light sync daily at 15:00 KST to catch missed webhooks
    node_cron_1.default.schedule('0 15 * * *', () => {
        (0, bookingStore_1.backfillBookingStore)().catch(e => console.error('❌ bookingStore daily sync:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Booking store daily sync scheduled: 15:00 KST');
    // Delete settled expenses older than 7 days — runs daily at 03:00 KST
    node_cron_1.default.schedule('0 3 * * *', () => {
        (0, expenses_1.deleteOldExpenses)().catch(e => console.error('❌ expense cleanup:', e?.message));
        (0, messageBuffer_1.pruneBuffer)();
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Expense cleanup + buffer prune scheduled: 03:00 KST daily');
    if (constants_1.CONFIG.ENABLE_JANDI_WATCHER) {
        setTimeout(() => (0, jandiWatcher_1.initJandiWatcher)().catch(e => console.error('❌ Jandi watcher:', e?.message)), 15000);
    }
    if (constants_1.CONFIG.ENABLE_WECHAT) {
        console.log('💚 WeChat auto-connecting in 5s...');
        setTimeout(() => {
            if (!(0, bot_1.isWeChatInitialized)()) {
                (0, bot_1.initWeChat)().catch(e => console.error('❌ WeChat auto-init failed:', e?.message));
            }
        }, 5000);
    }
});
const shutdown = async () => {
    console.log('🛑 Shutting down — destroying WA client...');
    try {
        await whatsapp_1.waClient.destroy();
    }
    catch { }
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
