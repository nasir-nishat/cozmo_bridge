"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.waClient = exports.setWaReady = exports.waReadyDurationMs = exports.isWaReady = exports.evoApi = exports.INSTANCE = void 0;
exports.ensureEvolutionWebhook = ensureEvolutionWebhook;
exports.evoSendText = evoSendText;
exports.evoSendTyping = evoSendTyping;
exports.fetchGroupName = fetchGroupName;
exports.getGroupInviteLink = getGroupInviteLink;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../../config/constants");
exports.INSTANCE = constants_1.CONFIG.EVOLUTION_INSTANCE;
exports.evoApi = axios_1.default.create({
    baseURL: constants_1.CONFIG.EVOLUTION_API_URL,
    headers: constants_1.CONFIG.EVOLUTION_API_KEY ? { apikey: constants_1.CONFIG.EVOLUTION_API_KEY } : {},
    timeout: 20000,
});
const REQUIRED_WEBHOOK_EVENTS = [
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'SEND_MESSAGE',
    'CONNECTION_UPDATE',
    'GROUP_PARTICIPANTS_UPDATE',
    'GROUPS_UPSERT',
    'CONTACTS_UPSERT',
];
let lastWebhookEnsureAt = 0;
async function ensureEvolutionWebhook(force = false) {
    if (!constants_1.CONFIG.EVOLUTION_WEBHOOK_URL)
        return;
    const now = Date.now();
    if (!force && now - lastWebhookEnsureAt < 60000)
        return;
    lastWebhookEnsureAt = now;
    try {
        const existing = await exports.evoApi.get(`/webhook/find/${exports.INSTANCE}`).catch(() => null);
        const current = existing?.data;
        const events = Array.isArray(current?.events) ? current.events : [];
        const hasRequiredEvents = REQUIRED_WEBHOOK_EVENTS.every(event => events.includes(event));
        const alreadyCorrect = current?.enabled === true &&
            current?.url === constants_1.CONFIG.EVOLUTION_WEBHOOK_URL &&
            current?.webhookByEvents === false &&
            current?.webhookBase64 === false &&
            hasRequiredEvents;
        if (alreadyCorrect)
            return;
        await exports.evoApi.post(`/webhook/set/${exports.INSTANCE}`, {
            webhook: {
                enabled: true,
                url: constants_1.CONFIG.EVOLUTION_WEBHOOK_URL,
                webhookByEvents: false,
                webhookBase64: false,
                events: REQUIRED_WEBHOOK_EVENTS,
            },
        });
        console.log(`✅ Evolution webhook registered: ${constants_1.CONFIG.EVOLUTION_WEBHOOK_URL}`);
    }
    catch (e) {
        console.error('❌ Evolution webhook registration failed:', e?.response?.data || e?.message);
    }
}
async function evoSendText(number, text) {
    await exports.evoApi.post(`/message/sendText/${exports.INSTANCE}`, { number, text });
}
async function evoSendTyping(number) {
    try {
        await exports.evoApi.post(`/chat/sendPresence/${exports.INSTANCE}`, {
            number,
            options: { presence: 'composing', delay: 1000 },
        });
    }
    catch {
        // non-critical
    }
}
let waReady = false;
let waReadySince = 0;
const isWaReady = () => waReady;
exports.isWaReady = isWaReady;
// How long the current session has been continuously open (0 when down) — used for post-reconnect warm-up
const waReadyDurationMs = () => (waReady && waReadySince ? Date.now() - waReadySince : 0);
exports.waReadyDurationMs = waReadyDurationMs;
const setWaReady = (val) => {
    if (val && !waReady)
        waReadySince = Date.now();
    else if (!val)
        waReadySince = 0;
    waReady = val;
};
exports.setWaReady = setWaReady;
exports.waClient = {
    isRegisteredUser: async (jidOrPhone) => {
        if (!waReady)
            return false;
        const phone = jidOrPhone.replace(/@.*$/, '').replace(/\D/g, '');
        if (!phone)
            return false;
        try {
            const res = await exports.evoApi.post(`/chat/whatsappNumbers/${exports.INSTANCE}`, { numbers: [phone] });
            return Boolean(res.data?.[0]?.exists);
        }
        catch {
            return false;
        }
    },
    sendMessage: async (to, content) => {
        if (!waReady)
            throw new Error('WA not ready');
        const number = to.includes('@') ? to : to.replace(/\D/g, '');
        if (typeof content === 'string' || content?.text) {
            const text = typeof content === 'string' ? content : content.text;
            return exports.evoApi.post(`/message/sendText/${exports.INSTANCE}`, { number, text });
        }
        if (content?.image) {
            const media = Buffer.isBuffer(content.image)
                ? content.image.toString('base64')
                : content.image;
            return exports.evoApi.post(`/message/sendMedia/${exports.INSTANCE}`, { number, mediatype: 'image', media });
        }
        throw new Error('Unsupported message content type');
    },
    destroy: async () => {
        waReady = false;
    },
};
async function fetchGroupName(groupJid) {
    try {
        const res = await exports.evoApi.get(`/group/findGroupInfos/${exports.INSTANCE}`, { params: { groupJid } });
        return res.data?.subject || res.data?.name || null;
    }
    catch {
        return null;
    }
}
async function getGroupInviteLink(groupJid) {
    try {
        const res = await exports.evoApi.get(`/group/inviteCode/${exports.INSTANCE}`, { params: { groupJid } });
        const code = res.data?.inviteCode || res.data?.code;
        return code ? `https://chat.whatsapp.com/${code}` : null;
    }
    catch {
        return null;
    }
}
