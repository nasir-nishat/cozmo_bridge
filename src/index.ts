import 'dotenv/config';
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 50;
import express from 'express';
import path from 'path';
import { CONFIG } from './config/constants';
import whatsappRoutes, { initWhatsApp, waClient } from './routes/whatsapp';
import { checkWaConnection } from './platforms/whatsapp/watchdog';
import { checkAndFireReminders } from './services/groupReminders';
import telegramRoutes, { pollBookingAutoGroupFallback } from './routes/telegram';
import guestRoutes from './routes/guest';
import lineRouter from './routes/line';
import kakaoRouter from './routes/kakao';
import { initWeChat, isWeChatInitialized } from './platforms/wechat/bot';
import wechatRouter from './routes/wechat';
import whatsapp360Router from './routes/whatsapp360';
import { pollLeadNotes } from './services/hostfully';
import { loadStaffNames } from './services/staffCache';
import { sendAlert } from './services/notify';
import { initCheckoutReminder, catchUpCheckout } from './services/checkoutReminder';
import { initCheckinReminder, catchUpCheckin } from './services/checkinReminder';
import { backfillBookingStore } from './services/bookingStore';
import { deleteOldExpenses } from './services/expenses';
import { flushPendingHfMessages, checkForStuckHfMessages } from './services/pendingHfMessages';
import { flushPendingGroupCreations, checkForStuckGroupCreations } from './services/pendingGroupCreation';
import { flushPendingMessages } from './platforms/whatsapp/groupCreation';
import { sweepStepWatcher } from './services/stepWatcher';
import cron from 'node-cron';
import { pruneBuffer } from './services/messageBuffer';
import { checkKakaoHeartbeat } from './services/kakaoWatchdog';
import jandiRouter from './routes/jandi';
import { initJandiWatcher } from './services/jandiWatcher';
import adminKakaoRouter from './routes/adminKakao';
import adminDashboardRouter from './routes/adminDashboard';
import adminTasksRouter from './routes/adminTasks';
import adminKbRouter from './routes/adminKb';
import adminScheduleRouter from './routes/adminSchedule';
import adminAnalyticsRouter from './routes/adminAnalytics';

// ─── Global error guards — prevent silent process exit ────────────────────────
process.on('unhandledRejection', (reason: any) => {
    const msg: string = reason?.message || String(reason);
    // Suppress Puppeteer DevTools disconnect noise — not fatal
    if (msg.includes('Target closed') || msg.includes('Protocol error')) {
        console.warn('⚠️ Puppeteer protocol error (ignored):', msg);
        return;
    }
    console.error('🔥 Unhandled Rejection:', msg);
});
process.on('uncaughtException', (err: any) => {
    console.error('🔥 Uncaught Exception:', err?.message || err);
});

const app = express();

