"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendJandi = sendJandi;
exports.sendJandiRich = sendJandiRich;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../config/constants");
const JANDI_HEADERS = {
    'Accept': 'application/vnd.tosslab.jandi-v2+json',
    'Content-Type': 'application/json',
};
async function sendJandi(message, webhookUrl) {
    if (!constants_1.CONFIG.ENABLE_JANDI)
        return;
    try {
        if (constants_1.CONFIG.USE_TEST_JANDI_WEBHOOK) {
            console.log('🧪 JANDI test webhook enabled');
        }
        await axios_1.default.post(webhookUrl || constants_1.CONFIG.JANDI_WEBHOOK_URL, { body: message }, { headers: JANDI_HEADERS });
    }
    catch (e) {
        console.error('❌ Jandi alert failed:', e.message);
    }
}
async function sendJandiRich(body, connectInfo, webhookUrl, color = '#00C73C') {
    if (!constants_1.CONFIG.ENABLE_JANDI)
        return;
    try {
        await axios_1.default.post(webhookUrl || constants_1.CONFIG.JANDI_WEBHOOK_URL, {
            body,
            connectColor: color,
            connectInfo,
        }, { headers: JANDI_HEADERS });
    }
    catch (e) {
        console.error('❌ Jandi rich alert failed:', e.message);
    }
}
