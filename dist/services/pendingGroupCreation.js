"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueGroupCreation = enqueueGroupCreation;
exports.hasQueuedGroupCreation = hasQueuedGroupCreation;
exports.checkForStuckGroupCreations = checkForStuckGroupCreations;
exports.flushPendingGroupCreations = flushPendingGroupCreations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sentMessages_1 = require("./sentMessages");
const groupLeads_1 = require("./groupLeads");
const notify_1 = require("./notify");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const FILE = path_1.default.join(process.cwd(), 'src/data/pending-group-creation.json');
function load() {
    try {
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function save(q) {
    try {
        fs_1.default.writeFileSync(FILE, JSON.stringify(q, null, 2));
    }
    catch (e) {
        console.error('❌ pendingGroupCreation save:', e?.message);
    }
}
function enqueueGroupCreation(job) {
    const q = load();
    if (q.some(m => m.leadUid === job.leadUid))
        return;
    q.push({ ...job, createdAt: new Date().toISOString() });
    save(q);
    console.log(`📋 Queued group creation for ${job.guestName} (${job.leadUid}) at ${job.fireAt}`);
}
function hasQueuedGroupCreation(leadUid) {
    return load().some(m => m.leadUid === leadUid);
}
function dequeue(leadUid) {
    save(load().filter(m => m.leadUid !== leadUid));
}
const stuckAlertedAt = new Map();
const STUCK_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const STUCK_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
async function checkForStuckGroupCreations() {
    const now = Date.now();
    const queue = load();
    for (const job of queue) {
        const ageMs = now - new Date(job.createdAt).getTime();
        if (ageMs < STUCK_THRESHOLD_MS)
            continue;
        const lastAlert = stuckAlertedAt.get(job.leadUid) ?? 0;
        if (now - lastAlert < STUCK_ALERT_COOLDOWN_MS)
            continue;
        stuckAlertedAt.set(job.leadUid, now);
        const hours = Math.floor(ageMs / 3600000);
        await (0, notify_1.sendAlert)(`⚠️ <b>WA Group Creation Stuck</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${job.guestName}\n` +
            `🏠 <b>Property:</b> ${job.property}\n` +
            `⏱️ <b>Waiting:</b> ${hours}h\n` +
            `─────────────────\n<i>Queue entry may need manual check · COZMO</i>`, { propertyCode: (0, groupNaming_1.propertyCodeFromName)(job.property) || undefined }).catch(() => { });
    }
}
let flushing = false;
async function flushPendingGroupCreations() {
    if (flushing)
        return;
    const now = Date.now();
    const due = load().filter(m => new Date(m.fireAt).getTime() <= now);
    if (!due.length)
        return;
    flushing = true;
    try {
        // Import here to avoid circular deps at module load time
        const { createBookingGroup } = await Promise.resolve().then(() => __importStar(require('../platforms/whatsapp/groupCreation')));
        for (const job of due) {
            // Skip if group already exists (created manually or by fallback)
            if ((0, groupLeads_1.getGroupIdByLeadUid)(job.leadUid)) {
                console.log(`⏭️ Group already exists for ${job.leadUid} — dequeuing`);
                dequeue(job.leadUid);
                continue;
            }
            // Wait until Step 2 HF inbox is confirmed sent before creating group
            if (!(0, sentMessages_1.isSent)(`hf:${job.leadUid}`, 'hf_step2') && !(0, sentMessages_1.isSent)(`hf:${job.leadUid}`, 'hf_no_wa')) {
                console.log(`⏳ Step 2 not yet sent for ${job.leadUid} — deferring group creation`);
                continue;
            }
            try {
                console.log(`🏗️ Creating group for ${job.guestName} (${job.leadUid})`);
                const groupId = await createBookingGroup({
                    guest_name: job.guestName,
                    phone: job.onWhatsApp ? job.phone : '',
                    property: job.property,
                    check_in: job.checkIn,
                    check_out: job.checkOut,
                    nationality: job.nationality,
                    lead_uid: job.leadUid,
                    property_uid: job.propertyUid,
                    lead_status: job.leadStatus,
                    lead_type: job.leadType,
                    group_name: job.groupName,
                });
                dequeue(job.leadUid);
                // For no-WA guests: send invite link via HF inbox only (no WA DM — guest has no WA)
                if (!job.onWhatsApp && groupId) {
                    const { getGroupInviteLink } = await Promise.resolve().then(() => __importStar(require('../platforms/whatsapp/evoClient')));
                    const { sendHfInviteLink } = await Promise.resolve().then(() => __importStar(require('./hostfully')));
                    const inviteLink = await getGroupInviteLink(groupId).catch(() => null);
                    if (inviteLink) {
                        sendHfInviteLink(job.leadUid, job.guestName, inviteLink).catch((e) => console.warn('⚠️ sendHfInviteLink (no-WA) failed:', e?.message));
                        console.log(`🔗 Invite link sent via HF inbox (no WA): ${job.guestName}`);
                    }
                }
            }
            catch (e) {
                console.error(`❌ Group creation failed (${job.leadUid}):`, e?.message);
            }
        }
    }
    finally {
        flushing = false;
    }
}
