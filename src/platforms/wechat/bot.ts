import path from 'path';
import { FileBox } from 'file-box';
import { WechatferryAgent } from '@wechatferry/agent';
import { CONFIG } from '../../config/constants';
import { linkGroup, saveGroupLang, getGroupLang, getLeadUid } from '../../services/groupLeads';
import { sendAlert } from '../../services/notify';
import { fetchLead, resolvePropertyNameForLead } from '../../services/hostfully';
import { propertyCodeFromName } from '../whatsapp/groupNaming';
import { getScheduledMessage, getMessages } from '../../services/sheets';
import { guestName, formatSeoulDate } from '../../utils/format';
import { handleWeChatDetection } from './detection';
import { wechatSourceKey } from './utils';
import { handleExpCommand, sendExpenseSummary } from '../../services/expenses';
import { SupportedLang } from '../../services/llm';
import { LANG_MAP, groupGuestLang, groupTranslationOn, handleWeChatTranslation } from './translation';
import { isLeadExpired } from '../../services/bookingStore';
import { addToBuffer } from '../../services/messageBuffer';

const TEST_LEAD_UID = '70778c3a-d60b-4473-a597-a5d6292628f5';
const TEXT_MSG_TYPE = 1;
const QUOTED_REPLY_TYPE = 49;

// Quoted replies are type 49 XML. Extract only the new reply text from <title>.
function extractMessageText(msg: any): string {
    const raw = (msg.content ?? '').trim();
    if (msg.type === QUOTED_REPLY_TYPE && raw.includes('<refermsg>')) {
        const match = raw.match(/<title>([\s\S]*?)<\/title>/);
        return match?.[1]?.trim() ?? '';
    }
    return raw;
}

let _agent: WechatferryAgent | null = null;

export function getAgent(): WechatferryAgent {
    if (!_agent) throw new Error('WeChat agent not initialized — ENABLE_WECHAT may be false');
    return _agent;
}

export function isWeChatInitialized(): boolean {
    return _agent !== null;
}

function resolveSenderName(agent: WechatferryAgent, wxid: string): string {
    try {
        const contacts = agent.getContactList();
        const contact = contacts.find((c: { userName: string; }) => c.userName === wxid);
        return contact?.nickName || contact?.alias || contact?.remark || wxid;
    } catch {
        return wxid;
    }
}

function resolveRoomName(agent: WechatferryAgent, roomId: string): string {
    try {
        const contacts = agent.getContactList();
        const room = contacts.find((c: any) => c.userName === roomId);
        return room?.nickName || room?.remark || roomId;
    } catch {
        return roomId;
    }
}

