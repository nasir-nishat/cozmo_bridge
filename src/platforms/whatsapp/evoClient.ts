import axios from 'axios';
import { CONFIG } from '../../config/constants';

export const INSTANCE = CONFIG.EVOLUTION_INSTANCE;

export const evoApi = axios.create({
    baseURL: CONFIG.EVOLUTION_API_URL,
    headers: CONFIG.EVOLUTION_API_KEY ? { apikey: CONFIG.EVOLUTION_API_KEY } : {},
    timeout: 20_000,
});

export async function evoSendText(number: string, text: string): Promise<void> {
    await evoApi.post(`/message/sendText/${INSTANCE}`, { number, text });
}

export async function evoSendTyping(number: string): Promise<void> {
    try {
        await evoApi.post(`/chat/sendPresence/${INSTANCE}`, {
            number,
            options: { presence: 'composing', delay: 1000 },
        });
    } catch {
        // non-critical
    }
}

let waReady = false;
let waReadySince = 0;

export const isWaReady = () => waReady;
// How long the current session has been continuously open (0 when down) — used for post-reconnect warm-up
export const waReadyDurationMs = () => (waReady && waReadySince ? Date.now() - waReadySince : 0);
export const setWaReady = (val: boolean) => {
    if (val && !waReady) waReadySince = Date.now();
    else if (!val) waReadySince = 0;
    waReady = val;
};

export const waClient = {
    isRegisteredUser: async (jidOrPhone: string): Promise<boolean> => {
        if (!waReady) return false;
        const phone = jidOrPhone.replace(/@.*$/, '').replace(/\D/g, '');
        if (!phone) return false;
        try {
            const res = await evoApi.post(`/chat/whatsappNumbers/${INSTANCE}`, { numbers: [phone] });
            return Boolean(res.data?.[0]?.exists);
        } catch {
            return false;
        }
    },
    sendMessage: async (to: string, content: any): Promise<any> => {
        if (!waReady) throw new Error('WA not ready');
        const number = to.includes('@') ? to : to.replace(/\D/g, '');
        if (typeof content === 'string' || content?.text) {
            const text = typeof content === 'string' ? content : content.text;
            return evoApi.post(`/message/sendText/${INSTANCE}`, { number, text });
        }
        if (content?.image) {
            const media = Buffer.isBuffer(content.image)
                ? content.image.toString('base64')
                : content.image;
            return evoApi.post(`/message/sendMedia/${INSTANCE}`, { number, mediatype: 'image', media });
        }
        throw new Error('Unsupported message content type');
    },
    destroy: async (): Promise<void> => {
        waReady = false;
    },
};

export async function fetchGroupName(groupJid: string): Promise<string | null> {
    try {
        const res = await evoApi.get(`/group/findGroupInfos/${INSTANCE}`, { params: { groupJid } });
        return res.data?.subject || res.data?.name || null;
    } catch {
        return null;
    }
}

export async function getGroupInviteLink(groupJid: string): Promise<string | null> {
    try {
        const res = await evoApi.get(`/group/inviteCode/${INSTANCE}`, { params: { groupJid } });
        const code = res.data?.inviteCode || res.data?.code;
        return code ? `https://chat.whatsapp.com/${code}` : null;
    } catch {
        return null;
    }
}
