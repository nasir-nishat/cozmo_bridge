"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveTeamMembers = getActiveTeamMembers;
exports.getDevTeamMembers = getDevTeamMembers;
exports.getTeamNumbers = getTeamNumbers;
exports.getTeamNames = getTeamNames;
exports.getAllTeamMembers = getAllTeamMembers;
exports.getMessages = getMessages;
exports.getBookingMsg = getBookingMsg;
exports.getGroupCreationMsg = getGroupCreationMsg;
exports.getBookingMsgKr = getBookingMsgKr;
exports.getBookingConfirmationMessage = getBookingConfirmationMessage;
exports.getPrePaymentMsg = getPrePaymentMsg;
exports.getGuestLeads = getGuestLeads;
exports.saveGuestLead = saveGuestLead;
exports.getTipsMessage = getTipsMessage;
exports.getScheduledMessage = getScheduledMessage;
exports.getAllCheckInMsgs = getAllCheckInMsgs;
exports.getAllCheckOutMsgs = getAllCheckOutMsgs;
exports.getAllBookingMsgs = getAllBookingMsgs;
const googleapis_1 = require("googleapis");
const google_auth_1 = __importDefault(require("./google-auth"));
const constants_1 = require("../config/constants");
const sheets = googleapis_1.google.sheets({ version: 'v4', auth: google_auth_1.default });
const isTrue = (value) => (value || '').toString().trim().toLowerCase() === 'true';
const toJid = (raw) => {
    const clean = (raw || '').replace(/\D/g, '');
    return clean ? `${clean}@c.us` : '';
};
async function getActiveTeamMembers() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'team_members!A2:E',
    });
    return (res.data.values || [])
        .filter(row => isTrue(row[3]))
        .map(row => toJid(row[1]))
        .filter(Boolean);
}
async function getDevTeamMembers() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'team_members!A2:E',
    });
    return (res.data.values || [])
        .filter(row => isTrue(row[4]))
        .map(row => toJid(row[1]))
        .filter(Boolean);
}
async function getTeamNumbers() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'team_members!A2:B',
    });
    return (res.data.values || [])
        .filter(row => row[1])
        .map(row => '+' + row[1].replace(/\D/g, ''));
}
async function getTeamNames() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'team_members!A2:A',
    });
    return (res.data.values || [])
        .map(row => (row[0] || '').trim().toLowerCase())
        .filter(Boolean);
}
async function getAllTeamMembers() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
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
const LANG_COL = {
    EN: 1, KR: 2, JA: 3, 'ZH-CN': 4, 'ZH-TW': 5,
};
function normalizeLang(lang) {
    if (lang === 'KO')
        return 'KR';
    if (lang === 'ZH')
        return 'ZH-CN';
    return lang;
}
async function getMessages(langCode = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'group_creation_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(langCode)] ?? 1;
    const map = {};
    (res.data.values || []).forEach(row => {
        if (row[0])
            map[row[0]] = row[col] || row[1] || '';
    });
    return map;
}
async function getBookingMsg(key, langCode = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'booking_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(langCode)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}
async function getGroupCreationMsg(key) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'group_creation_msgs!A2:B',
    });
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[1] || '';
}
// F9/L9/B9 in property code map → F09/L09/B09 in the sheet header
const KR_CODE_NORMALIZE = { F9: 'F09', L9: 'L09', B9: 'B09' };
async function getBookingMsgKr(propertyCode) {
    const code = KR_CODE_NORMALIZE[propertyCode] ?? propertyCode;
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'booking_msgs_kr!A1:N',
    });
    const rows = res.data.values || [];
    if (rows.length < 2)
        return '';
    const headers = rows[0];
    const colIdx = headers.findIndex(h => h.toUpperCase() === code.toUpperCase() ||
        h.toUpperCase().startsWith(code.toUpperCase() + '_'));
    if (colIdx < 0)
        return '';
    const dataRow = rows.slice(1).find(r => r[0] === 'booking_msg_kr');
    return dataRow?.[colIdx] || '';
}
async function getBookingConfirmationMessage(langCode) {
    return getBookingMsg('booking_confirmation', langCode);
}
async function getPrePaymentMsg(key, langCode = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'pre_payment_msg!A2:F',
    });
    const col = LANG_COL[normalizeLang(langCode)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}
async function getGuestLeads() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'guest_leads!A2:B',
    });
    const map = {};
    (res.data.values || []).forEach(row => {
        if (row[0] && row[1])
            map[row[0]] = row[1];
    });
    return map;
}
async function saveGuestLead(phone, leadUid) {
    await sheets.spreadsheets.values.append({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'guest_leads!A:B',
        valueInputOption: 'RAW',
        requestBody: { values: [[phone, leadUid]] },
    });
}
async function getTipsMessage(key, lang = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'check_in_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(lang)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}
async function getScheduledMessage(key, lang = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'check_out_msgs!A2:F',
    });
    const col = LANG_COL[normalizeLang(lang)] ?? 1;
    const row = (res.data.values || []).find(r => r[0] === key);
    return row?.[col] || row?.[1] || '';
}
function rowsToMap(rows, lang) {
    const col = LANG_COL[normalizeLang(lang)] ?? 1;
    const map = {};
    rows.forEach(row => { if (row[0])
        map[row[0]] = row[col] || row[1] || ''; });
    return map;
}
async function getAllCheckInMsgs(lang = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'check_in_msgs!A2:F',
    });
    return rowsToMap((res.data.values || []), lang);
}
async function getAllCheckOutMsgs(lang = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'check_out_msgs!A2:F',
    });
    return rowsToMap((res.data.values || []), lang);
}
async function getAllBookingMsgs(lang = 'EN') {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'booking_msgs!A2:F',
    });
    return rowsToMap((res.data.values || []), lang);
}
