import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { CONFIG } from '../config/constants';
import { linkGroup, getGroupLang, getLeadUid } from '../services/groupLeads';
import { fetchLead } from '../services/hostfully';
import { sendAlert } from '../services/notify';
import { SupportedLang } from '../services/llm';
import { LINE_API, pushMessage, replyMessage, lineGroupKey, getGroupName } from '../platforms/line/lineClient';
import { handleExpCommand } from '../services/expenses';
import { guestName as formatGuestName, formatSeoulDate } from '../utils/format';
import { groupGuestLang, groupTranslationOn, handleTranslation } from '../platforms/line/translation';
import { handleLineLinkCommand, handleLineWelcomeCommand, handleLineTransCommand, handleLineMembersCommand, handleLineCkoutCommand, handleLineCkinCommand } from '../platforms/line/commands';

import { sendLineWelcome } from '../platforms/line/welcome';
import { handleLineDetection } from '../platforms/line/detection';
import { isLeadExpired } from '../services/bookingStore';
import { addToBuffer } from '../services/messageBuffer';


function verifyLineSignature(rawBody: Buffer, signature: string, secret: string): boolean {
    const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return hash === signature;
}

const profileCache = new Map<string, string>();

async function getSenderName(senderId: string): Promise<string> {
    if (profileCache.has(senderId)) return profileCache.get(senderId)!;
    try {
        const profile = await axios.get(`${LINE_API}/profile/${senderId}`, {
            headers: { Authorization: `Bearer ${CONFIG.LINE_CHANNEL_ACCESS_TOKEN}` },
        });
        const name = profile.data?.displayName || 'unknown';
        if (name !== 'unknown') profileCache.set(senderId, name);
        return name;
    } catch {
        return 'unknown';
    }
}

const router = Router();

router.get('/webhook', (_req, res) => {
    res.status(200).json({
        ok: true,
        route: '/line/webhook',
        method: 'POST',
        message: 'LINE webhook endpoint is reachable. Send LINE events via POST.',
    });
});

