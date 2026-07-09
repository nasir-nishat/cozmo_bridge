"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markSent = markSent;
exports.isSent = isSent;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FILE = path_1.default.join(process.cwd(), 'src/data/sent-messages.json');
function load() {
    try {
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function save(data) {
    try {
        fs_1.default.writeFileSync(FILE, JSON.stringify(data, null, 2));
    }
    catch (e) {
        console.error('❌ sentMessages save:', e?.message);
    }
}
function key(groupKey, type) {
    return `${groupKey}:${type}`;
}
function markSent(groupKey, type) {
    const data = load();
    const k = key(groupKey, type);
    if (data[k])
        return;
    data[k] = new Date().toISOString();
    save(data);
    console.log(`✅ Marked ${type} sent: ${groupKey}`);
}
function isSent(groupKey, type) {
    return !!load()[key(groupKey, type)];
}