app.use('/assets', express.static(path.resolve(__dirname, '../../assets')));
app.use(express.json({
    limit: '50mb',
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// Catch-all request logger — shows every hit before routing (skip noisy poll endpoints)
app.use((req, _res, next) => {
    if (req.path !== '/kakao/dequeue') console.log(`📡 Incoming: ${req.method} ${req.path}`);
    next();
});

console.log('🔍 ENABLE_WHATSAPP:', CONFIG.ENABLE_WHATSAPP, '| raw env:', process.env.ENABLE_WHATSAPP);

if (CONFIG.ENABLE_WHATSAPP) {
    app.use(whatsappRoutes);
    initWhatsApp();
    setTimeout(checkWaConnection, 30_000);
    setInterval(checkWaConnection, 5 * 60 * 1000);
    setInterval(() => checkAndFireReminders().catch(e => console.error('❌ checkAndFireReminders:', e?.message)), 2 * 60 * 1000);
    if (CONFIG.ENABLE_CHECKOUT_REMINDER) initCheckoutReminder();
    if (CONFIG.ENABLE_CHECKIN_REMINDER) initCheckinReminder();
} else {
    console.log('⏸️ WhatsApp routes disabled by ENABLE_WHATSAPP=false');
}
app.use(telegramRoutes);
app.use(guestRoutes);
app.use(adminKakaoRouter);
app.use(adminDashboardRouter);
app.use(adminTasksRouter);
app.use(adminKbRouter);
app.use(adminScheduleRouter);
app.use(adminAnalyticsRouter);
if (CONFIG.ENABLE_JANDI_RECEIPT_SCAN) {
    app.use(jandiRouter);
} else {
    console.log('⏸️ Jandi receipt scan disabled by ENABLE_JANDI_RECEIPT_SCAN=false');
}
if (CONFIG.ENABLE_LINE) {
    app.use('/line', lineRouter);
} else {
    console.log('⏸️ LINE routes disabled by ENABLE_LINE=false');
}
if (CONFIG.ENABLE_KAKAO) {
    app.use('/kakao', kakaoRouter);
    setInterval(() => checkKakaoHeartbeat().catch(e => console.error('❌ checkKakaoHeartbeat:', e?.message)), 5 * 60 * 1000);
} else {
    console.log('⏸️ KAKAO routes disabled by ENABLE_KAKAO=false');
}
if (CONFIG.ENABLE_WECHAT) {
    app.use('/wechat', wechatRouter);
} else {
    console.log('⏸️ WeChat routes disabled by ENABLE_WECHAT=false');
}
if (CONFIG.ENABLE_360DIALOG_GROUPS) {
    app.use('/whatsapp360', whatsapp360Router);
    console.log('🆕 360dialog Groups API routes enabled at /whatsapp360 (scaffolding — see docs/whatsapp-groups-api-migration.md)');
} else {
    console.log('⏸️ 360dialog Groups routes disabled by ENABLE_360DIALOG_GROUPS=false');
}

app.listen(CONFIG.PORT, () => {
    console.log(`🚀 COZE Bridge on http://localhost:${CONFIG.PORT}`);
    console.log(`🧭 App mode: ${CONFIG.APP_MODE} (${CONFIG.TG_ONLY_ALERTS ? 'TG-only alerts' : 'TG + JANDI alerts'})`);
    console.log(`🕒 Hostfully note poll interval: ${Math.round(CONFIG.NOTE_POLL_INTERVAL_MS / 1000)}s`);

    sendAlert(
        `✅ <b>COZMO Bridge Online</b>\n─────────────────\n` +
        `🧭 <b>Mode:</b> ${CONFIG.APP_MODE}\n` +
        `🔌 <b>WhatsApp:</b> ${CONFIG.ENABLE_WHATSAPP ? 'enabled' : 'disabled'}\n` +
        `💬 <b>LINE:</b> ${CONFIG.ENABLE_LINE ? 'enabled' : 'disabled'}\n` +
        `💚 <b>WeChat:</b> ${CONFIG.ENABLE_WECHAT ? 'enabled' : 'disabled'}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    ).catch(() => {});


    // Note polling disabled — webhook handles note changes reliably now
    // Re-enable with NOTE_POLL_INTERVAL_MS env var if webhook proves unreliable
    loadStaffNames().catch(e => console.warn('⚠️ loadStaffNames failed:', e?.message));

    if (CONFIG.NOTE_POLL_INTERVAL_MS > 0) {
        setTimeout(pollLeadNotes, 10000);
        setInterval(pollLeadNotes, CONFIG.NOTE_POLL_INTERVAL_MS);
    }
    setTimeout(pollBookingAutoGroupFallback, 20000);
    setInterval(pollBookingAutoGroupFallback, CONFIG.NOTE_POLL_INTERVAL_MS);

    setTimeout(() => flushPendingHfMessages().catch(e => console.error('❌ flushPendingHfMessages:', e?.message)), 10_000);
    setTimeout(() => flushPendingMessages().catch(e => console.error('❌ flushPendingMessages:', e?.message)), 20_000);
    // Startup catch-up must respect the same kill switches as the daily crons — otherwise setting
    // ENABLE_*_REMINDER=false would NOT stop sending after a restart (mass-message risk).
    setTimeout(() => {
        if (CONFIG.ENABLE_CHECKIN_REMINDER) catchUpCheckin();
        if (CONFIG.ENABLE_CHECKOUT_REMINDER) catchUpCheckout();
    }, 30_000);
    setInterval(() => flushPendingHfMessages().catch(e => console.error('❌ flushPendingHfMessages:', e?.message)), 2 * 60 * 1000);
    setInterval(() => flushPendingGroupCreations().catch(e => console.error('❌ flushPendingGroupCreations:', e?.message)), 2 * 60 * 1000);
    setInterval(() => checkForStuckHfMessages().catch(e => console.error('❌ checkForStuckHfMessages:', e?.message)), 30 * 60 * 1000);
    setInterval(() => checkForStuckGroupCreations().catch(e => console.error('❌ checkForStuckGroupCreations:', e?.message)), 30 * 60 * 1000);
    setInterval(() => flushPendingMessages().catch(e => console.error('❌ flushPendingMessages:', e?.message)), 5 * 60 * 1000);
    // Step watcher backstop sweep — catches human-completed steps the real-time trigger may have missed
    setInterval(() => sweepStepWatcher().catch(e => console.error('❌ sweepStepWatcher:', e?.message)), 10 * 60 * 1000);

    // Light sync on startup — scans only the 2 most recent pages (~40 leads)
    // Full backfill is done manually via scripts/backfill-bookings.mjs when needed
    setTimeout(() => backfillBookingStore()
        .catch(e => console.error('❌ bookingStore sync:', e?.message)), 15_000);

    // Same light sync daily at 15:00 KST to catch missed webhooks
    cron.schedule('0 15 * * *', () => {
        backfillBookingStore().catch(e => console.error('❌ bookingStore daily sync:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Booking store daily sync scheduled: 15:00 KST');

    // Delete settled expenses older than 7 days — runs daily at 03:00 KST
    cron.schedule('0 3 * * *', () => {
        deleteOldExpenses().catch(e => console.error('❌ expense cleanup:', e?.message));
        pruneBuffer();
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Expense cleanup + buffer prune scheduled: 03:00 KST daily');

    if (CONFIG.ENABLE_JANDI_WATCHER) {
        setTimeout(() => initJandiWatcher().catch(e => console.error('❌ Jandi watcher:', e?.message)), 15_000);
    }

    if (CONFIG.ENABLE_WECHAT) {
        console.log('💚 WeChat auto-connecting in 5s...');
        setTimeout(() => {
            if (!isWeChatInitialized()) {
                initWeChat().catch(e => console.error('❌ WeChat auto-init failed:', e?.message));
            }
        }, 5000);
    }
});

const shutdown = async () => {
    console.log('🛑 Shutting down — destroying WA client...');
    try { await waClient.destroy(); } catch { }
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
