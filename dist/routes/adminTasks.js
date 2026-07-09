"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tasks_1 = require("../services/tasks");
const router = (0, express_1.Router)();
// GET /admin/tasks
router.get('/admin/tasks', (_req, res) => {
    try {
        res.json({ ok: true, tasks: (0, tasks_1.getAllTasks)() });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// POST /admin/tasks
router.post('/admin/tasks', (req, res) => {
    const { property, title, type, assignee, source, notes, leadUid, guestName } = req.body || {};
    if (!property || !title || !type) {
        return res.status(400).json({ ok: false, error: 'property, title, type required' });
    }
    try {
        const task = (0, tasks_1.createTask)({
            property, title, type,
            status: 'new',
            assignee: assignee || null,
            source: source || 'jandi',
            notes: notes || '',
            ...(leadUid && { leadUid }),
            ...(guestName && { guestName }),
        });
        res.json({ ok: true, task });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// PATCH /admin/tasks/:id
router.patch('/admin/tasks/:id', (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};
    if (!Object.keys(patch).length) {
        return res.status(400).json({ ok: false, error: 'no fields to update' });
    }
    try {
        const { id: _id, createdAt: _c, ...allowed } = patch;
        const task = (0, tasks_1.updateTask)(id, allowed);
        if (!task)
            return res.status(404).json({ ok: false, error: 'task not found' });
        res.json({ ok: true, task });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
exports.default = router;
