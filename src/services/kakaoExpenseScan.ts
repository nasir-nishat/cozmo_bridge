/**
 * kakaoExpenseScan.ts
 *
 * Scans message-buffer.json for /exp commands in Kakao groups,
 * compares against Google Sheets, and appends any missing entries.
 *
 * This is a recovery tool — it does NOT replace the live /exp handler.
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import oAuth2Client from './google-auth';
import { CONFIG } from '../config/constants';
import { getLeadUid } from './groupLeads';
import { kakaoSourceKey } from '../platforms/kakao/utils';

const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

const BUFFER_FILE = path.join(process.cwd(), 'src/data/message-buffer.json');

// Same regex as parseExpCommand in expenses.ts
const EXP_REGEX = /^\/exp\s+(jy|jn|rc|cy|gy|cz)\s+(-?\d+)\s+(.+)$/i;

const CARD_NAMES: Record<string, string> = {
    jy: 'Joyhasla', jn: 'Jin', rc: 'Ricky', cy: 'Cyrus', gy: 'Gaya', cz: 'COZMO',
};

export interface ScannedExpense {
    groupKey: string;       // e.g. kakao:471631360832065
    leadUid: string;
    sender: string;
    card: string;
    cardName: string;
    amount: number;
    item: string;
    ts: number;             // unix ms from buffer
    alreadyInSheet: boolean;
    inserted: boolean;
}

export interface ScanResult {
    groupKey: string;
    leadUid: string;
    scanned: ScannedExpense[];
    newCount: number;
    skippedCount: number;
}

function loadBuffer(): Record<string, { sender: string; text: string; ts: number }[]> {
    try {
        return JSON.parse(fs.readFileSync(BUFFER_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmt(n: number): string {
    return n.toLocaleString('en-US');
}

/** Fetch all existing expense rows from Sheets for deduplication */
async function getExistingExpenses(): Promise<{ group_id: string; amount_krw: number; item: string; card: string }[]> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'expenses!A2:M',
    });
    return (res.data.values || []).map(row => ({
        group_id: row[2] || '',
        item: (row[5] || '').trim().toLowerCase(),
        amount_krw: parseInt(row[6] || '0', 10),
        card: (row[12] || '').toLowerCase(),
    }));
}

/** Append a single recovered expense to Sheets */
async function appendRecoveredExpense(
    leadUid: string,
    groupKey: string,
    item: string,
    amount: number,
    card: string,
    sender: string,
    ts: number
): Promise<void> {
    const id = generateId();
    const vat10 = Math.round(amount * 1.10);
    const vat145 = Math.round(amount * 1.145);
    const createdAt = new Date(ts).toISOString();
    const seoulTime = new Date(ts).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    await sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'expenses!A:N',
        valueInputOption: 'RAW',
        requestBody: {
            values: [[id, leadUid, groupKey, `kakao-scan`, 'kakao', item, amount, vat10, vat145, sender, createdAt, 'false', card, seoulTime]],
        },
    });
}

/**
 * Scan message-buffer for a specific kakao group key (e.g. "kakao:471631360832065").
 * If groupKey is omitted, scans ALL kakao groups in the buffer.
 *
 * dryRun=true: parse and report but do NOT write to Sheets.
 */
