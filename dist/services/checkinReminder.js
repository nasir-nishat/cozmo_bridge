"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.catchUpCheckin = catchUpCheckin;
exports.initCheckinReminder = initCheckinReminder;
const node_cron_1 = __importDefault(require("node-cron"));
const groupLeads_1 = require("./groupLeads");
const sheets_1 = require("./sheets");
const evoClient_1 = require("../platforms/whatsapp/evoClient");
const lineClient_1 = require("../platforms/line/lineClient");
const wechat_1 = require("./wechat");
const notify_1 = require("./notify");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const bookingStore_1 = require("./bookingStore");
const constants_1 = require("../config/constants");
const sentMessages_1 = require("./sentMessages");
const llm_1 = require("./llm");
const groupLeads_2 = require("./groupLeads");
function getTodayKST() {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstNow.toISOString().slice(0, 10);
}
function getNationalityLang(nationality) {
    if (nationality === 'KR')
        return 'KR';
    if (nationality === 'JP')
        return 'JA';
    if (nationality === 'TW' || nationality === 'CN')
        return 'ZH-CN';
    return 'EN';
}
function resolveGroupLang(groupKey, platform, nationality) {
    const stored = (0, groupLeads_2.getGroupLang)(groupKey);
    if (stored)
        return stored;
    if (platform === 'kakao')
        return 'KR';
    if (platform === 'wechat')
        return 'ZH-CN';
    if (platform === 'wa')
        return 'EN';
    return getNationalityLang(nationality);
}
function getStayNights(checkIn, checkOut) {
    const inMs = new Date(`${checkIn}T00:00:00+09:00`).getTime();
    const outMs = new Date(`${checkOut}T00:00:00+09:00`).getTime();
    return Math.round((outMs - inMs) / (24 * 60 * 60 * 1000));
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
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const randSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);
const kakao_1 = require("../routes/kakao");
async function sendToGroup(platform, groupKey, _chatName, message) {
    if (platform === 'wa')
        await (0, evoClient_1.evoSendText)(groupKey, message);
    else if (platform === 'line')
        await (0, lineClient_1.pushMessage)(groupKey.replace('line:', ''), message);
    else if (platform === 'wechat')
        await (0, wechat_1.wechatSendText)(groupKey.replace('wechat:', ''), message);
    else if (platform === 'kakao')
        (0, kakao_1.enqueueKakaoMessage)(groupKey.replace('kakao:', ''), message);
}
async function sendCheckinTips() {
    if (!constants_1.CONFIG.ENABLE_CHECKIN_REMINDER) {
        console.log('⏸️ Check-in tips skipped — ENABLE_CHECKIN_REMINDER=false');
        return;
    }
    const dateStr = getTodayKST();
    const leads = (0, bookingStore_1.getBookingsCheckingIn)(dateStr);
    console.log(`🏨 Check-in tips run for: ${dateStr} (${leads.length} lead(s))`);
    if (leads.length === 0)
        return;
    const TIP_KEYS = ['breakfast_tips', 'food_tips', 'van_tips'];
    let sent = 0;
    let skipped = 0;
    for (const lead of leads) {
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid);
        if (groups.length === 0) {
            console.log(`⏭️ No linked groups for ${lead.guestName} (${lead.leadUid})`);
            skipped++;
            continue;
        }
        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform) {
                console.warn(`⚠️ Unknown platform key: ${groupKey}`);
                continue;
            }
            const chatName = null;
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const nights = getStayNights(lead.checkIn, lead.checkOut);
            const tipKeys = (lead.property.includes('JTS') || nights < 4)
                ? TIP_KEYS.filter(k => k !== 'breakfast_tips')
                : TIP_KEYS;
            if ((0, sentMessages_1.isSent)(groupKey, 'checkin_tips')) {
                console.log(`⏭️ checkin_tips already sent: ${groupKey}`);
                continue;
            }
            if (platform === 'kakao') {
                if (!(0, kakao_1.isKakaoQueued)(groupKey, 'checkin_tips')) {
                    const chatId = groupKey.replace('kakao:', '');
                    const parts = [];
                    for (const key of tipKeys) {
                        const msg = await (0, sheets_1.getTipsMessage)(key, lang);
                        if (msg)
                            parts.push(msg);
                    }
                    if (parts.length > 0) {
                        parts.forEach((p, i) => (0, kakao_1.enqueueKakaoMessage)(chatId, p, i === parts.length - 1 ? { groupKey, sentType: 'checkin_tips' } : undefined));
                        console.log(`✅ Check-in tips queued [kakao/${lang}] → ${lead.guestName} (${parts.length} msgs)`);
                        sent++;
                    }
                }
                else {
                    console.log(`⏭️ checkin_tips already queued: ${groupKey}`);
                }
                continue;
            }
            let groupSent = 0;
            for (const key of tipKeys) {
                const msg = await (0, sheets_1.getTipsMessage)(key, lang);
                if (!msg) {
                    console.warn(`⚠️ No tips message for: ${key}/${lang}`);
                    continue;
                }
                try {
                    await sendToGroup(platform, groupKey, chatName, msg);
                    groupSent++;
                    if (groupSent < tipKeys.length)
                        await sleep(3000);
                }
                catch (e) {
                    console.error(`❌ Tips send [${platform}/${key}] → ${groupKey}:`, e?.message);
                }
            }
            if (groupSent > 0) {
                (0, sentMessages_1.markSent)(groupKey, 'checkin_tips');
                console.log(`✅ Check-in tips sent [${platform}/${lang}] → ${lead.guestName} (${groupSent}/${tipKeys.length} msgs)`);
                sent++;
                if (platform === 'wa')
                    await randSleep(20000, 45000);
            }
        }
    }
    await (0, notify_1.sendAlert)(`🏨 <b>Check-in Tips Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `⏭️ <b>No group:</b> ${skipped}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
}
async function sendCheckinRules() {
    if (!constants_1.CONFIG.ENABLE_CHECKIN_REMINDER) {
        console.log('⏸️ Check-in rules skipped — ENABLE_CHECKIN_REMINDER=false');
        return;
    }
    const dateStr = getTodayKST();
    const leads = (0, bookingStore_1.getBookingsCheckingIn)(dateStr);
    console.log(`📋 Check-in rules run for: ${dateStr} (${leads.length} lead(s))`);
    if (leads.length === 0)
        return;
    let sent = 0;
    for (const lead of leads) {
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid);
        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform)
                continue;
            if ((0, sentMessages_1.isSent)(groupKey, 'checkin_rules')) {
                console.log(`⏭️ checkin_rules already sent: ${groupKey}`);
                continue;
            }
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            if (platform === 'kakao') {
                if (!(0, kakao_1.isKakaoQueued)(groupKey, 'checkin_rules')) {
                    const kakaoMsg = await (0, sheets_1.getTipsMessage)('guest_rules', lang);
                    if (kakaoMsg) {
                        (0, kakao_1.enqueueKakaoMessage)(groupKey.replace('kakao:', ''), kakaoMsg, { groupKey, sentType: 'checkin_rules' });
                        console.log(`✅ Guest rules queued [kakao/${lang}] → ${lead.guestName}`);
                        sent++;
                    }
                }
                else {
                    console.log(`⏭️ checkin_rules already queued: ${groupKey}`);
                }
                continue;
            }
            const msg = await (0, sheets_1.getTipsMessage)('guest_rules', lang);
            if (!msg) {
                console.warn(`⚠️ No guest_rules for lang: ${lang}`);
                continue;
            }
            try {
                await sendToGroup(platform, groupKey, null, msg);
                (0, sentMessages_1.markSent)(groupKey, 'checkin_rules');
                console.log(`✅ Guest rules sent [${platform}/${lang}] → ${lead.guestName}`);
                sent++;
                if (platform === 'wa')
                    await randSleep(20000, 45000);
            }
            catch (e) {
                console.error(`❌ Rules send [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }
    await (0, notify_1.sendAlert)(`📋 <b>Guest Rules Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
}
function kstHour() {
    return new Date(Date.now() + 9 * 3600000).getUTCHours();
}
async function preCheckWithLLM(sentKey, messageKey, leads) {
    for (const lead of leads) {
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid);
        for (const groupKey of groups) {
            if ((0, sentMessages_1.isSent)(groupKey, sentKey))
                continue;
            const platform = detectPlatform(groupKey);
            if (!platform)
                continue;
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const template = await (0, sheets_1.getTipsMessage)(messageKey, lang).catch(() => '');
            if (!template)
                continue;
            const detected = await (0, llm_1.wasAlreadySent)(groupKey, template).catch(() => false);
            if (detected) {
                (0, sentMessages_1.markSent)(groupKey, sentKey);
                console.log(`🤖 LLM pre-check: ${sentKey} already sent → ${groupKey}`);
            }
        }
    }
}
async function alertMissedCheckin(sentKey, label) {
    const dateStr = getTodayKST();
    const leads = (0, bookingStore_1.getBookingsCheckingIn)(dateStr);
    for (const lead of leads) {
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid);
        for (const groupKey of groups) {
            if ((0, sentMessages_1.isSent)(groupKey, sentKey))
                continue;
            const platform = detectPlatform(groupKey);
            // Declared missed → drop any pending kakao queue item so a late-recovering bot doesn't
            // auto-deliver it after the team has already sent it manually.
            if (platform === 'kakao') {
                const dropped = (0, kakao_1.dropKakaoQueued)(groupKey, sentKey);
                if (dropped)
                    console.log(`🗑️ Dropped ${dropped} pending kakao ${sentKey} for ${groupKey} (missed)`);
            }
            const platformName = platform === 'wa' ? 'WhatsApp'
                : platform === 'line' ? 'LINE'
                    : platform === 'wechat' ? 'WeChat'
                        : platform === 'kakao' ? 'KakaoTalk'
                            : 'Unknown';
            const chatName = platform === 'kakao'
                ? ((0, groupLeads_1.getKakaoChatName)(groupKey.replace('kakao:', '')) ?? groupKey)
                : groupKey;
            await (0, notify_1.sendAlert)(`⚠️ <b>Missed: ${label}</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${lead.guestName}\n` +
                `📱 <b>Platform:</b> ${platformName}\n` +
                `💬 <b>Group:</b> ${chatName}\n` +
                `─────────────────\n` +
                `<i>Server was down at scheduled time. Please send manually.</i>`, { propertyCode: (0, groupNaming_1.propertyCodeFromName)(lead.property) || undefined }).catch(() => { });
        }
    }
}
function catchUpCheckin() {
    const h = kstHour();
    if (h === 15) {
        const leads = (0, bookingStore_1.getBookingsCheckingIn)(getTodayKST());
        preCheckWithLLM('checkin_tips', 'breakfast_tips', leads)
            .then(() => sendCheckinTips())
            .catch(e => console.error('❌ catchUp checkinTips:', e?.message));
    }
    else if (h > 15) {
        alertMissedCheckin('checkin_tips', 'Check-in Tips').catch(e => console.error('❌ alertMissed checkinTips:', e?.message));
    }
    if (h === 19) {
        const leads = (0, bookingStore_1.getBookingsCheckingIn)(getTodayKST());
        preCheckWithLLM('checkin_rules', 'guest_rules', leads)
            .then(() => sendCheckinRules())
            .catch(e => console.error('❌ catchUp checkinRules:', e?.message));
    }
    else if (h > 19) {
        alertMissedCheckin('checkin_rules', 'Check-in Rules').catch(e => console.error('❌ alertMissed checkinRules:', e?.message));
    }
}
function initCheckinReminder() {
    node_cron_1.default.schedule('0 15 * * *', () => {
        sendCheckinTips().catch(e => console.error('❌ checkinTips crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    node_cron_1.default.schedule('0 19 * * *', () => {
        sendCheckinRules().catch(e => console.error('❌ checkinRules crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Check-in reminders scheduled: Tips 15:00 KST | Rules 19:00 KST daily');
}
