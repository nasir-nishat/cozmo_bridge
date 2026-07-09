import { getBookingByLeadUid } from '../services/bookingStore';
import type { RouterResult, Intent } from './router';

// ─── Derived fields ───────────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
    whatsapp: 'WhatsApp',
    kakao:    'KakaoTalk',
    line:     'LINE',
    wechat:   'WeChat',
};

// One concrete next step per intent — staff reads this and knows what to do
const STAFF_ACTION: Record<Intent, string> = {
    emergency:  'Respond immediately — potential safety situation',
    complaint:  'Contact guest and resolve the issue directly',
    checkin:    'Send check-in instructions or access details to guest',
    pricing:    'Clarify charges or payment details with guest',
    booking:    'Verify booking details and confirm with guest',
    faq:        'Answer guest question directly in the chat',
    other:      'Review the message and follow up with guest',
};

function whyEscalated(r: RouterResult): string {
    if (r.intent === 'emergency')  return 'Emergency — immediate staff action required';
    if (r.risk === 'high')         return 'High-risk situation — AI cannot handle';
    if (r.intent === 'complaint')  return 'Complaint requires a personal staff response';
    if (!r.escalate && r.confidence <= 0.75)
                                   return `Low classification confidence (${Math.round(r.confidence * 100)}%)`;
    if (!r.escalate)               return 'Answer not found in knowledge base';
    return `Risk level: ${r.risk}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

// Returns the formatted alert string. Caller passes it to:
//   sendAlert(msg, { platform, propertyCode })
// keeping routing options (Jandi channel, property webhook) at the call site.
export function buildEscalationAlert(
    routerResult: RouterResult,
    guestMsg:     string,
    leadUid:      string,
    platform:     string
): string {
    const booking      = getBookingByLeadUid(leadUid);
    const guestName    = booking?.guestName   || 'Unknown';
    const propertyName = booking?.property    || '—';
    const platformLabel = PLATFORM_LABEL[platform.toLowerCase()] ?? platform;

    const emoji = (routerResult.intent === 'emergency' || routerResult.risk === 'high')
        ? '🚨'
        : '🙋';

    return (
        `${emoji} <b>Escalation: Staff Needed</b>\n` +
        `─────────────────\n` +
        `👤 <b>Guest:</b> ${guestName}\n` +
        `🏠 <b>Property:</b> ${propertyName}\n` +
        `💬 <b>Message:</b> ${guestMsg.slice(0, 200)}\n` +
        `🧠 <b>Topic:</b> ${routerResult.intent} · ${routerResult.reason}\n` +
        `⚠️ <b>Why escalated:</b> ${whyEscalated(routerResult)}\n` +
        `✅ <b>Action needed:</b> ${STAFF_ACTION[routerResult.intent]}\n` +
        `📱 <b>Platform:</b> ${platformLabel}\n` +
        `─────────────────\n` +
        `<i>via COZMO · COZE Hospitality</i>`
    );
}
