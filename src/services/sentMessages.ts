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

const FILE = path.join(process.cwd(), 'src/data/sent-messages.json');

function load(): Record<string, string> {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
    catch { return {}; }
}

function save(data: Record<string, string>): void {
    try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
    catch (e: any) { console.error('❌ sentMessages save:', e?.message); }
}

function key(groupKey: string, type: MessageType): string {
    return `${groupKey}:${type}`;
}

export function markSent(groupKey: string, type: MessageType): void {
    const data = load();
    const k = key(groupKey, type);
    if (data[k]) return;
    data[k] = new Date().toISOString();
    save(data);
    console.log(`✅ Marked ${type} sent: ${groupKey}`);
}

export function isSent(groupKey: string, type: MessageType): boolean {
    return !!load()[key(groupKey, type)];
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
