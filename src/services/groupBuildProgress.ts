// Live per-build step tracker for WhatsApp group creation — powers the admin-ui "Group Builds"
// page so the team can see exactly which step a build is on and what happens next.
// Telemetry only: every function swallows its own errors so it can NEVER break a live build.

import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'src/data/group-build-progress.json');
const KEEP = 40; // most recent builds retained

export type BuildStepKey = 'create' | 'settings' | 'stabilize' | 'admins' | 'icon' | 'link' | 'welcome';
export type StepStatus = 'pending' | 'active' | 'done' | 'warn';

// Ordered plan — `expect` is the team-facing "what happens & how long" text.
// Deliberately slow-paced (anti-ban): see docs/whatsapp-anti-ban.md §3.2.
export const BUILD_STEP_PLAN: Array<{ key: BuildStepKey; label: string; expect: string }> = [
    { key: 'create',    label: 'Create group',      expect: 'Group created with guest + active team members added' },
    { key: 'settings',  label: 'Group settings',    expect: 'Starts 1–2 min later: open chat, invite link, member-add, join approval — 25–50s apart (~3 min)' },
    { key: 'stabilize', label: 'Quiet wait',        expect: '3–5 min of silence so WhatsApp sees a human-paced setup' },
    { key: 'admins',    label: 'Admin promotion',   expect: 'Staff then guest promoted to admin (up to 2 tries). After this the team can add family/friends' },
    { key: 'icon',      label: 'Group icon',        expect: 'Property photo set 30–45 min after creation (deferred on purpose)' },
    { key: 'link',      label: 'Link & team alert', expect: 'Group linked to the booking; "Group Created" alert goes to Jandi/Telegram' },
    { key: 'welcome',   label: 'Welcome messages',  expect: '8–15 min quiet cooldown, then brand + intro + business card, 2–5 min apart' },
];

export interface BuildRecord {
    leadUid: string;
    guestName: string;
    property: string;
    groupName: string;
    groupId: string | null;
    status: 'building' | 'done' | 'failed';
    startedAt: string;
    finishedAt: string | null;
    steps: Partial<Record<BuildStepKey, { status: StepStatus; at: string; note?: string }>>;
}

// In-memory list is the runtime source of truth; the file is a lenient-loaded snapshot
// (telemetry — losing history on a corrupt read is acceptable, unlike group-leads.json).
let builds: BuildRecord[] = loadLenient();

function loadLenient(): BuildRecord[] {
    try {
        const arr = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        if (Array.isArray(arr)) {
            // A build can't survive a process restart — anything still "building" is stale
            for (const b of arr) if (b?.status === 'building') b.status = 'failed';
            return arr;
        }
    } catch { }
    return [];
}

function persist(): void {
    try {
        const tmp = `${FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(builds.slice(0, KEEP), null, 2));
        fs.renameSync(tmp, FILE);
    } catch (e: any) { console.warn('⚠️ groupBuildProgress persist:', e?.message); }
}

function find(leadUid: string): BuildRecord | undefined {
    return builds.find(b => b.leadUid === leadUid && b.status === 'building');
}

export function buildStarted(info: { leadUid: string; guestName: string; property: string; groupName: string }): void {
    try {
        // A retry of a previously failed build replaces the old record
        builds = builds.filter(b => !(b.leadUid === info.leadUid && b.status !== 'done'));
        builds.unshift({
            ...info,
            groupId: null,
            status: 'building',
            startedAt: new Date().toISOString(),
            finishedAt: null,
            steps: { create: { status: 'active', at: new Date().toISOString() } },
        });
        persist();
    } catch { }
}

export function buildStep(leadUid: string, key: BuildStepKey, status: StepStatus, note?: string): void {
    try {
        const b = find(leadUid);
        if (!b) return;
        b.steps[key] = { status, at: new Date().toISOString(), ...(note ? { note } : {}) };
        persist();
    } catch { }
}

export function buildGroupId(leadUid: string, groupId: string): void {
    try {
        const b = find(leadUid);
        if (b) { b.groupId = groupId; persist(); }
    } catch { }
}

export function buildFinished(leadUid: string): void {
    try {
        const b = find(leadUid);
        if (!b) return;
        b.status = 'done';
        b.finishedAt = new Date().toISOString();
        persist();
    } catch { }
}

export function buildFailed(leadUid: string, note?: string): void {
    try {
        const b = find(leadUid);
        if (!b) return;
        b.status = 'failed';
        b.finishedAt = new Date().toISOString();
        for (const k of Object.keys(b.steps) as BuildStepKey[]) {
            if (b.steps[k]?.status === 'active') b.steps[k] = { status: 'warn', at: new Date().toISOString(), note };
        }
        persist();
    } catch { }
}

// Icon fires 30–45 min after creation, usually past buildFinished — allow updating done builds too
export function buildStepLate(leadUid: string, key: BuildStepKey, status: StepStatus, note?: string): void {
    try {
        const b = builds.find(x => x.leadUid === leadUid);
        if (!b) return;
        b.steps[key] = { status, at: new Date().toISOString(), ...(note ? { note } : {}) };
        persist();
    } catch { }
}

export function getBuilds(): BuildRecord[] {
    return builds.slice(0, KEEP);
}
