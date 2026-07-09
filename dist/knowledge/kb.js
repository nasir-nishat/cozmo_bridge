"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllEntries = getAllEntries;
exports.getPropertyEntries = getPropertyEntries;
exports.getSensitiveEntries = getSensitiveEntries;
exports.reloadKB = reloadKB;
exports.searchKBEntries = searchKBEntries;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ─── Loader (once at startup) ─────────────────────────────────────────────────
// Canonical runtime KB. All files live in src/knowledge/:
// wa-chat-data.json → wa-knowledge-corpus.json → knowledge-base.json
// Hand-curated seeds: wa-knowledge-data.json
const KB_PATH = path_1.default.resolve(__dirname, '..', '..', 'src', 'knowledge', 'knowledge-base.json');
const KB_BACKUP_PATH = `${KB_PATH}.bak`;
let _cache = null;
function load() {
    if (_cache)
        return _cache;
    try {
        _cache = JSON.parse(fs_1.default.readFileSync(KB_PATH, 'utf-8'));
        console.log(`📚 KB loaded: ${_cache.entries.length} entries`);
    }
    catch (e) {
        console.error('❌ KB load failed:', KB_PATH, e.message);
        try {
            _cache = JSON.parse(fs_1.default.readFileSync(KB_BACKUP_PATH, 'utf-8'));
            console.warn(`⚠️ KB fallback loaded from backup: ${_cache.entries.length} entries`);
        }
        catch (backupError) {
            console.error('❌ KB backup load failed:', KB_BACKUP_PATH, backupError.message);
            _cache = { version: 0, source: '', entries: [], propertyCodes: [], categories: [] };
        }
    }
    return _cache;
}
// ─── Public helpers ───────────────────────────────────────────────────────────
function getAllEntries() {
    return load().entries;
}
/** Entries scoped to this property (ALL entries + property-specific ones). */
function getPropertyEntries(propertyCode) {
    const entries = load().entries;
    if (!propertyCode)
        return entries.filter(e => !e.sensitive && e.propertyCode === 'ALL');
    return entries.filter(e => !e.sensitive && (e.propertyCode === 'ALL' || e.propertyCode === propertyCode));
}
function getSensitiveEntries() {
    return load().entries.filter(e => e.sensitive);
}
function reloadKB() {
    _cache = null;
}
/**
 * Trigger keyword search across scoped entries.
 * Returns matched entries sorted by match count (most triggers matched first).
 */
function searchKBEntries(text, propertyCode) {
    // Normalize hyphens to spaces so "check in" matches trigger "check-in" and vice versa
    const lower = text.toLowerCase().replace(/-/g, ' ');
    const scoped = getPropertyEntries(propertyCode);
    const scored = scoped
        .map(e => ({
        entry: e,
        score: e.triggers.filter(t => lower.includes(t.toLowerCase().replace(/-/g, ' '))).length,
    }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);
    return scored.map(x => x.entry);
}
