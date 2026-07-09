import { SupportedLang } from '../../services/llm';
import { sendTranslation } from './lineClient';
import { translateMessage } from '../../services/llm';
import { isStaffSender } from '../../services/staffCache';

function scriptOf(text: string): 'JA' | 'ZH' | 'TH' | 'KO' | 'EN' | 'OTHER' {
    if (/[ぁ-んァ-ン]/.test(text)) return 'JA';
    if (/[฀-๿]/.test(text)) return 'TH';
    if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'KO';
    if (/[一-鿿]/.test(text)) return 'ZH';
    if (/[^\x00-\x7F]/.test(text)) return 'OTHER';
    return 'EN';
}

export const LANG_MAP: Record<string, SupportedLang> = {
    jp: 'JA', ja: 'JA',
    cn: 'ZH-CN', zh: 'ZH-CN',
    tw: 'ZH-TW',
    th: 'TH',
    en: 'EN',
};

export const groupGuestLang = new Map<string, SupportedLang>();
export const groupTranslationOn = new Map<string, boolean>();

const globalTranslationQueue: Array<() => Promise<void>> = [];
let globalTranslationRunning = false;
const TRANSLATION_GAP_MS = 1200;

export function enqueueTranslation(_sourceId: string, task: () => Promise<void>): void {
    globalTranslationQueue.push(task);
    if (!globalTranslationRunning) runTranslationQueue();
}

async function runTranslationQueue(): Promise<void> {
    globalTranslationRunning = true;
    while (globalTranslationQueue.length > 0) {
        const task = globalTranslationQueue.shift()!;
        try { await task(); }
        catch (e: any) {
            console.error('❌ Translation error:', e?.response?.status, e?.message);
        }
        if (globalTranslationQueue.length > 0) await new Promise(r => setTimeout(r, TRANSLATION_GAP_MS));
    }
    globalTranslationRunning = false;
}

export async function handleTranslation(
    sourceId: string,
    text: string,
    senderId: string,
    senderName: string,
    replyToken: string,
    guestLang: SupportedLang
): Promise<void> {
    const t = text.trim();
    const isXml = t.startsWith('<');
    const isEmojiOnly = /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\s]+$/u.test(t);
    const isUrlOnly = /^https?:\/\/\S+$/i.test(t);
    const isNumberOnly = /^[\d\s\-+().]+$/.test(t);
    if (isXml || isEmojiOnly || isUrlOnly || isNumberOnly) return;

    const script = scriptOf(text);
    const isStaff = isStaffSender(senderId, senderName);

    const isInGuestLang =
        ((guestLang === 'ZH-CN' || guestLang === 'ZH-TW') && script === 'ZH') ||
        (guestLang === 'JA' && script === 'JA') ||
        (guestLang === 'TH' && script === 'TH') ||
        (guestLang === 'EN' && script === 'EN');

    if (isInGuestLang) {
        // Staff wrote in guest's language intentionally — no translation needed
        if (guestLang === 'EN' || isStaff) return;
        enqueueTranslation(sourceId, async () => {
            const translated = await translateMessage(text, 'EN');
            await sendTranslation(replyToken, translated, '[EN]');
            console.log(`🌐 LINE [guest lang→EN] | source=${sourceId}`);
        });
        return;
    }

    // Message NOT in guest's language → only translate to guestLang if sender is staff
    if (!isStaff) return;

    enqueueTranslation(sourceId, async () => {
        const translated = await translateMessage(text, guestLang);
        await sendTranslation(replyToken, translated, `[${guestLang}]`);
        console.log(`🌐 LINE [staff→${guestLang}] | source=${sourceId}`);
    });
}