export async function scanKakaoExpenses(
    groupKey?: string,
    dryRun = false
): Promise<ScanResult[]> {
    const buffer = loadBuffer();
    const existing = await getExistingExpenses();

    // Determine which groups to scan
    const kakaoKeys = Object.keys(buffer).filter(k => k.startsWith('kakao:'));
    const targetKeys = groupKey ? [groupKey] : kakaoKeys;

    const results: ScanResult[] = [];

    for (const key of targetKeys) {
        const leadUid = getLeadUid(key);
        if (!leadUid) continue; // unlinked group — skip

        const messages = buffer[key] || [];
        const scanned: ScannedExpense[] = [];

        for (const msg of messages) {
            const match = msg.text.trim().match(EXP_REGEX);
            if (!match) continue;

            const card = match[1].toLowerCase();
            const amount = parseInt(match[2], 10);
            const item = match[3].trim();
            if (amount === 0) continue;

            // Dedup: same group + card + amount + item (case-insensitive) already in sheet
            const alreadyInSheet = existing.some(
                e =>
                    e.group_id === key &&
                    e.card === card &&
                    e.amount_krw === amount &&
                    e.item === item.toLowerCase()
            );

            let inserted = false;
            if (!alreadyInSheet && !dryRun) {
                try {
                    await appendRecoveredExpense(leadUid, key, item, amount, card, msg.sender, msg.ts);
                    inserted = true;
                    // Add to existing cache so subsequent duplicates in same scan are caught
                    existing.push({ group_id: key, item: item.toLowerCase(), amount_krw: amount, card });
                } catch (e: any) {
                    console.error(`❌ kakaoExpenseScan insert failed: ${e?.message}`);
                }
            }

            scanned.push({
                groupKey: key,
                leadUid,
                sender: msg.sender,
                card,
                cardName: CARD_NAMES[card] ?? card,
                amount,
                item,
                ts: msg.ts,
                alreadyInSheet,
                inserted,
            });
        }

        if (scanned.length > 0) {
            results.push({
                groupKey: key,
                leadUid,
                scanned,
                newCount: scanned.filter(e => e.inserted).length,
                skippedCount: scanned.filter(e => e.alreadyInSheet).length,
            });
        }
    }

    return results;
}

/** Get all expenses from Sheets for a specific group (for UI display) */
export async function getExpensesForGroup(groupKey: string): Promise<{
    id: string; item: string; amount: number; card: string; cardName: string;
    loggedBy: string; createdAt: string; settled: boolean;
}[]> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'expenses!A2:M',
    });
    return (res.data.values || [])
        .filter(row => row[2] === groupKey)
        .map(row => ({
            id: row[0] || '',
            item: row[5] || '',
            amount: parseInt(row[6] || '0', 10),
            card: row[12] || '',
            cardName: CARD_NAMES[row[12]] ?? row[12] ?? '',
            loggedBy: row[9] || '',
            createdAt: row[10] || '',
            settled: row[11] === 'true',
        }));
}

/** Summary for all linked kakao groups — used by admin UI */
export async function getKakaoGroupsSummary(): Promise<{
    groupKey: string;
    leadUid: string;
    chatName: string | null;
    bufferedMsgCount: number;
    bufferedExpCount: number;
    sheetExpenses: Awaited<ReturnType<typeof getExpensesForGroup>>;
    total: number;
    totalVat10: number;
    totalVat145: number;
}[]> {
    const buffer = loadBuffer();
    const allExpenses = await (async () => {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: 'expenses!A2:M',
        });
        return res.data.values || [];
    })();

    // Load group-leads to find all kakao groups
    let groupLeads: Record<string, string> = {};
    try {
        groupLeads = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/group-leads.json'), 'utf-8'));
    } catch { /* empty */ }

    // Load kakao chat names
    let kakaoNames: Record<string, string> = {};
    try {
        kakaoNames = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/kakao-names.json'), 'utf-8'));
    } catch { /* empty */ }

    const kakaoGroups = Object.entries(groupLeads).filter(([k]) => k.startsWith('kakao:'));

    return kakaoGroups.map(([groupKey, leadUid]) => {
        const msgs = buffer[groupKey] || [];
        const bufferedExpCount = msgs.filter(m => EXP_REGEX.test(m.text.trim())).length;

        const sheetRows = allExpenses.filter(row => row[2] === groupKey);
        const sheetExpenses = sheetRows.map(row => ({
            id: row[0] || '',
            item: row[5] || '',
            amount: parseInt(row[6] || '0', 10),
            card: row[12] || '',
            cardName: CARD_NAMES[row[12]] ?? row[12] ?? '',
            loggedBy: row[9] || '',
            createdAt: row[10] || '',
            settled: row[11] === 'true',
        }));

        const unsettled = sheetExpenses.filter(e => !e.settled);
        const total = unsettled.reduce((s, e) => s + e.amount, 0);

        return {
            groupKey,
            leadUid,
            chatName: kakaoNames[groupKey.replace('kakao:', '')] || null,
            bufferedMsgCount: msgs.length,
            bufferedExpCount,
            sheetExpenses,
            total,
            totalVat10: Math.round(total * 1.10),
            totalVat145: Math.round(total * 1.145),
        };
    });
}
