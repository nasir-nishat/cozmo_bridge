"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wechatSendText = wechatSendText;
exports.wechatAddMember = wechatAddMember;
exports.wechatKickMember = wechatKickMember;
exports.wechatGetRooms = wechatGetRooms;
exports.wechatGetContacts = wechatGetContacts;
const bot_1 = require("../platforms/wechat/bot");
async function wechatSendText(roomId, text) {
    (0, bot_1.getAgent)().sendText(roomId, text);
}
async function wechatAddMember(roomId, wxid) {
    await (0, bot_1.getAgent)().addRoomMember(roomId, wxid);
}
async function wechatKickMember(roomId, wxid) {
    await (0, bot_1.getAgent)().kickRoomMember(roomId, wxid);
}
async function wechatGetRooms() {
    return (await (0, bot_1.getAgent)().getChatroomList?.()) ?? [];
}
async function wechatGetContacts() {
    return (await (0, bot_1.getAgent)().getContactList?.()) ?? [];
}
