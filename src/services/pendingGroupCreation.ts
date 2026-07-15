import fs from 'fs';
import path from 'path';
import { isSent } from './sentMessages';
import { getGroupIdByLeadUid } from './groupLeads';
import { sendAlert } from './notify';
import { canAutoCreateGroup } from './groupCreationPacing';
import { propertyCodeFromName } from '../platforms/whatsapp/groupNaming';

const FILE = path.join(process.cwd(), 'src/data/pending-group-creation.json');

export interface PendingGroupCreation {
    leadUid: string;
    propertyUid: string;
    guestName: string;
    phone: string;
    property: string;
    checkIn: string;
    checkOut: string;
    nationality: string;
    leadStatus: string;
    leadType: string;
    groupName: string;
    onWhatsApp: boolean;
    fireAt: string;
    createdAt: string;
}

function load(): PendingGroupCreation[] {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
    catch { return []; }
}

function save(q: PendingGroupCreation[]): void {
    try { fs.writeFileSync(FILE, JSON.stringify(q, null, 2)); }
    catch (e: any) { console.error('❌ pendingGroupCreation save:', e?.message); }
}

export function enqueueGroupCreation(job: Omit<PendingGroupCreation, 'createdAt'>): void {
    const q = load();
    if (q.some(m => m.leadUid === job.leadUid)) return;
    q.push({ ...job, createdAt: new Date().toISOString() });
    save(q);
    console.log(`📋 Queued group creation for ${job.guestName} (${job.leadUid}) at ${job.fireAt}`);
}

export function hasQueuedGroupCreation(leadUid: string): boolean {
    return load().some(m => m.leadUid === leadUid);
}

function dequeue(leadUid: string): void {
    save(load().filter(m => m.leadUid !== leadUid));
}

const stuckAlertedAt = new Map<string, number>();
const STUCK_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const STUCK_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export async function checkForStuckGroupCreations(): Promise<void> {
    const now = Date.now();
    const queue = load();
    if (queue.length && !canAutoCreateGroup().ok) return; // held by pacing — waiting is expected, not stuck
    for (const job of queue) {
        const ageMs = now - new Date(job.createdAt).getTime();
        if (ageMs < STUCK_THRESHOLD_MS) continue;
        const lastAlert = stuckAlertedAt.get(job.leadUid) ?? 0;
        if (now - lastAlert < STUCK_ALERT_COOLDOWN_MS) continue;
        stuckAlertedAt.set(job.leadUid, now);
        const hours = Math.floor(ageMs / 3_600_000);
        await sendAlert(
            `⚠️ <b>WA Group Creation Stuck</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${job.guestName}\n` +
            `🏠 <b>Property:</b> ${job.property}\n` +
            `⏱️ <b>Waiting:</b> ${hours}h\n` +
            `─────────────────\n<i>Queue entry may need manual check · COZMO</i>`,
            { propertyCode: propertyCodeFromName(job.property) || undefined }
        ).catch(() => {});
    }
}

let flushing = false;
export async function flushPendingGroupCreations(): Promise<void> {
    if (flushing) return;
    const now = Date.now();
    const due = load().filter(m => new Date(m.fireAt).getTime() <= now);
    if (!due.length) return;

    const pacing = canAutoCreateGroup();
    if (!pacing.ok) {
        console.log(`🐢 Auto group creation held: ${pacing.reason} — ${due.length} job(s) stay queued`);
        return;
    }

    flushing = true;
    try {
        // Import here to avoid circular deps at module load time
        const { createBookingGroup } = await import('../platforms/whatsapp/groupCreation');

        for (const job of due) {
            // Skip if group already exists (created manually or by fallback)
            if (getGroupIdByLeadUid(job.leadUid)) {
                console.log(`⏭️ Group already exists for ${job.leadUid} — dequeuing`);
                dequeue(job.leadUid);
                continue;
            }
            // Wait until Step 2 HF inbox is confirmed sent before creating group
            if (!isSent(`hf:${job.leadUid}`, 'hf_step2') && !isSent(`hf:${job.leadUid}`, 'hf_no_wa')) {
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
                    const { getGroupInviteLink } = await import('../platforms/whatsapp/evoClient');
                    const { sendHfInviteLink } = await import('./hostfully');
                    const inviteLink = await getGroupInviteLink(groupId).catch(() => null);
                    if (inviteLink) {
                        sendHfInviteLink(job.leadUid, job.guestName, inviteLink).catch((e: any) =>
                            console.warn('⚠️ sendHfInviteLink (no-WA) failed:', e?.message)
                        );
                        console.log(`🔗 Invite link sent via HF inbox (no WA): ${job.guestName}`);
                    }
                }
                // One auto-created group per flush cycle — the pacing gate decides when the next one runs
                if (groupId) break;
            } catch (e: any) {
                console.error(`❌ Group creation failed (${job.leadUid}):`, e?.message);
            }
        }
    } finally {
        flushing = false;
    }
}
