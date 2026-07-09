"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendLineWelcome = sendLineWelcome;
const constants_1 = require("../../config/constants");
const sheets_1 = require("../../services/sheets");
const groupLeads_1 = require("../../services/groupLeads");
const lineClient_1 = require("./lineClient");
async function sendLineWelcome({ userId, replyToken, guest_name, property, check_in, check_out, nationality, lead_uid, guestLang, }) {
    if (!userId)
        return;
    if (lead_uid) {
        (0, groupLeads_1.linkGroup)((0, lineClient_1.lineGroupKey)(userId), lead_uid);
        console.log(`🔗 LINE Auto-linked: ${(0, lineClient_1.lineGroupKey)(userId)} → ${lead_uid}`);
    }
    const sheetLang = guestLang ||
        (nationality === 'KR' ? 'KR' : 'EN');
    const msgs = await (0, sheets_1.getMessages)(sheetLang);
    const batch = [];
    if (msgs['brand_msg'])
        batch.push({ type: 'text', text: msgs['brand_msg'].replace(/\\n/g, '\n') });
    const cardImageUrl = (msgs['business_card_url'] || constants_1.CONFIG.LINE_BUSINESS_CARD_IMAGE_URL || '').trim();
    if (cardImageUrl)
        batch.push({ type: 'image', originalContentUrl: cardImageUrl, previewImageUrl: cardImageUrl });
    if (msgs['intro_msg'])
        batch.push({ type: 'text', text: msgs['intro_msg'].replace(/\\n/g, '\n') });
    await (0, lineClient_1.replyMessages)(replyToken, batch);
    console.log(`✅ LINE welcome sent: ${guest_name} [lang=${sheetLang}]`);
}
