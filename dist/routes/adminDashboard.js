"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const constants_1 = require("../config/constants");
const evoClient_1 = require("../platforms/whatsapp/evoClient");
const kakaoWatchdog_1 = require("../services/kakaoWatchdog");
const bot_1 = require("../platforms/wechat/bot");
const bookingStore_1 = require("../services/bookingStore");
const alertStore_1 = require("../services/alertStore");
const sheets_1 = require("../services/sheets");
const notify_1 = require("../services/notify");
const groupLeads_1 = require("../services/groupLeads");
const livePricing_1 = require("../knowledge/livePricing");
const webSearch_1 = require("../knowledge/webSearch");
const expenses_1 = require("../services/expenses");
const router = (0, express_1.Router)();
const startedAt = Date.now();
// GET /admin/health
router.get('/admin/health', (_req, res) => {
    const kakaoLastSeen = (0, kakaoWatchdog_1.getLastKakaoHeartbeat)();
    const kakaoAgeMs = kakaoLastSeen ? Date.now() - kakaoLastSeen : null;
    res.json({
        ok: true,
        bridge: {
            uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
            pid: process.pid,
            mode: constants_1.CONFIG.APP_MODE,
        },
        platforms: {
            whatsapp: {
                enabled: constants_1.CONFIG.ENABLE_WHATSAPP,
                connected: constants_1.CONFIG.ENABLE_WHATSAPP && (0, evoClient_1.isWaReady)(),
            },
            line: {
                enabled: constants_1.CONFIG.ENABLE_LINE,
                connected: constants_1.CONFIG.ENABLE_LINE,
            },
            kakao: {
                enabled: constants_1.CONFIG.ENABLE_KAKAO,
                lastHeartbeatMs: kakaoLastSeen || null,
                ageMs: kakaoAgeMs,
                connected: constants_1.CONFIG.ENABLE_KAKAO && kakaoAgeMs !== null && kakaoAgeMs < 5 * 60 * 1000,
            },
            wechat: {
                enabled: constants_1.CONFIG.ENABLE_WECHAT,
                connected: constants_1.CONFIG.ENABLE_WECHAT && (0, bot_1.isWeChatInitialized)(),
            },
        },
        ts: Date.now(),
    });
});
// GET /admin/bookings
router.get('/admin/bookings', (_req, res) => {
    try {
        res.json({ ok: true, bookings: (0, bookingStore_1.getAllBookings)() });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// GET /admin/alerts/recent
router.get('/admin/alerts/recent', (_req, res) => {
    res.json({ ok: true, alerts: (0, alertStore_1.getRecentAlerts)() });
});
// GET /admin/alerts/stream  — SSE
router.get('/admin/alerts/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    // Send buffered alerts as initial batch
    for (const alert of (0, alertStore_1.getRecentAlerts)(20).reverse()) {
        res.write(`data: ${JSON.stringify(alert)}\n\n`);
    }
    (0, alertStore_1.subscribeSSE)(res);
    // Heartbeat every 25s to prevent proxy timeouts
    const hb = setInterval(() => {
        try {
            res.write(': ping\n\n');
        }
        catch {
            clearInterval(hb);
        }
    }, 25000);
    req.on('close', () => clearInterval(hb));
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
function readJson(filePath) {
    try {
        if (!fs_1.default.existsSync(filePath))
            return {};
        return JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
    }
    catch {
        return {};
    }
}
function detectPlatform(groupId) {
    if (groupId.endsWith('@g.us'))
        return 'whatsapp';
    if (groupId.startsWith('line:'))
        return 'line';
    if (groupId.startsWith('kakao:'))
        return 'kakao';
    if (groupId.startsWith('wechat:'))
        return 'wechat';
    return 'unknown';
}
// GET /admin/groups
router.get('/admin/groups', (_req, res) => {
    const root = process.cwd();
    const groupLeads = readJson(path_1.default.join(root, 'src/data/group-leads.json'));
    const groupNames = readJson(path_1.default.join(root, 'src/data/group-names.json'));
    const kakaoNames = readJson(path_1.default.join(root, 'src/data/kakao-chat-names.json'));
    const bookings = (0, bookingStore_1.getAllBookings)();
    const groups = Object.entries(groupLeads)
        .filter(([id]) => detectPlatform(id) !== 'unknown')
        .map(([groupId, leadUid]) => {
        const platform = detectPlatform(groupId);
        const name = platform === 'kakao' ? (kakaoNames[groupId] || null) : (groupNames[groupId] || null);
        const booking = bookings.find(b => b.leadUid === leadUid) || null;
        return { groupId, leadUid, platform, name, booking };
    });
    res.json({ ok: true, groups });
});
// GET /admin/staff
router.get('/admin/staff', async (_req, res) => {
    try {
        const staff = await (0, sheets_1.getAllTeamMembers)();
        res.json({ ok: true, staff });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// POST /admin/lead-pricing — returns live Hostfully pricing facts for a group
// Called by admin-ui chat when staff has a group selected and asks about pricing
router.post('/admin/lead-pricing', async (req, res) => {
    const { groupKey, message = '' } = req.body || {};
    if (!groupKey)
        return res.status(400).json({ ok: false, error: 'groupKey required' });
    const leadUid = (0, groupLeads_1.getLeadUid)(groupKey);
    if (!leadUid)
        return res.json({ ok: true, facts: [] });
    try {
        const entry = await (0, livePricing_1.getLivePropertyPricingEntry)(leadUid, message || 'price rate cost');
        res.json({ ok: true, facts: entry?.facts ?? [], title: entry?.title ?? '' });
    }
    catch (e) {
        res.json({ ok: true, facts: [] });
    }
});
// POST /admin/web-search — proxies Serper search for admin-ui chat (key lives in bridge env)
router.post('/admin/web-search', async (req, res) => {
    const { query } = req.body || {};
    if (!query)
        return res.status(400).json({ ok: false, error: 'query required' });
    try {
        const result = await (0, webSearch_1.webSearch)(String(query));
        res.json({ ok: true, found: result.found, text: result.text, source: result.source });
    }
    catch (e) {
        res.json({ ok: true, found: false, text: '' });
    }
});
// GET /admin/expenses/summary — unsettled expense totals per group (hits Google Sheets)
router.get('/admin/expenses/summary', async (_req, res) => {
    try {
        const summary = await (0, expenses_1.getExpenseSummary)();
        res.json({ ok: true, summary });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// POST /admin/chat-alert — fired by admin-ui when a guest_draft response is generated
router.post('/admin/chat-alert', async (req, res) => {
    res.json({ ok: true });
    const { guestMessage, draft, propertyCode } = req.body || {};
    if (!guestMessage)
        return;
    const property = propertyCode ? ` (${propertyCode})` : '';
    const draftStr = draft ? String(draft) : '';
    const draftLine = draftStr
        ? `\n📝 <b>Draft:</b> ${draftStr.slice(0, 300)}${draftStr.length > 300 ? '…' : ''}`
        : '';
    await (0, notify_1.sendAlert)(`🙋 <b>Guest Needs Staff</b>\n─────────────────\n` +
        `💬 <b>Guest asked:</b> ${guestMessage}${property}${draftLine}\n` +
        `─────────────────\n<i>COZMO couldn't answer — staff take over in Admin Chat · COZE Hospitality</i>`, { useTestJandi: true }).catch(() => { });
});
exports.default = router;
