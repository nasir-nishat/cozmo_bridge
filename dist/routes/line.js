"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendLineWelcome = void 0;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const constants_1 = require("../config/constants");
const groupLeads_1 = require("../services/groupLeads");
const hostfully_1 = require("../services/hostfully");
const notify_1 = require("../services/notify");
const lineClient_1 = require("../platforms/line/lineClient");
const expenses_1 = require("../services/expenses");
const format_1 = require("../utils/format");
const translation_1 = require("../platforms/line/translation");
const commands_1 = require("../platforms/line/commands");
const welcome_1 = require("../platforms/line/welcome");
Object.defineProperty(exports, "sendLineWelcome", { enumerable: true, get: function () { return welcome_1.sendLineWelcome; } });
const detection_1 = require("../platforms/line/detection");
const bookingStore_1 = require("../services/bookingStore");
const messageBuffer_1 = require("../services/messageBuffer");
function verifyLineSignature(rawBody, signature, secret) {
    const hash = crypto_1.default.createHmac('sha256', secret).update(rawBody).digest('base64');
    return hash === signature;
}
const profileCache = new Map();
async function getSenderName(senderId) {
    if (profileCache.has(senderId))
        return profileCache.get(senderId);
    try {
        const profile = await axios_1.default.get(`${lineClient_1.LINE_API}/profile/${senderId}`, {
            headers: { Authorization: `Bearer ${constants_1.CONFIG.LINE_CHANNEL_ACCESS_TOKEN}` },
        });
        const name = profile.data?.displayName || 'unknown';
        if (name !== 'unknown')
            profileCache.set(senderId, name);
        return name;
    }
    catch {
        return 'unknown';
    }
}
const router = (0, express_1.Router)();
router.get('/webhook', (_req, res) => {
    res.status(200).json({
        ok: true,
        route: '/line/webhook',
        method: 'POST',
        message: 'LINE webhook endpoint is reachable. Send LINE events via POST.',
    });
});
router.post('/webhook', async (req, res) => {
    const secret = constants_1.CONFIG.LINE_CHANNEL_SECRET;
    if (secret) {
        const sig = req.headers['x-line-signature'];
        const rawBody = req.rawBody;
        if (!sig || !rawBody || !verifyLineSignature(rawBody, sig, secret)) {
            console.warn('⚠️ LINE webhook signature verification failed');
            return res.sendStatus(401);
        }
    }
    else {
        console.warn('⚠️ LINE_CHANNEL_SECRET not set — skipping signature verification');
    }
    res.sendStatus(200);
    const events = req.body?.events || [];
    for (const event of events) {
        const sourceId = event.source?.groupId || event.source?.roomId || event.source?.userId || '';
        console.log(`📨 LINE event | type: ${event.type} | source: ${event.source?.type || 'unknown'} | id: ${sourceId}`);
        if (event.type !== 'message' || event.message?.type !== 'text')
            continue;
        try {
            const text = event.message.text?.trim() || '';
            const sourceId = event.source?.groupId || event.source?.userId || '';
            const senderId = event.source?.userId || '';
            const senderName = senderId ? await getSenderName(senderId) : 'unknown';
            console.log(`👤 LINE sender | name: ${senderName} | id: ${senderId}`);
            console.log(`📩 LINE msg | source: ${event.source?.type} | id: ${sourceId} | sender: ${senderId} | text: ${text.slice(0, 60)}`);
            if (!sourceId)
                continue;
            if (event.source?.type === 'group')
                (0, messageBuffer_1.addToBuffer)((0, lineClient_1.lineGroupKey)(sourceId), senderName, text);
            // ─── TRANSLATION ─────────────────────────────────────────────
            const isCommand = text.startsWith('/');
            const isUrlOnly = /^https?:\/\/\S+$/.test(text.trim());
            const isCozmoReply = text.startsWith('🌐') || /^\[(EN|ZH-CN|ZH-TW|JA|TH|cont\.)\]/.test(text);
            if (!translation_1.groupGuestLang.has(sourceId)) {
                const persisted = (0, groupLeads_1.getGroupLang)(sourceId);
                if (persisted) {
                    translation_1.groupGuestLang.set(sourceId, persisted);
                    translation_1.groupTranslationOn.set(sourceId, true);
                }
            }
            const guestLang = translation_1.groupGuestLang.get(sourceId);
            const translationActive = !!(guestLang && translation_1.groupTranslationOn.get(sourceId) !== false);
            if (translationActive && guestLang && !isCommand && !isUrlOnly && !isCozmoReply) {
                await (0, translation_1.handleTranslation)(sourceId, text, senderId, senderName, event.replyToken, guestLang);
            }
            // ─────────────────────────────────────────────────────────────
            if (await (0, commands_1.handleLineMembersCommand)(sourceId, text, event.source?.type || '', event.replyToken))
                continue;
            if (await (0, commands_1.handleLineLinkCommand)(sourceId, text, event.source?.type || '', event.replyToken))
                continue;
            if (await (0, commands_1.handleLineWelcomeCommand)(sourceId, text, event.replyToken))
                continue;
            if (await (0, commands_1.handleLineTransCommand)(sourceId, text, event.replyToken))
                continue;
            if (text === '/ckin' && await (0, commands_1.handleLineCkinCommand)(sourceId, event.replyToken))
                continue;
            if (await (0, commands_1.handleLineCkoutCommand)(sourceId, text, event.replyToken))
                continue;
            // /exp command
            if (text.startsWith('/exp')) {
                const lineGroupName = event.source?.type === 'group'
                    ? await (0, lineClient_1.getGroupName)(sourceId)
                    : sourceId;
                await (0, expenses_1.handleExpCommand)('line', (0, lineClient_1.lineGroupKey)(sourceId), lineGroupName, senderId, (0, groupLeads_1.getLeadUid)((0, lineClient_1.lineGroupKey)(sourceId)), text, async (msg) => (0, lineClient_1.replyMessage)(event.replyToken, msg));
                continue;
            }
            const lineLeadUid = (0, groupLeads_1.getLeadUid)((0, lineClient_1.lineGroupKey)(sourceId));
            if (lineLeadUid && (0, bookingStore_1.isLeadExpired)(lineLeadUid))
                continue;
            await (0, detection_1.handleLineDetection)(sourceId, text, senderName);
        }
        catch (e) {
            const errMsg = e?.response?.data?.message || e?.message || String(e);
            console.error('❌ LINE message handler error:', e?.response?.status, errMsg);
            await (0, notify_1.sendAlert)(`⚠️ <b>LINE Handler Error</b>\n─────────────────\n` +
                `📱 <b>Source:</b> ${sourceId.slice(0, 20)}...\n` +
                `❌ <b>Error:</b> ${errMsg}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true, platform: 'LINE' }).catch(() => { });
        }
    }
});
router.post('/send', async (req, res) => {
    const { to, message } = req.body;
    try {
        await (0, lineClient_1.pushMessage)(to, message);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e?.response?.data || e?.message || String(e) });
    }
});
router.post('/link', async (req, res) => {
    const { group_id, lead_uid } = req.body;
    if (!group_id || !lead_uid)
        return res.status(400).json({ error: 'Missing group_id or lead_uid' });
    try {
        const lead = await (0, hostfully_1.fetchLead)(lead_uid);
        if (!lead)
            return res.status(404).json({ error: 'Lead not found in Hostfully' });
        (0, groupLeads_1.linkGroup)((0, lineClient_1.lineGroupKey)(group_id), lead_uid);
        const info = lead.guestInformation;
        const name = (0, format_1.guestName)(info, 'Unknown');
        const checkIn = (0, format_1.formatSeoulDate)(lead.checkInLocalDateTime);
        await (0, notify_1.sendAlert)(`🔗 <b>LINE Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `📅 <b>Check-in:</b> ${checkIn}\n` +
            `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true, platform: 'LINE', useTestJandi: lead_uid === '70778c3a-d60b-4473-a597-a5d6292628f5' });
        res.json({ success: true });
    }
    catch (e) {
        await (0, notify_1.sendAlert)(`⚠️ <b>LINE Link Failed</b>\n─────────────────\n❌ ${e?.message || e}`, { telegramOnly: true, platform: 'LINE' });
        res.status(500).json({ error: e?.response?.data || e?.message || String(e) });
    }
});
exports.default = router;
