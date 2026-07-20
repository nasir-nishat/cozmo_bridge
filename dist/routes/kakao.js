"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueKakaoMessage = enqueueKakaoMessage;
exports.isKakaoQueued = isKakaoQueued;
exports.dropKakaoQueued = dropKakaoQueued;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const groupLeads_1 = require("../services/groupLeads");
const sheets_1 = require("../services/sheets");
const notify_1 = require("../services/notify");
const detection_1 = require("../platforms/kakao/detection");
const utils_1 = require("../platforms/kakao/utils");
const hostfully_1 = require("../services/hostfully");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const format_1 = require("../utils/format");
const expenses_1 = require("../services/expenses");
const constants_1 = require("../config/constants");
const bookingStore_1 = require("../services/bookingStore");
const messageBuffer_1 = require("../services/messageBuffer");
const kakaoWatchdog_1 = require("../services/kakaoWatchdog");
const sentMessages_1 = require("../services/sentMessages");
const router = (0, express_1.Router)();
const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
]);
const TEST_LEAD_UID = '70778c3a-d60b-4473-a597-a5d6292628f5';
const parseText = (event) => {
    if (event.msg)
        return String(event.msg).trim();
    if (typeof event.message === 'string')
        return event.message.trim();
    if (typeof event.message === 'object' && event.message?.text)
        return event.message.text.trim();
    return (event.text || '').trim();
};
const parseSourceId = (event) => {
    const id = event.channelId || event.room || event.source?.id ||
        event.sourceId || event.chat_id || event.chatId;
    return id != null ? String(id) : '';
};
const parseSenderName = (event) => event.author || event.sender || event.sender?.name || event.senderName || 'Unknown';
// kakaocli payloads always include log_id (read from SQLite); MessengerBot R never does
const isFromKakaocli = (event) => {
    return event.log_id != null;
};
// Include the message timestamp so kakaocli replays of the exact same payload
// (same chat_id + timestamp + text) are caught even if they arrive minutes later.
const mergeKey = (event) => {
    const ts = event.timestamp || event.sentAt || '';
    return `${parseSourceId(event)}:${ts}:${parseText(event).slice(0, 60)}`;
};
// Persistent dedup — survives pm2 restarts. MessengerBot R re-delivers old messages whenever
// a new message arrives in the same chat; in-memory dedup is wiped on every restart.
const DEDUP_FILE = path_1.default.join(process.cwd(), 'kakao-dedup.json');
const recentlyProcessed = new Set();
const dedupExpiry = {};
function loadDedup() {
    try {
        const data = JSON.parse(fs_1.default.readFileSync(DEDUP_FILE, 'utf8'));
        const now = Date.now();
        for (const [k, expiry] of Object.entries(data)) {
            if (expiry > now) {
                dedupExpiry[k] = expiry;
                recentlyProcessed.add(k);
                setTimeout(() => { recentlyProcessed.delete(k); delete dedupExpiry[k]; }, expiry - now);
            }
        }
    }
    catch { /* first run or corrupt file — start fresh */ }
}
function saveDedup() {
    try {
        fs_1.default.writeFileSync(DEDUP_FILE, JSON.stringify(dedupExpiry), 'utf8');
    }
    catch { /* non-fatal */ }
}
const CMD_TTL = 300000; // 5 min — old MessengerBot R re-delivers same command on every new message; 10s was not enough
const MSG_TTL = 3600000; // 1 hour — guest messages: team replies can come 46+ min later
const markProcessed = (key, ttl = MSG_TTL) => {
    const expiry = Date.now() + ttl;
    recentlyProcessed.add(key);
    dedupExpiry[key] = expiry;
    saveDedup();
    setTimeout(() => { recentlyProcessed.delete(key); delete dedupExpiry[key]; }, ttl);
};
loadDedup();
const mergeBuffer = new Map();
async function runDetection(event) {
    const text = parseText(event);
    const sourceId = parseSourceId(event);
    const senderName = parseSenderName(event);
    const senderId = event.sender_id ? String(event.sender_id) : undefined;
    (0, messageBuffer_1.addToBuffer)((0, utils_1.kakaoSourceKey)(sourceId), senderName, text);
    const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.kakaoSourceKey)(sourceId));
    if (leadUid && (0, bookingStore_1.isLeadExpired)(leadUid))
        return;
    await (0, detection_1.handleKakaoDetection)(sourceId, text, senderName, senderId);
}
router.post('/heartbeat', (_req, res) => {
    (0, kakaoWatchdog_1.recordKakaoHeartbeat)();
    res.json({ ok: true });
});
router.get('/health', (_req, res) => {
    const last = (0, kakaoWatchdog_1.getLastKakaoHeartbeat)();
    const ageSec = last ? Math.round((Date.now() - last) / 1000) : null;
    res.json({ ok: true, lastHeartbeatAgeSeconds: ageSec });
});
router.get('/webhook', (_req, res) => {
    res.status(200).json({
        ok: true,
        route: '/kakao/webhook',
        method: 'POST',
        message: 'Kakao webhook endpoint is reachable.',
    });
});
router.post('/webhook', async (req, res) => {
    console.log('📲 KAKAO body:', JSON.stringify(req.body));
    const events = Array.isArray(req.body)
        ? req.body
        : Array.isArray(req.body?.events)
            ? req.body.events
            : [req.body];
    // Handle /link synchronously so MessengerBot R gets a reply field in the response
    if (events.length === 1) {
        const event = events[0];
        const text = parseText(event);
        const sourceId = parseSourceId(event);
        // MessengerBot R re-delivers old messages with their original timestamp whenever a new
        // message arrives in the same chat. Reject anything older than 5 minutes.
        const msgTs = event.timestamp || event.sentAt;
        if (msgTs) {
            const msgAge = Date.now() - new Date(msgTs).getTime();
            if (!isNaN(msgAge) && msgAge > 5 * 60000) {
                console.log(`⏭️ KAKAO stale skip | age=${Math.round(msgAge / 1000)}s | text=${text.slice(0, 30)}`);
                res.sendStatus(200);
                return;
            }
        }
        const key = mergeKey(event);
        const isCommand = !!(text && (text.startsWith('/exp') || text === '/ckout' || text === '/ckout exp' ||
            text === '/ckin' || /^\/link\s+/i.test(text) || text === '/welcome'));
        // Commands use a timestamp-independent key — KakaoTalk re-delivers the original message
        // after each COZMO reply, and MessengerBot R stamps a fresh new Date() each time, so the
        // mergeKey (which includes timestamp) would never match across re-deliveries.
        // Non-commands keep the timestamp key to deduplicate MessengerBot R's 3x onMessage fires.
        const dedupeKey = isCommand ? `cmd:${sourceId}:${text.slice(0, 60)}` : key;
        if (recentlyProcessed.has(dedupeKey)) {
            res.sendStatus(200);
            return;
        }
        // /exp needs sender_id for getStaffName — skip MessengerBot R when it's missing and let
        // kakaocli (2s poll) supply it. All other commands work fine without sender_id.
        const hasSenderId = !!events[0].sender_id;
        const isExpCommand = text.startsWith('/exp');
        if (isExpCommand && !hasSenderId && !isFromKakaocli(events[0])) {
            res.sendStatus(200);
            return;
        }
        // Mark before handling so a kakaocli delivery followed by a MessengerBot R delivery
        // of the same command doesn't double-log. MessengerBot R (instant onMessage) almost
        // always arrives first; kakaocli (2s poll) is then blocked by the dedup.
        // If MessengerBot R is NOT in the group, only kakaocli delivers the command — we still
        // process it so the expense is logged (no KakaoTalk reply, but data is saved).
        if (isCommand)
            markProcessed(dedupeKey, CMD_TTL);
        // kakaocli ignores HTTP response body — enqueue so MessengerBot R picks up via /dequeue.
        // MessengerBot R reads the reply directly from the HTTP response body.
        const isKakaocli = isFromKakaocli(events[0]);
        const sendKakaoReply = (...msgs) => {
            const valid = msgs.filter(Boolean);
            console.log(`📨 KAKAO sendReply | isKakaocli=${isKakaocli} | count=${valid.length} | chat=${sourceId}`);
            if (isKakaocli) {
                valid.forEach(m => enqueueKakaoMessage(sourceId, m));
                res.sendStatus(200);
            }
            else if (valid.length === 1) {
                console.log(`📨 KAKAO inline reply | chat=${sourceId} | text=${valid[0].slice(0, 40)}`);
                res.json({ reply: valid[0] });
            }
            else if (valid.length > 1) {
                // Multi-part replies: enqueue so MessengerBot R delivers them one-per-poll via
                // /dequeue. Sending them inline as { replies } made the script fire msg.reply()
                // back-to-back with no gap, so KakaoTalk dropped or duplicated them. The queue is
                // persisted and drains one message at a time (text + __IMAGE__ both handled).
                valid.forEach(m => enqueueKakaoMessage(sourceId, m));
                res.sendStatus(200);
            }
            else {
                res.sendStatus(200);
            }
        };
        if (text && sourceId) {
            // /exp commands work even when is_from_me (staff sending from KakaoTalk)
            if (text.startsWith('/exp')) {
                const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.kakaoSourceKey)(sourceId));
                const expSenderId = events[0].sender_id != null ? String(events[0].sender_id) : '';
                const expSenderName = parseSenderName(events[0]);
                const kakaoChatName = events[0].chat_name || (0, utils_1.kakaoSourceKey)(sourceId);
                const replyMessages = [];
                await (0, expenses_1.handleExpCommand)('kakao', (0, utils_1.kakaoSourceKey)(sourceId), kakaoChatName, expSenderId, leadUid, text, async (msg) => { replyMessages.push(msg); }, expSenderName);
                sendKakaoReply(...replyMessages);
                return;
            }
            if (!event.is_from_me) {
                if (text === '/ckout' || text === '/ckout exp') {
                    const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.kakaoSourceKey)(sourceId));
                    if (!leadUid) {
                        sendKakaoReply('❌ Group not linked. Use /link <lead_uid> first');
                        return;
                    }
                    if (text === '/ckout exp') {
                        const chatName = events[0].chat_name || '';
                        let replyMsg = '';
                        const had = await (0, expenses_1.sendExpenseSummary)(leadUid, async (msg) => { replyMsg = msg; }, `kakao:${events[0].chat_id}`);
                        if (!had) {
                            res.sendStatus(200);
                            return;
                        }
                        const payMsg = await (0, sheets_1.getScheduledMessage)('payment_reminder', 'KR');
                        sendKakaoReply(replyMsg + (payMsg ? '\n\n' + payMsg : ''));
                        console.log(`✅ KAKAO /ckout exp sent → ${chatName || sourceId}`);
                        return;
                    }
                    const message = await (0, sheets_1.getScheduledMessage)('checkout_reminder', 'KR');
                    sendKakaoReply(message || '❌ Checkout message not found in Sheets');
                    if (message)
                        console.log(`✅ KAKAO /ckout sent → ${sourceId}`);
                    return;
                }
                if (text === '/ckin') {
                    const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.kakaoSourceKey)(sourceId));
                    if (!leadUid) {
                        sendKakaoReply('❌ Group not linked. Use /link <lead_uid> first');
                        return;
                    }
                    try {
                        const lead = await withTimeout((0, hostfully_1.fetchLead)(leadUid), 5000, 'fetchLead');
                        const propertyName = lead?.propertyName || lead?.unit?.name || '';
                        const tipKeys = (0, constants_1.skipsBreakfast)(propertyName) ? ['food_tips', 'van_tips'] : ['breakfast_tips', 'food_tips', 'van_tips'];
                        const replies = [];
                        for (const key of tipKeys) {
                            const msg = await (0, sheets_1.getTipsMessage)(key, 'KR');
                            if (msg)
                                replies.push(msg);
                        }
                        const rules = await (0, sheets_1.getTipsMessage)('guest_rules', 'KR');
                        if (rules)
                            replies.push(rules);
                        sendKakaoReply(...replies);
                        console.log(`✅ KAKAO /ckin sent → ${sourceId}`);
                    }
                    catch (e) {
                        console.error('❌ KAKAO /ckin error:', e?.message);
                        sendKakaoReply('❌ Failed to send check-in messages');
                    }
                    return;
                }
                const linkMatch = text.match(/^\/link\s+([^\s]+)(?:\s+(welcome))?\s*$/i);
                if (linkMatch) {
                    const leadUid = linkMatch[1];
                    const sendWelcome = linkMatch[2]?.toLowerCase() === 'welcome';
                    (0, groupLeads_1.linkGroup)((0, utils_1.kakaoSourceKey)(sourceId), leadUid);
                    if (event.chat_name)
                        (0, groupLeads_1.saveKakaoChatName)(sourceId, event.chat_name);
                    console.log(`🔗 KAKAO linked: ${(0, utils_1.kakaoSourceKey)(sourceId)} → ${leadUid}`);
                    const chatName = event.chat_name || (0, groupLeads_1.getKakaoChatName)(sourceId) || '';
                    let lead = null;
                    let groupNameSuggestion = '';
                    let propCode = '';
                    try {
                        lead = await withTimeout((0, hostfully_1.fetchLead)(leadUid), 5000, 'fetchLead');
                        const name = (0, format_1.guestName)(lead?.guestInformation);
                        propCode = (0, groupNaming_1.propertyCodeFromName)(lead?.propertyName || lead?.unit?.name || '');
                        groupNameSuggestion = (0, groupNaming_1.buildBookingGroupName)(lead, null, name);
                    }
                    catch (e) {
                        console.error('❌ KAKAO /link lead fetch:', e?.message);
                    }
                    if (sendWelcome) {
                        try {
                            const msgs = await (0, sheets_1.getMessages)('KR');
                            const replies = [];
                            if (groupNameSuggestion) {
                                replies.push(`✅ Linked! Property: ${propCode}. Please rename this group to:`);
                                replies.push(groupNameSuggestion);
                            }
                            else {
                                replies.push('✅ Linked!');
                            }
                            const bm = msgs['brand_msg']?.replace(/\\n/g, '\n') || '';
                            const cu = msgs['business_card_url'] || '';
                            const im = msgs['intro_msg']?.replace(/\\n/g, '\n') || '';
                            if (bm)
                                replies.push(bm);
                            if (cu.startsWith('http'))
                                replies.push(`__IMAGE__${cu}`);
                            if (im && im !== bm)
                                replies.push(im);
                            sendKakaoReply(...replies);
                            console.log(`✅ KAKAO /link welcome sent → ${chatName}`);
                        }
                        catch (e) {
                            sendKakaoReply('✅ Linked! (welcome fetch failed)');
                        }
                    }
                    else if (groupNameSuggestion) {
                        sendKakaoReply(`✅ Linked! Property: ${propCode}. Please rename this group to:`, groupNameSuggestion);
                    }
                    else {
                        sendKakaoReply('✅ Linked!');
                    }
                    const alertName = lead ? (0, format_1.guestName)(lead?.guestInformation) : '(unavailable)';
                    const alertCheckIn = lead ? (0, format_1.formatSeoulDate)(lead?.checkInLocalDateTime) : '(unavailable)';
                    (0, notify_1.sendAlert)(`🔗 <b>KAKAO Linked</b>\n─────────────────\n` +
                        `👤 <b>Guest:</b> ${alertName}\n` +
                        `📅 <b>Check-in:</b> ${alertCheckIn}\n` +
                        `🔑 <b>Lead UID:</b> <code>${leadUid}</code>\n` +
                        `📱 <b>Platform:</b> KAKAO\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true, platform: 'KAKAO', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: propCode || undefined }).catch(e => console.error('❌ KAKAO /link alert error:', e?.message));
                    return;
                }
                if (text === '/welcome') {
                    const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.kakaoSourceKey)(sourceId));
                    if (!leadUid) {
                        sendKakaoReply('❌ Group not linked. Use /link <lead_uid> first');
                        return;
                    }
                    const chatName = event.chat_name || (0, groupLeads_1.getKakaoChatName)(sourceId) || '';
                    try {
                        const msgs = await (0, sheets_1.getMessages)('KR');
                        const replies = [];
                        const bm = msgs['brand_msg']?.replace(/\\n/g, '\n') || '';
                        const cu = msgs['business_card_url'] || '';
                        const im = msgs['intro_msg']?.replace(/\\n/g, '\n') || '';
                        if (bm)
                            replies.push(bm);
                        if (cu.startsWith('http'))
                            replies.push(`__IMAGE__${cu}`);
                        if (im && im !== bm)
                            replies.push(im);
                        sendKakaoReply(...replies);
                        console.log(`✅ KAKAO /welcome sent → ${chatName || sourceId}`);
                        withTimeout((0, hostfully_1.fetchLead)(leadUid), 5000, 'fetchLead').then(async (lead) => {
                            const name = (0, format_1.guestName)(lead?.guestInformation);
                            const property = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
                            return (0, notify_1.sendAlert)(`👋 <b>KakaoTalk Welcome Sent</b>\n─────────────────\n` +
                                `👤 <b>Guest:</b> ${name}\n` +
                                `🏠 <b>Property:</b> ${property}\n` +
                                `📱 <b>Platform:</b> KakaoTalk\n` +
                                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'KAKAO', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined });
                        }).catch(e => console.error('❌ KAKAO /welcome alert error:', e?.message));
                    }
                    catch (e) {
                        console.error('❌ KAKAO /welcome error:', e?.message);
                        sendKakaoReply(`❌ Failed: ${e?.message}`);
                    }
                    return;
                }
            } // end !is_from_me
        }
    }
    // All other messages: respond immediately, process async
    res.sendStatus(200);
    for (const event of events) {
        try {
            if (event.is_from_me)
                continue;
            const text = parseText(event);
            const sourceId = parseSourceId(event);
            if (!text || !sourceId)
                continue;
            if (text.startsWith('/exp'))
                continue; // handled in sync block above
            const key = mergeKey(event);
            if (isFromKakaocli(event)) {
                // kakaocli is sender_id enrichment only — skip commands
                const isCmd = text.startsWith('/exp') || text === '/ckout' || text === '/ckout exp' ||
                    text === '/ckin' || /^\/link\s+/i.test(text) || text === '/welcome';
                if (isCmd)
                    continue;
                const buffered = mergeBuffer.get(key);
                if (buffered) {
                    // MessengerBot R arrived first — enrich with sender_id and process
                    clearTimeout(buffered.timer);
                    mergeBuffer.delete(key);
                    buffered.event.sender_id = event.sender_id;
                    markProcessed(key);
                    await runDetection(buffered.event);
                }
                else if (!recentlyProcessed.has(key)) {
                    // kakaocli arrived alone (MessengerBot R not running or delayed beyond window)
                    markProcessed(key);
                    await runDetection(event);
                }
            }
            else {
                // MessengerBot R arrived — buffer for 1.5s waiting for kakaocli enrichment
                if (recentlyProcessed.has(key))
                    continue;
                if (mergeBuffer.has(key))
                    continue; // timer already running — don't reset it
                const timer = setTimeout(async () => {
                    mergeBuffer.delete(key);
                    markProcessed(key);
                    await runDetection(event).catch((e) => console.error('❌ KAKAO buffer timeout error:', e?.message));
                }, 1500);
                mergeBuffer.set(key, { event, timer });
            }
        }
        catch (e) {
            const errMsg = e?.message || String(e);
            console.error('❌ KAKAO webhook handler error:', errMsg);
            await (0, notify_1.sendAlert)(`⚠️ <b>KAKAO Handler Error</b>\n─────────────────\n` +
                `❌ <b>Error:</b> ${errMsg}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true, platform: 'KAKAO' }).catch(() => { });
        }
    }
});
const QUEUE_FILE = path_1.default.join(process.cwd(), 'kakao-outbound-queue.json');
const kakaoOutboundQueue = [];
function loadQueue() {
    try {
        const arr = JSON.parse(fs_1.default.readFileSync(QUEUE_FILE, 'utf8'));
        if (Array.isArray(arr))
            kakaoOutboundQueue.push(...arr);
    }
    catch { /* first run or corrupt — start empty */ }
}
function saveQueue() {
    try {
        fs_1.default.writeFileSync(QUEUE_FILE, JSON.stringify(kakaoOutboundQueue), 'utf8');
    }
    catch { /* non-fatal */ }
}
loadQueue();
function enqueueKakaoMessage(chatId, text, opts) {
    // Idempotent for ad-hoc/command replies: don't stack a message identical to one already waiting
    // to be delivered. Prevents duplicates when a command is retried while MessengerBot R is down
    // (the queue isn't draining, so retries would otherwise pile up and all flush on recovery).
    // Scheduled messages (sentType set) are guarded separately by isKakaoQueued() before enqueue.
    if (!opts?.sentType && kakaoOutboundQueue.some(i => i.chat_id === chatId && i.text === text && !i.sentType)) {
        return;
    }
    kakaoOutboundQueue.push({ chat_id: chatId, text, groupKey: opts?.groupKey, sentType: opts?.sentType });
    saveQueue();
    console.log(`📤 KAKAO enqueue | chat=${chatId} | q=${kakaoOutboundQueue.length} | text=${text.slice(0, 40)}`);
}
// True if a scheduled message for this group+type is still waiting in the queue (not yet delivered).
// Stops the cron + startup catch-up from enqueuing the same scheduled message twice.
function isKakaoQueued(groupKey, sentType) {
    return kakaoOutboundQueue.some(i => i.groupKey === groupKey && i.sentType === sentType);
}
// Remove pending scheduled items for a group+type — called when the scheduler declares the message
// "missed" (server was down past the send window) so it won't auto-deliver later after the team has
// already sent it manually.
function dropKakaoQueued(groupKey, sentType) {
    let removed = 0;
    for (let i = kakaoOutboundQueue.length - 1; i >= 0; i--) {
        if (kakaoOutboundQueue[i].groupKey === groupKey && kakaoOutboundQueue[i].sentType === sentType) {
            kakaoOutboundQueue.splice(i, 1);
            removed++;
        }
    }
    if (removed)
        saveQueue();
    return removed;
}
// GET /dequeue?peek=1 — return first item WITHOUT removing (MessengerBot R must POST /dequeue/ack to confirm delivery).
// GET /dequeue       — legacy: shift + return in one call (old script compat, not used by new script).
router.get('/dequeue', (req, res) => {
    (0, kakaoWatchdog_1.recordKakaoHeartbeat)();
    if (req.query.peek === '1') {
        const item = kakaoOutboundQueue[0];
        if (item)
            console.log(`🔍 KAKAO dequeue peek | q=${kakaoOutboundQueue.length} | item=${item.chat_id}:${item.text.slice(0, 30)}`);
        res.json(item ? [{ chat_id: item.chat_id, text: item.text }] : []);
        return;
    }
    // Legacy shift-on-read path (kept for backward compat)
    const item = kakaoOutboundQueue.shift();
    if (item) {
        saveQueue();
        if (item.groupKey && item.sentType)
            (0, sentMessages_1.markSent)(item.groupKey, item.sentType);
    }
    if (item)
        console.log(`🔍 KAKAO dequeue legacy | q=${kakaoOutboundQueue.length} | item=${item.chat_id}:${item.text.slice(0, 30)}`);
    res.json(item ? [{ chat_id: item.chat_id, text: item.text }] : []);
});
// POST /dequeue/ack — remove the first item after MessengerBot R has successfully delivered it.
router.post('/dequeue/ack', (_req, res) => {
    const item = kakaoOutboundQueue.shift();
    if (item) {
        saveQueue();
        if (item.groupKey && item.sentType)
            (0, sentMessages_1.markSent)(item.groupKey, item.sentType);
        console.log(`✅ KAKAO dequeue ack | removed=${item.chat_id}:${item.text.slice(0, 30)} | q=${kakaoOutboundQueue.length}`);
    }
    else {
        console.log(`⚠️ KAKAO dequeue ack | queue was already empty`);
    }
    res.json({ ok: true });
});
router.post('/send', (req, res) => {
    const { chat_id, text } = req.body;
    if (!chat_id || !text)
        return res.status(400).json({ error: 'Missing chat_id or text' });
    enqueueKakaoMessage(String(chat_id), text);
    res.json({ ok: true, queued: 1 });
});
router.post('/link', async (req, res) => {
    const { source_id, lead_uid } = req.body;
    if (!source_id || !lead_uid) {
        return res.status(400).json({ error: 'Missing source_id or lead_uid' });
    }
    (0, groupLeads_1.linkGroup)((0, utils_1.kakaoSourceKey)(source_id), lead_uid);
    await (0, notify_1.sendAlert)(`🔗 <b>KAKAO Linked (API)</b>\n─────────────────\n` +
        `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
        `📱 <b>Platform:</b> KAKAO\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true, platform: 'KAKAO' });
    return res.json({ success: true });
});
exports.default = router;
