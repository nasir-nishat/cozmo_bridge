import { getAgent } from '../platforms/wechat/bot';

export async function wechatSendText(roomId: string, text: string): Promise<void> {
    getAgent().sendText(roomId, text);
}

export async function wechatAddMember(roomId: string, wxid: string): Promise<void> {
    await (getAgent() as any).addRoomMember(roomId, wxid);
}

export async function wechatKickMember(roomId: string, wxid: string): Promise<void> {
    await (getAgent() as any).kickRoomMember(roomId, wxid);
}

export async function wechatGetRooms(): Promise<any[]> {
    return (await (getAgent() as any).getChatroomList?.()) ?? [];
}

export async function wechatGetContacts(): Promise<any[]> {
    return (await (getAgent() as any).getContactList?.()) ?? [];
}
