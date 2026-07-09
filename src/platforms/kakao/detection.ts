import { CONFIG } from '../../config/constants';
import { getLeadUid } from '../../services/groupLeads';
import { fetchLead, saveGuestNote, resolvePropertyNameForLead } from '../../services/hostfully';
import { propertyCodeFromName } from '../whatsapp/groupNaming';
import { detectGuestIntentWithContext } from '../../services/requestDetection';
import { sendAlert } from '../../services/notify';
import { guestName } from '../../utils/format';
import { isStaffSender } from '../../services/staffCache';
import { kakaoSourceKey } from './utils';
import { runAutoReplyPipeline, shouldAttemptAutoReply } from '../../knowledge/autoReplyPipeline';
import { getBookingByLeadUid } from '../../services/bookingStore';

const CANCELLATION_HINT_REGEX =
    /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now|괜찮아요|취소|필요없어|没关系|不用了|キャンセル|大丈夫)\b/i;

const COZMO_REPLY_REGEX = /^✅ Linked!|guest care team|coze hospitality|cozmo ai/i;

const sourceDebounce = new Map<string, number>();

export async function handleKakaoDetection(sourceId: string, text: string, senderName: string, senderId?: string): Promise<void> {
    if (isStaffSender(senderId || '', senderId ? '' : senderName)) {
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
    if (!isCancellationHint && now - lastProcessed < CONFIG.KAKAO_DEBOUNCE_MS) {
        console.log(`⏭️ KAKAO debounce skip | source=${sourceId}`);
        return;
    }
    sourceDebounce.set(sourceId, now);

    const leadUid = getLeadUid(kakaoSourceKey(sourceId));
    if (!leadUid) {
        console.log(`⏭️ KAKAO unlinked source skip | source=${sourceId}`);
        return;
    }

    const { result, usedHistoryFallback, saveToHostfully } = await detectGuestIntentWithContext({
        platform: 'kakao',
        sourceId,
        text,
        senderName,
        isCancellationHint,
        historyFallbackEnabled: CONFIG.KAKAO_HISTORY_FALLBACK_ENABLED,
        historyContextSize: CONFIG.KAKAO_HISTORY_CONTEXT_SIZE,
    });

    if (usedHistoryFallback && result) {
        console.log(`🧠 KAKAO history fallback matched | source=${sourceId} | result=${result.slice(0, 80)}`);
    }
    if (!result) {
        console.log(`⏭️ KAKAO no actionable intent | source=${sourceId}`);
        const booking = getBookingByLeadUid(leadUid);
        const propertyCode = booking?.property ? propertyCodeFromName(booking.property) || undefined : undefined;
        if (shouldAttemptAutoReply(text, propertyCode)) {
            runAutoReplyPipeline({
                leadUid,
                platform: 'kakao',
                guestMessage: text,
                propertyCode,
            }).catch(e => console.error('❌ KAKAO auto-reply pipeline error:', e?.message));
        }
        return;
    }

    let lead: any;
    try {
        lead = await fetchLead(leadUid);
    } catch (e: any) {
        if (e.status === 404) {
            console.warn(`⚠️ KAKAO lead not in HF | leadUid=${leadUid} | skipping alert`);
            return;
        }
        throw e;
    }
    const info = lead?.guestInformation;
    const name = guestName(info);
    const propertyName = await resolvePropertyNameForLead(lead);
    const propertyCode = propertyCodeFromName(propertyName) || undefined;

    const today = new Date();
    const checkIn = lead?.checkInLocalDateTime ? new Date(lead.checkInLocalDateTime) : null;
    const isPostCheckIn = checkIn && today >= checkIn;
    if (saveToHostfully && !isPostCheckIn) await saveGuestNote(leadUid, result);

    const isTestLead = leadUid === '70778c3a-d60b-4473-a597-a5d6292628f5';

    if (result.startsWith('CANCELLED:')) {
        const cancelledText = result.replace(/^CANCELLED:\s*/i, '').trim() || 'Previous request';
        await sendAlert(
            `🚫 <b>Cancelled</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Cancelled:</b> ${cancelledText}\n` +
            `📱 <b>Platform:</b> KAKAO\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'KAKAO', useTestJandi: isTestLead, propertyCode }
        );
    } else {
        await sendAlert(
            `💬 <b>Guest Request Detected</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Request:</b> ${result}\n` +
            `📱 <b>Platform:</b> KAKAO\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'KAKAO', useTestJandi: isTestLead, propertyCode }
        );
        // Kakao can't push from detection (replies go via HTTP response body only)
        // — pipeline still routes and fires escalation alerts when needed
        runAutoReplyPipeline({
            leadUid,
            platform: 'kakao',
            guestMessage: text,
            propertyCode,
        }).catch(e => console.error('❌ KAKAO auto-reply pipeline error:', e?.message));
    }

    console.log(`✅ KAKAO alert sent | lead=${leadUid}`);
}
