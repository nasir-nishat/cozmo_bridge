"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileOnStartup = reconcileOnStartup;
const bookingStore_1 = require("./bookingStore");
const sentMessages_1 = require("./sentMessages");
const groupLeads_1 = require("./groupLeads");
const pendingHfMessages_1 = require("./pendingHfMessages");
const pendingGroupCreation_1 = require("./pendingGroupCreation");
const notify_1 = require("./notify");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
function getTodayKST() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function langCode(nationality) {
    if (nationality === 'KR')
        return 'KO';
    if (nationality === 'JP')
        return 'JA';
    if (nationality === 'TW' || nationality === 'CN')
        return 'ZH';
    return 'EN';
}
function hfCountry(nationality) {
    if (['KR', 'JP', 'TW', 'CN'].includes(nationality))
        return nationality;
    return 'OTHER';
}
// Checks active-bookings.json against sent-messages.json and group-leads.json,
// re-queues any HF inbox steps or WA group creation that were missed (e.g. server was
// down when the NEW_BOOKING webhook fired). Safe to call on every restart — isSent()
// dedup prevents any double-sends.
async function reconcileOnStartup() {
    const today = getTodayKST();
    const bookings = (0, bookingStore_1.getAllBookings)().filter(b => b.checkOut >= today);
    let hfQueued = 0;
    let groupQueued = 0;
    for (const booking of bookings) {
        const { leadUid, guestName, nationality, source: leadType, phone, property, checkIn, checkOut, status } = booking;
        const sentKey = `hf:${leadUid}`;
        const isNonWaPlatform = ['KR', 'JP', 'TW', 'CN'].includes(nationality);
        if (leadType !== 'DIRECT') {
            // HF step 1
            if (!(0, sentMessages_1.isSent)(sentKey, 'hf_step1')) {
                (0, pendingHfMessages_1.enqueueHfMessage)({
                    leadUid,
                    guestName,
                    step: 1,
                    langCode: langCode(nationality),
                    propertyCode: (0, groupNaming_1.propertyCodeFromName)(property),
                    leadType,
                    fireAt: new Date().toISOString(),
                });
                hfQueued++;
            }
            // HF step 2 (or no_wa for non-WA platforms)
            if (isNonWaPlatform) {
                if (!(0, sentMessages_1.isSent)(sentKey, 'hf_no_wa')) {
                    (0, pendingHfMessages_1.enqueueHfMessage)({
                        leadUid,
                        guestName,
                        step: 'no_wa',
                        country: hfCountry(nationality),
                        leadType,
                        fireAt: new Date().toISOString(),
                    });
                    hfQueued++;
                }
            }
            else {
                if (!(0, sentMessages_1.isSent)(sentKey, 'hf_step2')) {
                    (0, pendingHfMessages_1.enqueueHfMessage)({
                        leadUid,
                        guestName,
                        step: 2,
                        country: 'OTHER',
                        leadType,
                        fireAt: new Date().toISOString(),
                    });
                    hfQueued++;
                }
            }
        }
        // WA group creation — only for non-KR/JP/TW/CN guests (others use LINE/KakaoTalk/WeChat)
        if (!isNonWaPlatform && !(0, groupLeads_1.getWaGroupIdByLeadUid)(leadUid) && !(0, pendingGroupCreation_1.hasQueuedGroupCreation)(leadUid)) {
            (0, pendingGroupCreation_1.enqueueGroupCreation)({
                leadUid,
                propertyUid: '',
                guestName,
                phone,
                property,
                checkIn,
                checkOut,
                nationality,
                leadStatus: status,
                leadType,
                groupName: '',
                onWhatsApp: true,
                fireAt: new Date(Date.now() + 90000).toISOString(), // 90s delay — let HF msgs send first
            });
            groupQueued++;
        }
    }
    if (hfQueued + groupQueued > 0) {
        console.log(`🔄 Reconciliation: ${hfQueued} HF inbox job(s), ${groupQueued} group creation job(s) queued`);
        await (0, notify_1.sendAlert)(`🔄 <b>Startup Reconciliation</b>\n─────────────────\n` +
            `📨 <b>HF inbox queued:</b> ${hfQueued}\n` +
            `👥 <b>Group creation queued:</b> ${groupQueued}\n` +
            `─────────────────\n<i>Missed jobs recovered · COZMO</i>`, { telegramOnly: true }).catch(() => { });
    }
    else {
        console.log('✅ Reconciliation: no missed jobs found');
    }
}
