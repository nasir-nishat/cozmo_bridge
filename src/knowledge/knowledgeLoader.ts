import { getBookingByLeadUid }          from '../services/bookingStore';
import { propertyCodeFromName }          from '../platforms/whatsapp/groupNaming';
import { getAllGroupsByLeadUid }          from '../services/groupLeads';
import { getRecentMessages }             from '../services/messageBuffer';
import { CONFIG }                        from '../config/constants';
import { getPropertyEntries, KBEntry }   from './kb';

export type { KBEntry };

export interface ChatMessage {
    sender: string;
    text:   string;
    ts:     number;
}

export interface KnowledgeContext {
    propertyCode?: string;
    guestName?:    string;
    entries:       KBEntry[];    // all KB entries scoped to this property
    chatHistory:   ChatMessage[];
}

// Platform → group key filter (same logic as old knowledgeLoader)
const PLATFORM_FILTER: Record<string, (id: string) => boolean> = {
    whatsapp: id => id.endsWith('@g.us') || id.endsWith('@c.us'),
    kakao:    id => id.startsWith('kakao:'),
    wechat:   id => id.startsWith('wechat:') || id.endsWith('@chatroom'),
    line:     id => !id.endsWith('@g.us') && !id.startsWith('kakao:') && !id.startsWith('wechat:'),
};

export async function getKnowledgeContext(
    leadUid:  string,
    platform: string,
    _lang     = 'EN',  // reserved for future i18n of KB entries
    sourceId?: string
): Promise<KnowledgeContext> {
    // Resolve property code from in-memory booking store (zero network)
    const booking     = getBookingByLeadUid(leadUid);
    const propertyCode = booking?.property ? propertyCodeFromName(booking.property) : undefined;

    // KB entries for this property (ALL + property-specific)
    const entries = getPropertyEntries(propertyCode ?? undefined);

    // Recent chat history across all linked groups for this platform
    const filter   = PLATFORM_FILTER[platform.toLowerCase()];
    const allIds   = getAllGroupsByLeadUid(leadUid);
    if (sourceId && !allIds.includes(sourceId)) allIds.push(sourceId);
    const groupIds = filter ? allIds.filter(filter) : allIds;

    const limit = CONFIG.MESSAGE_HISTORY_CONTEXT_SIZE;
    const chatHistory: ChatMessage[] = groupIds
        .flatMap(id => getRecentMessages(id, 4 * 60))
        .sort((a, b) => a.ts - b.ts)
        .slice(-limit);

    return { propertyCode: propertyCode ?? undefined, guestName: booking?.guestName, entries, chatHistory };
}
