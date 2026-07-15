import fs from 'fs';
import path from 'path';

export type MessageType =
    | 'welcome'
    | 'welcome_status'
    | 'welcome_brand'
    | 'welcome_intro'
    | 'welcome_card'
    | 'hf_step1'
    | 'hf_step2'
    | 'hf_no_wa'
    | 'hf_pre_payment'
    | 'checkin_tips'
    | 'checkin_rules'
    | 'checkout_reminder'
    | 'checkout_instructions_am'
    | 'farewell'
    | 'final_bill';

// Who completed a step. 'cozmo' = automation sent it; 'team' = a human did it manually
// (detected by the step watcher, or via a manual command).
export type StepActor = 'cozmo' | 'team';

// Stored value is an object going forward; legacy entries are a bare ISO string (treated as 'cozmo').
type StepRecord = { at: string; by: StepActor };
type StoredValue = string | StepRecord;

const FILE = path.join(process.cwd(), 'src/data/sent-messages.json');

function load(): Record<string, StoredValue> {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
    catch { return {}; }
}

function save(data: Record<string, StoredValue>): void {
    try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
    catch (e: any) { console.error('❌ sentMessages save:', e?.message); }
}

function key(groupKey: string, type: MessageType): string {
    return `${groupKey}:${type}`;
}

function normalize(v: StoredValue | undefined): StepRecord | null {
    if (!v) return null;
    return typeof v === 'string' ? { at: v, by: 'cozmo' } : v;
}

export function markSent(groupKey: string, type: MessageType, by: StepActor = 'cozmo'): void {
    const data = load();
    const k = key(groupKey, type);
    if (data[k]) return; // first writer wins — never overwrite an existing completion
    data[k] = { at: new Date().toISOString(), by };
    save(data);
    console.log(`✅ Marked ${type} done by ${by}: ${groupKey}`);
}

export function isSent(groupKey: string, type: MessageType): boolean {
    return !!load()[key(groupKey, type)];
}

// Full record (when + who) for a single step, or null if not done
export function getStep(groupKey: string, type: MessageType): StepRecord | null {
    return normalize(load()[key(groupKey, type)]);
}

// The whole checklist for a group: every step in `types` with done/by/at
export function getGroupSteps(groupKey: string, types: MessageType[]): Array<{ type: MessageType; done: boolean; by: StepActor | null; at: string | null }> {
    const data = load();
    return types.map(type => {
        const rec = normalize(data[key(groupKey, type)]);
        return { type, done: !!rec, by: rec?.by ?? null, at: rec?.at ?? null };
    });
}

export function clearSentForGroup(groupKey: string): number {
    const data = load();
    let removed = 0;
    for (const k of Object.keys(data)) {
        if (k.startsWith(`${groupKey}:`)) {
            delete data[k];
            removed++;
        }
    }
    if (removed > 0) save(data);
    return removed;
}
