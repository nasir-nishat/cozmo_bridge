"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const kbLinkSync_1 = require("../services/kbLinkSync");
const kb_1 = require("../knowledge/kb");
const router = (0, express_1.Router)();
// GET /admin/kb/entries
router.get('/admin/kb/entries', (_req, res) => {
    try {
        const entries = (0, kb_1.getAllEntries)().map(e => ({
            id: e.id,
            propertyCode: e.propertyCode,
            category: e.category,
            title: e.title,
            triggers: e.triggers,
            facts: e.facts,
            links: e.links,
            sensitive: e.sensitive,
        }));
        res.json({ ok: true, entries });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// In-memory sync state
let syncState = { running: false, startedAt: null, results: [], error: null };
// POST /admin/kb/sync-links — starts sync in background, returns immediately
router.post('/admin/kb/sync-links', (_req, res) => {
    if (syncState.running) {
        return res.json({ ok: true, status: 'running', startedAt: syncState.startedAt });
    }
    syncState = { running: true, startedAt: new Date().toISOString(), results: [], error: null };
    res.json({ ok: true, status: 'started' });
    (0, kbLinkSync_1.syncKBLinks)()
        .then(results => { syncState = { running: false, startedAt: syncState.startedAt, results, error: null }; })
        .catch(e => { syncState = { running: false, startedAt: syncState.startedAt, results: [], error: e?.message }; });
});
// GET /admin/kb/sync-status — poll for completion
router.get('/admin/kb/sync-status', (_req, res) => {
    const { running, results, error, startedAt } = syncState;
    const updated = results.filter(r => r.status === 'updated').length;
    const failed = results.filter(r => r.status === 'failed').length;
    res.json({ ok: true, running, startedAt, updated, failed, results, error });
});
exports.default = router;
