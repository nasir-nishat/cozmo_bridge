"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setGroupCreationEnabled = exports.groupCreationEnabled = exports.createBookingGroup = exports.waClient = exports.isWaReady = void 0;
exports.initWhatsApp = initWhatsApp;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
const sheets_1 = require("../services/sheets");
const groupLeads_1 = require("../services/groupLeads");
const hostfully_1 = require("../services/hostfully");
const notify_1 = require("../services/notify");
const evoClient_1 = require("../platforms/whatsapp/evoClient");
Object.defineProperty(exports, "isWaReady", { enumerable: true, get: function () { return evoClient_1.isWaReady; } });
Object.defineProperty(exports, "waClient", { enumerable: true, get: function () { return evoClient_1.waClient; } });
const format_1 = require("../utils/format");
const groupCreation_1 = require("../platforms/whatsapp/groupCreation");
Object.defineProperty(exports, "createBookingGroup", { enumerable: true, get: function () { return groupCreation_1.createBookingGroup; } });
Object.defineProperty(exports, "groupCreationEnabled", { enumerable: true, get: function () { return groupCreation_1.groupCreationEnabled; } });
Object.defineProperty(exports, "setGroupCreationEnabled", { enumerable: true, get: function () { return groupCreation_1.setGroupCreationEnabled; } });
const detection_1 = require("../platforms/whatsapp/detection");
const groupReminders_1 = require("../services/groupReminders");
// ─── Router ───────────────────────────────────────────────────────────────────
const router = (0, express_1.Router)();
// Evolution API pushes incoming messages here; configure Evolution webhook to POST /wa/webhook
// Also registered as /webhook/wa for docker host.docker.internal routing
const processedIds = new Set();
const loggedWebhookIds = new Set();
const IGNORED_EVENTS = new Set([
    'presence.update', 'chats.update', 'contacts.update',
    'contacts.upsert', 'chats.upsert', 'chats.delete',
]);
const ROUTE_EVENT_ALIASES = {
    'connection-update': 'connection.update',
    'group-participants-update': 'group-participants.update',
    'groups-participants-update': 'groups-participants.update',
    'groups-upsert': 'groups.upsert',
    'messages-upsert': 'messages.upsert',
    'messages-update': 'messages.update',
    'send-message': 'send.message',
};
function rememberRecent(set, key, max = 500) {
    if (set.has(key))
        return false;
    set.add(key);
    if (set.size > max) {
        const first = set.values().next().value;
        set.delete(first);
    }
    return true;
}
function eventFromPath(value) {
    if (!value)
        return '';
    return ROUTE_EVENT_ALIASES[value] || value.replace(/-/g, '.');
}
function normalizeEventName(value) {
    return value.trim().toLowerCase().replace(/_/g, '.');
}
function parseWebhookBody(req) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body))
        return req.body;
    try {
        const raw = req.rawBody?.toString?.('utf8') || '';
        return raw ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
}
function extractWebhookMessage(data) {
    return Array.isArray(data?.messages) ? data.messages[0] : data;
}
async function handleEvolutionWebhook(req, res) {
    res.json({ success: true });
    const body = parseWebhookBody(req);
    const event = String(body?.event || eventFromPath(req.params?.eventName) || '');
    const data = body?.data;
    const eventKey = normalizeEventName(event);
    if (!event) {
        console.warn('⚠️ WA webhook missing event:', JSON.stringify({
            path: req.path,
            contentType: req.headers?.['content-type'],
            bodyKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 12) : [],
        }));
        return;
    }
    if (IGNORED_EVENTS.has(eventKey))
        return;
    const msg = extractWebhookMessage(data);
    const msgId = msg?.key?.id;
    const logKey = msgId ? `${eventKey}:${msgId}` : '';
    if (!logKey || rememberRecent(loggedWebhookIds, logKey)) {
        // Log every non-noisy event once so we can see what Evolution is actually sending.
        console.log(`📨 WA webhook event="${event}" raw:`, JSON.stringify(body));
    }
    if (eventKey === 'connection.update') {
        const state = data?.state || data?.instance?.state;
        console.log(`🔌 WA connection state: "${state}"`);
        if (state === 'open') {
            (0, evoClient_1.setWaReady)(true);
            (0, evoClient_1.ensureEvolutionWebhook)().catch(e => console.error('❌ ensureEvolutionWebhook error:', e?.message));
            (0, groupCreation_1.flushPendingMessages)().catch(e => console.error('❌ flushPendingMessages error:', e?.message));
        }
        else if (state === 'close') {
            (0, evoClient_1.setWaReady)(false);
        }
        return;
    }
    // New participant added → cancel companion reminder (guest handled it themselves)
    if (eventKey === 'group-participants.update' || eventKey === 'groups-participants.update') {
        const groupId = data?.id || data?.groupJid || data?.group;
        if (groupId && data?.action === 'add') {
            (0, groupReminders_1.cancelReminder)(groupId, 'new participant added to group');
        }
        return;
    }
    // v1.8.2 may send MESSAGES_UPSERT (uppercase) or messages.upsert (lowercase)
    if (eventKey === 'messages.upsert') {
        if (msg) {
            if (msgId && !rememberRecent(processedIds, msgId))
                return;
            if (!msg.sender)
                msg.sender = body.sender;
            (0, detection_1.handleIncomingMessage)(msg).catch((e) => console.error('❌ Message handler error:', e?.message || e));
        }
    }
}
router.get('/wa/webhook', (_req, res) => res.json({ ok: true, waReady: (0, evoClient_1.isWaReady)() }));
router.post('/wa/webhook', handleEvolutionWebhook);
router.post('/wa/webhook/:eventName', handleEvolutionWebhook);
router.post('/webhook/wa', handleEvolutionWebhook);
router.post('/webhook/wa/:eventName', handleEvolutionWebhook);
router.post('/send', async (req, res) => {
    const { to, message } = req.body;
    try {
        if (!(0, evoClient_1.isWaReady)())
            throw new Error('WA not ready');
        const number = to.includes('@') ? to : to.replace(/\D/g, '');
        await evoClient_1.evoApi.post(`/message/sendText/${evoClient_1.INSTANCE}`, { number, textMessage: { text: message } });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e?.message });
    }
});
router.post('/webhook-test', async (req, res) => {
    console.log('🧪 Test webhook:', req.body);
    res.json({ success: true });
    try {
        await (0, groupCreation_1.createBookingGroup)(req.body);
    }
    catch (e) {
        console.error('❌ Test error:', e?.stack || e?.message);
    }
});
router.post('/webhook-test/group-setup', async (req, res) => {
    const { group_id, property, nationality } = req.body;
    if (!group_id || !property)
        return res.status(400).json({ error: 'Missing group_id or property' });
    const results = {};
    const TO = { timeout: 10000 };
    // 1. Icon
    const imageBase64 = await (0, groupCreation_1.getPropertyImageBase64)(property);
    if (imageBase64) {
        try {
            await evoClient_1.evoApi.put(`/group/updateGroupPicture/${evoClient_1.INSTANCE}`, { image: imageBase64 }, { params: { groupJid: group_id }, timeout: 10000 });
            results.icon = '✅ ok';
        }
        catch (e) {
            results.icon = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
        }
    }
    else {
        results.icon = '⚠️ no image found for property';
    }
    // 2. Promote team members to admin
    try {
        const teamNumbers = await (0, sheets_1.getTeamNumbers)();
        const participants = teamNumbers.map(n => n.replace(/\D/g, ''));
        await evoClient_1.evoApi.put(`/group/updateParticipant/${evoClient_1.INSTANCE}`, {
            groupJid: group_id,
            action: 'promote',
            participants,
        }, TO);
        results.admin_promotion = `✅ ok (${participants.length} members)`;
    }
    catch (e) {
        results.admin_promotion = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
    }
    // 3. Brand + Intro messages
    const msgs = await (0, sheets_1.getMessages)(nationality === 'KR' ? 'KR' : 'EN');
    for (const key of ['brand_msg', 'intro_msg']) {
        if (msgs[key]) {
            try {
                await evoClient_1.evoApi.post(`/message/sendText/${evoClient_1.INSTANCE}`, { number: group_id, textMessage: { text: msgs[key].replace(/\\n/g, '\n') } }, TO);
                results[key] = '✅ ok';
            }
            catch (e) {
                results[key] = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
            }
        }
    }
    // 4. Business card
    const cardUrl = msgs['business_card_url'];
    const cardSrc = cardUrl || (fs_1.default.existsSync(constants_1.CONFIG.BUSINESS_CARD_PATH) ? 'local' : '');
    if (cardSrc) {
        try {
            const media = cardUrl
                ? Buffer.from((await axios_1.default.get(cardUrl, { responseType: 'arraybuffer', timeout: 10000 })).data).toString('base64')
                : fs_1.default.readFileSync(constants_1.CONFIG.BUSINESS_CARD_PATH).toString('base64');
            await evoClient_1.evoApi.post(`/message/sendMedia/${evoClient_1.INSTANCE}`, {
                number: group_id,
                mediaMessage: { mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg' },
            }, TO);
            results.business_card = '✅ ok';
        }
        catch (e) {
            results.business_card = `❌ ${JSON.stringify(e?.response?.data) || e?.message}`;
        }
    }
    res.json(results);
});
router.post('/webhook-test/messages', async (req, res) => {
    const { group_id, nationality } = req.body;
    if (!group_id)
        return res.status(400).json({ error: 'Missing group_id' });
    res.json({ success: true, message: 'Sending messages in background — check pm2 logs' });
    const warnings = [];
    try {
        await (0, groupCreation_1.sendBookingMessages)(group_id, { nationality: nationality || 'EN' }, warnings);
    }
    catch (e) {
        console.error('❌ Test messages error:', e?.message);
        warnings.push(e?.message || 'unknown error');
    }
    await (0, notify_1.sendAlert)(warnings.length
        ? `⚠️ <b>Test Messages — Failures</b>\n─────────────────\n🆔 <b>Group:</b> <code>${group_id}</code>\n` +
            warnings.map(w => `• ${w}`).join('\n') + `\n─────────────────\n<i>via COZMO · DEV TEST</i>`
        : `✅ <b>Test Messages Sent</b>\n─────────────────\n🆔 <b>Group:</b> <code>${group_id}</code>\n─────────────────\n<i>via COZMO · DEV TEST</i>`, { useTestJandi: true });
});
router.post('/admin/toggle-groups', (req, res) => {
    const { enabled } = req.body;
    (0, groupCreation_1.setGroupCreationEnabled)(enabled === true || enabled === 'true');
    console.log(`🔧 Group creation ${groupCreation_1.groupCreationEnabled ? 'ENABLED' : 'DISABLED'}`);
    res.json({ success: true, groupCreationEnabled: groupCreation_1.groupCreationEnabled });
});
router.get('/admin/whatsapp-status', (_req, res) => {
    res.json({ success: true, waReady: (0, evoClient_1.isWaReady)(), groupCreationEnabled: groupCreation_1.groupCreationEnabled });
});
router.post('/admin/test-checkout-reminder', async (req, res) => {
    const { group_id, lang = 'EN' } = req.body;
    if (!group_id)
        return res.status(400).json({ error: 'Missing group_id' });
    const validLangs = ['EN', 'KR', 'JA', 'ZH'];
    if (!validLangs.includes(lang))
        return res.status(400).json({ error: `lang must be one of: ${validLangs.join(', ')}` });
    const message = await (0, sheets_1.getScheduledMessage)('checkout_reminder', lang);
    if (!message)
        return res.status(404).json({ error: `No message found for checkout_reminder/${lang}` });
    await (0, evoClient_1.evoSendText)(group_id, message);
    console.log(`🧪 Test checkout reminder sent [${lang}] → ${group_id}`);
    res.json({ success: true, group_id, lang });
});
router.post('/link', async (req, res) => {
    const { group_id, lead_uid } = req.body;
    if (!group_id || !lead_uid)
        return res.status(400).json({ error: 'Missing group_id or lead_uid' });
    try {
        const lead = await (0, hostfully_1.fetchLead)(lead_uid);
        if (!lead)
            return res.status(404).json({ error: 'Lead not found in Hostfully' });
        (0, groupLeads_1.linkGroup)(group_id, lead_uid);
        const info = lead.guestInformation;
        const guest_name = (0, format_1.guestName)(info, 'Unknown');
        await (0, notify_1.sendAlert)(`🔗 <b>Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `📅 <b>Check-in:</b> ${(0, format_1.formatSeoulDate)(lead.checkInLocalDateTime)}\n` +
            `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true, useTestJandi: lead_uid === '70778c3a-d60b-4473-a597-a5d6292628f5' });
        res.json({ success: true });
    }
    catch (e) {
        await (0, notify_1.sendAlert)(`⚠️ <b>Link Failed</b>\n─────────────────\n❌ ${e?.message}`, { telegramOnly: true });
        res.status(500).json({ error: e?.message });
    }
});
function initWhatsApp() {
    (0, evoClient_1.setWaReady)(true);
    (0, evoClient_1.ensureEvolutionWebhook)(true).catch(e => console.error('❌ ensureEvolutionWebhook startup error:', e?.message));
    if (constants_1.CONFIG.GROUP_CREATION_ENABLED) {
        (0, groupCreation_1.setGroupCreationEnabled)(true);
    }
    console.log(`✨ WhatsApp via Evolution API (${constants_1.CONFIG.EVOLUTION_API_URL}, instance: ${evoClient_1.INSTANCE})`);
    console.log(`🔧 Group creation ${groupCreation_1.groupCreationEnabled ? 'ENABLED' : 'DISABLED'} (default)`);
}
exports.default = router;
