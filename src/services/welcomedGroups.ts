import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'src/data/welcomed-groups.json');

function load(): Record<string, string> {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
    catch { return {}; }
}

function save(data: Record<string, string>): void {
    try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
    catch (e: any) { console.error('❌ welcomedGroups save:', e?.message); }
}

export function markWelcomed(groupId: string): void {
    const data = load();
    if (data[groupId]) return;
    data[groupId] = new Date().toISOString();
    save(data);
    console.log(`✅ Marked as welcomed: ${groupId}`);
}

export function isWelcomed(groupId: string): boolean {
    return !!load()[groupId];
}

export function clearWelcomed(groupId: string): void {
    const data = load();
    if (!data[groupId]) return;
    delete data[groupId];
    save(data);
}
