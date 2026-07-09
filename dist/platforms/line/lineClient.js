"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lineGroupKey = exports.LINE_API = void 0;
exports.checkLineAuth = checkLineAuth;
exports.getGroupName = getGroupName;
exports.pushMessage = pushMessage;
exports.pushImage = pushImage;
exports.replyMessage = replyMessage;
exports.replyMessages = replyMessages;
exports.sendTranslation = sendTranslation;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../../config/constants");
exports.LINE_API = 'https://api.line.me/v2/bot';
const lineGroupKey = (id) => `line:${id}`;
exports.lineGroupKey = lineGroupKey;
let cachedAuthStatus = null;
const LINE_AUTH_CACHE_MS = 60000;
function authHeader() {
    return { Authorization: `Bearer ${constants_1.CONFIG.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
}
const groupNameCache = new Map();
async function checkLineAuth() {
    const now = Date.now();
    if (cachedAuthStatus && now - cachedAuthStatus.checkedAt < LINE_AUTH_CACHE_MS) {
        return cachedAuthStatus;
    }
    if (!constants_1.CONFIG.LINE_CHANNEL_ACCESS_TOKEN) {
        cachedAuthStatus = {
            connected: false,
            checkedAt: now,
            error: 'LINE_CHANNEL_ACCESS_TOKEN is not configured',
        };
        return cachedAuthStatus;
    }
    try {
        await axios_1.default.get(`${exports.LINE_API}/info`, {
            headers: authHeader(),
            timeout: 5000,
        });
        cachedAuthStatus = { connected: true, checkedAt: now };
    }
    catch (e) {
        const status = e?.response?.status;
        cachedAuthStatus = {
            connected: false,
            checkedAt: now,
            error: status ? `LINE API returned ${status}` : e?.message || 'LINE API check failed',
        };
    }
    return cachedAuthStatus;
}
async function getGroupName(groupId) {
    if (groupNameCache.has(groupId))
        return groupNameCache.get(groupId);
    try {
        const res = await axios_1.default.get(`${exports.LINE_API}/group/${groupId}/summary`, {
            headers: authHeader(),
        });
        const name = res.data?.groupName || groupId;
        groupNameCache.set(groupId, name);
        return name;
    }
    catch {
        return groupId;
    }
}
async function pushMessage(to, text) {
    await axios_1.default.post(`${exports.LINE_API}/message/push`, { to, messages: [{ type: 'text', text }] }, { headers: authHeader() });
}
async function pushImage(to, imageUrl) {
    await axios_1.default.post(`${exports.LINE_API}/message/push`, { to, messages: [{ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl }] }, { headers: authHeader() });
}
async function replyMessage(replyToken, text) {
    await axios_1.default.post(`${exports.LINE_API}/message/reply`, { replyToken, messages: [{ type: 'text', text }] }, { headers: authHeader() });
}
async function replyMessages(replyToken, messages) {
    await axios_1.default.post(`${exports.LINE_API}/message/reply`, { replyToken, messages: messages.slice(0, 5) }, { headers: authHeader() });
}
async function sendTranslation(replyToken, text, prefix) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        chunks.push(remaining.slice(0, 4999));
        remaining = remaining.slice(4999);
    }
    const messages = chunks.slice(0, 5).map((chunk, i) => ({
        type: 'text',
        text: `${i === 0 ? prefix : '[cont.]'} ${chunk}`,
    }));
    await axios_1.default.post(`${exports.LINE_API}/message/reply`, { replyToken, messages }, { headers: authHeader() });
}
