"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * adminKakao.ts — Admin endpoints for KakaoTalk expense recovery UI
 *
 * GET  /admin/kakao/groups          — list all linked kakao groups with sheet expenses + buffer stats
 * POST /admin/kakao/scan-expenses   — scan message-buffer for missed /exp, write to Sheets
 * POST /admin/kakao/scan-expenses/:groupKey — scan a single group
 * GET  /admin/kakao/ui              — serve the HTML dashboard
 */
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const kakaoExpenseScan_1 = require("../services/kakaoExpenseScan");
const bookingStore_1 = require("../services/bookingStore");
const router = (0, express_1.Router)();
// GET /admin/kakao/groups
router.get('/admin/kakao/groups', async (_req, res) => {
    try {
        const groups = await (0, kakaoExpenseScan_1.getKakaoGroupsSummary)();
        // Enrich with booking info
        const enriched = groups.map(g => {
            const booking = (0, bookingStore_1.getBookingByLeadUid)(g.leadUid);
            return {
                ...g,
                booking: booking
                    ? {
                        guestName: booking.guestName,
                        property: booking.property,
                        checkIn: booking.checkIn,
                        checkOut: booking.checkOut,
                        status: booking.status,
                    }
                    : null,
            };
        });
        res.json({ ok: true, groups: enriched });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// POST /admin/kakao/scan-expenses  (body: { groupKey?: string, dryRun?: boolean })
router.post('/admin/kakao/scan-expenses', async (req, res) => {
    const { groupKey, dryRun } = req.body;
    try {
        const results = await (0, kakaoExpenseScan_1.scanKakaoExpenses)(groupKey, dryRun === true);
        const totalNew = results.reduce((s, r) => s + r.newCount, 0);
        const totalSkipped = results.reduce((s, r) => s + r.skippedCount, 0);
        res.json({ ok: true, results, totalNew, totalSkipped });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// GET /admin/kakao/ui — serve the HTML dashboard
router.get('/admin/kakao/ui', (_req, res) => {
    // Works both in dev (ts-node from root) and prod (compiled dist/routes/)
    const htmlPath = path_1.default.resolve(__dirname, '../../src/admin/kakao-ui.html');
    if (!fs_1.default.existsSync(htmlPath)) {
        res.status(404).send('UI file not found');
        return;
    }
    res.sendFile(htmlPath);
});
exports.default = router;
