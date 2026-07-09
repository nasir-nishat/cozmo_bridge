import { Router } from 'express';
import { syncKBLinks } from '../services/kbLinkSync';
import { getAllEntries } from '../knowledge/kb';

const router = Router();

// GET /admin/kb/entries
router.get('/admin/kb/entries', (_req, res) => {
    try {
        const entries = getAllEntries().map(e => ({
            id:          e.id,
            propertyCode: e.propertyCode,
            category:    e.category,
            title:       e.title,
            triggers:    e.triggers,
            facts:       e.facts,
            links:       e.links,
            sensitive:   e.sensitive,
        }));
        res.json({ ok: true, entries });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});

// In-memory sync state
let syncState: {
    running: boolean;
    startedAt: string | null;
    results: ReturnType<typeof syncKBLinks> extends Promise<infer T> ? T : never;
    error: string | null;
} = { running: false, startedAt: null, results: [], error: null };

// POST /admin/kb/sync-links — starts sync in background, returns immediately
router.post('/admin/kb/sync-links', (_req, res) => {
    if (syncState.running) {
        return res.json({ ok: true, status: 'running', startedAt: syncState.startedAt });
    }
    syncState = { running: true, startedAt: new Date().toISOString(), results: [], error: null };
    res.json({ ok: true, status: 'started' });

    syncKBLinks()
        .then(results => { syncState = { running: false, startedAt: syncState.startedAt, results, error: null }; })
        .catch(e => { syncState = { running: false, startedAt: syncState.startedAt, results: [], error: e?.message }; });
});

// GET /admin/kb/sync-status — poll for completion
router.get('/admin/kb/sync-status', (_req, res) => {
    const { running, results, error, startedAt } = syncState;
    const updated = results.filter(r => r.status === 'updated').length;
    const failed  = results.filter(r => r.status === 'failed').length;
    res.json({ ok: true, running, startedAt, updated, failed, results, error });
});

export default router;
