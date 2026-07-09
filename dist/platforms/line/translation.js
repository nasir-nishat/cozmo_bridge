"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupTranslationOn = exports.groupGuestLang = exports.LANG_MAP = void 0;
exports.enqueueTranslation = enqueueTranslation;
exports.handleTranslation = handleTranslation;
const lineClient_1 = require("./lineClient");
const llm_1 = require("../../services/llm");
const staffCache_1 = require("../../services/staffCache");
function scriptOf(text) {
    if (/[ぁ-んァ-ン]/.test(text))
        return 'JA';
    if (/[฀-๿]/.test(text))
        return 'TH';
    if (/[가-힯ᄀ-ᇿ]/.test(text))
        return 'KO';
    if (/[一-鿿]/.test(text))
        return 'ZH';
    if (/[^\x00-\x7F]/.test(text))
        return 'OTHER';
    return 'EN';
}
exports.LANG_MAP = {
    jp: 'JA', ja: 'JA',
    cn: 'ZH-CN', zh: 'ZH-CN',
    tw: 'ZH-TW',
    th: 'TH',
    en: 'EN',
};
exports.groupGuestLang = new Map();
exports.groupTranslationOn = new Map();
const globalTranslationQueue = [];
let globalTranslationRunning = false;
const TRANSLATION_GAP_MS = 1200;
function enqueueTranslation(_sourceId, task) {
    globalTranslationQueue.push(task);
    if (!globalTranslationRunning)
        runTranslationQueue();
}
async function runTranslationQueue() {
    globalTranslationRunning = true;
    while (globalTranslationQueue.length > 0) {
        const task = globalTranslationQueue.shift();
        try {
            await task();
        }
        catch (e) {
            console.error('❌ Translation error:', e?.response?.status, e?.message);
        }
        if (globalTranslationQueue.length > 0)
            await new Promise(r => setTimeout(r, TRANSLATION_GAP_MS));
    }
    globalTranslationRunning = false;
}
async function handleTranslation(sourceId, text, senderId, senderName, replyToken, guestLang) {
    const t = text.trim();
    const isXml = t.startsWith('<');
    const isEmojiOnly = /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\s]+$/u.test(t);
    const isUrlOnly = /^https?:\/\/\S+$/i.test(t);
    const isNumberOnly = /^[\d\s\-+().]+$/.test(t);
    if (isXml || isEmojiOnly || isUrlOnly || isNumberOnly)
        return;
    const script = scriptOf(text);
    const isStaff = (0, staffCache_1.isStaffSender)(senderId, senderName);
    const isInGuestLang = ((guestLang === 'ZH-CN' || guestLang === 'ZH-TW') && script === 'ZH') ||
        (guestLang === 'JA' && script === 'JA') ||
        (guestLang === 'TH' && script === 'TH') ||
        (guestLang === 'EN' && script === 'EN');
    if (isInGuestLang) {
        // Staff wrote in guest's language intentionally — no translation needed
        if (guestLang === 'EN' || isStaff)
            return;
        enqueueTranslation(sourceId, async () => {
            const translated = await (0, llm_1.translateMessage)(text, 'EN');
            await (0, lineClient_1.sendTranslation)(replyToken, translated, '[EN]');
            console.log(`🌐 LINE [guest lang→EN] | source=${sourceId}`);
        });
        return;
    }
    // Message NOT in guest's language → only translate to guestLang if sender is staff
    if (!isStaff)
        return;
    enqueueTranslation(sourceId, async () => {
        const translated = await (0, llm_1.translateMessage)(text, guestLang);
        await (0, lineClient_1.sendTranslation)(replyToken, translated, `[${guestLang}]`);
        console.log(`🌐 LINE [staff→${guestLang}] | source=${sourceId}`);
    });
}
