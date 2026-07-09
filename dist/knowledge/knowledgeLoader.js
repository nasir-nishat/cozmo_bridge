"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKnowledgeContext = getKnowledgeContext;
const bookingStore_1 = require("../services/bookingStore");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const groupLeads_1 = require("../services/groupLeads");
const messageBuffer_1 = require("../services/messageBuffer");
const constants_1 = require("../config/constants");
const kb_1 = require("./kb");
// Platform → group key filter (same logic as old knowledgeLoader)
const PLATFORM_FILTER = {
    whatsapp: id => id.endsWith('@g.us') || id.endsWith('@c.us'),
    kakao: id => id.startsWith('kakao:'),
    wechat: id => id.startsWith('wechat:') || id.endsWith('@chatroom'),
    line: id => !id.endsWith('@g.us') && !id.startsWith('kakao:') && !id.startsWith('wechat:'),
};
async function getKnowledgeContext(leadUid, platform, _lang = 'EN', // reserved for future i18n of KB entries
sourceId) {
    // Resolve property code from in-memory booking store (zero network)
    const booking = (0, bookingStore_1.getBookingByLeadUid)(leadUid);
    const propertyCode = booking?.property ? (0, groupNaming_1.propertyCodeFromName)(booking.property) : undefined;
    // KB entries for this property (ALL + property-specific)
    const entries = (0, kb_1.getPropertyEntries)(propertyCode ?? undefined);
    // Recent chat history across all linked groups for this platform
    const filter = PLATFORM_FILTER[platform.toLowerCase()];
    const allIds = (0, groupLeads_1.getAllGroupsByLeadUid)(leadUid);
    if (sourceId && !allIds.includes(sourceId))
        allIds.push(sourceId);
    const groupIds = filter ? allIds.filter(filter) : allIds;
    const limit = constants_1.CONFIG.MESSAGE_HISTORY_CONTEXT_SIZE;
    const chatHistory = groupIds
        .flatMap(id => (0, messageBuffer_1.getRecentMessages)(id, 4 * 60))
        .sort((a, b) => a.ts - b.ts)
        .slice(-limit);
    return { propertyCode: propertyCode ?? undefined, guestName: booking?.guestName, entries, chatHistory };
}
