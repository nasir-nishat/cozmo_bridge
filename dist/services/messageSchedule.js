"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessageScheduleReport = getMessageScheduleReport;
const bookingStore_1 = require("./bookingStore");
const groupLeads_1 = require("./groupLeads");
const sentMessages_1 = require("./sentMessages");
const kakao_1 = require("../routes/kakao");
const expenses_1 = require("./expenses");
const LABELS = {
    checkin_tips: 'Stay Tips',
    checkin_rules: 'House Rules (noise/precautions)',
    checkout_reminder: 'Checkout Pack (night before)',
    checkout_instructions_am: 'AM Checkout Instructions',
    final_bill: 'Final Bill',
    farewell: 'Farewell',
};
function kstDateStr(offsetDays = 0) {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86400000);
    return kst.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
function kstNowMinutes() {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}
function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}
function detectPlatform(groupKey) {
    if (groupKey.endsWith('@g.us'))
        return 'wa';
    if (groupKey.startsWith('line:'))
        return 'line';
    if (groupKey.startsWith('wechat:'))
        return 'wechat';
    if (groupKey.startsWith('kakao:'))
        return 'kakao';
    return null;
}
function groupDisplayName(groupKey, platform) {
    if (platform === 'kakao')
        return (0, groupLeads_1.getKakaoChatName)(groupKey.replace('kakao:', ''));
    return (0, groupLeads_1.getStoredGroupName)(groupKey);
}
function statusFor(dateStr, time, groupKey, type, todayStr) {
    const isFuture = dateStr > todayStr || (dateStr === todayStr && timeToMinutes(time) > kstNowMinutes());
    if (isFuture)
        return 'scheduled';
    if ((0, sentMessages_1.isSent)(groupKey, type))
        return 'sent';
    if (detectPlatform(groupKey) === 'kakao' && (0, kakao_1.isKakaoQueued)(groupKey, type))
        return 'queued';
    return 'missed';
}
async function pushEvents(events, leads, time, type, dateStr, todayStr, opts) {
    for (const lead of leads) {
        let groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid);
        if (opts?.kakaoOnly)
            groups = groups.filter(g => detectPlatform(g) === 'kakao');
        if (groups.length === 0)
            continue;
        let skipNote;
        if (opts?.skipIfNoExpenses) {
            // Fail open on error — an unknown expense state should never be mislabeled "skipped".
            const hasExpenses = await (0, expenses_1.hasAnyExpenses)(lead.leadUid).catch(() => true);
            if (!hasExpenses)
                skipNote = 'no expenses logged';
        }
        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform)
                continue;
            events.push({
                time, type, label: LABELS[type],
                guestName: lead.guestName,
                property: lead.property,
                platform,
                groupKey,
                groupName: groupDisplayName(groupKey, platform),
                status: skipNote ? 'skipped' : statusFor(dateStr, time, groupKey, type, todayStr),
                note: skipNote,
            });
        }
    }
}
async function buildDay(dateStr, todayStr) {
    const events = [];
    const checkins = (0, bookingStore_1.getBookingsCheckingIn)(dateStr);
    const checkouts = (0, bookingStore_1.getBookingsCheckingOut)(dateStr);
    const tomorrowCheckouts = (0, bookingStore_1.getBookingsCheckingOut)(addDays(dateStr, 1));
    await pushEvents(events, checkins, '15:00', 'checkin_tips', dateStr, todayStr);
    await pushEvents(events, checkins, '19:00', 'checkin_rules', dateStr, todayStr);
    await pushEvents(events, checkouts, '07:00', 'final_bill', dateStr, todayStr, { skipIfNoExpenses: true });
    await pushEvents(events, checkouts, '09:00', 'checkout_instructions_am', dateStr, todayStr, { kakaoOnly: true });
    await pushEvents(events, checkouts, '15:00', 'farewell', dateStr, todayStr);
    await pushEvents(events, tomorrowCheckouts, '21:00', 'checkout_reminder', dateStr, todayStr);
    events.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    return events;
}
async function getMessageScheduleReport() {
    const todayStr = kstDateStr(0);
    const yesterdayStr = addDays(todayStr, -1);
    const tomorrowStr = addDays(todayStr, 1);
    const [yesterdayEvents, todayEvents, tomorrowEvents] = await Promise.all([
        buildDay(yesterdayStr, todayStr),
        buildDay(todayStr, todayStr),
        buildDay(tomorrowStr, todayStr),
    ]);
    return {
        yesterday: { date: yesterdayStr, events: yesterdayEvents },
        today: { date: todayStr, events: todayEvents },
        tomorrow: { date: tomorrowStr, events: tomorrowEvents },
    };
}
