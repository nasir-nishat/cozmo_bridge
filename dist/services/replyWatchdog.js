"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToReplyWatchdog = addToReplyWatchdog;
exports.markReplied = markReplied;
exports.checkReplyWatchdog = checkReplyWatchdog;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const notify_1 = require("./notify");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const evoClient_1 = require("../platforms/whatsapp/evoClient");
const FILE = path_1.default.join(__dirname, '../data/reply-watchdog.json');
const ALERT_THRESHOLD_MS = 30 * 60 * 60 * 1000; // 30 hours
const HOURS_LEFT = 18; // 48 − 30
function load() {
    try {
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf8'));
    }
    catch {
        return {};
    }
}
function save(data) {
    fs_1.default.writeFileSync(FILE, JSON.stringify(data, null, 2));
}
function addToReplyWatchdog(groupId, guestName, property, groupName) {
    const data = load();
    data[groupId] = { sentAt: new Date().toISOString(), guestName, property, groupName, alerted: false };
    save(data);
    console.log(`👁️ Reply watchdog started: ${groupId} (${guestName})`);
}
function markReplied(groupId) {
    const data = load();
    if (!data[groupId])
        return;
    delete data[groupId];
    save(data);
    console.log(`✅ Reply watchdog cleared: ${groupId}`);
}
async function checkReplyWatchdog() {
    const data = load();
    const now = Date.now();
    let changed = false;
    for (const [groupId, entry] of Object.entries(data)) {
        if (entry.alerted)
            continue;
        if (now - new Date(entry.sentAt).getTime() < ALERT_THRESHOLD_MS)
            continue;
        const inviteLink = await (0, evoClient_1.getGroupInviteLink)(groupId).catch(() => null);
        await (0, notify_1.sendAlert)(`⏰ <b>No Reply Yet — WA Group</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${entry.guestName}\n` +
            `🏠 <b>Property:</b> ${entry.property}\n` +
            (entry.groupName ? `💬 <b>Group:</b> ${entry.groupName}\n` : '') +
            (inviteLink ? `🔗 <b>Link:</b> ${inviteLink}\n` : '') +
            `⚠️ <b>${HOURS_LEFT} hours left</b> to reply before WhatsApp flags the group\n` +
            `📨 <b>Please send a message in the group ASAP</b>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode: (0, groupNaming_1.propertyCodeFromName)(entry.property) || undefined }).catch(() => { });
        data[groupId].alerted = true;
        changed = true;
        console.log(`⏰ Reply watchdog alert sent: ${groupId} (${entry.guestName})`);
    }
    if (changed)
        save(data);
}
