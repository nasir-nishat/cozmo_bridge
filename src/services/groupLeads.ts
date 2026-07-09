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

function load(): Record<string, string> {
    try {
        ensureCanonicalFile();
        return JSON.parse(fs.readFileSync(PRIMARY_FILE, 'utf-8'));
    }
    catch { return {}; }
}

function save(data: Record<string, string>) {
    fs.mkdirSync(path.dirname(PRIMARY_FILE), { recursive: true });
    fs.writeFileSync(PRIMARY_FILE, JSON.stringify(data, null, 2));
}

export function linkGroup(groupId: string, leadUid: string): void {
    const data = load();
    data[groupId] = leadUid;
    save(data);
}

export function getLeadUid(groupId: string): string | null {
    return load()[groupId] || null;
}

export function getGroupIdByLeadUid(leadUid: string): string | null {
    const data = load();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid) return groupId;
    }
    return null;
}

export function getWaGroupIdByLeadUid(leadUid: string): string | null {
    const data = load();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid && groupId.endsWith('@g.us')) return groupId;
    }
    return null;
}

export function getAllGroupsByLeadUid(leadUid: string): string[] {
    const data = load();
    return Object.entries(data)
        .filter(([, uid]) => uid === leadUid)
        .map(([groupId]) => groupId);
}

export function unlinkGroup(groupId: string): void {
    const data = load();
    delete data[groupId];
    save(data);
}

// ─── Group language persistence ──────────────────────────────────────────────
const LANGS_FILE = path.join(ROOT, 'src/data/group-langs.json');

function loadLangs(): Record<string, string> {
    try {
        if (!fs.existsSync(LANGS_FILE)) return {};
        return JSON.parse(fs.readFileSync(LANGS_FILE, 'utf-8'));
    } catch { return {}; }
}

const LANGS_BACKUP_FILE = path.join(ROOT, 'src/data/group-langs.backup.json');

function saveLangs(data: Record<string, string>) {
    fs.mkdirSync(path.dirname(LANGS_FILE), { recursive: true });
    if (fs.existsSync(LANGS_FILE)) {
        fs.copyFileSync(LANGS_FILE, LANGS_BACKUP_FILE);
    }
    fs.writeFileSync(LANGS_FILE, JSON.stringify(data, null, 2));
}

export function saveGroupLang(groupId: string, lang: string): void {
    const data = loadLangs();
    data[groupId] = lang;
    saveLangs(data);
}

export function getGroupLang(groupId: string): string | null {
    return loadLangs()[groupId] || null;
}

// ─── Kakao chat name persistence ─────────────────────────────────────────────
const KAKAO_NAMES_FILE = path.join(ROOT, 'src/data/kakao-chat-names.json');

function loadKakaoNames(): Record<string, string> {
    try {
        if (!fs.existsSync(KAKAO_NAMES_FILE)) return {};
        return JSON.parse(fs.readFileSync(KAKAO_NAMES_FILE, 'utf-8'));
    } catch { return {}; }
}

function saveKakaoNames(data: Record<string, string>) {
    fs.mkdirSync(path.dirname(KAKAO_NAMES_FILE), { recursive: true });
    fs.writeFileSync(KAKAO_NAMES_FILE, JSON.stringify(data, null, 2));
}

export function saveKakaoChatName(sourceId: string, chatName: string): void {
    const data = loadKakaoNames();
    data[sourceId] = chatName;
    saveKakaoNames(data);
}

export function getKakaoChatName(sourceId: string): string | null {
    return loadKakaoNames()[sourceId] || null;
}

// ─── Generic group name persistence (WA, WeChat) ─────────────────────────────
const GROUP_NAMES_FILE = path.join(ROOT, 'src/data/group-names.json');

function loadGroupNames(): Record<string, string> {
    try {
        if (!fs.existsSync(GROUP_NAMES_FILE)) return {};
        return JSON.parse(fs.readFileSync(GROUP_NAMES_FILE, 'utf-8'));
    } catch { return {}; }
}

function saveGroupNames(data: Record<string, string>) {
    fs.mkdirSync(path.dirname(GROUP_NAMES_FILE), { recursive: true });
    fs.writeFileSync(GROUP_NAMES_FILE, JSON.stringify(data, null, 2));
}

export function saveGroupName(groupId: string, name: string): void {
    const data = loadGroupNames();
    data[groupId] = name;
    saveGroupNames(data);
}

export function getStoredGroupName(groupId: string): string | null {
    return loadGroupNames()[groupId] || null;
}