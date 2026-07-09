"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToBuffer = addToBuffer;
exports.getRecentMessages = getRecentMessages;
exports.pruneBuffer = pruneBuffer;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FILE = path_1.default.join(process.cwd(), 'src/data/message-buffer.json');
const MAX_PER_GROUP = 100;
const BUFFER_WINDOW_MS = 4 * 60 * 60 * 1000; // keep last 4 hours
function load() {
    try {
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function save(buf) {
    try {
        fs_1.default.writeFileSync(FILE, JSON.stringify(buf, null, 2));
    }
    catch { /* non-critical */ }
}
function addToBuffer(groupKey, sender, text) {
    const buf = load();
    if (!buf[groupKey])
        buf[groupKey] = [];
    buf[groupKey].push({ sender, text, ts: Date.now() });
    // Keep only last MAX_PER_GROUP entries
    if (buf[groupKey].length > MAX_PER_GROUP) {
        buf[groupKey] = buf[groupKey].slice(-MAX_PER_GROUP);
    }
    save(buf);
}
// Returns messages received within the last `sinceMinutes` minutes for a group
function getRecentMessages(groupKey, sinceMinutes) {
    const buf = load();
    const cutoff = Date.now() - sinceMinutes * 60 * 1000;
    return (buf[groupKey] ?? []).filter(m => m.ts >= cutoff);
}
// Prune entries older than BUFFER_WINDOW_MS from all groups — call periodically
function pruneBuffer() {
    const buf = load();
    const cutoff = Date.now() - BUFFER_WINDOW_MS;
    let changed = false;
    for (const key of Object.keys(buf)) {
        const before = buf[key].length;
        buf[key] = buf[key].filter(m => m.ts >= cutoff);
        if (buf[key].length !== before)
            changed = true;
        if (buf[key].length === 0)
            delete buf[key];
    }
    if (changed)
        save(buf);
}
