import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { linkGroup, getLeadUid, saveKakaoChatName, getKakaoChatName } from '../services/groupLeads';
import { getScheduledMessage, getMessages, getTipsMessage } from '../services/sheets';
import { sendAlert } from '../services/notify';
import { handleKakaoDetection } from '../platforms/kakao/detection';
import { kakaoSourceKey } from '../platforms/kakao/utils';
import { fetchLead, resolvePropertyNameForLead } from '../services/hostfully';
import { propertyCodeFromName, buildBookingGroupName } from '../platforms/whatsapp/groupNaming';
import { guestName, formatSeoulDate } from '../utils/format';
import { handleExpCommand, getStaffName, sendExpenseSummary } from '../services/expenses';
import { CONFIG, skipsBreakfast } from '../config/constants';
import { isLeadExpired } from '../services/bookingStore';
import { addToBuffer } from '../services/messageBuffer';
import { recordKakaoHeartbeat, getLastKakaoHeartbeat } from '../services/kakaoWatchdog';
import { markSent, MessageType } from '../services/sentMessages';

const router = Router();

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        )
    ]);


const TEST_LEAD_UID = '70778c3a-d60b-4473-a597-a5d6292628f5';

type KakaoEvent = {
    room?: string;                      // MessengerBot R (broken in v0.7.29a — equals sender name)
    channelId?: string;                 // MessengerBot R v0.7.39a+ — stable unique group ID
    msg?: string;                       // MessengerBot R
    sender?: any;                       // MessengerBot R (string) or object
    author?: string;                    // kakaocli (sender name)
    chat_id?: number;                   // kakaocli (snake_case)
    chat_name?: string;                 // kakaocli
    sender_id?: number;                 // kakaocli
    is_from_me?: boolean;               // kakaocli
    log_id?: number;                    // kakaocli
    isGroupChat?: boolean;
    sourceId?: string;
    chatId?: string | number;
    logId?: number;
    sentAt?: string;
    timestamp?: string;             // kakaocli ISO timestamp
    text?: string;
    senderName?: string;
    source?: { id?: string; type?: string };
    message?: string | { text?: string }; // kakaocli sends plain string; MessengerBot R sends object
};

const parseText = (event: KakaoEvent): string => {
    if ((event as any).msg) return String((event as any).msg).trim();
    if (typeof event.message === 'string') return event.message.trim();
    if (typeof event.message === 'object' && event.message?.text) return event.message.text.trim();
    return (event.text || '').trim();
};

const parseSourceId = (event: KakaoEvent): string => {
    const id = (event as any).channelId || (event as any).room || event.source?.id ||
               event.sourceId || event.chat_id || event.chatId;
    return id != null ? String(id) : '';
};

const parseSenderName = (event: KakaoEvent): string =>
    event.author || (event as any).sender || event.sender?.name || event.senderName || 'Unknown';

// kakaocli payloads always include log_id (read from SQLite); MessengerBot R never does
const isFromKakaocli = (event: KakaoEvent): boolean => {
    return event.log_id != null;
};

// Include the message timestamp so kakaocli replays of the exact same payload
// (same chat_id + timestamp + text) are caught even if they arrive minutes later.
const mergeKey = (event: KakaoEvent): string => {
    const ts = event.timestamp || event.sentAt || '';
    return `${parseSourceId(event)}:${ts}:${parseText(event).slice(0, 60)}`;
};

// Persistent dedup — survives pm2 restarts. MessengerBot R re-delivers old messages whenever
// a new message arrives in the same chat; in-memory dedup is wiped on every restart.
const DEDUP_FILE = path.join(process.cwd(), 'kakao-dedup.json');
const recentlyProcessed = new Set<string>();
const dedupExpiry: Record<string, number> = {};

