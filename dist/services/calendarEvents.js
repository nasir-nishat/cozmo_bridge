"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCalendarEventId = getCalendarEventId;
exports.setCalendarEventId = setCalendarEventId;
exports.removeCalendarEventId = removeCalendarEventId;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FILE = path_1.default.join(process.cwd(), 'src/data/calendar-events.json');
function load() {
    try {
        if (!fs_1.default.existsSync(FILE))
            return {};
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function save(data) {
    fs_1.default.mkdirSync(path_1.default.dirname(FILE), { recursive: true });
    fs_1.default.writeFileSync(FILE, JSON.stringify(data, null, 2));
}
function getCalendarEventId(leadUid) {
    return load()[leadUid] || null;
}
function setCalendarEventId(leadUid, eventId) {
    const data = load();
    data[leadUid] = eventId;
    save(data);
}
function removeCalendarEventId(leadUid) {
    const data = load();
    delete data[leadUid];
    save(data);
}
