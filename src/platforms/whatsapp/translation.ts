import { SupportedLang, translateMessage } from '../../services/llm';
import { evoSendText } from './evoClient';
import * as fs from 'fs';
import * as path from 'path';

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
            console.error('❌ WA translation error:', e?.message);
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
    const asciiContent = text.replace(/[^\x20-\x7E]/g, '');
    if (/\S/.test(asciiContent)) return 'EN';
    return 'OTHER';
}

export function isWaStaff(senderJid: string): boolean {
    try {
        const staffIds = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/staff-ids.json'), 'utf8'));
        const lidNum = senderJid.replace(/@.*$/, '');
        return lidNum in (staffIds.whatsapp || {});
    } catch {
        return false;
    }
}

export async function handleWaTranslation(
    groupId: string,
    text: string,
    senderJid: string,
    guestLang: SupportedLang
): Promise<void> {
    const t = text.trim();
    if (
        t.startsWith('<') ||
        /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\s]+$/u.test(t) ||
        /^https?:\/\/\S+$/i.test(t) ||
        /^[\d\s\-+().]+$/.test(t) ||
        /^\[(?:EN|JA|ZH-CN|ZH-TW|TH)\]/.test(t)
    ) return;

    const script = scriptOf(text);
    const isStaff = isWaStaff(senderJid);

    const isInGuestLang =
        ((guestLang === 'ZH-CN' || guestLang === 'ZH-TW') && script === 'ZH') ||
        (guestLang === 'JA' && script === 'JA') ||
        (guestLang === 'TH' && script === 'TH') ||
        (guestLang === 'EN' && script === 'EN');

    if (isInGuestLang) {
        if (guestLang === 'EN' || isStaff) return;
        enqueueTranslation(async () => {
            const translated = await translateMessage(text, 'EN');
            if (!translated || translated === text.trim()) return;
            await evoSendText(groupId, `[EN] ${translated}`);
            console.log(`🌐 WA [guest→EN] | group=${groupId}`);
        });
        return;
    }

    if (!isStaff) return;

    enqueueTranslation(async () => {
        const translated = await translateMessage(text, guestLang);
        if (!translated || translated === text.trim()) return;
        await evoSendText(groupId, `[${guestLang}] ${translated}`);
        console.log(`🌐 WA [staff→${guestLang}] | group=${groupId}`);
    });
}