export async function initWeChat(): Promise<void> {
    const agent = new WechatferryAgent();
    _agent = agent;

    agent.on('message', async (msg: any) => {
        try {
            console.log(`📨 WC raw | type=${msg.type} is_group=${msg.is_group} is_self=${msg.is_self} roomid=${msg.roomid} sender=${msg.sender} content=${String(msg.content ?? '').slice(0, 80)}`);

            // Handle plain text (type 1) and quoted replies (type 49)
            if (msg.type !== TEXT_MSG_TYPE && msg.type !== QUOTED_REPLY_TYPE) return;

            if (!msg.is_group) return;

            const roomId: string = msg.roomid ?? '';
            const text: string = extractMessageText(msg);
            // WechatFerry omits msg.sender on self-messages — fall back to COZMO's known wxid
            const senderWxid: string = (msg.is_self && !msg.sender) ? 'wxid_0u4ov1mylu8k22' : (msg.sender ?? '');

            if (!text || !roomId) return;

            const senderName = resolveSenderName(agent, senderWxid);

            // /members — dump all group member wxids (temporary diagnostic command)
            // Commands are processed before the is_self guard so the COZE guest care account can run them too
            if (text === '/members') {
                try {
                    const members = agent.getChatRoomMembers(roomId);
                    const lines = (members || []).map((m: any) => `${m.wxid || m.userName} → ${m.nickName || m.displayName || m.alias || '?'}`);
                    const reply = lines.length ? lines.join('\n') : 'No members found';
                    agent.sendText(roomId, `Members:\n${reply}`);
                } catch (e: any) {
                    agent.sendText(roomId, `Could not fetch members: ${e?.message}`);
                }
                return;
            }

            // /link <uid> [cn|jp|en|tw|th|welcome]
            const linkMatch = text.match(/^\/link\s+([^\s]+)(?:\s+([^\s]+))?\s*$/i);
            if (linkMatch) {
                const leadUid = linkMatch[1];
                const arg2 = linkMatch[2]?.toLowerCase();
                const sendWelcome = arg2 === 'welcome';
                const langArg = sendWelcome ? undefined : arg2;
                const requestedLang: SupportedLang | undefined = langArg ? LANG_MAP[langArg] : undefined;

                linkGroup(wechatSourceKey(roomId), leadUid);
                if (requestedLang) {
                    groupGuestLang.set(roomId, requestedLang);
                    groupTranslationOn.set(roomId, true);
                    saveGroupLang(roomId, requestedLang);
                }
                console.log(`🔗 WeChat linked: ${wechatSourceKey(roomId)} → ${leadUid}${requestedLang ? ` [${requestedLang}]` : ''}`);
                agent.sendText(roomId, `Linked.${requestedLang ? ` Translation: ${requestedLang}` : ''}${sendWelcome ? ' ⏳ Sending welcome...' : ''}`);

                fetchLead(leadUid).then(async lead => {
                    const name = guestName(lead?.guestInformation);
                    const checkIn = formatSeoulDate(lead?.checkInLocalDateTime);
                    const property = await resolvePropertyNameForLead(lead);
                    await sendAlert(
                        `🔗 <b>WeChat Linked</b>\n─────────────────\n` +
                        `👤 <b>Guest:</b> ${name}\n` +
                        `📅 <b>Check-in:</b> ${checkIn}\n` +
                        `🔑 <b>Lead UID:</b> <code>${leadUid}</code>\n` +
                        `🌐 <b>Translation:</b> ${requestedLang || 'not set'}\n` +
                        `📱 <b>Platform:</b> WeChat\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                        { platform: 'WECHAT', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: propertyCodeFromName(property) || undefined }
                    );
                    if (sendWelcome) {
                        const lang = requestedLang || groupGuestLang.get(roomId) || 'ZH';
                        const msgs = await getMessages(lang);
                        if (msgs['brand_msg']) agent.sendText(roomId, msgs['brand_msg'].replace(/\\n/g, '\n'));
                        const cardPath = path.resolve(CONFIG.BUSINESS_CARD_PATH);
                        agent.sendImage(roomId, FileBox.fromFile(cardPath)).catch((e: any) => console.warn('⚠️ WeChat card send failed:', e?.message));
                        if (msgs['intro_msg']) agent.sendText(roomId, msgs['intro_msg'].replace(/\\n/g, '\n'));
                        console.log(`✅ WeChat /link welcome sent → ${roomId}`);
                    }
                }).catch(e => console.error('❌ WeChat /link error:', e?.message));
                return;
            }

            // /welcome — send welcome message to linked group
            if (text.startsWith('/welcome')) {
                const leadUid = getLeadUid(wechatSourceKey(roomId));
                if (!leadUid) {
                    agent.sendText(roomId, '❌ Group not linked. Use /link <lead_uid> first');
                    return;
                }
                try {
                    const lead = await fetchLead(leadUid);
                    const name = guestName(lead?.guestInformation);
                    const property = await resolvePropertyNameForLead(lead);
                    const lang = groupGuestLang.get(roomId) || 'ZH';
                    const msgs = await getMessages(lang);

                    if (msgs['brand_msg']) agent.sendText(roomId, msgs['brand_msg'].replace(/\\n/g, '\n'));
                    const cardPath = path.resolve(CONFIG.BUSINESS_CARD_PATH);
                    agent.sendImage(roomId, FileBox.fromFile(cardPath)).catch((e: any) => console.warn('⚠️ WeChat card send failed:', e?.message));
                    if (msgs['intro_msg']) agent.sendText(roomId, msgs['intro_msg'].replace(/\\n/g, '\n'));

                    console.log(`✅ WeChat /welcome sent → ${roomId} [lang=${lang}]`);
                    await sendAlert(
                        `👋 <b>WeChat Welcome Sent</b>\n─────────────────\n` +
                        `👤 <b>Guest:</b> ${name}\n` +
                        `🏠 <b>Property:</b> ${property}\n` +
                        `📱 <b>Platform:</b> WeChat\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                        { platform: 'WECHAT', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: propertyCodeFromName(property) || undefined }
                    );
                } catch (e: any) {
                    console.error('❌ WeChat /welcome error:', e?.message);
                    agent.sendText(roomId, `❌ Failed to send welcome: ${e?.message}`);
                }
                return;
            }

            // /exp — expense logging
            if (text.startsWith('/exp')) {
                const leadUid = getLeadUid(wechatSourceKey(roomId));
                await handleExpCommand(
                    'wechat',
                    wechatSourceKey(roomId),
                    resolveRoomName(agent, roomId),
                    senderWxid,
                    leadUid,
                    text,
                    async (m) => { agent.sendText(roomId, m); },
                    senderName
                );
                return;
            }

            // /ckout — send checkout reminder to this group
            if (text === '/ckout' || text === '/ckout exp') {
                const leadUid = getLeadUid(wechatSourceKey(roomId));
                if (!leadUid) {
                    agent.sendText(roomId, '❌ Group not linked. Use /link <lead_uid> first');
                    return;
                }
                if (text === '/ckout exp') {
                    const had = await sendExpenseSummary(leadUid, async (msg) => { agent.sendText(roomId, msg); }, `wechat:${roomId}`);
                    if (had) {
                        const payMsg = await getScheduledMessage('payment_reminder', 'ZH');
                        if (payMsg) agent.sendText(roomId, payMsg);
                        console.log(`✅ WeChat /ckout exp sent → ${roomId}`);
                    }
                    return;
                }
                const message = await getScheduledMessage('checkout_reminder', 'ZH');
                if (message) {
                    agent.sendText(roomId, message);
                    console.log(`✅ WeChat /ckout sent → ${roomId}`);
                } else {
                    agent.sendText(roomId, '❌ Checkout message not found in Sheets');
                }
                return;
            }

            // /trans [cn|jp|en|tw|th|on|off]
            if (text.startsWith('/trans')) {
                const arg = text.split(' ')[1]?.toLowerCase().trim();
                if (!arg) {
                    const cur = groupGuestLang.get(roomId);
                    const on = groupTranslationOn.get(roomId) !== false;
                    agent.sendText(roomId, `Translation: ${cur ? `${cur} (${on ? 'ON' : 'OFF'})` : 'not set'}`);
                } else if (arg === 'off') {
                    groupTranslationOn.set(roomId, false);
                    agent.sendText(roomId, 'Translation paused. /trans on to resume.');
                } else if (arg === 'on') {
                    groupTranslationOn.set(roomId, true);
                    const lang = groupGuestLang.get(roomId);
                    agent.sendText(roomId, lang ? `Translation resumed: ${lang}` : 'No language set. Use /trans cn first.');
                } else {
                    const newLang = LANG_MAP[arg];
                    if (newLang) {
                        groupGuestLang.set(roomId, newLang);
                        groupTranslationOn.set(roomId, true);
                        saveGroupLang(roomId, newLang);
                        agent.sendText(roomId, `Translation set: ${newLang}`);
                        console.log(`🌐 WECHAT /trans [${newLang}] | room=${roomId}`);
                    } else {
                        agent.sendText(roomId, 'Unknown language. Use: cn, jp, tw, th, en');
                    }
                }
                return;
            }

            // Skip self-messages for detection/translation — commands above already handled
            if (msg.is_self) return;
            addToBuffer(wechatSourceKey(roomId), senderName, text);

            // Restore persisted lang for this room if not in memory
            if (!groupGuestLang.has(roomId)) {
                const persisted = getGroupLang(roomId);
                if (persisted) {
                    groupGuestLang.set(roomId, persisted as SupportedLang);
                    groupTranslationOn.set(roomId, true);
                }
            }

            // Translation (runs for both staff and guest messages)
            const guestLang = groupGuestLang.get(roomId);
            const translationActive = !!(guestLang && groupTranslationOn.get(roomId) !== false);
            const isCozmoReply = /^\[(?:EN|JA|ZH-CN|ZH-TW|TH)\]/.test(text);
            if (translationActive && guestLang && !isCozmoReply) {
                await handleWeChatTranslation(roomId, text, senderWxid, senderName, agent, guestLang);
            }

            const wcLeadUid = getLeadUid(wechatSourceKey(roomId));
            if (wcLeadUid && isLeadExpired(wcLeadUid)) return;
            await handleWeChatDetection(roomId, text, senderName);
        } catch (e: any) {
            console.error('❌ WeChat message handler error:', e?.message);
        }
    });

    // Suppress WechatFerry's internal "not connected" spam — it bypasses console.error
    // and writes directly to stderr, so we intercept at the stream level
    const _origStderrWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = (chunk: any, ...args: any[]) => {
        const text = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
        if (text.includes('WechatferryCore is not connected')) return true;
        return _origStderrWrite(chunk, ...args);
    };

    const RETRY_DELAY_MS = 15000;
    const MAX_RETRIES = 20;
    let attempt = 0;
    let disconnectAlerted = false;

    const tryStart = async (): Promise<void> => {
        attempt++;
        try {
            agent.start();
            console.log('🤖 WeChat agent started — connected to WeChat PC');
            disconnectAlerted = false;
            startHealthMonitor();
        } catch (e: any) {
            console.warn(`⚠️ WeChat connect attempt ${attempt}/${MAX_RETRIES} failed: ${e?.message}`);
            if (attempt < MAX_RETRIES) {
                console.log(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s — keep WeChat PC open...`);
                setTimeout(tryStart, RETRY_DELAY_MS);
            } else {
                console.error('❌ WeChat gave up after max retries — open WeChat PC, log in, then run: .\\scripts\\restart.ps1');
                sendAlert(
                    `⚠️ WeChat failed to connect after ${MAX_RETRIES} attempts\n` +
                    `Open WeChat PC and run: <code>pm2 restart cozmo-bridge</code>`,
                    { telegramOnly: true }
                ).catch(() => {});
            }
        }
    };

    // Checks every 60s whether WeChat PC is still connected; alerts once on disconnect
    function startHealthMonitor(): void {
        const interval = setInterval(() => {
            try {
                const contacts = agent.getContactList();
                if (contacts && contacts.length > 0) {
                    disconnectAlerted = false;
                    return;
                }
                throw new Error('empty contact list');
            } catch {
                if (!disconnectAlerted) {
                    disconnectAlerted = true;
                    console.warn('⚠️ WeChat disconnected — sending alert');
                    sendAlert(
                        `⚠️ <b>WeChat Disconnected</b>\n─────────────────\n` +
                        `Open WeChat PC and log in, then run:\n<code>.\\scripts\\restart.ps1</code>\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                        { telegramOnly: true }
                    ).catch(() => {});
                    clearInterval(interval);
                }
            }
        }, 60_000);
    }

    tryStart();
}