function loadDedup(): void {
    try {
        const data = JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf8')) as Record<string, number>;
        const now = Date.now();
        for (const [k, expiry] of Object.entries(data)) {
            if (expiry > now) {
                dedupExpiry[k] = expiry;
                recentlyProcessed.add(k);
                setTimeout(() => { recentlyProcessed.delete(k); delete dedupExpiry[k]; }, expiry - now);
            }
        }
    } catch { /* first run or corrupt file — start fresh */ }
}

function saveDedup(): void {
    try { fs.writeFileSync(DEDUP_FILE, JSON.stringify(dedupExpiry), 'utf8'); } catch { /* non-fatal */ }
}

const CMD_TTL = 300_000;       // 5 min — old MessengerBot R re-delivers same command on every new message; 10s was not enough
const MSG_TTL = 3_600_000;     // 1 hour — guest messages: team replies can come 46+ min later
const markProcessed = (key: string, ttl = MSG_TTL): void => {
    const expiry = Date.now() + ttl;
    recentlyProcessed.add(key);
    dedupExpiry[key] = expiry;
    saveDedup();
    setTimeout(() => { recentlyProcessed.delete(key); delete dedupExpiry[key]; }, ttl);
};

loadDedup();

interface MergeEntry { event: KakaoEvent; timer: ReturnType<typeof setTimeout>; }
const mergeBuffer = new Map<string, MergeEntry>();

async function runDetection(event: KakaoEvent): Promise<void> {
    const text = parseText(event);
    const sourceId = parseSourceId(event);
    const senderName = parseSenderName(event);
    const senderId = event.sender_id ? String(event.sender_id) : undefined;
    addToBuffer(kakaoSourceKey(sourceId), senderName, text);
    const leadUid = getLeadUid(kakaoSourceKey(sourceId));
    if (leadUid && isLeadExpired(leadUid)) return;
    await handleKakaoDetection(sourceId, text, senderName, senderId);
}

router.post('/heartbeat', (_req, res) => {
    recordKakaoHeartbeat();
    res.json({ ok: true });
});