router.post('/webhook', async (req, res) => {
    const secret = CONFIG.LINE_CHANNEL_SECRET;
    if (secret) {
        const sig = req.headers['x-line-signature'] as string;
        const rawBody: Buffer = (req as any).rawBody;
        if (!sig || !rawBody || !verifyLineSignature(rawBody, sig, secret)) {
            console.warn('⚠️ LINE webhook signature verification failed');
            return res.sendStatus(401);
        }
    } else {
        console.warn('⚠️ LINE_CHANNEL_SECRET not set — skipping signature verification');
    }

    res.sendStatus(200);

    const events = req.body?.events || [];

    for (const event of events) {
        const sourceId: string = event.source?.groupId || event.source?.roomId || event.source?.userId || '';
        console.log(`📨 LINE event | type: ${event.type} | source: ${event.source?.type || 'unknown'} | id: ${sourceId}`);
        if (event.type !== 'message' || event.message?.type !== 'text') continue;

        try {
            const text: string = event.message.text?.trim() || '';
            const sourceId: string = event.source?.groupId || event.source?.userId || '';
            const senderId: string = event.source?.userId || '';

            const senderName = senderId ? await getSenderName(senderId) : 'unknown';

            console.log(`👤 LINE sender | name: ${senderName} | id: ${senderId}`);
            console.log(`📩 LINE msg | source: ${event.source?.type} | id: ${sourceId} | sender: ${senderId} | text: ${text.slice(0, 60)}`);

            if (!sourceId) continue;
            if (event.source?.type === 'group') addToBuffer(lineGroupKey(sourceId), senderName, text);

            // ─── TRANSLATION ─────────────────────────────────────────────
            const isCommand = text.startsWith('/');
            const isUrlOnly = /^https?:\/\/\S+$/.test(text.trim());
            const isCozmoReply = text.startsWith('🌐') || /^\[(EN|ZH-CN|ZH-TW|JA|TH|cont\.)\]/.test(text);

            if (!groupGuestLang.has(sourceId)) {
                const persisted = getGroupLang(sourceId);
                if (persisted) {
                    groupGuestLang.set(sourceId, persisted as SupportedLang);
                    groupTranslationOn.set(sourceId, true);
                }
            }
            const guestLang = groupGuestLang.get(sourceId);
            const translationActive = !!(guestLang && groupTranslationOn.get(sourceId) !== false);

            if (translationActive && guestLang && !isCommand && !isUrlOnly && !isCozmoReply) {
                await handleTranslation(sourceId, text, senderId, senderName, event.replyToken, guestLang);
            }
            // ─────────────────────────────────────────────────────────────

            if (await handleLineMembersCommand(sourceId, text, event.source?.type || '', event.replyToken)) continue;
            if (await handleLineLinkCommand(sourceId, text, event.source?.type || '', event.replyToken)) continue;
            if (await handleLineWelcomeCommand(sourceId, text, event.replyToken)) continue;
            if (await handleLineTransCommand(sourceId, text, event.replyToken)) continue;
            if (text === '/ckin' && await handleLineCkinCommand(sourceId, event.replyToken)) continue;
            if (await handleLineCkoutCommand(sourceId, text, event.replyToken)) continue;

            // /exp command
            if (text.startsWith('/exp')) {
                const lineGroupName = event.source?.type === 'group'
                    ? await getGroupName(sourceId)
                    : sourceId;
                await handleExpCommand(
                    'line',
                    lineGroupKey(sourceId),
                    lineGroupName,
                    senderId,
                    getLeadUid(lineGroupKey(sourceId)),
                    text,
                    async (msg) => replyMessage(event.replyToken, msg)
                );
                continue;
            }

            const lineLeadUid = getLeadUid(lineGroupKey(sourceId));
            if (lineLeadUid && isLeadExpired(lineLeadUid)) continue;
            await handleLineDetection(sourceId, text, senderName);
        } catch (e: any) {
            const errMsg = e?.response?.data?.message || e?.message || String(e);
            console.error('❌ LINE message handler error:', e?.response?.status, errMsg);
            await sendAlert(
                `⚠️ <b>LINE Handler Error</b>\n─────────────────\n` +
                `📱 <b>Source:</b> ${sourceId.slice(0, 20)}...\n` +
                `❌ <b>Error:</b> ${errMsg}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                { telegramOnly: true, platform: 'LINE' }
            ).catch(() => { });
        }
    }
});

export { sendLineWelcome };

router.post('/send', async (req, res) => {
    const { to, message } = req.body;
    try {
        await pushMessage(to, message);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.response?.data || e?.message || String(e) });
    }
});

router.post('/link', async (req, res) => {
    const { group_id, lead_uid } = req.body;
    if (!group_id || !lead_uid) return res.status(400).json({ error: 'Missing group_id or lead_uid' });

    try {
        const lead = await fetchLead(lead_uid);
        if (!lead) return res.status(404).json({ error: 'Lead not found in Hostfully' });

        linkGroup(lineGroupKey(group_id), lead_uid);

        const info = lead.guestInformation;
        const name = formatGuestName(info, 'Unknown');
        const checkIn = formatSeoulDate(lead.checkInLocalDateTime);

        await sendAlert(
            `🔗 <b>LINE Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `📅 <b>Check-in:</b> ${checkIn}\n` +
            `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { telegramOnly: true, platform: 'LINE', useTestJandi: lead_uid === '70778c3a-d60b-4473-a597-a5d6292628f5' }
        );

        res.json({ success: true });
    } catch (e: any) {
        await sendAlert(`⚠️ <b>LINE Link Failed</b>\n─────────────────\n❌ ${e?.message || e}`, { telegramOnly: true, platform: 'LINE' });
        res.status(500).json({ error: e?.response?.data || e?.message || String(e) });
    }
});

export default router;
