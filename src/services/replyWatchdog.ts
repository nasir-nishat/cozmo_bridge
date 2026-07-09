import fs from 'fs';
import path from 'path';
import { sendAlert } from './notify';
import { propertyCodeFromName } from '../platforms/whatsapp/groupNaming';
import { getGroupInviteLink } from '../platforms/whatsapp/evoClient';

const FILE = path.join(__dirname, '../data/reply-watchdog.json');
const ALERT_THRESHOLD_MS = 30 * 60 * 60 * 1000; // 30 hours
const HOURS_LEFT = 18; // 48 − 30

interface WatchEntry {
    sentAt: string;
    guestName: string;
    property: string;
    groupName?: string;
    alerted: boolean;
}

function load(): Record<string, WatchEntry> {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

function save(data: Record<string, WatchEntry>) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function addToReplyWatchdog(groupId: string, guestName: string, property: string, groupName?: string) {
    const data = load();
    data[groupId] = { sentAt: new Date().toISOString(), guestName, property, groupName, alerted: false };
    save(data);
    console.log(`👁️ Reply watchdog started: ${groupId} (${guestName})`);
}

export function markReplied(groupId: string) {
    const data = load();
    if (!data[groupId]) return;
    delete data[groupId];
    save(data);
    console.log(`✅ Reply watchdog cleared: ${groupId}`);
}

export async function checkReplyWatchdog(): Promise<void> {
    const data = load();
    const now = Date.now();
    let changed = false;

    for (const [groupId, entry] of Object.entries(data)) {
        if (entry.alerted) continue;
        if (now - new Date(entry.sentAt).getTime() < ALERT_THRESHOLD_MS) continue;

        const inviteLink = await getGroupInviteLink(groupId).catch(() => null);

        await sendAlert(
            `⏰ <b>No Reply Yet — WA Group</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${entry.guestName}\n` +
            `🏠 <b>Property:</b> ${entry.property}\n` +
            (entry.groupName ? `💬 <b>Group:</b> ${entry.groupName}\n` : '') +
            (inviteLink ? `🔗 <b>Link:</b> ${inviteLink}\n` : '') +
            `⚠️ <b>${HOURS_LEFT} hours left</b> to reply before WhatsApp flags the group\n` +
            `📨 <b>Please send a message in the group ASAP</b>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { propertyCode: propertyCodeFromName(entry.property) || undefined }
        ).catch(() => {});

        data[groupId].alerted = true;
        changed = true;
        console.log(`⏰ Reply watchdog alert sent: ${groupId} (${entry.guestName})`);
    }

    if (changed) save(data);
}