router.get('/health', (_req, res) => {
    const last = getLastKakaoHeartbeat();
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

    const events: KakaoEvent[] = Array.isArray(req.body)
        ? req.body as KakaoEvent[]
        : Array.isArray(req.body?.events)
        ? req.body.events
        : [req.body as KakaoEvent];

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
            if (!isNaN(msgAge) && msgAge > 5 * 60_000) {
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
        const hasSenderId = !!(events[0] as KakaoEvent).sender_id;
        const isExpCommand = text.startsWith('/exp');
        if (isExpCommand && !hasSenderId && !isFromKakaocli(events[0] as KakaoEvent)) {
            res.sendStatus(200);
            return;
        }
        // Mark before handling so a kakaocli delivery followed by a MessengerBot R delivery
        // of the same command doesn't double-log. MessengerBot R (instant onMessage) almost
        // always arrives first; kakaocli (2s poll) is then blocked by the dedup.
        // If MessengerBot R is NOT in the group, only kakaocli delivers the command — we still
        // process it so the expense is logged (no KakaoTalk reply, but data is saved).
        if (isCommand) markProcessed(dedupeKey, CMD_TTL);

        // kakaocli ignores HTTP response body — enqueue so MessengerBot R picks up via /dequeue.
        // MessengerBot R reads the reply directly from the HTTP response body.
        const isKakaocli = isFromKakaocli(events[0] as KakaoEvent);
        const sendKakaoReply = (...msgs: string[]) => {
            const valid = msgs.filter(Boolean);
            console.log(`📨 KAKAO sendReply | isKakaocli=${isKakaocli} | count=${valid.length} | chat=${sourceId}`);
            if (isKakaocli) {
                valid.forEach(m => enqueueKakaoMessage(sourceId, m));
                res.sendStatus(200);
            } else if (valid.length === 1) {
                console.log(`📨 KAKAO inline reply | chat=${sourceId} | text=${valid[0].slice(0, 40)}`);
                res.json({ reply: valid[0] });
            } else if (valid.length > 1) {
                // Multi-part replies: enqueue so MessengerBot R delivers them one-per-poll via
                // /dequeue. Sending them inline as { replies } made the script fire msg.reply()
                // back-to-back with no gap, so KakaoTalk dropped or duplicated them. The queue is
                // persisted and drains one message at a time (text + __IMAGE__ both handled).
                valid.forEach(m => enqueueKakaoMessage(sourceId, m));
                res.sendStatus(200);
            } else {
                res.sendStatus(200);
            }
        };

        if (text && sourceId) {
            // /exp commands work even when is_from_me (staff sending from KakaoTalk)
            if (text.startsWith('/exp')) {
                const leadUid = getLeadUid(kakaoSourceKey(sourceId));
                const expSenderId = (events[0] as KakaoEvent).sender_id != null ? String((events[0] as KakaoEvent).sender_id) : '';
                const expSenderName = parseSenderName(events[0] as KakaoEvent);
                const kakaoChatName = (events[0] as KakaoEvent).chat_name || kakaoSourceKey(sourceId);

                const replyMessages: string[] = [];
                await handleExpCommand(
                    'kakao',
                    kakaoSourceKey(sourceId),
                    kakaoChatName,
                    expSenderId,
                    leadUid,
                    text,
                    async (msg) => { replyMessages.push(msg); },
                    expSenderName
                );
                sendKakaoReply(...replyMessages);
                return;
            }

            if (!event.is_from_me) {
            if (text === '/ckout' || text === '/ckout exp') {
                const leadUid = getLeadUid(kakaoSourceKey(sourceId));
                if (!leadUid) {
                    sendKakaoReply('❌ Group not linked. Use /link <lead_uid> first');
                    return;
                }
                if (text === '/ckout exp') {
                    const chatName = (events[0] as KakaoEvent).chat_name || '';
                    let replyMsg = '';
                    const had = await sendExpenseSummary(leadUid, async (msg) => { replyMsg = msg; }, `kakao:${(events[0] as KakaoEvent).chat_id}`);
                    if (!had) { res.sendStatus(200); return; }
                    const payMsg = await getScheduledMessage('payment_reminder', 'KR');
                    sendKakaoReply(replyMsg + (payMsg ? '\n\n' + payMsg : ''));
                    console.log(`✅ KAKAO /ckout exp sent → ${chatName || sourceId}`);
                    return;
                }
                const message = await getScheduledMessage('checkout_reminder', 'KR');
                sendKakaoReply(message || '❌ Checkout message not found in Sheets');
                if (message) console.log(`✅ KAKAO /ckout sent → ${sourceId}`);
                return;
            }

            if (text === '/ckin') {
                const leadUid = getLeadUid(kakaoSourceKey(sourceId));
                if (!leadUid) {
                    sendKakaoReply('❌ Group not linked. Use /link <lead_uid> first');
                    return;
                }
                try {
                    const lead = await withTimeout(fetchLead(leadUid), 5000, 'fetchLead');
                    const propertyName = lead?.propertyName || lead?.unit?.name || '';
                    const tipKeys = skipsBreakfast(propertyName) ? ['food_tips', 'van_tips'] : ['breakfast_tips', 'food_tips', 'van_tips'];
                    const replies: string[] = [];
                    for (const key of tipKeys) {
                        const msg = await getTipsMessage(key, 'KR');
                        if (msg) replies.push(msg);
                    }
                    const rules = await getTipsMessage('guest_rules', 'KR');
                    if (rules) replies.push(rules);
                    sendKakaoReply(...replies);
                    console.log(`✅ KAKAO /ckin sent → ${sourceId}`);
                } catch (e: any) {
                    console.error('❌ KAKAO /ckin error:', e?.message);
                    sendKakaoReply('❌ Failed to send check-in messages');
                }
                return;
            }

            const linkMatch = text.match(/^\/link\s+([^\s]+)(?:\s+(welcome))?\s*$/i);
            if (linkMatch) {
                const leadUid = linkMatch[1];
                const sendWelcome = linkMatch[2]?.toLowerCase() === 'welcome';
                linkGroup(kakaoSourceKey(sourceId), leadUid);
                if (event.chat_name) saveKakaoChatName(sourceId, event.chat_name);
                console.log(`🔗 KAKAO linked: ${kakaoSourceKey(sourceId)} → ${leadUid}`);

                const chatName = event.chat_name || getKakaoChatName(sourceId) || '';

                let lead: any = null;
                let groupNameSuggestion = '';
                let propCode = '';
                try {
                    lead = await withTimeout(fetchLead(leadUid), 5000, 'fetchLead');
                    const name = guestName(lead?.guestInformation);
                    propCode = propertyCodeFromName(lead?.propertyName || lead?.unit?.name || '');
                    groupNameSuggestion = buildBookingGroupName(lead, null, name);
                } catch (e: any) {
                    console.error('❌ KAKAO /link lead fetch:', e?.message);
                }

                if (sendWelcome) {
                    try {
                        const msgs = await getMessages('KR');
                        const replies: string[] = [];
                        if (groupNameSuggestion) {
                            replies.push(`✅ Linked! Property: ${propCode}. Please rename this group to:`);
                            replies.push(groupNameSuggestion);
                        } else {
                            replies.push('✅ Linked!');
                        }
                        const bm = msgs['brand_msg']?.replace(/\\n/g, '\n') || '';
                        const cu = msgs['business_card_url'] || '';
                        const im = msgs['intro_msg']?.replace(/\\n/g, '\n') || '';
                        if (bm) replies.push(bm);
                        if (cu.startsWith('http')) replies.push(`__IMAGE__${cu}`);
                        if (im && im !== bm) replies.push(im);
                        sendKakaoReply(...replies);
                        console.log(`✅ KAKAO /link welcome sent → ${chatName}`);
                    } catch (e: any) {
                        sendKakaoReply('✅ Linked! (welcome fetch failed)');
                    }
                } else if (groupNameSuggestion) {
                    sendKakaoReply(
                        `✅ Linked! Property: ${propCode}. Please rename this group to:`,
                        groupNameSuggestion
                    );
                } else {
                    sendKakaoReply('✅ Linked!');
                }

                const alertName = lead ? guestName(lead?.guestInformation) : '(unavailable)';
                const alertCheckIn = lead ? formatSeoulDate(lead?.checkInLocalDateTime) : '(unavailable)';
                sendAlert(
                    `🔗 <b>KAKAO Linked</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${alertName}\n` +
                    `📅 <b>Check-in:</b> ${alertCheckIn}\n` +
                    `🔑 <b>Lead UID:</b> <code>${leadUid}</code>\n` +
                    `📱 <b>Platform:</b> KAKAO\n` +
                    `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                    { telegramOnly: true, platform: 'KAKAO', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: propCode || undefined }
                ).catch(e => console.error('❌ KAKAO /link alert error:', e?.message));
                return;
            }
            if (text === '/welcome') {
                const leadUid = getLeadUid(kakaoSourceKey(sourceId));
                if (!leadUid) {
                    sendKakaoReply('❌ Group not linked. Use /link <lead_uid> first');
                    return;
                }
                const chatName = event.chat_name || getKakaoChatName(sourceId) || '';
                try {
                    const msgs = await getMessages('KR');
                    const replies: string[] = [];
                    const bm = msgs['brand_msg']?.replace(/\\n/g, '\n') || '';
                    const cu = msgs['business_card_url'] || '';
                    const im = msgs['intro_msg']?.replace(/\\n/g, '\n') || '';
                    if (bm) replies.push(bm);
                    if (cu.startsWith('http')) replies.push(`__IMAGE__${cu}`);
                    if (im && im !== bm) replies.push(im);
                    sendKakaoReply(...replies);
                    console.log(`✅ KAKAO /welcome sent → ${chatName || sourceId}`);
                    withTimeout(fetchLead(leadUid), 5000, 'fetchLead').then(async lead => {
                        const name = guestName(lead?.guestInformation);
                        const property = await resolvePropertyNameForLead(lead);
                        return sendAlert(
                            `👋 <b>KakaoTalk Welcome Sent</b>\n─────────────────\n` +
                            `👤 <b>Guest:</b> ${name}\n` +
                            `🏠 <b>Property:</b> ${property}\n` +
                            `📱 <b>Platform:</b> KakaoTalk\n` +
                            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                            { platform: 'KAKAO', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: propertyCodeFromName(property) || undefined }
                        );
                    }).catch(e => console.error('❌ KAKAO /welcome alert error:', e?.message));
                } catch (e: any) {
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
            if (event.is_from_me) continue;
            const text = parseText(event);
            const sourceId = parseSourceId(event);
            if (!text || !sourceId) continue;
            if (text.startsWith('/exp')) continue; // handled in sync block above

            const key = mergeKey(event);

            if (isFromKakaocli(event)) {
                // kakaocli is sender_id enrichment only — skip commands
                const isCmd = text.startsWith('/exp') || text === '/ckout' || text === '/ckout exp' ||
                    text === '/ckin' || /^\/link\s+/i.test(text) || text === '/welcome';
                if (isCmd) continue;

                const buffered = mergeBuffer.get(key);
                if (buffered) {
                    // MessengerBot R arrived first — enrich with sender_id and process
                    clearTimeout(buffered.timer);
                    mergeBuffer.delete(key);
                    buffered.event.sender_id = event.sender_id;
                    markProcessed(key);
                    await runDetection(buffered.event);
                } else if (!recentlyProcessed.has(key)) {
                    // kakaocli arrived alone (MessengerBot R not running or delayed beyond window)
                    markProcessed(key);
                    await runDetection(event);
                }
            } else {
                // MessengerBot R arrived — buffer for 1.5s waiting for kakaocli enrichment
                if (recentlyProcessed.has(key)) continue;
                if (mergeBuffer.has(key)) continue; // timer already running — don't reset it
                const timer = setTimeout(async () => {
                    mergeBuffer.delete(key);
                    markProcessed(key);
                    await runDetection(event).catch((e: any) =>
                        console.error('❌ KAKAO buffer timeout error:', e?.message));
                }, 1500);
                mergeBuffer.set(key, { event, timer });
            }
        } catch (e: any) {
            const errMsg = e?.message || String(e);
            console.error('❌ KAKAO webhook handler error:', errMsg);
            await sendAlert(
                `⚠️ <b>KAKAO Handler Error</b>\n─────────────────\n` +
                `❌ <b>Error:</b> ${errMsg}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                { telegramOnly: true, platform: 'KAKAO' }
            ).catch(() => { });
        }
    }
});

// Outbound queue — scheduled messages enqueued here, MessengerBot R drains via GET /kakao/dequeue.
// Persisted to disk so queued scheduled messages survive a pm2 restart / crash (same pattern as the
// dedup file). An item may carry { groupKey, sentType }: the message is marked "sent" only when
// MessengerBot R actually dequeues it — not at enqueue time. If the bot is down, the item stays
// pending (undelivered) and the scheduler's missed-message alert fires instead of a silent loss.
interface KakaoOutboundItem { chat_id: string; text: string; groupKey?: string; sentType?: MessageType; }
const QUEUE_FILE = path.join(process.cwd(), 'kakao-outbound-queue.json');
const kakaoOutboundQueue: KakaoOutboundItem[] = [];

function loadQueue(): void {
    try {
        const arr = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        if (Array.isArray(arr)) kakaoOutboundQueue.push(...arr);
    } catch { /* first run or corrupt — start empty */ }
}
function saveQueue(): void {
    try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(kakaoOutboundQueue), 'utf8'); } catch { /* non-fatal */ }
}
loadQueue();

