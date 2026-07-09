"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleKakaoDetection = handleKakaoDetection;
const constants_1 = require("../../config/constants");
const groupLeads_1 = require("../../services/groupLeads");
const hostfully_1 = require("../../services/hostfully");
const groupNaming_1 = require("../whatsapp/groupNaming");
const requestDetection_1 = require("../../services/requestDetection");
const notify_1 = require("../../services/notify");
const format_1 = require("../../utils/format");
const staffCache_1 = require("../../services/staffCache");
const utils_1 = require("./utils");
const autoReplyPipeline_1 = require("../../knowledge/autoReplyPipeline");
const bookingStore_1 = require("../../services/bookingStore");
const CANCELLATION_HINT_REGEX = /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now|괜찮아요|취소|필요없어|没关系|不用了|キャンセル|大丈夫)\b/i;
const COZMO_REPLY_REGEX = /^✅ Linked!|guest care team|coze hospitality|cozmo ai/i;
const sourceDebounce = new Map();
async function handleKakaoDetection(sourceId, text, senderName, senderId) {
    if ((0, staffCache_1.isStaffSender)(senderId || '', senderId ? '' : senderName)) {
        console.log(`⏭️ KAKAO team member skip | id=${senderId} name=${senderName}`);
        return;
    }
    if (COZMO_REPLY_REGEX.test(text)) {
        console.log(`⏭️ KAKAO own reply skip | text=${text.slice(0, 40)}`);
        return;
    }
    const isCancellationHint = CANCELLATION_HINT_REGEX.test(text);
    const now = Date.now();
    const lastProcessed = sourceDebounce.get(sourceId) || 0;
    if (!isCancellationHint && now - lastProcessed < constants_1.CONFIG.KAKAO_DEBOUNCE_MS) {
        console.log(`⏭️ KAKAO debounce skip | source=${sourceId}`);
        return;
    }
    sourceDebounce.set(sourceId, now);
    const leadUid = (0, groupLeads_1.getLeadUid)((0, utils_1.kakaoSourceKey)(sourceId));
    if (!leadUid) {
        console.log(`⏭️ KAKAO unlinked source skip | source=${sourceId}`);
        return;
    }
    const { result, usedHistoryFallback, saveToHostfully } = await (0, requestDetection_1.detectGuestIntentWithContext)({
        platform: 'kakao',
        sourceId,
        text,
        senderName,
        isCancellationHint,
        historyFallbackEnabled: constants_1.CONFIG.KAKAO_HISTORY_FALLBACK_ENABLED,
        historyContextSize: constants_1.CONFIG.KAKAO_HISTORY_CONTEXT_SIZE,
    });
    if (usedHistoryFallback && result) {
        console.log(`🧠 KAKAO history fallback matched | source=${sourceId} | result=${result.slice(0, 80)}`);
    }
    if (!result) {
        console.log(`⏭️ KAKAO no actionable intent | source=${sourceId}`);
        const booking = (0, bookingStore_1.getBookingByLeadUid)(leadUid);
        const propertyCode = booking?.property ? (0, groupNaming_1.propertyCodeFromName)(booking.property) || undefined : undefined;
        if ((0, autoReplyPipeline_1.shouldAttemptAutoReply)(text, propertyCode)) {
            (0, autoReplyPipeline_1.runAutoReplyPipeline)({
                leadUid,
                platform: 'kakao',
                guestMessage: text,
                propertyCode,
            }).catch(e => console.error('❌ KAKAO auto-reply pipeline error:', e?.message));
        }
        return;
    }
    let lead;
    try {
        lead = await (0, hostfully_1.fetchLead)(leadUid);
    }
    catch (e) {
        if (e.status === 404) {
            console.warn(`⚠️ KAKAO lead not in HF | leadUid=${leadUid} | skipping alert`);
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
            `📱 <b>Platform:</b> KAKAO\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'KAKAO', useTestJandi: isTestLead, propertyCode });
    }
    else {
        await (0, notify_1.sendAlert)(`💬 <b>Guest Request Detected</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Request:</b> ${result}\n` +
            `📱 <b>Platform:</b> KAKAO\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { platform: 'KAKAO', useTestJandi: isTestLead, propertyCode });
        // Kakao can't push from detection (replies go via HTTP response body only)
        // — pipeline still routes and fires escalation alerts when needed
        (0, autoReplyPipeline_1.runAutoReplyPipeline)({
            leadUid,
            platform: 'kakao',
            guestMessage: text,
            propertyCode,
        }).catch(e => console.error('❌ KAKAO auto-reply pipeline error:', e?.message));
    }
    console.log(`✅ KAKAO alert sent | lead=${leadUid}`);
}
