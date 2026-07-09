"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadStaffNames = loadStaffNames;
exports.getStaffName = getStaffName;
exports.getStaffWhatsAppLids = getStaffWhatsAppLids;
exports.isStaffSender = isStaffSender;
const sheets_1 = require("./sheets");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const STAFF_IDS_PATH = path.join(__dirname, '../data/staff-ids.json');
function loadStaffIds() {
    try {
        const raw = fs.readFileSync(STAFF_IDS_PATH, 'utf-8');
        return JSON.parse(raw);
    }
    catch (e) {
        console.warn('⚠️ staffCache: could not load staff-ids.json:', e?.message);
        return { line: {}, wechat: {}, kakao: {} };
    }
}
const staffIds = loadStaffIds();
const staffLineIds = new Set(Object.keys(staffIds.line));
const staffWechatIds = new Set(Object.keys(staffIds.wechat));
const staffKakaoIds = new Set(Object.keys(staffIds.kakao || {}));
// Fallback name-matching for unrecognized IDs
const FALLBACK_NAMES = ['gaya', 'ricky', 'cyrus', 'jin', 'june', 'coze', 'cozmo'];
let cachedNames = new Set(FALLBACK_NAMES);
async function loadStaffNames() {
    try {
        const names = await (0, sheets_1.getTeamNames)();
        if (names.length > 0) {
            cachedNames = new Set([...names, ...FALLBACK_NAMES]);
            console.log(`👥 Staff name cache loaded: ${[...cachedNames].join(', ')}`);
        }
    }
    catch (e) {
        console.warn('⚠️ staffCache: could not load from Sheets, using fallback names:', e?.message);
    }
    console.log(`👥 Staff LINE IDs: ${staffLineIds.size} | WeChat IDs: ${staffWechatIds.size} | Kakao IDs: ${staffKakaoIds.size}`);
}
/**
 * Returns the staff member's display name for a given ID, or null if not found.
 */
function getStaffName(senderId) {
    return staffIds.line[senderId] || staffIds.wechat[senderId] || null;
}
const COZMO_WA_LID_BASE = '234325463273604';
/**
 * Returns all staff WhatsApp LIDs in @lid format, excluding COZMO itself.
 * Used for reliable group admin promotion.
 */
function getStaffWhatsAppLids() {
    return Object.keys(staffIds.whatsapp || {})
        .filter(id => id !== COZMO_WA_LID_BASE)
        .map(id => `${id}@lid`);
}
/**
 * Returns true if the sender is a known staff member.
 * Checks platform ID first (reliable), then falls back to name matching.
 */
function isStaffSender(senderId, senderName) {
    if (senderId && (staffLineIds.has(senderId) || staffWechatIds.has(senderId) || staffKakaoIds.has(senderId)))
        return true;
    if (!senderName)
        return false;
    const lower = senderName.toLowerCase();
    for (const name of cachedNames) {
        if (lower.includes(name))
            return true;
    }
    return false;
}
