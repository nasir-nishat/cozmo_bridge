"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaffName = getStaffName;
exports.logJandiReceipt = logJandiReceipt;
exports.hasUnsettledExpenses = hasUnsettledExpenses;
exports.hasAnyExpenses = hasAnyExpenses;
exports.sendExpenseSummary = sendExpenseSummary;
exports.deleteOldExpenses = deleteOldExpenses;
exports.getExpenseSummary = getExpenseSummary;
exports.handleExpCommand = handleExpCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const googleapis_1 = require("googleapis");
const google_auth_1 = __importDefault(require("./google-auth"));
const constants_1 = require("../config/constants");
const jandi_1 = require("./jandi");
const hostfully_1 = require("./hostfully");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const sheets = googleapis_1.google.sheets({ version: 'v4', auth: google_auth_1.default });
// Sheet columns (0-based index in row array)
// A: id | B: lead_uid | C: group_id | D: group_name | E: platform | F: item | G: amount_krw | H: VAT 10% | I: VAT 10%+4.5% | J: logged_by | K: created_at | L: settled | M: card
const C = { id: 0, lead_uid: 1, group_id: 2, group_name: 3, platform: 4, item: 5, amount_krw: 6, vat_10: 7, vat_145: 8, logged_by: 9, created_at: 10, settled: 11, card: 12 };
const CARD_NAMES = { jy: 'Joyhasla', jn: 'Jin', rc: 'Ricky', cy: 'Cyrus', gy: 'Gaya', cz: 'COZMO' };
async function resolvePropertyCode(leadUid) {
    if (!leadUid)
        return null;
    try {
        const lead = await (0, hostfully_1.fetchLead)(leadUid);
        const name = (lead?.propertyName || '').toString().trim();
        if (!name)
            return null;
        const code = (0, groupNaming_1.propertyCodeFromName)(name);
        return constants_1.CONFIG.JANDI_PROPERTY_WEBHOOKS[code] ? code : null;
    }
    catch {
        return null;
    }
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function fmt(n) {
    return n.toLocaleString('en-US');
}
function loadStaffIds() {
    try {
        return JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../data/staff-ids.json'), 'utf8'));
    }
    catch {
        return {};
    }
}
function getStaffName(platform, senderId, fallbackName) {
    const map = loadStaffIds()[platform] || {};
    const id = senderId.replace(/@.*$/, '');
    if (id && map[id])
        return map[id];
    if (fallbackName && map[fallbackName])
        return map[fallbackName];
    if (fallbackName) {
        const lower = fallbackName.toLowerCase();
        for (const [key, staffName] of Object.entries(map)) {
            if (/^\d+$/.test(key)) {
                const parts = staffName.toLowerCase().split(/[_|\s]+/);
                if (parts.some(p => p.length > 4 && lower.includes(p)))
                    return staffName;
            }
        }
    }
    return null;
}
async function getAllRows() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'expenses!A2:M',
    });
    return (res.data.values || []).map((row, i) => ({
        sheetRow: i + 2,
        id: row[C.id] || '',
        lead_uid: row[C.lead_uid] || '',
        group_id: row[C.group_id] || '',
        group_name: row[C.group_name] || '',
        platform: row[C.platform] || '',
        item: row[C.item] || '',
        amount_krw: parseInt(row[C.amount_krw] || '0', 10),
        logged_by: row[C.logged_by] || '',
        created_at: row[C.created_at] || '',
        settled: row[C.settled] === 'true',
        card: row[C.card] || '',
    }));
}
async function logJandiReceipt(topicId, topicName, item, amountKrw, loggedBy, card) {
    await appendExpense(generateId(), '', `jandi:${topicId}`, topicName, 'jandi', item, amountKrw, loggedBy, card);
}
async function appendExpense(id, leadUid, groupId, groupName, platform, item, amountKrw, loggedBy, card) {
    const vat10 = Math.round(amountKrw * 1.10);
    const vat145 = Math.round(amountKrw * 1.145);
    const now = new Date();
    const seoulTime = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    await sheets.spreadsheets.values.append({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: 'expenses!A:N',
        valueInputOption: 'RAW',
        requestBody: {
            values: [[id, leadUid, groupId, groupName, platform, item, amountKrw, vat10, vat145, loggedBy, now.toISOString(), 'false', card, seoulTime]],
        },
    });
}
async function markSettled(rowIds) {
    if (!rowIds.length)
        return;
    const rows = await getAllRows();
    const data = rows
        .filter(r => rowIds.includes(r.id))
        .map(r => ({ range: `expenses!L${r.sheetRow}`, values: [['true']] }));
    if (!data.length)
        return;
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data },
    });
}
function parseExpCommand(text) {
    const match = text.match(/^\/exp\s+(jy|jn|rc|cy|gy|cz)\s+(-?\d+)\s+(.+)$/i);
    if (!match)
        return null;
    const amount = parseInt(match[2], 10);
    if (amount === 0)
        return null;
    return { card: match[1].toLowerCase(), amount, item: match[3].trim() };
}
function buildLoggedReply(item, amount, staffName, platform, card) {
    return [
        '✅ Expense logged',
        '━━━━━━━━━━━━━━━',
        `📦 ${item}`,
        `💰 ₩${fmt(amount)}`,
        `💳 ${CARD_NAMES[card] ?? card}'s card`,
        `🏷️ ${staffName} · ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
    ].join('\n');
}
function buildGuestMessage(expenses) {
    const subtotal = expenses.reduce((s, e) => s + e.amount_krw, 0);
    const vat10 = Math.round(subtotal * 1.10);
    const vat145 = Math.round(subtotal * 1.145);
    const SEP = '─────────────────';
    const items = expenses.map(e => `• ₩${fmt(e.amount_krw)}  ${e.item}`).join('\n');
    return [
        '🧾 Expense Summary',
        items,
        SEP,
        `💵 ₩${fmt(subtotal)}  Cash · Crypto`,
        `🏦 ₩${fmt(vat10)}  Bank · WISE (+10% VAT)`,
        `💳 ₩${fmt(vat145)}  Card (+10% VAT +4.5%)`,
        SEP,
        'via COZMO · COZE Hospitality',
    ].join('\n');
}
async function hasUnsettledExpenses(leadUid, groupId) {
    const rows = await getAllRows();
    return rows.some(r => (r.lead_uid === leadUid || (!!groupId && r.group_id === groupId)) && !r.settled);
}
async function hasAnyExpenses(leadUid) {
    const rows = await getAllRows();
    return rows.some(r => r.lead_uid === leadUid);
}
async function sendExpenseSummary(leadUid, sendFn, groupId) {
    const rows = await getAllRows();
    const unsettled = rows.filter(r => (r.lead_uid === leadUid || (!!groupId && r.group_id === groupId)) && !r.settled);
    if (!unsettled.length)
        return false;
    await sendFn(buildGuestMessage(unsettled));
    return true;
}
async function deleteOldExpenses() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await getAllRows();
    const keep = rows.filter(r => !r.settled || r.created_at >= cutoff);
    const removeCount = rows.length - keep.length;
    if (removeCount === 0) {
        console.log('🗑️ Expense cleanup: nothing to remove');
        return;
    }
    const keepRows = keep.map(r => [r.id, r.lead_uid, r.group_id, r.group_name, r.platform, r.item, r.amount_krw, Math.round(r.amount_krw * 1.10), Math.round(r.amount_krw * 1.145), r.logged_by, r.created_at, String(r.settled), r.card]);
    // Write kept rows first — if this fails, original data is untouched
    if (keep.length) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: constants_1.CONFIG.SHEET_ID,
            range: 'expenses!A2',
            valueInputOption: 'RAW',
            requestBody: { values: keepRows },
        });
    }
    // Clear only the rows beyond what we kept (safe: kept rows already written above)
    const clearFrom = keep.length + 2;
    await sheets.spreadsheets.values.clear({
        spreadsheetId: constants_1.CONFIG.SHEET_ID,
        range: `expenses!A${clearFrom}:M`,
    });
    console.log(`🗑️ Expense cleanup: removed ${removeCount}, kept ${keep.length}`);
}
async function getExpenseSummary() {
    const rows = await getAllRows();
    const map = new Map();
    for (const r of rows.filter(r => !r.settled && r.group_id)) {
        if (!map.has(r.group_id)) {
            map.set(r.group_id, { groupId: r.group_id, groupName: r.group_name, platform: r.platform, total: 0, count: 0 });
        }
        const e = map.get(r.group_id);
        e.total += r.amount_krw;
        e.count++;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
async function handleExpCommand(platform, groupId, groupName, staffId, leadUid, text, replyInGroup, senderName) {
    const cmd = text.trim().toLowerCase();
    const SEP = '─────────';
    if (cmd === '/exp total') {
        if (!leadUid) {
            await replyInGroup('❌ This group is not linked to a booking.').catch(() => { });
            return;
        }
        if (!getStaffName(platform, staffId, senderName))
            return;
        const rows = await getAllRows();
        const unsettled = rows.filter(r => r.group_id === groupId && !r.settled);
        if (!unsettled.length) {
            await replyInGroup('No pending expenses for this group.').catch(() => { });
            return;
        }
        await replyInGroup(buildGuestMessage(unsettled)).catch(() => { });
        return;
    }
    if (cmd === '/exp done') {
        if (!leadUid) {
            await replyInGroup('❌ This group is not linked to a booking.').catch(() => { });
            return;
        }
        if (!getStaffName(platform, staffId, senderName))
            return;
        const rows = await getAllRows();
        const unsettled = rows.filter(r => r.group_id === groupId && !r.settled);
        if (!unsettled.length) {
            await replyInGroup('No pending expenses to settle.').catch(() => { });
            return;
        }
        await markSettled(unsettled.map(r => r.id));
        const total = unsettled.reduce((s, e) => s + e.amount_krw, 0);
        await replyInGroup(`✅ ${unsettled.length} expense(s) settled — ₩${fmt(total)} total`).catch(() => { });
        const lines = unsettled.map(e => `• ₩${fmt(e.amount_krw)}  ${e.item}${e.card ? '  [' + (CARD_NAMES[e.card] ?? e.card) + ']' : ''}`).join('\n');
        const settledMsg = `✅ Expenses Settled\n` +
            `👥 Group: ${groupName}\n` +
            `${lines}\n` +
            `💵 Total: ₩${fmt(total)}`;
        (0, jandi_1.sendJandi)(settledMsg, constants_1.CONFIG.JANDI_WEBHOOK_EXPENSE).catch(() => { });
        resolvePropertyCode(leadUid).then(code => {
            const pw = code ? constants_1.CONFIG.JANDI_PROPERTY_WEBHOOKS[code] : undefined;
            if (pw)
                (0, jandi_1.sendJandi)(settledMsg, pw).catch(() => { });
        }).catch(() => { });
        return;
    }
    if (cmd === '/exp list') {
        if (!getStaffName(platform, staffId, senderName))
            return;
        if (!leadUid) {
            await replyInGroup('❌ This group is not linked to a booking.').catch(() => { });
            return;
        }
        const rows = await getAllRows();
        const unsettled = rows.filter(r => r.group_id === groupId && !r.settled);
        if (!unsettled.length) {
            await replyInGroup('No expenses logged yet.').catch(() => { });
            return;
        }
        const total = unsettled.reduce((s, e) => s + e.amount_krw, 0);
        const lines = unsettled.map(e => `• ₩${fmt(e.amount_krw)}  ${e.item}${e.card ? '  [' + (CARD_NAMES[e.card] ?? e.card) + ']' : ''}`).join('\n');
        await replyInGroup(`🧾 Expenses\n${lines}\n${SEP}\nTotal  ₩${fmt(total)}`).catch(() => { });
        return;
    }
    // /exp <card> <amount> <item>
    if (!leadUid) {
        await replyInGroup('❌ This group is not linked to a booking.').catch(() => { });
        return;
    }
    const staffName = getStaffName(platform, staffId, senderName);
    if (!staffName)
        return;
    const parsed = parseExpCommand(text.trim());
    if (!parsed) {
        const wordCount = text.trim().split(/\s+/).length;
        const msg = wordCount <= 2
            ? `Commands:\n` +
                `/exp [card] [amount] [item] — log expense\n` +
                `/exp list — view pending\n` +
                `/exp total — guest summary\n` +
                `/exp done — mark settled\n\n` +
                `Cards: jy · jn · rc · cy · gy · cz`
            : `Please include whose card 💳\n\n` +
                `Format:\n/exp [card] [amount] [item]\n\n` +
                `Cards:\n` +
                `jy = Joyhasla\n` +
                `jn = Jin\n` +
                `rc = Ricky\n` +
                `cy = Cyrus\n` +
                `gy = Gaya\n` +
                `cz = COZMO\n\n` +
                `Example:\n/exp jy 50000 Airport taxi`;
        await replyInGroup(msg).catch(() => { });
        return;
    }
    try {
        await appendExpense(generateId(), leadUid, groupId, groupName, platform, parsed.item, parsed.amount, staffName, parsed.card);
        await replyInGroup(buildLoggedReply(parsed.item, parsed.amount, staffName, platform, parsed.card)).catch(e => console.error('❌ replyInGroup error:', e?.message));
        const loggedMsg = `💳 Expense Logged\n` +
            `👥 Group: ${groupName}\n` +
            `💰 ₩${fmt(parsed.amount)}  ${parsed.item}\n` +
            `💳 Card: ${CARD_NAMES[parsed.card] ?? parsed.card}\n` +
            `🏷️ By: ${staffName} · ${platform}`;
        (0, jandi_1.sendJandi)(loggedMsg, constants_1.CONFIG.JANDI_WEBHOOK_EXPENSE).catch(() => { });
        resolvePropertyCode(leadUid).then(code => {
            const pw = code ? constants_1.CONFIG.JANDI_PROPERTY_WEBHOOKS[code] : undefined;
            if (pw)
                (0, jandi_1.sendJandi)(loggedMsg, pw).catch(() => { });
        }).catch(() => { });
    }
    catch (e) {
        console.error('❌ expense insert failed:', e?.message);
        await replyInGroup('❌ Failed to log expense. Try again.').catch(() => { });
    }
}
