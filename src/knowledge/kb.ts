import fs   from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KBEntry {
    id:           string;
    propertyCode: string;   // 'ALL' or a specific property code
    category:     string;
    title:        string;
    triggers:     string[];
    facts:        string[];
    links:        string[];
    sensitive:    boolean;
}

interface KBFile {
    version:       number;
    source?:       string;
    entries:       KBEntry[];
    propertyCodes: string[];
    categories:    string[];
}

// ─── Loader (once at startup) ─────────────────────────────────────────────────

// Canonical runtime KB. All files live in src/knowledge/:
// wa-chat-data.json → wa-knowledge-corpus.json → knowledge-base.json
// Hand-curated seeds: wa-knowledge-data.json
const KB_PATH = path.resolve(
    __dirname, '..', '..', 'src', 'knowledge', 'knowledge-base.json'
);
const KB_BACKUP_PATH = `${KB_PATH}.bak`;

let _cache: KBFile | null = null;

function load(): KBFile {
    if (_cache) return _cache;
    try {
        _cache = JSON.parse(fs.readFileSync(KB_PATH, 'utf-8')) as KBFile;
        console.log(`📚 KB loaded: ${_cache.entries.length} entries`);
    } catch (e: any) {
        console.error('❌ KB load failed:', KB_PATH, e.message);
        try {
            _cache = JSON.parse(fs.readFileSync(KB_BACKUP_PATH, 'utf-8')) as KBFile;
            console.warn(`⚠️ KB fallback loaded from backup: ${_cache.entries.length} entries`);
        } catch (backupError: any) {
            console.error('❌ KB backup load failed:', KB_BACKUP_PATH, backupError.message);
            _cache = { version: 0, source: '', entries: [], propertyCodes: [], categories: [] };
        }
    }
    return _cache;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export function getAllEntries(): KBEntry[] {
    return load().entries;
}

/** Entries scoped to this property (ALL entries + property-specific ones). */
export function getPropertyEntries(propertyCode?: string): KBEntry[] {
    const entries = load().entries;
    if (!propertyCode) return entries.filter(e => !e.sensitive && e.propertyCode === 'ALL');
    return entries.filter(e => !e.sensitive && (e.propertyCode === 'ALL' || e.propertyCode === propertyCode));
}

export function getSensitiveEntries(): KBEntry[] {
    return load().entries.filter(e => e.sensitive);
}

export function reloadKB(): void {
    _cache = null;
}

/**
 * Trigger keyword search across scoped entries.
 * Returns matched entries sorted by match count (most triggers matched first).
 */
export function searchKBEntries(text: string, propertyCode?: string): KBEntry[] {
    // Normalize hyphens to spaces so "check in" matches trigger "check-in" and vice versa
    const lower   = text.toLowerCase().replace(/-/g, ' ');
    const scoped  = getPropertyEntries(propertyCode);

    const scored = scoped
        .map(e => ({
            entry:  e,
            score:  e.triggers.filter(t => lower.includes(t.toLowerCase().replace(/-/g, ' '))).length,
        }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.map(x => x.entry);
}
