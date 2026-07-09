import { Router } from 'express';
import { saveGuestNote } from '../services/hostfully';
import { sendAlert } from '../services/notify';
import { getLeadUid } from '../services/groupLeads';
const router = Router();

router.post('/guest/note', async (req, res) => {
    const { group_id, note } = req.body;
    if (!group_id || !note) return res.status(400).json({ error: 'Missing group_id or note' });

    try {
        const leadUid = getLeadUid(group_id);
        if (!leadUid) return res.status(404).json({ error: 'Group not linked to any lead. Use /link <uid> first.' });

        const ok = await saveGuestNote(leadUid, note);

        if (ok) {
            await sendAlert(
                `📝 <b>Guest Note Saved</b>\n─────────────────\n` +
                `🗒️ <b>Note:</b> ${note}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                { telegramOnly: true }
            );
        }

        res.json({ success: ok });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;