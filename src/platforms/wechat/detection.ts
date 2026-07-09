import { CONFIG } from '../../config/constants';
import { getLeadUid } from '../../services/groupLeads';
import { fetchLead, saveGuestNote, resolvePropertyNameForLead } from '../../services/hostfully';
import { propertyCodeFromName } from '../whatsapp/groupNaming';
import { detectGuestIntentWithContext } from '../../services/requestDetection';
import { sendAlert } from '../../services/notify';
import { guestName } from '../../utils/format';
import { wechatSourceKey } from './utils';
import { wechatSendText } from '../../services/wechat';
import { runAutoReplyPipeline, shouldAttemptAutoReply } from '../../knowledge/autoReplyPipeline';
import { getBookingByLeadUid } from '../../services/bookingStore';

const CANCELLATION_HINT_REGEX =
    /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now|괜찮아요|취소|필요없어|没关系|不用了|キャンセル|大丈夫)\b/i;

const sourceDebounce = new Map<string, number>();

export async function handleWeChatDetection(roomId: string, text: string, senderName: string): Promise<void> {
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

    const leadUid = getLeadUid(wechatSourceKey(roomId));
    if (!leadUid) {
        console.log(`⏭️ WECHAT unlinked room skip | room=${roomId}`);
        return;
    }

    const { result, usedHistoryFallback, saveToHostfully } = await detectGuestIntentWithContext({
        platform: 'wechat',
        sourceId: roomId,
        text,
        senderName,
        isCancellationHint,
        historyFallbackEnabled: CONFIG.WECHAT_HISTORY_FALLBACK_ENABLED,
        historyContextSize: CONFIG.WECHAT_HISTORY_CONTEXT_SIZE,
    });

    if (usedHistoryFallback && result) {
        console.log(`🧠 WECHAT history fallback matched | room=${roomId} | result=${result.slice(0, 80)}`);
    }
    if (!result) {
        console.log(`⏭️ WECHAT no actionable intent | room=${roomId}`);
        const booking = getBookingByLeadUid(leadUid);
        const propertyCode = booking?.property ? propertyCodeFromName(booking.property) || undefined : undefined;
        if (shouldAttemptAutoReply(text, propertyCode)) {
            runAutoReplyPipeline({
                leadUid,
                platform: 'wechat',
                guestMessage: text,
                propertyCode,
                sendReply: async (reply) => { await wechatSendText(roomId, reply); },
            }).catch(e => console.error('❌ WECHAT auto-reply pipeline error:', e?.message));
        }
        return;
    }

    let lead: any;
    try {
        lead = await fetchLead(leadUid);
    } catch (e: any) {
        if (e.status === 404) {
            console.warn(`⚠️ WECHAT lead not in HF | leadUid=${leadUid} | skipping alert`);
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
            `📱 <b>Platform:</b> WeChat\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'WECHAT', useTestJandi: isTestLead, propertyCode }
        );
    } else {
        await sendAlert(
            `💬 <b>New Request</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📋 <b>Request:</b> ${result}\n` +
            `📱 <b>Platform:</b> WeChat\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { platform: 'WECHAT', useTestJandi: isTestLead, propertyCode }
        );
        runAutoReplyPipeline({
            leadUid,
            platform: 'wechat',
            guestMessage: text,
            propertyCode,
            sendReply: async (reply) => { await wechatSendText(roomId, reply); },
        }).catch(e => console.error('❌ WECHAT auto-reply pipeline error:', e?.message));
    }

    console.log(`✅ WECHAT alert sent | lead=${leadUid}`);
}
