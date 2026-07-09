import fs from 'fs';
import path from 'path';

const QUEUE_FILE = path.join(process.cwd(), 'src/data/pending-messages.json');

export interface PendingMeta {
    guestName: string;
    phone: string;
    property: string;
    guestOnWA: boolean;
    checkIn?: string;
    checkOut?: string;
}

export interface PendingMsg {
    groupId: string;
    nationality: string;
    label: string;
    createdAt: string;
    attempts: number;
    meta?: PendingMeta;
}

function load(): PendingMsg[] {
    try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); }
    catch { return []; }
}

function save(q: PendingMsg[]): void {
    try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2)); }
    catch (e: any) { console.error('❌ pendingMessages save:', e?.message); }
}

export function enqueue(groupId: string, nationality: string, label: string, meta?: PendingMeta): void {
    const q = load();
    if (q.some(m => m.groupId === groupId)) return;
    q.push({ groupId, nationality, label, createdAt: new Date().toISOString(), attempts: 0, meta });
    save(q);
    console.log(`📋 Queued pending messages: ${groupId} (${label})`);
}

export function dequeue(groupId: string): void {
    save(load().filter(m => m.groupId !== groupId));
}

export function getPending(): PendingMsg[] {
    return load();
}

export function incrementAttempts(groupId: string): void {
    const q = load();
    const item = q.find(m => m.groupId === groupId);
    if (item) { item.attempts++; save(q); }
}
