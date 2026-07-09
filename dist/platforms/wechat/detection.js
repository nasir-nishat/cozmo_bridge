"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWeChatDetection = handleWeChatDetection;
const constants_1 = require("../../config/constants");
const groupLeads_1 = require("../../services/groupLeads");
const hostfully_1 = require("../../services/hostfully");
const groupNaming_1 = require("../whatsapp/groupNaming");
const requestDetection_1 = require("../../services/requestDetection");
const notify_1 = require("../../services/notify");
const format_1 = require("../../utils/format");
const utils_1 = require("./utils");
const wechat_1 = require("../../services/wechat");
const autoReplyPipeline_1 = require("../../knowledge/autoReplyPipeline");
const bookingStore_1 = require("../../services/bookingStore");
const CANCELLATION_HINT_REGEX = /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now|괜찮아요|취소|필요없어|没关系|不用了|キャンセル|大丈夫)\b/i;
const sourceDebounce = new Map();
async function handleWeChatDetection(roomId, text, senderName) {
    const isTeamMember = /coze|gaya/i.test(senderName);
    if (isTeamMember) {
        console.log(`⏭️ WECHAT team member skip | name=${senderName}`);
        return;
    }
    const isCancellationHint = CANCELLATION_HINT_REGEX.test(text);
    const now = Date.now();
    const lastProcessed = sourceDebounce.get(roomId) || 0;
    if (!isCancellationHint && now - lastProcessed < 30000) {
        console.log(`⏭️ WECHAT debounce skip | room=${roomId}`);
        return;
    }
    sourceDebounce.set(roomId, now);
    const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.wechatSourceKey)(roomId));
    if (!leadUid) {
        console.log(`⏭️ WECHAT unlinked room skip | room=${roomId}`);
        return;
    }
    const { result, usedHistoryFallback, saveToHostfully } = await (0, requestDetection_1.detectGuestIntentWithContext)({
        platform: 'wechat',
        sourceId: roomId,
        text,
        senderName,
        isCancellationHint,
        historyFallbackEnabled: constants_1.CONFIG.WECHAT_HISTORY_FALLBACK_ENABLED,
        historyContextSize: constants_1.CONFIG.WECHAT_HISTORY_CONTEXT_SIZE,
    });
    if (usedHistoryFallback && result) {
        console.log(`🧠 WECHAT history fallback matched | room=${roomId} | result=${result.slice(0, 80)}`);
    }
    if (!result) {
        console.log(`⏭️ WECHAT no actionable intent | room=${roomId}`);
        const booking = (0, bookingStore_1.getBookingByLeadUid)(leadUid);
        const propertyCode = booking?.property ? (0, groupNaming_1.propertyCodeFromName)(booking.property) || undefined : undefined;
        if ((0, autoReplyPipeline_1.shouldAttemptAutoReply)(text, propertyCode)) {
            (0, autoReplyPipeline_1.runAutoReplyPipeline)({
                leadUid,
                platform: 'wechat',
                guestMessage: text,
                propertyCode,
                sendReply: async (reply) => { await (0, wechat_1.wechatSendText)(roomId, reply); },
            }).catch(e => console.error('❌ WECHAT auto-reply pipeline error:', e?.message));
        }
        return;
    }
    let lead;
    try {
        lead = await (0, hostfully_1.fetchLead)(leadUid);
    }
    catch (e) {
        if (e.status === 404) {
            console.warn(`⚠️ WECHAT lead not in HF | leadUid=${leadUid} | skipping alert`);
            return;
        }
        throw e;
    }
    const info = lead?.guestInformation;
    const name = (0, format_1.guestName)(info);
    const propertyName = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
    const propertyCode = (0, groupNaming_1.propertyCodeFromName)(propertyName) || undefined;
    const today = new Date();
    const checkIn = lead?.checkInLocalDateTime ? new Date(lead.checkInLocalDateTime) : null;
    const isPostCheckIn = checkIn && today >= checkIn;
    if (saveToHostfully && !isPostCheckIn)
        await (0, hostfully_1.saveGuestNote)(leadUid, result);
    const isTestLead = leadUid === '70778c3a-d60b-4473-a597-a5d6292628f5';
    if (result.startsWith('CANCELLED:')) {
        const cancelledText = result.replace(/^CANCELLED:\s*/i, '').trim() || 'Previous request';
        await (0, notify_1.sendAlert)(`🚫 <b>Cancelled</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Cancelled:</b> ${cancelledText}\n` +
            `📱 <b>Platform:</b> WeChat\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'WECHAT', useTestJandi: isTestLead, propertyCode });
    }
    else {
        await (0, notify_1.sendAlert)(`💬 <b>New Request</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Request:</b> ${result}\n` +
            `📱 <b>Platform:</b> WeChat\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'WECHAT', useTestJandi: isTestLead, propertyCode });
        (0, autoReplyPipeline_1.runAutoReplyPipeline)({
            leadUid,
            platform: 'wechat',
            guestMessage: text,
            propertyCode,
            sendReply: async (reply) => { await (0, wechat_1.wechatSendText)(roomId, reply); },
        }).catch(e => console.error('❌ WECHAT auto-reply pipeline error:', e?.message));
    }
    console.log(`✅ WECHAT alert sent | lead=${leadUid}`);
}
