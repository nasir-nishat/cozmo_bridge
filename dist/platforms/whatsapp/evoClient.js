"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.waClient = exports.setWaReady = exports.isWaReady = exports.evoApi = exports.INSTANCE = void 0;
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
const isWaReady = () => waReady;
exports.isWaReady = isWaReady;
const setWaReady = (val) => { waReady = val; };
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
