/**
 * adminKakao.ts — Admin endpoints for KakaoTalk expense recovery UI
 *
 * GET  /admin/kakao/groups          — list all linked kakao groups with sheet expenses + buffer stats
 * POST /admin/kakao/scan-expenses   — scan message-buffer for missed /exp, write to Sheets
 * POST /admin/kakao/scan-expenses/:groupKey — scan a single group
 * GET  /admin/kakao/ui              — serve the HTML dashboard
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { scanKakaoExpenses, getKakaoGroupsSummary } from '../services/kakaoExpenseScan';
import { getBookingByLeadUid } from '../services/bookingStore';

const router = Router();

// GET /admin/kakao/groups
router.get('/admin/kakao/groups', async (_req, res) => {
    try {
        const groups = await getKakaoGroupsSummary();
        // Enrich with booking info
        const enriched = groups.map(g => {
            const booking = getBookingByLeadUid(g.leadUid);
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
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});

// POST /admin/kakao/scan-expenses  (body: { groupKey?: string, dryRun?: boolean })
router.post('/admin/kakao/scan-expenses', async (req, res) => {
    const { groupKey, dryRun } = req.body as { groupKey?: string; dryRun?: boolean };
    try {
        const results = await scanKakaoExpenses(groupKey, dryRun === true);
        const totalNew = results.reduce((s, r) => s + r.newCount, 0);
        const totalSkipped = results.reduce((s, r) => s + r.skippedCount, 0);
        res.json({ ok: true, results, totalNew, totalSkipped });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});

// GET /admin/kakao/ui — serve the HTML dashboard
router.get('/admin/kakao/ui', (_req, res) => {
    // Works both in dev (ts-node from root) and prod (compiled dist/routes/)
    const htmlPath = path.resolve(__dirname, '../../src/admin/kakao-ui.html');
    if (!fs.existsSync(htmlPath)) {
        res.status(404).send('UI file not found');
        return;
    }
    res.sendFile(htmlPath);
});

export default router;
