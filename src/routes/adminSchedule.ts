import { Router } from 'express';
import { getMessageScheduleReport } from '../services/messageSchedule';

const router = Router();

// GET /admin/message-schedule — yesterday/today/tomorrow breakdown of automated guest messages
router.get('/admin/message-schedule', async (_req, res) => {
    try {
        const report = await getMessageScheduleReport();
        res.json({ ok: true, ...report });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});

export default router;
