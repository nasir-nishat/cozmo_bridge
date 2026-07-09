"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupTranslationOn = exports.groupGuestLang = exports.LANG_MAP = void 0;
exports.isWaStaff = isWaStaff;
exports.handleWaTranslation = handleWaTranslation;
const llm_1 = require("../../services/llm");
const evoClient_1 = require("./evoClient");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
            console.error('❌ WA translation error:', e?.message);
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
    const asciiContent = text.replace(/[^\x20-\x7E]/g, '');
    if (/\S/.test(asciiContent))
        return 'EN';
    return 'OTHER';
}
function isWaStaff(senderJid) {
    try {
        const staffIds = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/staff-ids.json'), 'utf8'));
        const lidNum = senderJid.replace(/@.*$/, '');
        return lidNum in (staffIds.whatsapp || {});
    }
    catch {
        return false;
    }
}
async function handleWaTranslation(groupId, text, senderJid, guestLang) {
    const t = text.trim();
    if (t.startsWith('<') ||
        /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\s]+$/u.test(t) ||
        /^https?:\/\/\S+$/i.test(t) ||
        /^[\d\s\-+().]+$/.test(t) ||
        /^\[(?:EN|JA|ZH-CN|ZH-TW|TH)\]/.test(t))
        return;
    const script = scriptOf(text);
    const isStaff = isWaStaff(senderJid);
    const isInGuestLang = ((guestLang === 'ZH-CN' || guestLang === 'ZH-TW') && script === 'ZH') ||
        (guestLang === 'JA' && script === 'JA') ||
        (guestLang === 'TH' && script === 'TH') ||
        (guestLang === 'EN' && script === 'EN');
    if (isInGuestLang) {
        if (guestLang === 'EN' || isStaff)
            return;
        enqueueTranslation(async () => {
            const translated = await (0, llm_1.translateMessage)(text, 'EN');
            if (!translated || translated === text.trim())
                return;
            await (0, evoClient_1.evoSendText)(groupId, `[EN] ${translated}`);
            console.log(`🌐 WA [guest→EN] | group=${groupId}`);
        });
        return;
    }
    if (!isStaff)
        return;
    enqueueTranslation(async () => {
        const translated = await (0, llm_1.translateMessage)(text, guestLang);
        if (!translated || translated === text.trim())
            return;
        await (0, evoClient_1.evoSendText)(groupId, `[${guestLang}] ${translated}`);
        console.log(`🌐 WA [staff→${guestLang}] | group=${groupId}`);
    });
}
