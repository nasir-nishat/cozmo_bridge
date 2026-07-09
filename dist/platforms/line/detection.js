"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLineDetection = handleLineDetection;
const constants_1 = require("../../config/constants");
const groupLeads_1 = require("../../services/groupLeads");
const lineClient_1 = require("./lineClient");
const autoReplyPipeline_1 = require("../../knowledge/autoReplyPipeline");
const format_1 = require("../../utils/format");
const hostfully_1 = require("../../services/hostfully");
const groupNaming_1 = require("../whatsapp/groupNaming");
const notify_1 = require("../../services/notify");
const requestDetection_1 = require("../../services/requestDetection");
const bookingStore_1 = require("../../services/bookingStore");
const CANCELLATION_HINT_REGEX = /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now|괜찮아요|취소|필요없어|没关系|不用了|キャンセル|大丈夫)\b/i;
const groupDebounce = new Map();
async function handleLineDetection(sourceId, text, senderName) {
    const isTeamMember = /coze|gaya/i.test(senderName);
    if (isTeamMember) {
        console.log(`⏭️ LINE team member intent skip | name=${senderName}`);
        return;
    }
    const isCancellationHint = CANCELLATION_HINT_REGEX.test(text);
    const now = Date.now();
    const lastProcessed = groupDebounce.get(sourceId) || 0;
    if (!isCancellationHint && now - lastProcessed < 30000) {
        console.log(`⏭️ LINE debounce skip | source=${sourceId}`);
        return;
    }
    groupDebounce.set(sourceId, now);
    const leadUid = (0, groupLeads_1.getLeadUid)((0, lineClient_1.lineGroupKey)(sourceId));
    if (!leadUid) {
        console.log(`⏭️ LINE unlinked source skip | source=${sourceId}`);
        return;
    }
    const { result, usedHistoryFallback, saveToHostfully } = await (0, requestDetection_1.detectGuestIntentWithContext)({
        platform: 'line',
        sourceId,
        text,
        isCancellationHint,
        historyFallbackEnabled: constants_1.CONFIG.LINE_HISTORY_FALLBACK_ENABLED,
        historyContextSize: constants_1.CONFIG.LINE_HISTORY_CONTEXT_SIZE,
    });
    if (usedHistoryFallback && result) {
        console.log(`🧠 LINE history fallback matched | source=${sourceId} | result=${result.slice(0, 80)}`);
    }
    if (!result) {
        console.log(`⏭️ LINE no actionable intent | source=${sourceId}`);
        const booking = (0, bookingStore_1.getBookingByLeadUid)(leadUid);
        const propertyCode = booking?.property ? (0, groupNaming_1.propertyCodeFromName)(booking.property) || undefined : undefined;
        if ((0, autoReplyPipeline_1.shouldAttemptAutoReply)(text, propertyCode)) {
            (0, autoReplyPipeline_1.runAutoReplyPipeline)({
                leadUid,
                platform: 'line',
                guestMessage: text,
                propertyCode,
                sendReply: async (reply) => { await (0, lineClient_1.pushMessage)(sourceId, reply); },
            }).catch(e => console.error('❌ LINE auto-reply pipeline error:', e?.message));
        }
        return;
    }
    let lead;
    try {
        lead = await (0, hostfully_1.fetchLead)(leadUid);
    }
    catch (e) {
        if (e.status === 404) {
            console.warn(`⚠️ LINE lead not in HF | leadUid=${leadUid} | skipping alert`);
            return;
        }
        throw e;
    }
    const info = lead?.guestInformation;
    const name = (0, format_1.guestName)(info);
    const today = new Date();
    const checkIn = lead?.checkInLocalDateTime ? new Date(lead.checkInLocalDateTime) : null;
    const isPostCheckIn = checkIn && today >= checkIn;
    if (saveToHostfully && !isPostCheckIn)
        await (0, hostfully_1.saveGuestNote)(leadUid, result);
    const propertyName = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
    const propertyCode = (0, groupNaming_1.propertyCodeFromName)(propertyName) || undefined;
    if (result.startsWith('CANCELLED:')) {
        const cancelledText = result.replace(/^CANCELLED:\s*/i, '').trim() || 'Previous request';
        await (0, notify_1.sendAlert)(`🚫 <b>Cancelled</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Cancelled:</b> ${cancelledText}\n` +
            `📱 <b>Platform:</b> LINE\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'LINE', propertyCode });
    }
    else {
        await (0, notify_1.sendAlert)(`💬 <b>New Request</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Request:</b> ${result}\n` +
            `📱 <b>Platform:</b> LINE\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'LINE', propertyCode });
        (0, autoReplyPipeline_1.runAutoReplyPipeline)({
            leadUid,
            platform: 'line',
            guestMessage: text,
            propertyCode,
            sendReply: async (reply) => { await (0, lineClient_1.pushMessage)(sourceId, reply); },
        }).catch(e => console.error('❌ LINE auto-reply pipeline error:', e?.message));
    }
    console.log(`✅ LINE alert sent | lead=${leadUid}`);
}
