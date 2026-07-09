import axios from 'axios';
import { CONFIG } from '../../config/constants';

export const LINE_API = 'https://api.line.me/v2/bot';

export const lineGroupKey = (id: string) => `line:${id}`;

function authHeader() {
    return { Authorization: `Bearer ${CONFIG.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
}

const groupNameCache = new Map<string, string>();

export async function getGroupName(groupId: string): Promise<string> {
    if (groupNameCache.has(groupId)) return groupNameCache.get(groupId)!;
    try {
        const res = await axios.get(`${LINE_API}/group/${groupId}/summary`, {
            headers: authHeader(),
        });
        const name: string = res.data?.groupName || groupId;
        groupNameCache.set(groupId, name);
        return name;
    } catch {
        return groupId;
    }
}

export async function pushMessage(to: string, text: string): Promise<void> {
    await axios.post(
        `${LINE_API}/message/push`,
        { to, messages: [{ type: 'text', text }] },
        { headers: authHeader() }
    );
}

export async function pushImage(to: string, imageUrl: string): Promise<void> {
    await axios.post(
        `${LINE_API}/message/push`,
        { to, messages: [{ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl }] },
        { headers: authHeader() }
    );
}

export async function replyMessage(replyToken: string, text: string): Promise<void> {
    await axios.post(
        `${LINE_API}/message/reply`,
        { replyToken, messages: [{ type: 'text', text }] },
        { headers: authHeader() }
    );
}

type LineMessage = { type: 'text'; text: string } | { type: 'image'; originalContentUrl: string; previewImageUrl: string };

export async function replyMessages(replyToken: string, messages: LineMessage[]): Promise<void> {
    await axios.post(
        `${LINE_API}/message/reply`,
        { replyToken, messages: messages.slice(0, 5) },
        { headers: authHeader() }
    );
}

export async function sendTranslation(replyToken: string, text: string, prefix: string): Promise<void> {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        chunks.push(remaining.slice(0, 4999));
        remaining = remaining.slice(4999);
    }
    const messages = chunks.slice(0, 5).map((chunk, i) => ({
        type: 'text' as const,
        text: `${i === 0 ? prefix : '[cont.]'} ${chunk}`,
    }));
    await axios.post(
        `${LINE_API}/message/reply`,
        { replyToken, messages },
        { headers: authHeader() }
    );
}
