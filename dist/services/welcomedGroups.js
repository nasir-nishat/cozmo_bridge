"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markWelcomed = markWelcomed;
exports.isWelcomed = isWelcomed;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FILE = path_1.default.join(process.cwd(), 'src/data/welcomed-groups.json');
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
        console.error('❌ welcomedGroups save:', e?.message);
    }
}
function markWelcomed(groupId) {
    const data = load();
    if (data[groupId])
        return;
    data[groupId] = new Date().toISOString();
    save(data);
    console.log(`✅ Marked as welcomed: ${groupId}`);
}
function isWelcomed(groupId) {
    return !!load()[groupId];
}
