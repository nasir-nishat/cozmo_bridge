"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkGroup = linkGroup;
exports.unlinkGroup = unlinkGroup;
exports.getLeadUid = getLeadUid;
exports.getGroupIdByLeadUid = getGroupIdByLeadUid;
exports.getWaGroupIdByLeadUid = getWaGroupIdByLeadUid;
exports.getDialog360GroupIdByLeadUid = getDialog360GroupIdByLeadUid;
exports.getAllGroupsByLeadUid = getAllGroupsByLeadUid;
exports.saveGroupLang = saveGroupLang;
exports.getGroupLang = getGroupLang;
exports.deleteGroupLang = deleteGroupLang;
exports.saveKakaoChatName = saveKakaoChatName;
exports.getKakaoChatName = getKakaoChatName;
exports.saveGroupName = saveGroupName;
exports.getStoredGroupName = getStoredGroupName;
exports.deleteGroupName = deleteGroupName;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ROOT = process.cwd();
const PRIMARY_FILE = path_1.default.join(ROOT, 'src/data/group-leads.json');
const LEGACY_DIST_FILE = path_1.default.join(ROOT, 'dist/data/group-leads.json');
const FILE = (() => {
    if (fs_1.default.existsSync(PRIMARY_FILE))
        return PRIMARY_FILE;
    if (fs_1.default.existsSync(LEGACY_DIST_FILE))
        return LEGACY_DIST_FILE;
    return PRIMARY_FILE;
})();
function ensureCanonicalFile() {
    if (FILE !== PRIMARY_FILE && fs_1.default.existsSync(FILE) && !fs_1.default.existsSync(PRIMARY_FILE)) {
        const data = fs_1.default.readFileSync(FILE, 'utf-8');
        fs_1.default.mkdirSync(path_1.default.dirname(PRIMARY_FILE), { recursive: true });
        fs_1.default.writeFileSync(PRIMARY_FILE, data);
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
function sleepSync(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* brief blocking wait for transient file locks */ }
}
function readStrict(file) {
    if (!fs_1.default.existsSync(file))
        return {};
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return JSON.parse(fs_1.default.readFileSync(file, 'utf-8'));
        }
        catch (e) {
            lastErr = e;
            sleepSync(50);
        }
    }
    console.error(`❌ readStrict failed after retries: ${file}:`, lastErr?.message);
    throw lastErr;
}
function readLenient(file) {
    try {
        return readStrict(file);
    }
    catch {
        return {};
    }
}
function writeAtomic(file, data) {
    fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true });
    if (fs_1.default.existsSync(file)) {
        fs_1.default.copyFileSync(file, file.replace(/\.json$/, '.backup.json'));
    }
    const tmp = `${file}.tmp`;
    fs_1.default.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs_1.default.renameSync(tmp, file);
}
// ─── Group → lead mapping ────────────────────────────────────────────────────
function save(data) {
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
function linkGroup(groupId, leadUid) {
    ensureCanonicalFile();
    const data = readStrict(PRIMARY_FILE); // throws → /link fails loudly, DB untouched
    data[groupId] = leadUid;
    save(data);
}
function unlinkGroup(groupId) {
    ensureCanonicalFile();
    const data = readStrict(PRIMARY_FILE);
    if (!(groupId in data))
        return;
    delete data[groupId];
    save(data);
}
function loadLeads() {
    ensureCanonicalFile();
    return readLenient(PRIMARY_FILE);
}
function getLeadUid(groupId) {
    return loadLeads()[groupId] || null;
}
function getGroupIdByLeadUid(leadUid) {
    const data = loadLeads();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid)
            return groupId;
    }
    return null;
}
function getWaGroupIdByLeadUid(leadUid) {
    const data = loadLeads();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid && groupId.endsWith('@g.us'))
            return groupId;
    }
    return null;
}
// 360dialog Cloud API groups are stored with a "360:" prefix (mirrors the line:/wechat:/kakao:
// convention above) — their IDs aren't @g.us JIDs, so getWaGroupIdByLeadUid never matches them.
// detectPlatform()-style helpers elsewhere already skip unrecognized prefixes safely (no
// misrouting into Evolution API calls) — see checkoutReminder.ts/checkinReminder.ts.
function getDialog360GroupIdByLeadUid(leadUid) {
    const data = loadLeads();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid && groupId.startsWith('360:'))
            return groupId;
    }
    return null;
}
function getAllGroupsByLeadUid(leadUid) {
    const data = loadLeads();
    return Object.entries(data)
        .filter(([, uid]) => uid === leadUid)
        .map(([groupId]) => groupId);
}
// ─── Group language persistence ──────────────────────────────────────────────
const LANGS_FILE = path_1.default.join(ROOT, 'src/data/group-langs.json');
function saveGroupLang(groupId, lang) {
    const data = readStrict(LANGS_FILE);
    data[groupId] = lang;
    writeAtomic(LANGS_FILE, data);
}
function getGroupLang(groupId) {
    return readLenient(LANGS_FILE)[groupId] || null;
}
function deleteGroupLang(groupId) {
    const data = readStrict(LANGS_FILE);
    if (!(groupId in data))
        return;
    delete data[groupId];
    writeAtomic(LANGS_FILE, data);
}
// ─── Kakao chat name persistence ─────────────────────────────────────────────
const KAKAO_NAMES_FILE = path_1.default.join(ROOT, 'src/data/kakao-chat-names.json');
function saveKakaoChatName(sourceId, chatName) {
    const data = readStrict(KAKAO_NAMES_FILE);
    data[sourceId] = chatName;
    writeAtomic(KAKAO_NAMES_FILE, data);
}
function getKakaoChatName(sourceId) {
    return readLenient(KAKAO_NAMES_FILE)[sourceId] || null;
}
// ─── Generic group name persistence (WA, WeChat) ─────────────────────────────
const GROUP_NAMES_FILE = path_1.default.join(ROOT, 'src/data/group-names.json');
function saveGroupName(groupId, name) {
    const data = readStrict(GROUP_NAMES_FILE);
    data[groupId] = name;
    writeAtomic(GROUP_NAMES_FILE, data);
}
function getStoredGroupName(groupId) {
    return readLenient(GROUP_NAMES_FILE)[groupId] || null;
}
function deleteGroupName(groupId) {
    const data = readStrict(GROUP_NAMES_FILE);
    if (!(groupId in data))
        return;
    delete data[groupId];
    writeAtomic(GROUP_NAMES_FILE, data);
}
