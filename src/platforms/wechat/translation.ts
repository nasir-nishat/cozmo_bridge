import { SupportedLang, translateMessage } from '../../services/llm';
import { WechatferryAgent } from '@wechatferry/agent';
import { isStaffSender } from '../../services/staffCache';

export const LANG_MAP: Record<string, SupportedLang> = {
    jp: 'JA', ja: 'JA',
    cn: 'ZH-CN', zh: 'ZH-CN',
    tw: 'ZH-TW',
    th: 'TH',
    en: 'EN',
};

export const groupGuestLang = new Map<string, SupportedLang>();
export const groupTranslationOn = new Map<string, boolean>();

const translationQueue: Array<() => Promise<void>> = [];
let translationRunning = false;
const TRANSLATION_GAP_MS = 1200;

function enqueueTranslation(task: () => Promise<void>): void {
    translationQueue.push(task);
    if (!translationRunning) runQueue();
}

async function runQueue(): Promise<void> {
    translationRunning = true;
    while (translationQueue.length > 0) {
        const task = translationQueue.shift()!;
        try { await task(); } catch (e: any) {
            console.error('❌ WeChat translation error:', e?.message);
        }
        if (translationQueue.length > 0) await new Promise(r => setTimeout(r, TRANSLATION_GAP_MS));
    }
    translationRunning = false;
}

function scriptOf(text: string): 'JA' | 'ZH' | 'TH' | 'KO' | 'EN' | 'OTHER' {
    if (/[ぁ-んァ-ン]/.test(text)) return 'JA';
    if (/[฀-๿]/.test(text)) return 'TH';
    if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'KO';
    if (/[一-鿿]/.test(text)) return 'ZH';
    // If stripping all non-ASCII leaves printable ASCII content, it's Latin/English
    // regardless of emojis, smart quotes, em dashes, or other Unicode symbols.
    const asciiContent = text.replace(/[^\x20-\x7E]/g, '');
    if (/\S/.test(asciiContent)) return 'EN';
    return 'OTHER';
}

export async function handleWeChatTranslation(
    roomId: string,
    text: string,
    senderWxid: string,
    senderName: string,
    agent: WechatferryAgent,
    guestLang: SupportedLang
): Promise<void> {
    const t = text.trim();
    const isXml = t.startsWith('<');
    const isEmojiOnly = /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\s]+$/u.test(t);
    const isUrlOnly = /^https?:\/\/\S+$/i.test(t);
    const isNumberOnly = /^[\d\s\-+().]+$/.test(t);
    const isCozmoOutput = /^\[(?:EN|JA|ZH-CN|ZH-TW|TH)\]/.test(t);
    if (isXml || isEmojiOnly || isUrlOnly || isNumberOnly || isCozmoOutput) return;

    const script = scriptOf(text);
    const isStaff = isStaffSender(senderWxid, senderName);

    console.log(`🔍 TRANS | room=${roomId} sender=${senderWxid}(${senderName}) isStaff=${isStaff} script=${script} guestLang=${guestLang} text="${t.slice(0, 60)}"`);

    const isInGuestLang =
        ((guestLang === 'ZH-CN' || guestLang === 'ZH-TW') && script === 'ZH') ||
        (guestLang === 'JA' && script === 'JA') ||
        (guestLang === 'TH' && script === 'TH') ||
        (guestLang === 'EN' && script === 'EN');

    if (isInGuestLang) {
        if (guestLang === 'EN' || isStaff) {
            console.log(`⏭️ TRANS skip | isInGuestLang=true guestLang=${guestLang} isStaff=${isStaff}`);
            return;
        }
        enqueueTranslation(async () => {
            const translated = await translateMessage(text, 'EN');
            if (!translated || translated === text.trim()) {
                console.log(`⏭️ TRANS skip | empty or identical output (guest lang→EN)`);
                return;
            }
            agent.sendText(roomId, `[EN] ${translated}`);
            console.log(`🌐 WECHAT [guest lang→EN] | room=${roomId}`);
        });
        return;
    }

    if (!isStaff) {
        console.log(`⏭️ TRANS skip | not staff, script=${script} not in guestLang=${guestLang}`);
        return;
    }

    enqueueTranslation(async () => {
        const translated = await translateMessage(text, guestLang);
        if (!translated || translated === text.trim()) {
            console.log(`⏭️ TRANS skip | empty or identical output (staff→${guestLang})`);
            return;
        }
        agent.sendText(roomId, `[${guestLang}] ${translated}`);
        console.log(`🌐 WECHAT [staff→${guestLang}] | room=${roomId}`);
    });
}
