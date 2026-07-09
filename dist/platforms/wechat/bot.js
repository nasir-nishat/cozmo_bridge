"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgent = getAgent;
exports.isWeChatInitialized = isWeChatInitialized;
exports.initWeChat = initWeChat;
const path_1 = __importDefault(require("path"));
const file_box_1 = require("file-box");
const agent_1 = require("@wechatferry/agent");
const constants_1 = require("../../config/constants");
const groupLeads_1 = require("../../services/groupLeads");
const notify_1 = require("../../services/notify");
const hostfully_1 = require("../../services/hostfully");
const groupNaming_1 = require("../whatsapp/groupNaming");
const sheets_1 = require("../../services/sheets");
const format_1 = require("../../utils/format");
const detection_1 = require("./detection");
const utils_1 = require("./utils");
const expenses_1 = require("../../services/expenses");
const translation_1 = require("./translation");
const bookingStore_1 = require("../../services/bookingStore");
const messageBuffer_1 = require("../../services/messageBuffer");
const TEST_LEAD_UID = '70778c3a-d60b-4473-a597-a5d6292628f5';
const TEXT_MSG_TYPE = 1;
const QUOTED_REPLY_TYPE = 49;
// Quoted replies are type 49 XML. Extract only the new reply text from <title>.
function extractMessageText(msg) {
    const raw = (msg.content ?? '').trim();
    if (msg.type === QUOTED_REPLY_TYPE && raw.includes('<refermsg>')) {
        const match = raw.match(/<title>([\s\S]*?)<\/title>/);
        return match?.[1]?.trim() ?? '';
    }
    return raw;
}
let _agent = null;
function getAgent() {
    if (!_agent)
        throw new Error('WeChat agent not initialized — ENABLE_WECHAT may be false');
    return _agent;
}
function isWeChatInitialized() {
    return _agent !== null;
}
function resolveSenderName(agent, wxid) {
    try {
        const contacts = agent.getContactList();
        const contact = contacts.find((c) => c.userName === wxid);
        return contact?.nickName || contact?.alias || contact?.remark || wxid;
    }
    catch {
        return wxid;
    }
}
function resolveRoomName(agent, roomId) {
    try {
        const contacts = agent.getContactList();
        const room = contacts.find((c) => c.userName === roomId);
        return room?.nickName || room?.remark || roomId;
    }
    catch {
        return roomId;
    }
}
async function initWeChat() {
    const agent = new agent_1.WechatferryAgent();
    _agent = agent;
    agent.on('message', async (msg) => {
        try {
            console.log(`📨 WC raw | type=${msg.type} is_group=${msg.is_group} is_self=${msg.is_self} roomid=${msg.roomid} sender=${msg.sender} content=${String(msg.content ?? '').slice(0, 80)}`);
            // Handle plain text (type 1) and quoted replies (type 49)
            if (msg.type !== TEXT_MSG_TYPE && msg.type !== QUOTED_REPLY_TYPE)
                return;
            if (!msg.is_group)
                return;
            const roomId = msg.roomid ?? '';
            const text = extractMessageText(msg);
            // WechatFerry omits msg.sender on self-messages — fall back to COZMO's known wxid
            const senderWxid = (msg.is_self && !msg.sender) ? 'wxid_0u4ov1mylu8k22' : (msg.sender ?? '');
            if (!text || !roomId)
                return;
            const senderName = resolveSenderName(agent, senderWxid);
            // /members — dump all group member wxids (temporary diagnostic command)
            // Commands are processed before the is_self guard so the COZE guest care account can run them too
            if (text === '/members') {
                try {
                    const members = agent.getChatRoomMembers(roomId);
                    const lines = (members || []).map((m) => `${m.wxid || m.userName} → ${m.nickName || m.displayName || m.alias || '?'}`);
                    const reply = lines.length ? lines.join('\n') : 'No members found';
                    agent.sendText(roomId, `Members:\n${reply}`);
                }
                catch (e) {
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
                const requestedLang = langArg ? translation_1.LANG_MAP[langArg] : undefined;
                (0, groupLeads_1.linkGroup)((0, utils_1.wechatSourceKey)(roomId), leadUid);
                if (requestedLang) {
                    translation_1.groupGuestLang.set(roomId, requestedLang);
                    translation_1.groupTranslationOn.set(roomId, true);
                    (0, groupLeads_1.saveGroupLang)(roomId, requestedLang);
                }
                console.log(`🔗 WeChat linked: ${(0, utils_1.wechatSourceKey)(roomId)} → ${leadUid}${requestedLang ? ` [${requestedLang}]` : ''}`);
                agent.sendText(roomId, `Linked.${requestedLang ? ` Translation: ${requestedLang}` : ''}${sendWelcome ? ' ⏳ Sending welcome...' : ''}`);
                (0, hostfully_1.fetchLead)(leadUid).then(async (lead) => {
                    const name = (0, format_1.guestName)(lead?.guestInformation);
                    const checkIn = (0, format_1.formatSeoulDate)(lead?.checkInLocalDateTime);
                    const property = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
                    await (0, notify_1.sendAlert)(`🔗 <b>WeChat Linked</b>\n─────────────────\n` +
                        `👤 <b>Guest:</b> ${name}\n` +
                        `📅 <b>Check-in:</b> ${checkIn}\n` +
                        `🔑 <b>Lead UID:</b> <code>${leadUid}</code>\n` +
                        `🌐 <b>Translation:</b> ${requestedLang || 'not set'}\n` +
                        `📱 <b>Platform:</b> WeChat\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'WECHAT', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined });
                    if (sendWelcome) {
                        const lang = requestedLang || translation_1.groupGuestLang.get(roomId) || 'ZH';
                        const msgs = await (0, sheets_1.getMessages)(lang);
                        if (msgs['brand_msg'])
                            agent.sendText(roomId, msgs['brand_msg'].replace(/\\n/g, '\n'));
                        const cardPath = path_1.default.resolve(constants_1.CONFIG.BUSINESS_CARD_PATH);
                        agent.sendImage(roomId, file_box_1.FileBox.fromFile(cardPath)).catch((e) => console.warn('⚠️ WeChat card send failed:', e?.message));
                        if (msgs['intro_msg'])
                            agent.sendText(roomId, msgs['intro_msg'].replace(/\\n/g, '\n'));
                        console.log(`✅ WeChat /link welcome sent → ${roomId}`);
                    }
                }).catch(e => console.error('❌ WeChat /link error:', e?.message));
                return;
            }
            // /welcome — send welcome message to linked group
            if (text.startsWith('/welcome')) {
                const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.wechatSourceKey)(roomId));
                if (!leadUid) {
                    agent.sendText(roomId, '❌ Group not linked. Use /link <lead_uid> first');
                    return;
                }
                try {
                    const lead = await (0, hostfully_1.fetchLead)(leadUid);
                    const name = (0, format_1.guestName)(lead?.guestInformation);
                    const property = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
                    const lang = translation_1.groupGuestLang.get(roomId) || 'ZH';
                    const msgs = await (0, sheets_1.getMessages)(lang);
                    if (msgs['brand_msg'])
                        agent.sendText(roomId, msgs['brand_msg'].replace(/\\n/g, '\n'));
                    const cardPath = path_1.default.resolve(constants_1.CONFIG.BUSINESS_CARD_PATH);
                    agent.sendImage(roomId, file_box_1.FileBox.fromFile(cardPath)).catch((e) => console.warn('⚠️ WeChat card send failed:', e?.message));
                    if (msgs['intro_msg'])
                        agent.sendText(roomId, msgs['intro_msg'].replace(/\\n/g, '\n'));
                    console.log(`✅ WeChat /welcome sent → ${roomId} [lang=${lang}]`);
                    await (0, notify_1.sendAlert)(`👋 <b>WeChat Welcome Sent</b>\n─────────────────\n` +
                        `👤 <b>Guest:</b> ${name}\n` +
                        `🏠 <b>Property:</b> ${property}\n` +
                        `📱 <b>Platform:</b> WeChat\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'WECHAT', useTestJandi: leadUid === TEST_LEAD_UID, propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined });
                }
                catch (e) {
                    console.error('❌ WeChat /welcome error:', e?.message);
                    agent.sendText(roomId, `❌ Failed to send welcome: ${e?.message}`);
                }
                return;
            }
            // /exp — expense logging
            if (text.startsWith('/exp')) {
                const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.wechatSourceKey)(roomId));
                await (0, expenses_1.handleExpCommand)('wechat', (0, utils_1.wechatSourceKey)(roomId), resolveRoomName(agent, roomId), senderWxid, leadUid, text, async (m) => { agent.sendText(roomId, m); }, senderName);
                return;
            }
            // /ckout — send checkout reminder to this group
            if (text === '/ckout' || text === '/ckout exp') {
                const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.wechatSourceKey)(roomId));
                if (!leadUid) {
                    agent.sendText(roomId, '❌ Group not linked. Use /link <lead_uid> first');
                    return;
                }
                if (text === '/ckout exp') {
                    const had = await (0, expenses_1.sendExpenseSummary)(leadUid, async (msg) => { agent.sendText(roomId, msg); }, `wechat:${roomId}`);
                    if (had) {
                        const payMsg = await (0, sheets_1.getScheduledMessage)('payment_reminder', 'ZH');
                        if (payMsg)
                            agent.sendText(roomId, payMsg);
                        console.log(`✅ WeChat /ckout exp sent → ${roomId}`);
                    }
                    return;
                }
                const message = await (0, sheets_1.getScheduledMessage)('checkout_reminder', 'ZH');
                if (message) {
                    agent.sendText(roomId, message);
                    console.log(`✅ WeChat /ckout sent → ${roomId}`);
                }
                else {
                    agent.sendText(roomId, '❌ Checkout message not found in Sheets');
                }
                return;
            }
            // /trans [cn|jp|en|tw|th|on|off]
            if (text.startsWith('/trans')) {
                const arg = text.split(' ')[1]?.toLowerCase().trim();
                if (!arg) {
                    const cur = translation_1.groupGuestLang.get(roomId);
                    const on = translation_1.groupTranslationOn.get(roomId) !== false;
                    agent.sendText(roomId, `Translation: ${cur ? `${cur} (${on ? 'ON' : 'OFF'})` : 'not set'}`);
                }
                else if (arg === 'off') {
                    translation_1.groupTranslationOn.set(roomId, false);
                    agent.sendText(roomId, 'Translation paused. /trans on to resume.');
                }
                else if (arg === 'on') {
                    translation_1.groupTranslationOn.set(roomId, true);
                    const lang = translation_1.groupGuestLang.get(roomId);
                    agent.sendText(roomId, lang ? `Translation resumed: ${lang}` : 'No language set. Use /trans cn first.');
                }
                else {
                    const newLang = translation_1.LANG_MAP[arg];
                    if (newLang) {
                        translation_1.groupGuestLang.set(roomId, newLang);
                        translation_1.groupTranslationOn.set(roomId, true);
                        (0, groupLeads_1.saveGroupLang)(roomId, newLang);
                        agent.sendText(roomId, `Translation set: ${newLang}`);
                        console.log(`🌐 WECHAT /trans [${newLang}] | room=${roomId}`);
                    }
                    else {
                        agent.sendText(roomId, 'Unknown language. Use: cn, jp, tw, th, en');
                    }
                }
                return;
            }
            // Skip self-messages for detection/translation — commands above already handled
            if (msg.is_self)
                return;
            (0, messageBuffer_1.addToBuffer)((0, utils_1.wechatSourceKey)(roomId), senderName, text);
            // Restore persisted lang for this room if not in memory
            if (!translation_1.groupGuestLang.has(roomId)) {
                const persisted = (0, groupLeads_1.getGroupLang)(roomId);
                if (persisted) {
                    translation_1.groupGuestLang.set(roomId, persisted);
                    translation_1.groupTranslationOn.set(roomId, true);
                }
            }
            // Translation (runs for both staff and guest messages)
            const guestLang = translation_1.groupGuestLang.get(roomId);
            const translationActive = !!(guestLang && translation_1.groupTranslationOn.get(roomId) !== false);
            const isCozmoReply = /^\[(?:EN|JA|ZH-CN|ZH-TW|TH)\]/.test(text);
            if (translationActive && guestLang && !isCozmoReply) {
                await (0, translation_1.handleWeChatTranslation)(roomId, text, senderWxid, senderName, agent, guestLang);
            }
            const wcLeadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.wechatSourceKey)(roomId));
            if (wcLeadUid && (0, bookingStore_1.isLeadExpired)(wcLeadUid))
                return;
            await (0, detection_1.handleWeChatDetection)(roomId, text, senderName);
        }
        catch (e) {
            console.error('❌ WeChat message handler error:', e?.message);
        }
    });
    // Suppress WechatFerry's internal "not connected" spam — it bypasses console.error
    // and writes directly to stderr, so we intercept at the stream level
    const _origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...args) => {
        const text = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
        if (text.includes('WechatferryCore is not connected'))
            return true;
        return _origStderrWrite(chunk, ...args);
    };
    const RETRY_DELAY_MS = 15000;
    const MAX_RETRIES = 20;
    let attempt = 0;
    let disconnectAlerted = false;
    const tryStart = async () => {
        attempt++;
        try {
            agent.start();
            console.log('🤖 WeChat agent started — connected to WeChat PC');
            disconnectAlerted = false;
            startHealthMonitor();
        }
        catch (e) {
            console.warn(`⚠️ WeChat connect attempt ${attempt}/${MAX_RETRIES} failed: ${e?.message}`);
            if (attempt < MAX_RETRIES) {
                console.log(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s — keep WeChat PC open...`);
                setTimeout(tryStart, RETRY_DELAY_MS);
            }
            else {
                console.error('❌ WeChat gave up after max retries — open WeChat PC, log in, then run: .\\scripts\\restart.ps1');
                (0, notify_1.sendAlert)(`⚠️ WeChat failed to connect after ${MAX_RETRIES} attempts\n` +
                    `Open WeChat PC and run: <code>pm2 restart cozmo-bridge</code>`, { telegramOnly: true }).catch(() => { });
            }
        }
    };
    // Checks every 60s whether WeChat PC is still connected; alerts once on disconnect
    function startHealthMonitor() {
        const interval = setInterval(() => {
            try {
                const contacts = agent.getContactList();
                if (contacts && contacts.length > 0) {
                    disconnectAlerted = false;
                    return;
                }
                throw new Error('empty contact list');
            }
            catch {
                if (!disconnectAlerted) {
                    disconnectAlerted = true;
                    console.warn('⚠️ WeChat disconnected — sending alert');
                    (0, notify_1.sendAlert)(`⚠️ <b>WeChat Disconnected</b>\n─────────────────\n` +
                        `Open WeChat PC and log in, then run:\n<code>.\\scripts\\restart.ps1</code>\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true }).catch(() => { });
                    clearInterval(interval);
                }
            }
        }, 60000);
    }
    tryStart();
}
