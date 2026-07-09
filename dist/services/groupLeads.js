"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkGroup = linkGroup;
exports.getLeadUid = getLeadUid;
exports.getGroupIdByLeadUid = getGroupIdByLeadUid;
exports.getWaGroupIdByLeadUid = getWaGroupIdByLeadUid;
exports.getAllGroupsByLeadUid = getAllGroupsByLeadUid;
exports.unlinkGroup = unlinkGroup;
exports.saveGroupLang = saveGroupLang;
exports.getGroupLang = getGroupLang;
exports.saveKakaoChatName = saveKakaoChatName;
exports.getKakaoChatName = getKakaoChatName;
exports.saveGroupName = saveGroupName;
exports.getStoredGroupName = getStoredGroupName;
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
function load() {
    try {
        ensureCanonicalFile();
        return JSON.parse(fs_1.default.readFileSync(PRIMARY_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function save(data) {
    fs_1.default.mkdirSync(path_1.default.dirname(PRIMARY_FILE), { recursive: true });
    fs_1.default.writeFileSync(PRIMARY_FILE, JSON.stringify(data, null, 2));
}
function linkGroup(groupId, leadUid) {
    const data = load();
    data[groupId] = leadUid;
    save(data);
}
function getLeadUid(groupId) {
    return load()[groupId] || null;
}
function getGroupIdByLeadUid(leadUid) {
    const data = load();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid)
            return groupId;
    }
    return null;
}
function getWaGroupIdByLeadUid(leadUid) {
    const data = load();
    for (const [groupId, mappedLeadUid] of Object.entries(data)) {
        if (mappedLeadUid === leadUid && groupId.endsWith('@g.us'))
            return groupId;
    }
    return null;
}
function getAllGroupsByLeadUid(leadUid) {
    const data = load();
    return Object.entries(data)
        .filter(([, uid]) => uid === leadUid)
        .map(([groupId]) => groupId);
}
function unlinkGroup(groupId) {
    const data = load();
    delete data[groupId];
    save(data);
}
// ─── Group language persistence ──────────────────────────────────────────────
const LANGS_FILE = path_1.default.join(ROOT, 'src/data/group-langs.json');
function loadLangs() {
    try {
        if (!fs_1.default.existsSync(LANGS_FILE))
            return {};
        return JSON.parse(fs_1.default.readFileSync(LANGS_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
const LANGS_BACKUP_FILE = path_1.default.join(ROOT, 'src/data/group-langs.backup.json');
function saveLangs(data) {
    fs_1.default.mkdirSync(path_1.default.dirname(LANGS_FILE), { recursive: true });
    if (fs_1.default.existsSync(LANGS_FILE)) {
        fs_1.default.copyFileSync(LANGS_FILE, LANGS_BACKUP_FILE);
    }
    fs_1.default.writeFileSync(LANGS_FILE, JSON.stringify(data, null, 2));
}
function saveGroupLang(groupId, lang) {
    const data = loadLangs();
    data[groupId] = lang;
    saveLangs(data);
}
function getGroupLang(groupId) {
    return loadLangs()[groupId] || null;
}
// ─── Kakao chat name persistence ─────────────────────────────────────────────
const KAKAO_NAMES_FILE = path_1.default.join(ROOT, 'src/data/kakao-chat-names.json');
function loadKakaoNames() {
    try {
        if (!fs_1.default.existsSync(KAKAO_NAMES_FILE))
            return {};
        return JSON.parse(fs_1.default.readFileSync(KAKAO_NAMES_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function saveKakaoNames(data) {
    fs_1.default.mkdirSync(path_1.default.dirname(KAKAO_NAMES_FILE), { recursive: true });
    fs_1.default.writeFileSync(KAKAO_NAMES_FILE, JSON.stringify(data, null, 2));
}
function saveKakaoChatName(sourceId, chatName) {
    const data = loadKakaoNames();
    data[sourceId] = chatName;
    saveKakaoNames(data);
}
function getKakaoChatName(sourceId) {
    return loadKakaoNames()[sourceId] || null;
}
// ─── Generic group name persistence (WA, WeChat) ─────────────────────────────
const GROUP_NAMES_FILE = path_1.default.join(ROOT, 'src/data/group-names.json');
function loadGroupNames() {
    try {
        if (!fs_1.default.existsSync(GROUP_NAMES_FILE))
            return {};
        return JSON.parse(fs_1.default.readFileSync(GROUP_NAMES_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function saveGroupNames(data) {
    fs_1.default.mkdirSync(path_1.default.dirname(GROUP_NAMES_FILE), { recursive: true });
    fs_1.default.writeFileSync(GROUP_NAMES_FILE, JSON.stringify(data, null, 2));
}
function saveGroupName(groupId, name) {
    const data = loadGroupNames();
    data[groupId] = name;
    saveGroupNames(data);
}
function getStoredGroupName(groupId) {
    return loadGroupNames()[groupId] || null;
}
