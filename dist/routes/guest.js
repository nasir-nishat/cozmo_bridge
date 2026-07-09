"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hostfully_1 = require("../services/hostfully");
const notify_1 = require("../services/notify");
const groupLeads_1 = require("../services/groupLeads");
const router = (0, express_1.Router)();
router.post('/guest/note', async (req, res) => {
    const { group_id, note } = req.body;
    if (!group_id || !note)
        return res.status(400).json({ error: 'Missing group_id or note' });
    try {
        const leadUid = (0, groupLeads_1.getLeadUid)(group_id);
        if (!leadUid)
            return res.status(404).json({ error: 'Group not linked to any lead. Use /link <uid> first.' });
        const ok = await (0, hostfully_1.saveGuestNote)(leadUid, note);
        if (ok) {
            await (0, notify_1.sendAlert)(`📝 <b>Guest Note Saved</b>\n─────────────────\n` +
                `🗒️ <b>Note:</b> ${note}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
        }
        res.json({ success: ok });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
