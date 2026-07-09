"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const messageSchedule_1 = require("../services/messageSchedule");
const router = (0, express_1.Router)();
// GET /admin/message-schedule — yesterday/today/tomorrow breakdown of automated guest messages
router.get('/admin/message-schedule', async (_req, res) => {
    try {
        const report = await (0, messageSchedule_1.getMessageScheduleReport)();
        res.json({ ok: true, ...report });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
exports.default = router;
