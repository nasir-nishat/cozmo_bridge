"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupTranslationOn = exports.groupGuestLang = exports.LANG_MAP = void 0;
exports.handleWeChatTranslation = handleWeChatTranslation;
const llm_1 = require("../../services/llm");
const staffCache_1 = require("../../services/staffCache");
exports.LANG_MAP = {
    jp: 'JA', ja: 'JA',
    cn: 'ZH-CN', zh: 'ZH-CN',
    tw: 'ZH-TW',
    th: 'TH',
    en: 'EN',
};
exports.groupGuestLang = new Map();
exports.groupTranslationOn = new Map();
const translationQueue = [];
let translationRunning = false;
const TRANSLATION_GAP_MS = 1200;
function enqueueTranslation(task) {
    translationQueue.push(task);
    if (!translationRunning)
        runQueue();
}
async function runQueue() {
    translationRunning = true;
    while (translationQueue.length > 0) {
        const task = translationQueue.shift();
        try {
            await task();
        }
        catch (e) {
            console.error('❌ WeChat translation error:', e?.message);
        }
        if (translationQueue.length > 0)
            await new Promise(r => setTimeout(r, TRANSLATION_GAP_MS));
    }
    translationRunning = false;
}
function scriptOf(text) {
    if (/[ぁ-んァ-ン]/.test(text))
        return 'JA';
    if (/[฀-๿]/.test(text))
        return 'TH';
    if (/[가-힯ᄀ-ᇿ]/.test(text))
        return 'KO';
    if (/[一-鿿]/.test(text))
        return 'ZH';
    // If stripping all non-ASCII leaves printable ASCII content, it's Latin/English
    // regardless of emojis, smart quotes, em dashes, or other Unicode symbols.
    const asciiContent = text.replace(/[^\x20-\x7E]/g, '');
    if (/\S/.test(asciiContent))
        return 'EN';
    return 'OTHER';
}
async function handleWeChatTranslation(roomId, text, senderWxid, senderName, agent, guestLang) {
    const t = text.trim();
    const isXml = t.startsWith('<');
    const isEmojiOnly = /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\s]+$/u.test(t);
    const isUrlOnly = /^https?:\/\/\S+$/i.test(t);
    const isNumberOnly = /^[\d\s\-+().]+$/.test(t);
    const isCozmoOutput = /^\[(?:EN|JA|ZH-CN|ZH-TW|TH)\]/.test(t);
    if (isXml || isEmojiOnly || isUrlOnly || isNumberOnly || isCozmoOutput)
        return;
    const script = scriptOf(text);
    const isStaff = (0, staffCache_1.isStaffSender)(senderWxid, senderName);
    console.log(`🔍 TRANS | room=${roomId} sender=${senderWxid}(${senderName}) isStaff=${isStaff} script=${script} guestLang=${guestLang} text="${t.slice(0, 60)}"`);
    const isInGuestLang = ((guestLang === 'ZH-CN' || guestLang === 'ZH-TW') && script === 'ZH') ||
        (guestLang === 'JA' && script === 'JA') ||
        (guestLang === 'TH' && script === 'TH') ||
        (guestLang === 'EN' && script === 'EN');
    if (isInGuestLang) {
        if (guestLang === 'EN' || isStaff) {
            console.log(`⏭️ TRANS skip | isInGuestLang=true guestLang=${guestLang} isStaff=${isStaff}`);
            return;
        }
        enqueueTranslation(async () => {
            const translated = await (0, llm_1.translateMessage)(text, 'EN');
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
        const translated = await (0, llm_1.translateMessage)(text, guestLang);
        if (!translated || translated === text.trim()) {
            console.log(`⏭️ TRANS skip | empty or identical output (staff→${guestLang})`);
            return;
        }
        agent.sendText(roomId, `[${guestLang}] ${translated}`);
        console.log(`🌐 WECHAT [staff→${guestLang}] | room=${roomId}`);
    });
}
