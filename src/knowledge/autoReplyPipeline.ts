import { CONFIG } from '../config/constants';
import { routeGuestMessage } from './router';
import { searchKBEntries } from './kb';
import { getKnowledgeContext } from './knowledgeLoader';
import { generateReply } from './replyAgent';
import { buildEscalationAlert } from './escalationAgent';
import { getLivePropertyPricingEntry, isPropertyPricingQuestion } from './livePricing';
import { webSearch } from './webSearch';
import { sendAlert } from '../services/notify';
import { saveGuestNote } from '../services/hostfully';
import { VIBE_GUIDE } from './vibeGuide';
import type { KBEntry } from './kb';

// Ordered longest-first so "teva retreat" matches before "teva"
const PROPERTY_ALIASES: [string, string][] = [
    ['teva retreat', 'HT'], ['teva wellness', 'HTA'], ['teva aeris', 'HTB'], ['aeris garden', 'HTB'],
    ['kelly ananda', 'GKA'], ['kelly prana', 'GKB'], ['kelly luxury', 'GK'],
    ['fish bird', 'FB'], ['lotus 09', 'L9'], ['fish 09', 'F9'], ['bird 09', 'B9'],
    ['joyhasla bs', 'BS'], ['joyhasla sg', 'SG'], ['joyhasla sj', 'SJ'],
    ['jts', 'JTS'], ['hta', 'HTA'], ['htb', 'HTB'], ['gka', 'GKA'], ['gkb', 'GKB'],
    ['swa', 'SWA'], ['leeha', 'SWA'], ['achae', 'SA'],
    ['teva', 'JT'], ['yeonnam', 'YT'], ['kelly', 'GK'], ['ananda', 'GKA'], ['prana', 'GKB'],
    ['joyhasla', 'BS'], ['seongbuk', 'BS'],
    [' bs ', 'BS'], [' sg ', 'SG'], [' sj ', 'SJ'], [' sa ', 'SA'],
    [' jt ', 'JT'], [' ht ', 'HT'], [' yt ', 'YT'], [' gk ', 'GK'],
    [' l9 ', 'L9'], [' f9 ', 'F9'], [' b9 ', 'B9'], [' fb ', 'FB'],
];

function extractPropertyCode(text: string): string | undefined {
    const lower = ` ${text.toLowerCase()} `;
    for (const [alias, code] of PROPERTY_ALIASES) {
        if (lower.includes(alias)) return code;
    }
    return undefined;
}

function makeWebEntry(text: string, source?: string): KBEntry {
    return {
        id: 'web-search',
        propertyCode: 'ALL',
        category: 'web',
        title: 'Web search result',
        triggers: [],
        facts: [text + (source ? ` (source: ${source})` : '')],
        links: source ? [source] : [],
        sensitive: false,
    };
}

// Per-(chat, intent) dedup — prevents repeating the same escalation alert
// when a guest sends multiple follow-up messages about the same topic.
const handoffDedup = new Map<string, number>(); // `${sourceId|leadUid}:${intent}` → ms timestamp
const HANDOFF_DEDUP_MS = 20 * 60 * 1000; // 20 minutes

const PLATFORM_KEY: Record<string, 'WHATSAPP' | 'LINE' | 'KAKAO' | 'WECHAT'> = {
    whatsapp: 'WHATSAPP',
    line: 'LINE',
    kakao: 'KAKAO',
    wechat: 'WECHAT',
};

export interface AutoReplyParams {
    leadUid: string;
    platform: string;   // lowercase: 'whatsapp' | 'line' | 'kakao' | 'wechat'
    guestMessage: string;   // raw message text
    propertyCode?: string;   // for KB scoping + Jandi channel routing
    sourceId?: string;   // chat/group id to include in context history
    sendReply?: (text: string) => Promise<void>;  // omit when platform can't push
    testMode?: boolean;  // true when a staff member is testing via DM — routes alerts to dev channel
    bypassFlagCheck?: boolean;  // true for WA DM-specific flag (ENABLE_WA_DM_AUTO_REPLY)
}

const OPERATIONAL_QUESTION_RE =
    /\?|^\s*(what|where|when|how|can|could|is|are|do|does|will|would|which|who|why|please|pls)\b/i;
const SMALL_TALK_RE =
    /^\s*(hi|hello|hey|thanks|thank you|ok|okay|yes|no|cool|great|good morning|good night)[\s!.?]*$/i;

