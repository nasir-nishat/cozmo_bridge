import { Router } from 'express';
import fs from 'fs';
import axios from 'axios';

import { CONFIG } from '../config/constants';
import { getTeamNumbers, getMessages, getScheduledMessage } from '../services/sheets';
import { linkGroup } from '../services/groupLeads';
import { fetchLead } from '../services/hostfully';
import { sendAlert } from '../services/notify';
import { evoApi, INSTANCE, isWaReady, setWaReady, waClient, evoSendText } from '../platforms/whatsapp/evoClient';
import { guestName, formatSeoulDate } from '../utils/format';
import { createBookingGroup, sendBookingMessages, groupCreationEnabled, setGroupCreationEnabled, getPropertyImageBase64, flushPendingMessages } from '../platforms/whatsapp/groupCreation';
import { handleIncomingMessage } from '../platforms/whatsapp/detection';
import { cancelReminder } from '../services/groupReminders';

export { isWaReady, waClient };
export { createBookingGroup, groupCreationEnabled, setGroupCreationEnabled };

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

// Evolution API pushes incoming messages here; configure Evolution webhook to POST /wa/webhook
// Also registered as /webhook/wa for docker host.docker.internal routing
const processedIds = new Set<string>();

async function handleEvolutionWebhook(req: any, res: any) {
    res.json({ success: true });
    const body = req.body;
    const { event, data } = body;

    // Suppress noisy non-actionable events
    const IGNORED_EVENTS = [
        'presence.update', 'chats.update', 'contacts.update',
        'contacts.upsert', 'chats.upsert', 'chats.delete'
    ];
    if (IGNORED_EVENTS.includes(event)) return;

    // Deduplicate — Evolution API fires webhooks twice (global + instance)
    const msgId = (Array.isArray(data?.messages) ? data.messages[0] : data)?.key?.id;
    if (msgId) {
        if (processedIds.has(msgId)) return;
        processedIds.add(msgId);
        if (processedIds.size > 500) {
            const first = processedIds.values().next().value as string;
            processedIds.delete(first);
        }
    }

    // Log every event so we can see what Evolution is actually sending
    console.log(`📨 WA webhook event="${event}" raw:`, JSON.stringify(body));

    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
        const state = data?.state || data?.instance?.state;
        console.log(`🔌 WA connection state: "${state}"`);
        if (state === 'open') {
            setWaReady(true);
            flushPendingMessages().catch(e => console.error('❌ flushPendingMessages error:', e?.message));
        } else if (state === 'close') {
            setWaReady(false);
        }
        return;
    }

    // New participant added → cancel companion reminder (guest handled it themselves)
    if (event === 'group-participants.update' || event === 'groups-participants.update' || event === 'GROUP_PARTICIPANTS_UPDATE') {
        const groupId = data?.id || data?.groupJid || data?.group;
        if (groupId && data?.action === 'add') {
            cancelReminder(groupId, 'new participant added to group');
        }
        return;
    }

    // v1.8.2 may send MESSAGES_UPSERT (uppercase) or messages.upsert (lowercase)
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
        const msg = Array.isArray(data?.messages) ? data.messages[0] : data;
        if (msg) {
            if (!msg.sender) msg.sender = body.sender;
            handleIncomingMessage(msg).catch((e) => console.error('❌ Message handler error:', e?.message || e));
        }
    }
}
router.get('/wa/webhook', (_req, res) => res.json({ ok: true, waReady: isWaReady() }));
router.post('/wa/webhook', handleEvolutionWebhook);
router.post('/webhook/wa', handleEvolutionWebhook);

router.post('/send', async (req, res) => {
    const { to, message } = req.body;
    try {
        if (!isWaReady()) throw new Error('WA not ready');
        const number = to.includes('@') ? to : to.replace(/\D/g, '');
        await evoApi.post(`/message/sendText/${INSTANCE}`, { number, textMessage: { text: message } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message });
    }
});

router.post('/webhook-test', async (req, res) => {
    console.log('🧪 Test webhook:', req.body);
    res.json({ success: true });
    try {
        await createBookingGroup(req.body);
    } catch (e: any) {
        console.error('❌ Test error:', e?.stack || e?.message);
    }
});