export function enqueueKakaoMessage(
    chatId: string,
    text: string,
    opts?: { groupKey?: string; sentType?: MessageType }
): void {
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
export function isKakaoQueued(groupKey: string, sentType: MessageType): boolean {
    return kakaoOutboundQueue.some(i => i.groupKey === groupKey && i.sentType === sentType);
}

// Remove pending scheduled items for a group+type — called when the scheduler declares the message
// "missed" (server was down past the send window) so it won't auto-deliver later after the team has
// already sent it manually.
export function dropKakaoQueued(groupKey: string, sentType: MessageType): number {
    let removed = 0;
    for (let i = kakaoOutboundQueue.length - 1; i >= 0; i--) {
        if (kakaoOutboundQueue[i].groupKey === groupKey && kakaoOutboundQueue[i].sentType === sentType) {
            kakaoOutboundQueue.splice(i, 1);
            removed++;
        }
    }
    if (removed) saveQueue();
    return removed;
}

// GET /dequeue?peek=1 — return first item WITHOUT removing (MessengerBot R must POST /dequeue/ack to confirm delivery).
// GET /dequeue       — legacy: shift + return in one call (old script compat, not used by new script).
router.get('/dequeue', (req, res) => {
    recordKakaoHeartbeat();
    if (req.query.peek === '1') {
        const item = kakaoOutboundQueue[0];
        if (item) console.log(`🔍 KAKAO dequeue peek | q=${kakaoOutboundQueue.length} | item=${item.chat_id}:${item.text.slice(0, 30)}`);
        res.json(item ? [{ chat_id: item.chat_id, text: item.text }] : []);
        return;
    }
    // Legacy shift-on-read path (kept for backward compat)
    const item = kakaoOutboundQueue.shift();
    if (item) {
        saveQueue();
        if (item.groupKey && item.sentType) markSent(item.groupKey, item.sentType);
    }
    if (item) console.log(`🔍 KAKAO dequeue legacy | q=${kakaoOutboundQueue.length} | item=${item.chat_id}:${item.text.slice(0, 30)}`);
    res.json(item ? [{ chat_id: item.chat_id, text: item.text }] : []);
});

// POST /dequeue/ack — remove the first item after MessengerBot R has successfully delivered it.
router.post('/dequeue/ack', (_req, res) => {
    const item = kakaoOutboundQueue.shift();
    if (item) {
        saveQueue();
        if (item.groupKey && item.sentType) markSent(item.groupKey, item.sentType);
        console.log(`✅ KAKAO dequeue ack | removed=${item.chat_id}:${item.text.slice(0, 30)} | q=${kakaoOutboundQueue.length}`);
    } else {
        console.log(`⚠️ KAKAO dequeue ack | queue was already empty`);
    }
    res.json({ ok: true });
});

router.post('/send', (req, res) => {
    const { chat_id, text } = req.body;
    if (!chat_id || !text) return res.status(400).json({ error: 'Missing chat_id or text' });
    enqueueKakaoMessage(String(chat_id), text);
    res.json({ ok: true, queued: 1 });
});

router.post('/link', async (req, res) => {
    const { source_id, lead_uid } = req.body;
    if (!source_id || !lead_uid) {
        return res.status(400).json({ error: 'Missing source_id or lead_uid' });
    }

    linkGroup(kakaoSourceKey(source_id), lead_uid);
    await sendAlert(
        `🔗 <b>KAKAO Linked (API)</b>\n─────────────────\n` +
        `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
        `📱 <b>Platform:</b> KAKAO\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true, platform: 'KAKAO' }
    );
    return res.json({ success: true });
});

export default router;
