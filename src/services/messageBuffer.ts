import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'src/data/message-buffer.json');
const MAX_PER_GROUP = 100;
const BUFFER_WINDOW_MS = 4 * 60 * 60 * 1000; // keep last 4 hours

interface BufferedMessage {
    sender: string;
    text: string;
    ts: number; // unix ms
}

type Buffer = Record<string, BufferedMessage[]>;

function load(): Buffer {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
    catch { return {}; }
}

function save(buf: Buffer): void {
    try { fs.writeFileSync(FILE, JSON.stringify(buf, null, 2)); }
    catch { /* non-critical */ }
}

export function addToBuffer(groupKey: string, sender: string, text: string): void {
    const buf = load();
    if (!buf[groupKey]) buf[groupKey] = [];
    buf[groupKey].push({ sender, text, ts: Date.now() });
    // Keep only last MAX_PER_GROUP entries
    if (buf[groupKey].length > MAX_PER_GROUP) {
        buf[groupKey] = buf[groupKey].slice(-MAX_PER_GROUP);
    }
    save(buf);
}

// Returns messages received within the last `sinceMinutes` minutes for a group
export function getRecentMessages(groupKey: string, sinceMinutes: number): BufferedMessage[] {
    const buf = load();
    const cutoff = Date.now() - sinceMinutes * 60 * 1000;
    return (buf[groupKey] ?? []).filter(m => m.ts >= cutoff);
}

// Prune entries older than BUFFER_WINDOW_MS from all groups — call periodically
export function pruneBuffer(): void {
    const buf = load();
    const cutoff = Date.now() - BUFFER_WINDOW_MS;
    let changed = false;
    for (const key of Object.keys(buf)) {
        const before = buf[key].length;
        buf[key] = buf[key].filter(m => m.ts >= cutoff);
        if (buf[key].length !== before) changed = true;
        if (buf[key].length === 0) delete buf[key];
    }
    if (changed) save(buf);
}
