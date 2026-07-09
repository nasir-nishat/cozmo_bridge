"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueue = enqueue;
exports.dequeue = dequeue;
exports.getPending = getPending;
exports.incrementAttempts = incrementAttempts;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const QUEUE_FILE = path_1.default.join(process.cwd(), 'src/data/pending-messages.json');
function load() {
    try {
        return JSON.parse(fs_1.default.readFileSync(QUEUE_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function save(q) {
    try {
        fs_1.default.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
    }
    catch (e) {
        console.error('❌ pendingMessages save:', e?.message);
    }
}
function enqueue(groupId, nationality, label, meta) {
    const q = load();
    if (q.some(m => m.groupId === groupId))
        return;
    q.push({ groupId, nationality, label, createdAt: new Date().toISOString(), attempts: 0, meta });
    save(q);
    console.log(`📋 Queued pending messages: ${groupId} (${label})`);
}
function dequeue(groupId) {
    save(load().filter(m => m.groupId !== groupId));
}
function getPending() {
    return load();
}
function incrementAttempts(groupId) {
    const q = load();
    const item = q.find(m => m.groupId === groupId);
    if (item) {
        item.attempts++;
        save(q);
    }
}
