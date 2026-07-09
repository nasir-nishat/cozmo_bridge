import { Router } from 'express';
import { getBookingAnalytics, getPropertyList } from '../services/bookingAnalytics';

const router = Router();

// GET /admin/properties — active property list for filter dropdowns
router.get('/admin/properties', async (_req, res) => {
    try {
        const properties = await getPropertyList();
        res.json({ ok: true, properties });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});

// GET /admin/bookings/analytics?propertyUid=&from=&to=&cursor=
// Live-scans Hostfully leads (no server-side date/status filter support upstream)
// within a wall-clock budget; returns a resume cursor when the range isn't fully covered.
router.get('/admin/bookings/analytics', async (req, res) => {
    const { propertyUid, from, to, cursor } = req.query as Record<string, string | undefined>;
    if (!from || !to) return res.status(400).json({ ok: false, error: 'from and to (YYYY-MM-DD) are required' });

    try {
        const result = await getBookingAnalytics({ propertyUid: propertyUid || undefined, from, to, cursor: cursor || undefined });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});

export default router;
