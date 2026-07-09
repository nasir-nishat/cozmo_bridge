import { CONFIG } from '../config/constants';
import { searchKB } from './knowledgeBase';
import { generateAiReply, AiReplyContext } from './aiReply';
import { sendAlert } from './notify';

// Matches messages that look like questions (ends with ?, or starts with question word)
const QUESTION_REGEX = /\?|^\s*(what|where|when|how|can|could|is|are|do|does|will|would|which|who|why|어디|언제|어떻게|뭐|무엇|있나요|있어요|되나요|되요|가능한가요|해주세요)\b/i;

export function ragShouldAttempt(text: string, propertyCode?: string): boolean {
    if (searchKB(text, propertyCode).length > 0) return true;
    return QUESTION_REGEX.test(text.trim());
}

export async function tryRagReply(
    groupId: string,
    text: string,
    ctx: AiReplyContext,
    guestDisplayName: string,
    propertyName: string
): Promise<{ replied: boolean; reply: string }> {
    const kbContext = searchKB(text, ctx.propertyCode);
    const hasKbMatch = kbContext.length > 0;

    const { reply, escalate } = await generateAiReply(text, 'group', ctx, groupId);

    const source = hasKbMatch ? 'KB+GPT-4o' : 'GPT-4o';
    const escalateNote = escalate ? '\n⚡ <b>Needs staff follow-up</b>' : '';

    await sendAlert(
        `🤖 <b>COZMO Auto-Replied</b>\n─────────────────\n` +
        `👤 <b>Guest:</b> ${guestDisplayName}\n` +
        `🏠 <b>Property:</b> ${propertyName || '—'}\n` +
        `💬 <b>Question:</b> ${text.slice(0, 150)}\n` +
        `🤖 <b>Reply:</b> ${reply.slice(0, 200)}\n` +
        `📚 <b>Source:</b> ${source}${escalateNote}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { propertyCode: ctx.propertyCode }
    );

    return { replied: true, reply };
}
