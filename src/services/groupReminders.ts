import fs from 'fs';
import path from 'path';
import { evoSendText } from '../platforms/whatsapp/evoClient';
import { getGroupCreationMsg } from './sheets';

const FILE = path.join(process.cwd(), 'src/data/pending-reminders.json');
const REMINDER_DELAY_MS = 60 * 60 * 1000; // 1 hour

interface Reminder {
    groupId: string;
    leadUid: string;
    fireAt: number;
    cancelled: boolean;
    fired: boolean;
    cancelReason?: string;
}

function load(): Reminder[] {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
    catch { return []; }
}

function save(reminders: Reminder[]): void {
    try { fs.writeFileSync(FILE, JSON.stringify(reminders, null, 2)); }
    catch (e: any) { console.error('❌ groupReminders save:', e?.message); }
}

export function scheduleReminder(groupId: string, leadUid: string): void {
    const reminders = load();
    if (reminders.some(r => r.groupId === groupId && !r.cancelled && !r.fired)) return;
    reminders.push({ groupId, leadUid, fireAt: Date.now() + REMINDER_DELAY_MS, cancelled: false, fired: false });
    save(reminders);
    console.log(`⏰ Companion reminder scheduled for ${groupId} in 1h`);
}

export function cancelReminder(groupId: string, reason: string): void {
    const reminders = load();
    const r = reminders.find(r => r.groupId === groupId && !r.cancelled && !r.fired);
    if (!r) return;
    r.cancelled = true;
    r.cancelReason = reason;
    save(reminders);
    console.log(`🚫 Companion reminder cancelled for ${groupId}: ${reason}`);
}

export function hasPendingReminder(groupId: string): boolean {
    return load().some(r => r.groupId === groupId && !r.cancelled && !r.fired);
}

function markFired(groupId: string): void {
    const reminders = load();
    const r = reminders.find(r => r.groupId === groupId && !r.fired);
    if (!r) return;
    r.fired = true;
    save(reminders);
}

export async function checkAndFireReminders(): Promise<void> {
    const now = Date.now();
    const due = load().filter(r => !r.cancelled && !r.fired && r.fireAt <= now);
    for (const r of due) {
        markFired(r.groupId);
        try {
            const msg = await getGroupCreationMsg('second_msg_after_welcoming').catch(() => '');
            if (!msg) {
                console.warn(`⚠️ second_msg_after_welcoming not found in group_creation_msgs — skipping group ${r.groupId}`);
                continue;
            }
            await evoSendText(r.groupId, msg);
            console.log(`⏰ Companion reminder sent to group ${r.groupId}`);
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 400 || status === 404) {
                console.warn(`⚠️ Companion reminder skipped for ${r.groupId}: group unreachable (${status})`);
            } else {
                console.error(`❌ Companion reminder failed for ${r.groupId}:`, e?.message);
            }
        }
    }
}
