import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PRIMARY_FILE = path.join(ROOT, 'src/data/group-leads.json');
const LEGACY_DIST_FILE = path.join(ROOT, 'dist/data/group-leads.json');

const FILE = (() => {
    if (fs.existsSync(PRIMARY_FILE)) return PRIMARY_FILE;
    if (fs.existsSync(LEGACY_DIST_FILE)) return LEGACY_DIST_FILE;
    return PRIMARY_FILE;
})();

function ensureCanonicalFile() {
    if (FILE !== PRIMARY_FILE && fs.existsSync(FILE) && !fs.existsSync(PRIMARY_FILE)) {
        const data = fs.readFileSync(FILE, 'utf-8');
        fs.mkdirSync(path.dirname(PRIMARY_FILE), { recursive: true });
        fs.writeFileSync(PRIMARY_FILE, data);
    }
}

// ─── Safe JSON persistence ───────────────────────────────────────────────────
// History: a transient read failure used to be swallowed as `{}`, so the next
// save wiped the whole store (228 group links lost on 2026-07-15). Rules now:
//   1. Mutations use readStrict — if the file exists but can't be read/parsed,
//      the mutation ABORTS. Never save over data you couldn't read.
//   2. Getters use readLenient — a transient failure means "not found", which
//      is harmless because getters never save.
//   3. Writes are atomic (tmp + rename) and keep a .backup of the previous
//      version, so a crash mid-write can't corrupt the store either.

function sleepSync(ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* brief blocking wait for transient file locks */ }
}

function readStrict(file: string): Record<string, string> {
    if (!fs.existsSync(file)) return {};
    let lastErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
        try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
        catch (e) { lastErr = e; sleepSync(50); }
    }
    console.error(`❌ readStrict failed after retries: ${file}:`, lastErr?.message);
    throw lastErr;
}

function readLenient(file: string): Record<string, string> {
    try { return readStrict(file); } catch { return {}; }
}

function writeAtomic(file: string, data: Record<string, string>) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, file.replace(/\.json$/, '.backup.json'));
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
}

// ─── Group → lead mapping ────────────────────────────────────────────────────

function save(data: Record<string, string>) {
    // Last line of defense: normal ops change at most one entry, so a save
    // that shrinks the store by many entries can only be a bug — block it.
    const currentCount = Object.keys(readLenient(PRIMARY_FILE)).length;
    const nextCount = Object.keys(data).length;
    if (currentCount >= 10 && nextCount < currentCount - 5) {
        console.error(`❌ group-leads save BLOCKED: ${currentCount} → ${nextCount} entries looks like data loss`);
        throw new Error(`group-leads save blocked (${currentCount} → ${nextCount} entries)`);
    }
    writeAtomic(PRIMARY_FILE, data);
}

export function linkGroup(groupId: string, leadUid: string): void {
    ensureCanonicalFile();
    const data = readStrict(PRIMARY_FILE); // throws → /link fails loudly, DB untouched
    data[groupId] = leadUid;
    save(data);
}

export function unlinkGroup(groupId: string): void {
    ensureCanonicalFile();
    const data = readStrict(PRIMARY_FILE);
    if (!(groupId in data)) return;
    delete data[groupId];
    save(data);
}

function loadLeads(): Record<string, string> {
    ensureCanonicalFile();
    return readLenient(PRIMARY_FILE);
}

export function getLeadUid(groupId: string): string | null {
    return loadLeads()[groupId] || null;
}

export function getGroupIdByLeadUid(leadUid: string): string | null {
    const data = loadLeads();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid) return groupId;
    }
    return null;
}

export function getWaGroupIdByLeadUid(leadUid: string): string | null {
    const data = loadLeads();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid && groupId.endsWith('@g.us')) return groupId;
    }
    return null;
}

// 360dialog Cloud API groups are stored with a "360:" prefix (mirrors the line:/wechat:/kakao:
// convention above) — their IDs aren't @g.us JIDs, so getWaGroupIdByLeadUid never matches them.
// detectPlatform()-style helpers elsewhere already skip unrecognized prefixes safely (no
// misrouting into Evolution API calls) — see checkoutReminder.ts/checkinReminder.ts.
export function getDialog360GroupIdByLeadUid(leadUid: string): string | null {
    const data = loadLeads();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid && groupId.startsWith('360:')) return groupId;
    }
    return null;
}

export function getAllGroupsByLeadUid(leadUid: string): string[] {
    const data = loadLeads();
    return Object.entries(data)
        .filter(([, uid]) => uid === leadUid)
        .map(([groupId]) => groupId);
}

// ─── Group language persistence ──────────────────────────────────────────────
const LANGS_FILE = path.join(ROOT, 'src/data/group-langs.json');

export function saveGroupLang(groupId: string, lang: string): void {
    const data = readStrict(LANGS_FILE);
    data[groupId] = lang;
    writeAtomic(LANGS_FILE, data);
}

export function getGroupLang(groupId: string): string | null {
    return readLenient(LANGS_FILE)[groupId] || null;
}

export function deleteGroupLang(groupId: string): void {
    const data = readStrict(LANGS_FILE);
    if (!(groupId in data)) return;
    delete data[groupId];
    writeAtomic(LANGS_FILE, data);
}

// ─── Kakao chat name persistence ─────────────────────────────────────────────
const KAKAO_NAMES_FILE = path.join(ROOT, 'src/data/kakao-chat-names.json');

export function saveKakaoChatName(sourceId: string, chatName: string): void {
    const data = readStrict(KAKAO_NAMES_FILE);
    data[sourceId] = chatName;
    writeAtomic(KAKAO_NAMES_FILE, data);
}

export function getKakaoChatName(sourceId: string): string | null {
    return readLenient(KAKAO_NAMES_FILE)[sourceId] || null;
}

// ─── Generic group name persistence (WA, WeChat) ─────────────────────────────
const GROUP_NAMES_FILE = path.join(ROOT, 'src/data/group-names.json');

export function saveGroupName(groupId: string, name: string): void {
    const data = readStrict(GROUP_NAMES_FILE);
    data[groupId] = name;
    writeAtomic(GROUP_NAMES_FILE, data);
}

export function getStoredGroupName(groupId: string): string | null {
    return readLenient(GROUP_NAMES_FILE)[groupId] || null;
}

export function deleteGroupName(groupId: string): void {
    const data = readStrict(GROUP_NAMES_FILE);
    if (!(groupId in data)) return;
    delete data[groupId];
    writeAtomic(GROUP_NAMES_FILE, data);
}
