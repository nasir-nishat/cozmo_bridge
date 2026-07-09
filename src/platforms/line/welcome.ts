import { CONFIG } from '../../config/constants';
import { getMessages } from '../../services/sheets';
import { linkGroup } from '../../services/groupLeads';
import { SupportedLang } from '../../services/llm';
import { replyMessages, lineGroupKey } from './lineClient';

export async function sendLineWelcome({
    userId,
    replyToken,
    guest_name,
    property,
    check_in,
    check_out,
    nationality,
    lead_uid,
    guestLang,
}: any) {
    if (!userId) return;

    if (lead_uid) {
        linkGroup(lineGroupKey(userId), lead_uid);
        console.log(`🔗 LINE Auto-linked: ${lineGroupKey(userId)} → ${lead_uid}`);
    }

    const sheetLang = (guestLang as SupportedLang | undefined) ||
        (nationality === 'KR' ? 'KR' : 'EN');
    const msgs = await getMessages(sheetLang);

    type LineMsg = { type: 'text'; text: string } | { type: 'image'; originalContentUrl: string; previewImageUrl: string };
    const batch: LineMsg[] = [];

    if (msgs['brand_msg']) batch.push({ type: 'text', text: msgs['brand_msg'].replace(/\\n/g, '\n') });

    const cardImageUrl = (msgs['business_card_url'] || CONFIG.LINE_BUSINESS_CARD_IMAGE_URL || '').trim();
    if (cardImageUrl) batch.push({ type: 'image', originalContentUrl: cardImageUrl, previewImageUrl: cardImageUrl });

    if (msgs['intro_msg']) batch.push({ type: 'text', text: msgs['intro_msg'].replace(/\\n/g, '\n') });

    await replyMessages(replyToken, batch);
    console.log(`✅ LINE welcome sent: ${guest_name} [lang=${sheetLang}]`);
}