router.post('/webhook-test/group-setup', async (req, res) => {
    const { group_id, property, nationality } = req.body;
    if (!group_id || !property) return res.status(400).json({ error: 'Missing group_id or property' });

    const results: Record<string, string> = {};
    const TO = { timeout: 10000 };

    // 1. Icon
    const imageBase64 = await getPropertyImageBase64(property);
    if (imageBase64) {
        try {
            await evoApi.put(`/group/updateGroupPicture/${INSTANCE}`,
                { image: imageBase64 },
                { params: { groupJid: group_id }, timeout: 10000 }
            );
            results.icon = '✅ ok';
        } catch (e: any) {
            results.icon = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
        }
    } else {
        results.icon = '⚠️ no image found for property';
    }

    // 2. Promote team members to admin
    try {
        const teamNumbers = await getTeamNumbers();
        const participants = teamNumbers.map(n => n.replace(/\D/g, ''));
        await evoApi.put(`/group/updateParticipant/${INSTANCE}`, {
            groupJid: group_id,
            action: 'promote',
            participants,
        }, TO);
        results.admin_promotion = `✅ ok (${participants.length} members)`;
    } catch (e: any) {
        results.admin_promotion = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
    }

    // 3. Brand + Intro messages
    const msgs = await getMessages(nationality === 'KR' ? 'KR' : 'EN');

    for (const key of ['brand_msg', 'intro_msg'] as const) {
        if (msgs[key]) {
            try {
                await evoApi.post(`/message/sendText/${INSTANCE}`, { number: group_id, textMessage: { text: msgs[key].replace(/\\n/g, '\n') } }, TO);
                results[key] = '✅ ok';
            } catch (e: any) {
                results[key] = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
            }
        }
    }

    // 4. Business card
    const cardUrl = msgs['business_card_url'];
    const cardSrc = cardUrl || (fs.existsSync(CONFIG.BUSINESS_CARD_PATH) ? 'local' : '');
    if (cardSrc) {
        try {
            const media = cardUrl
                ? Buffer.from((await axios.get(cardUrl, { responseType: 'arraybuffer', timeout: 10000 })).data).toString('base64')
                : fs.readFileSync(CONFIG.BUSINESS_CARD_PATH).toString('base64');
            await evoApi.post(`/message/sendMedia/${INSTANCE}`, {
                number: group_id,
                mediaMessage: { mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg' },
            }, TO);
            results.business_card = '✅ ok';
        } catch (e: any) {
            results.business_card = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
        }
    }

    res.json(results);
});

router.post('/webhook-test/messages', async (req, res) => {
    const { group_id, nationality } = req.body;
    if (!group_id) return res.status(400).json({ error: 'Missing group_id' });
    res.json({ success: true, message: 'Sending messages in background — check pm2 logs' });

    const warnings: string[] = [];
    try {
        await sendBookingMessages(group_id, { nationality: nationality || 'EN' }, warnings);
    } catch (e: any) {
        console.error('❌ Test messages error:', e?.message);
        warnings.push(e?.message || 'unknown error');
    }

    await sendAlert(
        warnings.length
            ? `⚠️ <b>Test Messages — Failures</b>\n─────────────────\n🆔 <b>Group:</b> <code>${group_id}</code>\n` +
              warnings.map(w => `• ${w}`).join('\n') + `\n─────────────────\n<i>via COZMO · DEV TEST</i>`
            : `✅ <b>Test Messages Sent</b>\n─────────────────\n🆔 <b>Group:</b> <code>${group_id}</code>\n─────────────────\n<i>via COZMO · DEV TEST</i>`,
        { useTestJandi: true }
    );
});

router.post('/admin/toggle-groups', (req, res) => {
    const { enabled } = req.body;
    setGroupCreationEnabled(enabled === true || enabled === 'true');
    console.log(`🔧 Group creation ${groupCreationEnabled ? 'ENABLED' : 'DISABLED'}`);
    res.json({ success: true, groupCreationEnabled });
});

router.get('/admin/whatsapp-status', (_req, res) => {
    res.json({ success: true, waReady: isWaReady(), groupCreationEnabled });
});

router.post('/admin/test-checkout-reminder', async (req, res) => {
    const { group_id, lang = 'EN' } = req.body;
    if (!group_id) return res.status(400).json({ error: 'Missing group_id' });

    const validLangs = ['EN', 'KR', 'JA', 'ZH'];
    if (!validLangs.includes(lang)) return res.status(400).json({ error: `lang must be one of: ${validLangs.join(', ')}` });

    const message = await getScheduledMessage('checkout_reminder', lang);
    if (!message) return res.status(404).json({ error: `No message found for checkout_reminder/${lang}` });

    await evoSendText(group_id, message);
    console.log(`🧪 Test checkout reminder sent [${lang}] → ${group_id}`);
    res.json({ success: true, group_id, lang });
});

router.post('/link', async (req, res) => {
    const { group_id, lead_uid } = req.body;
    if (!group_id || !lead_uid) return res.status(400).json({ error: 'Missing group_id or lead_uid' });

    try {
        const lead = await fetchLead(lead_uid);
        if (!lead) return res.status(404).json({ error: 'Lead not found in Hostfully' });

        linkGroup(group_id, lead_uid);

        const info = lead.guestInformation;
        const guest_name = guestName(info, 'Unknown');

        await sendAlert(
            `🔗 <b>Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `📅 <b>Check-in:</b> ${formatSeoulDate(lead.checkInLocalDateTime)}\n` +
            `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { telegramOnly: true, useTestJandi: lead_uid === '70778c3a-d60b-4473-a597-a5d6292628f5' }
        );

        res.json({ success: true });
    } catch (e: any) {
        await sendAlert(`⚠️ <b>Link Failed</b>\n─────────────────\n❌ ${e?.message}`, { telegramOnly: true });
        res.status(500).json({ error: e?.message });
    }
});

export function initWhatsApp() {
    setWaReady(true);
    if (CONFIG.GROUP_CREATION_ENABLED) {
        setGroupCreationEnabled(true);
    }
    console.log(`✨ WhatsApp via Evolution API (${CONFIG.EVOLUTION_API_URL}, instance: ${INSTANCE})`);
    console.log(`🔧 Group creation ${groupCreationEnabled ? 'ENABLED' : 'DISABLED'} (default)`);
}

export default router;