export function shouldAttemptAutoReply(text: string, propertyCode?: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || SMALL_TALK_RE.test(trimmed)) return false;
    if (isPropertyPricingQuestion(trimmed)) return true;
    if (searchKBEntries(trimmed, propertyCode).length > 0) return true;
    return OPERATIONAL_QUESTION_RE.test(trimmed);
}

// Call fire-and-forget: runAutoReplyPipeline({...}).catch(...)
// Never await — must not delay the existing alert pipeline.
export async function runAutoReplyPipeline(params: AutoReplyParams): Promise<void> {
    if (!CONFIG.ENABLE_AUTO_REPLY && !params.bypassFlagCheck) return;

    const { leadUid, platform, guestMessage, sourceId, sendReply, testMode } = params;
    const propertyCode = params.propertyCode ?? extractPropertyCode(guestMessage);
    const alertPlatform = PLATFORM_KEY[platform.toLowerCase()];
    const alertOpts = { propertyCode, platform: alertPlatform, ...(testMode ? { useTestJandi: true, telegramOnly: true } : {}) };

    // 1. Route the message (trigger-first KB match, then LLM fallback)
    const routerResult = await routeGuestMessage({ message: guestMessage, platform, lang: 'EN', propertyCode });

    console.log(
        `🧭 Router | platform=${platform} | intent=${routerResult.intent} | ` +
        `category=${routerResult.category} | entries=${routerResult.matchedEntries.length} | ` +
        `risk=${routerResult.risk} | escalate=${routerResult.escalate} | conf=${routerResult.confidence.toFixed(2)}`
    );

    // 2. Inject live Hostfully pricing if the question is about booking cost
    const livePricingEntry = await getLivePropertyPricingEntry(leadUid, guestMessage).catch(e => {
        console.error('❌ live pricing lookup failed:', e?.message);
        return null;
    });
    if (livePricingEntry) {
        routerResult.matchedEntries = [livePricingEntry, ...routerResult.matchedEntries];
        routerResult.intent = 'pricing';
        routerResult.category = 'payment';
        routerResult.risk = 'low';
        routerResult.confidence = 0.95;
        routerResult.escalate = false;
        routerResult.reason = 'Live Hostfully property pricing match';
    }

    // 3. Hard escalation (emergency / complaint / high-risk)
    if (routerResult.escalate) {
        await sendAlert(buildEscalationAlert(routerResult, guestMessage, leadUid, platform), alertOpts);
        return;
    }

    // 4. Try answering from the full KB
    const ctx = await getKnowledgeContext(leadUid, platform, 'EN', sourceId);
    const reply = await generateReply(routerResult, ctx, VIBE_GUIDE);

    if (reply !== 'ESCALATE') {
        if (sendReply) {
            await sendReply(reply);
            if (leadUid) await saveGuestNote(leadUid, `🤖 COZMO auto-replied: ${reply}`).catch(() => { });
            console.log(`🤖 Auto-reply sent | platform=${platform} | "${reply.slice(0, 80)}"`);
        } else {
            console.log(`⚠️ Auto-reply ready but no send fn for ${platform} — skipping send`);
        }
        return;
    }

    // 5. KB had no answer — try DuckDuckGo before escalating
    const webResult = await webSearch(guestMessage).catch(() => ({ found: false, text: '', source: undefined }));
    if (webResult.found) {
        const webRouterResult = {
            ...routerResult,
            matchedEntries: [...routerResult.matchedEntries, makeWebEntry(webResult.text, webResult.source)],
        };
        const webReply = await generateReply(webRouterResult, ctx, VIBE_GUIDE);
        if (webReply !== 'ESCALATE' && sendReply) {
            await sendReply(webReply);
            if (leadUid) await saveGuestNote(leadUid, `🌐 COZMO web-replied: ${webReply}`).catch(() => { });
            console.log(`🌐 Web-search reply sent | "${webReply.slice(0, 80)}"`);
            return;
        }
    }

    // 6. Nothing worked — escalate to staff (with dedup to avoid alert spam)
    const dedupKey = `${sourceId || leadUid}:${routerResult.intent}`;
    const isRecentHandoff = Date.now() - (handoffDedup.get(dedupKey) ?? 0) < HANDOFF_DEDUP_MS;
    if (isRecentHandoff) {
        console.log(`⏭️ Escalation deduped | intent=${routerResult.intent} | key=${dedupKey}`);
        return;
    }
    handoffDedup.set(dedupKey, Date.now());
    await sendAlert(buildEscalationAlert(routerResult, guestMessage, leadUid, platform), alertOpts);
}
