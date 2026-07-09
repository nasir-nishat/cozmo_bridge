import { google } from 'googleapis';
import oAuth2Client from './google-auth';
import { CONFIG } from '../config/constants';

const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

const isTrue = (value: string | undefined): boolean =>
    (value || '').toString().trim().toLowerCase() === 'true';

const toJid = (raw: string | undefined): string => {
    const clean = (raw || '').replace(/\D/g, '');
    return clean ? `${clean}@c.us` : '';
};

export async function getActiveTeamMembers(): Promise<string[]> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'team_members!A2:E',
    });
    return (res.data.values || [])
        .filter(row => isTrue(row[3]))
        .map(row => toJid(row[1]))
        .filter(Boolean);
}

export async function getDevTeamMembers(): Promise<string[]> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'team_members!A2:E',
    });
    return (res.data.values || [])
        .filter(row => isTrue(row[4]))
        .map(row => toJid(row[1]))
        .filter(Boolean);
}

export async function getTeamNumbers(): Promise<string[]> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'team_members!A2:B',
    });
    return (res.data.values || [])
        .filter(row => row[1])
        .map(row => '+' + row[1].replace(/\D/g, ''));
}

export async function getTeamNames(): Promise<string[]> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'team_members!A2:A',
    });
    return (res.data.values || [])
        .map(row => (row[0] || '').trim().toLowerCase())
        .filter(Boolean);
}

export async function getAllTeamMembers(): Promise<{
    name: string; phone: string; role: string; active: boolean; dev: boolean;
}[]> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'team_members!A2:E',
    });
    return (res.data.values || [])
        .map(row => ({
            name: (row[0] || '').trim(),
            phone: (row[1] || '').replace(/\D/g, ''),
            role: (row[2] || '').trim(),
            active: (row[3] || '').toString().toLowerCase() === 'true',
            dev: (row[4] || '').toString().toLowerCase() === 'true',
        }))
        .filter(m => m.name);
}

const LANG_COL: Record<string, number> = {
    EN: 1, KR: 2, JA: 3, 'ZH-CN': 4, 'ZH-TW': 5,
};

function normalizeLang(lang: string): string {
    if (lang === 'KO') return 'KR';
    if (lang === 'ZH') return 'ZH-CN';
    return lang;
}

export async function getMessages(langCode = 'EN'): Promise<Record<string, string>> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'group_creation_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(langCode)] ?? 1;
    const map: Record<string, string> = {};
    (res.data.values || []).forEach(row => {
        if (row[0]) map[row[0]] = row[col] || row[1] || '';
    });
    return map;
}

export async function getBookingMsg(key: string, langCode = 'EN'): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'booking_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(langCode)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}

export async function getGroupCreationMsg(key: string): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'group_creation_msgs!A2:B',
    });
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[1] || '';
}

// F9/L9/B9 in property code map → F09/L09/B09 in the sheet header
const KR_CODE_NORMALIZE: Record<string, string> = { F9: 'F09', L9: 'L09', B9: 'B09' };

export async function getBookingMsgKr(propertyCode: string): Promise<string> {
    const code = KR_CODE_NORMALIZE[propertyCode] ?? propertyCode;
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'booking_msgs_kr!A1:N',
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return '';
    const headers: string[] = rows[0];
    const colIdx = headers.findIndex(h =>
        h.toUpperCase() === code.toUpperCase() ||
        h.toUpperCase().startsWith(code.toUpperCase() + '_')
    );
    if (colIdx < 0) return '';
    const dataRow = rows.slice(1).find(r => r[0] === 'booking_msg_kr');
    return dataRow?.[colIdx] || '';
}

export async function getBookingConfirmationMessage(langCode: string): Promise<string> {
    return getBookingMsg('booking_confirmation', langCode);
}

export async function getPrePaymentMsg(key: string, langCode = 'EN'): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'pre_payment_msg!A2:F',
    });
    const col = LANG_COL[normalizeLang(langCode)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}

export async function getGuestLeads(): Promise<Record<string, string>> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'guest_leads!A2:B',
    });
    const map: Record<string, string> = {};
    (res.data.values || []).forEach(row => {
        if (row[0] && row[1]) map[row[0]] = row[1];
    });
    return map;
}

export async function saveGuestLead(phone: string, leadUid: string): Promise<void> {
    await sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'guest_leads!A:B',
        valueInputOption: 'RAW',
        requestBody: { values: [[phone, leadUid]] },
    });
}

export async function getTipsMessage(key: string, lang = 'EN'): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'check_in_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(lang)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}

export async function getScheduledMessage(key: string, lang = 'EN'): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'check_out_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(lang)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}

function rowsToMap(rows: string[][], lang: string): Record<string, string> {
    const col = LANG_COL[normalizeLang(lang)] ?? 1;
    const map: Record<string, string> = {};
    rows.forEach(row => { if (row[0]) map[row[0]] = row[col] || row[1] || ''; });
    return map;
}

export async function getAllCheckInMsgs(lang = 'EN'): Promise<Record<string, string>> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'check_in_msgs!A2:F',
    });
    return rowsToMap((res.data.values || []) as string[][], lang);
}

export async function getAllCheckOutMsgs(lang = 'EN'): Promise<Record<string, string>> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'check_out_msgs!A2:F',
    });
    return rowsToMap((res.data.values || []) as string[][], lang);
}

export async function getAllBookingMsgs(lang = 'EN'): Promise<Record<string, string>> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SHEET_ID,
        range: 'booking_msgs!A2:F',
    });
    return rowsToMap((res.data.values || []) as string[][], lang);
}