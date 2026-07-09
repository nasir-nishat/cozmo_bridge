import { getTeamNames } from './sheets';
import * as fs from 'fs';
import * as path from 'path';

const STAFF_IDS_PATH = path.join(__dirname, '../data/staff-ids.json');

interface StaffIds {
    line: Record<string, string>;
    wechat: Record<string, string>;
    kakao: Record<string, string>;
}

function loadStaffIds(): StaffIds {
    try {
        const raw = fs.readFileSync(STAFF_IDS_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (e: any) {
        console.warn('⚠️ staffCache: could not load staff-ids.json:', e?.message);
        return { line: {}, wechat: {}, kakao: {} };
    }
}

const staffIds = loadStaffIds();
const staffLineIds = new Set<string>(Object.keys(staffIds.line));
const staffWechatIds = new Set<string>(Object.keys(staffIds.wechat));
const staffKakaoIds = new Set<string>(Object.keys(staffIds.kakao || {}));

// Fallback name-matching for unrecognized IDs
const FALLBACK_NAMES = ['gaya', 'ricky', 'cyrus', 'jin', 'june', 'coze', 'cozmo'];
let cachedNames: Set<string> = new Set(FALLBACK_NAMES);

export async function loadStaffNames(): Promise<void> {
    try {
        const names = await getTeamNames();
        if (names.length > 0) {
            cachedNames = new Set([...names, ...FALLBACK_NAMES]);
            console.log(`👥 Staff name cache loaded: ${[...cachedNames].join(', ')}`);
        }
    } catch (e: any) {
        console.warn('⚠️ staffCache: could not load from Sheets, using fallback names:', e?.message);
    }
    console.log(`👥 Staff LINE IDs: ${staffLineIds.size} | WeChat IDs: ${staffWechatIds.size} | Kakao IDs: ${staffKakaoIds.size}`);
}

/**
 * Returns the staff member's display name for a given ID, or null if not found.
 */
export function getStaffName(senderId: string): string | null {
    return staffIds.line[senderId] || staffIds.wechat[senderId] || null;
}

const COZMO_WA_LID_BASE = '234325463273604';

/**
 * Returns all staff WhatsApp LIDs in @lid format, excluding COZMO itself.
 * Used for reliable group admin promotion.
 */
export function getStaffWhatsAppLids(): string[] {
    return Object.keys((staffIds as any).whatsapp || {})
        .filter(id => id !== COZMO_WA_LID_BASE)
        .map(id => `${id}@lid`);
}

/**
 * Returns true if the sender is a known staff member.
 * Checks platform ID first (reliable), then falls back to name matching.
 */
export function isStaffSender(senderId: string, senderName: string): boolean {
    if (senderId && (staffLineIds.has(senderId) || staffWechatIds.has(senderId) || staffKakaoIds.has(senderId))) return true;
    if (!senderName) return false;
    const lower = senderName.toLowerCase();
    for (const name of cachedNames) {
        if (lower.includes(name)) return true;
    }
    return false;
}
