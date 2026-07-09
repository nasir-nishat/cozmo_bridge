"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleReminder = scheduleReminder;
exports.cancelReminder = cancelReminder;
exports.hasPendingReminder = hasPendingReminder;
exports.checkAndFireReminders = checkAndFireReminders;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const evoClient_1 = require("../platforms/whatsapp/evoClient");
const sheets_1 = require("./sheets");
const FILE = path_1.default.join(process.cwd(), 'src/data/pending-reminders.json');
const REMINDER_DELAY_MS = 60 * 60 * 1000; // 1 hour
function load() {
    try {
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function save(reminders) {
    try {
        fs_1.default.writeFileSync(FILE, JSON.stringify(reminders, null, 2));
    }
    catch (e) {
        console.error('❌ groupReminders save:', e?.message);
    }
}
function scheduleReminder(groupId, leadUid) {
    const reminders = load();
    if (reminders.some(r => r.groupId === groupId && !r.cancelled && !r.fired))
        return;
    reminders.push({ groupId, leadUid, fireAt: Date.now() + REMINDER_DELAY_MS, cancelled: false, fired: false });
    save(reminders);
    console.log(`⏰ Companion reminder scheduled for ${groupId} in 1h`);
}
function cancelReminder(groupId, reason) {
    const reminders = load();
    const r = reminders.find(r => r.groupId === groupId && !r.cancelled && !r.fired);
    if (!r)
        return;
    r.cancelled = true;
    r.cancelReason = reason;
    save(reminders);
    console.log(`🚫 Companion reminder cancelled for ${groupId}: ${reason}`);
}
function hasPendingReminder(groupId) {
    return load().some(r => r.groupId === groupId && !r.cancelled && !r.fired);
}
function markFired(groupId) {
    const reminders = load();
    const r = reminders.find(r => r.groupId === groupId && !r.fired);
    if (!r)
        return;
    r.fired = true;
    save(reminders);
}
async function checkAndFireReminders() {
    const now = Date.now();
    const due = load().filter(r => !r.cancelled && !r.fired && r.fireAt <= now);
    for (const r of due) {
        markFired(r.groupId);
        try {
            const msg = await (0, sheets_1.getGroupCreationMsg)('second_msg_after_welcoming').catch(() => '');
            if (!msg) {
                console.warn(`⚠️ second_msg_after_welcoming not found in group_creation_msgs — skipping group ${r.groupId}`);
                continue;
            }
            await (0, evoClient_1.evoSendText)(r.groupId, msg);
            console.log(`⏰ Companion reminder sent to group ${r.groupId}`);
        }
        catch (e) {
            const status = e?.response?.status;
            if (status === 400 || status === 404) {
                console.warn(`⚠️ Companion reminder skipped for ${r.groupId}: group unreachable (${status})`);
            }
            else {
                console.error(`❌ Companion reminder failed for ${r.groupId}:`, e?.message);
            }
        }
    }
}
