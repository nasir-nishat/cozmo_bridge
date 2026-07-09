"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const groupLeads_1 = require("../services/groupLeads");
const notify_1 = require("../services/notify");
const wechat_1 = require("../services/wechat");
const utils_1 = require("../platforms/wechat/utils");
const bot_1 = require("../platforms/wechat/bot");
const translation_1 = require("../platforms/wechat/translation");
const router = (0, express_1.Router)();
const TEST_LEAD_UID = '70778c3a-d60b-4473-a597-a5d6292628f5';
// POST /wechat/connect — trigger WeChat connection on demand
// Call this AFTER WeChat PC is open and logged in
router.post('/connect', async (_req, res) => {
    try {
        if ((0, bot_1.isWeChatInitialized)()) {
            return res.json({ ok: true, message: 'WeChat already connected' });
        }
        console.log('🔌 Manual WeChat connect triggered via /wechat/connect');
        (0, bot_1.initWeChat)().catch(e => console.error('❌ initWeChat failed:', e?.message));
        res.json({ ok: true, message: 'WeChat init started — check pm2 logs in 10s' });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});
// GET /wechat/status — health check
router.get('/status', async (_req, res) => {
    try {
        const rooms = await (0, wechat_1.wechatGetRooms)();
        res.json({ ok: true, rooms: rooms.length });
    }
    catch (e) {
        res.status(503).json({ ok: false, error: e?.message });
    }
});
// GET /wechat/rooms — list all group room IDs and names
router.get('/rooms', async (_req, res) => {
    try {
        const contacts = await (0, wechat_1.wechatGetContacts)();
        const list = contacts
            .filter((c) => (c.userName ?? c.wxid ?? '').endsWith('@chatroom'))
            .map((c) => ({
            id: c.userName ?? c.wxid,
            name: c.nickName ?? c.remark ?? c.alias ?? c.displayName ?? '',
        }));
        res.json({ ok: true, count: list.length, rooms: list });
    }
    catch (e) {
        res.status(503).json({ ok: false, error: e?.message });
    }
});
// POST /wechat/link — API-based link (alternative to in-chat /link command)
router.post('/link', async (req, res) => {
    const { room_id, lead_uid } = req.body;
    if (!room_id || !lead_uid) {
        return res.status(400).json({ error: 'Missing room_id or lead_uid' });
    }
    (0, groupLeads_1.linkGroup)((0, utils_1.wechatSourceKey)(room_id), lead_uid);
    await (0, notify_1.sendAlert)(`🔗 <b>WeChat Linked (API)</b>\n─────────────────\n` +
        `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
        `📱 <b>Platform:</b> WeChat\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true, platform: 'WECHAT', useTestJandi: lead_uid === TEST_LEAD_UID });
    return res.json({ success: true });
});
// POST /wechat/trans — set translation language for a room via API (no in-chat command needed)
// Body: { room_id: string, lang: "cn"|"jp"|"tw"|"th"|"en"|"off" }
router.post('/trans', (req, res) => {
    const { room_id, lang } = req.body;
    if (!room_id || !lang) {
        return res.status(400).json({ error: 'Missing room_id or lang' });
    }
    const l = lang.toLowerCase();
    if (l === 'off') {
        translation_1.groupTranslationOn.set(room_id, false);
        return res.json({ ok: true, room_id, translation: 'off' });
    }
    const resolved = translation_1.LANG_MAP[l];
    if (!resolved) {
        return res.status(400).json({ error: 'Unknown lang. Use: cn, jp, tw, th, en, off' });
    }
    translation_1.groupGuestLang.set(room_id, resolved);
    translation_1.groupTranslationOn.set(room_id, true);
    (0, groupLeads_1.saveGroupLang)(room_id, resolved);
    console.log(`🌐 WECHAT /trans API [${resolved}] | room=${room_id}`);
    return res.json({ ok: true, room_id, translation: resolved });
});
// POST /wechat/welcome — send welcome message to linked group
router.post('/welcome', async (req, res) => {
    const { roomId, guestName: name, propertyName } = req.body;
    if (!roomId || !name || !propertyName) {
        return res.status(400).json({ error: 'Missing roomId, guestName, or propertyName' });
    }
    try {
        const text = `👋 Welcome to ${propertyName}, ${name}!\n\n` +
            `We're here if you need anything during your stay. ` +
            `Just send a message in this group and our team will assist you.\n\n` +
            `COZMO AI | Guest Care Team | COZE Hospitality 3.0`;
        await (0, wechat_1.wechatSendText)(roomId, text);
        return res.json({ success: true });
    }
    catch (e) {
        console.error('❌ WeChat /welcome error:', e?.message);
        return res.status(500).json({ error: e?.message });
    }
});
// POST /wechat/add-member — add a wxid to an existing group
router.post('/add-member', async (req, res) => {
    const { roomId, wxid } = req.body;
    if (!roomId || !wxid) {
        return res.status(400).json({ error: 'Missing roomId or wxid' });
    }
    try {
        await (0, wechat_1.wechatAddMember)(roomId, wxid);
        return res.json({ success: true });
    }
    catch (e) {
        console.error('❌ WeChat /add-member error:', e?.message);
        return res.status(500).json({ error: e?.message });
    }
});
// POST /wechat/invite-guest
// NOTE: WechatFerry does NOT support createRoom/createGroup.
// Workaround: staff pre-creates a template group, then call /add-member to add the guest.
// This endpoint sends a private DM to the guest wxid explaining they'll be added.
router.post('/invite-guest', async (req, res) => {
    const { guestWxid, propertyName, teamWxids } = req.body;
    if (!guestWxid || !propertyName) {
        return res.status(400).json({ error: 'Missing guestWxid or propertyName' });
    }
    try {
        const inviteText = `Hi! This is COZE Hospitality. You've booked ${propertyName}. ` +
            `Our team will add you to a WeChat group for your stay. ` +
            `Please accept the group invitation when it arrives.\n\n` +
            `COZMO AI | Guest Care Team | COZE Hospitality 3.0`;
        await (0, wechat_1.wechatSendText)(guestWxid, inviteText);
        return res.json({
            success: true,
            note: 'WechatFerry does not support automatic group creation. ' +
                'Staff must manually create the group or use a pre-created template group, ' +
                'then call POST /wechat/add-member to add the guest.',
            teamWxids: teamWxids ?? [],
        });
    }
    catch (e) {
        console.error('❌ WeChat /invite-guest error:', e?.message);
        return res.status(500).json({ error: e?.message });
    }
});
exports.default = router;
