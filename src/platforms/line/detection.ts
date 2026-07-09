import { CONFIG } from '../../config/constants';
import { getLeadUid } from '../../services/groupLeads';
import { lineGroupKey, pushMessage } from './lineClient';
import { runAutoReplyPipeline, shouldAttemptAutoReply } from '../../knowledge/autoReplyPipeline';
import { guestName } from '../../utils/format';
import { fetchLead, saveGuestNote, resolvePropertyNameForLead } from '../../services/hostfully';
import { propertyCodeFromName } from '../whatsapp/groupNaming';
import { sendAlert } from '../../services/notify';
import { detectGuestIntentWithContext } from '../../services/requestDetection';
import { getBookingByLeadUid } from '../../services/bookingStore';

const CANCELLATION_HINT_REGEX =
    /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now|괜찮아요|취소|필요없어|没关系|不用了|キャンセル|大丈夫)\b/i;

const groupDebounce = new Map<string, number>();

export async function handleLineDetection(
    sourceId: string,
    text: string,
    senderName: string
): Promise<void> {
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

    const leadUid = getLeadUid(lineGroupKey(sourceId));
    if (!leadUid) {
        console.log(`⏭️ LINE unlinked source skip | source=${sourceId}`);
        return;
    }

    const { result, usedHistoryFallback, saveToHostfully } = await detectGuestIntentWithContext({
        platform: 'line',
        sourceId,
        text,
        isCancellationHint,
        historyFallbackEnabled: CONFIG.LINE_HISTORY_FALLBACK_ENABLED,
        historyContextSize: CONFIG.LINE_HISTORY_CONTEXT_SIZE,
    });
    if (usedHistoryFallback && result) {
        console.log(`🧠 LINE history fallback matched | source=${sourceId} | result=${result.slice(0, 80)}`);
    }
    if (!result) {
        console.log(`⏭️ LINE no actionable intent | source=${sourceId}`);
        const booking = getBookingByLeadUid(leadUid);
        const propertyCode = booking?.property ? propertyCodeFromName(booking.property) || undefined : undefined;
        if (shouldAttemptAutoReply(text, propertyCode)) {
            runAutoReplyPipeline({
                leadUid,
                platform: 'line',
                guestMessage: text,
                propertyCode,
                sendReply: async (reply) => { await pushMessage(sourceId, reply); },
            }).catch(e => console.error('❌ LINE auto-reply pipeline error:', e?.message));
        }
        return;
    }

    let lead: any;
    try {
        lead = await fetchLead(leadUid);
    } catch (e: any) {
        if (e.status === 404) {
            console.warn(`⚠️ LINE lead not in HF | leadUid=${leadUid} | skipping alert`);
            return;
        }
        throw e;
    }
    const info = lead?.guestInformation;
    const name = guestName(info);

    const today = new Date();
    const checkIn = lead?.checkInLocalDateTime ? new Date(lead.checkInLocalDateTime) : null;
    const isPostCheckIn = checkIn && today >= checkIn;
    if (saveToHostfully && !isPostCheckIn) await saveGuestNote(leadUid, result);

    const propertyName = await resolvePropertyNameForLead(lead);
    const propertyCode = propertyCodeFromName(propertyName) || undefined;

    if (result.startsWith('CANCELLED:')) {
        const cancelledText = result.replace(/^CANCELLED:\s*/i, '').trim() || 'Previous request';
        await sendAlert(
            `🚫 <b>Cancelled</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Cancelled:</b> ${cancelledText}\n` +
            `📱 <b>Platform:</b> LINE\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'LINE', propertyCode }
        );
    } else {
        await sendAlert(
            `💬 <b>New Request</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Request:</b> ${result}\n` +
            `📱 <b>Platform:</b> LINE\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'LINE', propertyCode }
        );
        runAutoReplyPipeline({
            leadUid,
            platform: 'line',
            guestMessage: text,
            propertyCode,
            sendReply: async (reply) => { await pushMessage(sourceId, reply); },
        }).catch(e => console.error('❌ LINE auto-reply pipeline error:', e?.message));
    }
    console.log(`✅ LINE alert sent | lead=${leadUid}`);
}
