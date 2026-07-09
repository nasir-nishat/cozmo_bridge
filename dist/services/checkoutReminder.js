"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.catchUpCheckout = catchUpCheckout;
exports.initCheckoutReminder = initCheckoutReminder;
const node_cron_1 = __importDefault(require("node-cron"));
const groupLeads_1 = require("./groupLeads");
const kakao_1 = require("../routes/kakao");
const sheets_1 = require("./sheets");
const evoClient_1 = require("../platforms/whatsapp/evoClient");
const lineClient_1 = require("../platforms/line/lineClient");
const wechat_1 = require("./wechat");
const notify_1 = require("./notify");
const groupNaming_1 = require("../platforms/whatsapp/groupNaming");
const bookingStore_1 = require("./bookingStore");
const expenses_1 = require("./expenses");
const constants_1 = require("../config/constants");
const sentMessages_1 = require("./sentMessages");
const llm_1 = require("./llm");
const groupLeads_2 = require("./groupLeads");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);
function getTodayKST() {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstNow.toISOString().slice(0, 10);
}
function getTomorrowKST() {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(kstNow.getTime() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
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
async function sendCheckoutReminders() {
    if (!constants_1.CONFIG.ENABLE_CHECKOUT_REMINDER) {
        console.log('⏸️ Checkout reminders skipped — ENABLE_CHECKOUT_REMINDER=false');
        return;
    }
    const dateStr = getTomorrowKST();
    console.log(`📅 Checkout reminder run for: ${dateStr}`);
    const leads = (0, bookingStore_1.getBookingsCheckingOut)(dateStr);
    console.log(`📋 Leads checking out tomorrow (${dateStr}): ${leads.length}`);
    if (leads.length === 0)
        return;
    // Fetch each message once per language per run
    const msgCache = new Map();
    const getMessage = async (key, lang = 'EN') => {
        const cacheKey = `${key}_${lang}`;
        if (!msgCache.has(cacheKey)) {
            msgCache.set(cacheKey, await (0, sheets_1.getScheduledMessage)(key, lang));
        }
        return msgCache.get(cacheKey);
    };
    let sent = 0;
    let skipped = 0;
    for (const lead of leads) {
        const uid = lead.leadUid;
        const name = lead.guestName;
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(uid);
        if (groups.length === 0) {
            console.log(`⏭️ No linked groups for ${name} (${uid})`);
            skipped++;
            continue;
        }
        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform) {
                console.warn(`⚠️ Unknown platform key: ${groupKey} — skipping`);
                continue;
            }
            if ((0, sentMessages_1.isSent)(groupKey, 'checkout_reminder')) {
                console.log(`⏭️ checkout_reminder already sent: ${groupKey}`);
                continue;
            }
            if (platform === 'kakao') {
                const chatId = groupKey.replace('kakao:', '');
                if ((0, kakao_1.isKakaoQueued)(groupKey, 'checkout_reminder')) {
                    console.log(`⏭️ checkout_reminder already queued: ${groupKey}`);
                    continue;
                }
                const message = await getMessage('checkout_reminder', 'KR');
                if (!message) {
                    console.warn(`⚠️ No message in sheet for: checkout_reminder/KR`);
                    continue;
                }
                // Collect the whole burst, then enqueue — the LAST item carries the sentType so the
                // message is marked "sent" only after MessengerBot R has dequeued all parts.
                const parts = [message];
                const payMsg = await getMessage('payment_reminder', 'KR');
                if (payMsg)
                    parts.push(payMsg);
                if (constants_1.CONFIG.ENABLE_EXPENSE_AUTO_SEND && lead.checkIn >= constants_1.CONFIG.EXPENSE_AUTO_SEND_CHECKIN_FROM) {
                    await (0, expenses_1.sendExpenseSummary)(uid, async (msg) => { parts.push(msg); }, groupKey);
                }
                parts.forEach((p, i) => (0, kakao_1.enqueueKakaoMessage)(chatId, p, i === parts.length - 1 ? { groupKey, sentType: 'checkout_reminder' } : undefined));
                console.log(`✅ Checkout reminder queued [kakao/KR] → ${name} (${parts.length} msgs)`);
                sent++;
                continue;
            }
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const message = await getMessage('checkout_reminder', lang);
            if (!message) {
                console.warn(`⚠️ No message in sheet for: checkout_reminder/${lang}`);
                continue;
            }
            let sendFn;
            try {
                if (platform === 'wa') {
                    sendFn = async (msg) => (0, evoClient_1.evoSendText)(groupKey, msg);
                    await (0, evoClient_1.evoSendText)(groupKey, message);
                }
                else if (platform === 'line') {
                    const lineId = groupKey.replace('line:', '');
                    sendFn = async (msg) => (0, lineClient_1.pushMessage)(lineId, msg);
                    await (0, lineClient_1.pushMessage)(lineId, message);
                }
                else if (platform === 'wechat') {
                    const wcId = groupKey.replace('wechat:', '');
                    sendFn = async (msg) => (0, wechat_1.wechatSendText)(wcId, msg);
                    await (0, wechat_1.wechatSendText)(wcId, message);
                }
                else {
                    continue;
                }
                (0, sentMessages_1.markSent)(groupKey, 'checkout_reminder');
                console.log(`✅ Checkout reminder sent [${platform}/${lang}] → ${name}`);
                sent++;
                const payMsg = await getMessage('payment_reminder', lang);
                if (payMsg)
                    await sendFn(payMsg);
                if (constants_1.CONFIG.ENABLE_EXPENSE_AUTO_SEND && lead.checkIn >= constants_1.CONFIG.EXPENSE_AUTO_SEND_CHECKIN_FROM) {
                    const hadExpenses = await (0, expenses_1.sendExpenseSummary)(uid, sendFn, groupKey);
                    if (hadExpenses)
                        console.log(`💰 Expense summary sent [${platform}] → ${name}`);
                }
                if (platform === 'wa')
                    await randSleep(20000, 45000);
            }
            catch (e) {
                console.error(`❌ Send failed [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }
    await (0, notify_1.sendAlert)(`📅 <b>Checkout Reminders Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `⏭️ <b>No group linked:</b> ${skipped}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
}
async function sendCheckoutInstructionsAM() {
    if (!constants_1.CONFIG.ENABLE_CHECKOUT_REMINDER) {
        console.log('⏸️ AM checkout instructions skipped — ENABLE_CHECKOUT_REMINDER=false');
        return;
    }
    const dateStr = getTodayKST();
    const leads = (0, bookingStore_1.getBookingsCheckingOut)(dateStr);
    console.log(`🌅 AM checkout instructions run for: ${dateStr} (${leads.length} lead(s))`);
    if (leads.length === 0)
        return;
    const message = await (0, sheets_1.getScheduledMessage)('checkout_reminder', 'KR');
    if (!message) {
        console.warn(`⚠️ No message in sheet for: checkout_reminder/KR`);
        return;
    }
    let sent = 0;
    for (const lead of leads) {
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid).filter(g => detectPlatform(g) === 'kakao');
        for (const groupKey of groups) {
            if ((0, sentMessages_1.isSent)(groupKey, 'checkout_instructions_am')) {
                console.log(`⏭️ checkout_instructions_am already sent: ${groupKey}`);
                continue;
            }
            if ((0, kakao_1.isKakaoQueued)(groupKey, 'checkout_instructions_am')) {
                console.log(`⏭️ checkout_instructions_am already queued: ${groupKey}`);
                continue;
            }
            const chatId = groupKey.replace('kakao:', '');
            (0, kakao_1.enqueueKakaoMessage)(chatId, message, { groupKey, sentType: 'checkout_instructions_am' });
            console.log(`✅ AM checkout instructions queued [kakao/KR] → ${lead.guestName}`);
            sent++;
        }
    }
    await (0, notify_1.sendAlert)(`🌅 <b>AM Checkout Instructions Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
}
async function sendFarewellMessages() {
    if (!constants_1.CONFIG.ENABLE_CHECKOUT_REMINDER) {
        console.log('⏸️ Farewell skipped — ENABLE_CHECKOUT_REMINDER=false');
        return;
    }
    const dateStr = getTodayKST();
    const leads = (0, bookingStore_1.getBookingsCheckingOut)(dateStr);
    if (leads.length === 0)
        return;
    console.log(`👋 Farewell run for: ${dateStr} (${leads.length} lead(s))`);
    let sent = 0;
    for (const lead of leads) {
        const uid = lead.leadUid;
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(uid);
        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform)
                continue;
            if ((0, sentMessages_1.isSent)(groupKey, 'farewell')) {
                console.log(`⏭️ farewell already sent: ${groupKey}`);
                continue;
            }
            if (platform === 'kakao') {
                const chatId = groupKey.replace('kakao:', '');
                if ((0, kakao_1.isKakaoQueued)(groupKey, 'farewell')) {
                    console.log(`⏭️ farewell already queued: ${groupKey}`);
                    continue;
                }
                const msg = await (0, sheets_1.getScheduledMessage)('farewell_reminder', 'KR');
                if (!msg)
                    continue;
                (0, kakao_1.enqueueKakaoMessage)(chatId, msg, { groupKey, sentType: 'farewell' });
                sent++;
                continue;
            }
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const msg = await (0, sheets_1.getScheduledMessage)('farewell_reminder', lang);
            if (!msg)
                continue;
            try {
                if (platform === 'wa')
                    await (0, evoClient_1.evoSendText)(groupKey, msg);
                else if (platform === 'line')
                    await (0, lineClient_1.pushMessage)(groupKey.replace('line:', ''), msg);
                else if (platform === 'wechat')
                    await (0, wechat_1.wechatSendText)(groupKey.replace('wechat:', ''), msg);
                (0, sentMessages_1.markSent)(groupKey, 'farewell');
                console.log(`✅ Farewell sent [${platform}/${lang}] → ${lead.guestName}`);
                sent++;
                if (platform === 'wa')
                    await randSleep(20000, 45000);
            }
            catch (e) {
                console.error(`❌ Farewell send [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }
    await (0, notify_1.sendAlert)(`👋 <b>Farewell Messages Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
}
async function sendFinalBill() {
    if (!constants_1.CONFIG.ENABLE_CHECKOUT_REMINDER) {
        console.log('⏸️ Final bill skipped — ENABLE_CHECKOUT_REMINDER=false');
        return;
    }
    const dateStr = getTodayKST();
    const leads = (0, bookingStore_1.getBookingsCheckingOut)(dateStr);
    if (leads.length === 0)
        return;
    console.log(`💳 Final bill run for: ${dateStr} (${leads.length} lead(s))`);
    let sent = 0;
    for (const lead of leads) {
        const uid = lead.leadUid;
        const hasExpenses = await (0, expenses_1.hasAnyExpenses)(uid);
        if (!hasExpenses) {
            console.log(`⏭️ No expenses for ${lead.guestName} — final bill skipped`);
            continue;
        }
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(uid);
        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform)
                continue;
            if ((0, sentMessages_1.isSent)(groupKey, 'final_bill')) {
                console.log(`⏭️ final_bill already sent: ${groupKey}`);
                continue;
            }
            if (platform === 'kakao') {
                const chatId = groupKey.replace('kakao:', '');
                if ((0, kakao_1.isKakaoQueued)(groupKey, 'final_bill')) {
                    console.log(`⏭️ final_bill already queued: ${groupKey}`);
                    continue;
                }
                const parts = [];
                const billMsg = await (0, sheets_1.getScheduledMessage)('final_bill', 'KR');
                if (billMsg)
                    parts.push(billMsg);
                if (constants_1.CONFIG.ENABLE_EXPENSE_AUTO_SEND)
                    await (0, expenses_1.sendExpenseSummary)(uid, async (msg) => { parts.push(msg); }, groupKey);
                if (parts.length === 0)
                    continue;
                parts.forEach((p, i) => (0, kakao_1.enqueueKakaoMessage)(chatId, p, i === parts.length - 1 ? { groupKey, sentType: 'final_bill' } : undefined));
                console.log(`💳 Final bill queued [kakao] → ${lead.guestName} (${parts.length} msgs)`);
                sent++;
                continue;
            }
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            let sendFn;
            if (platform === 'wa')
                sendFn = (msg) => (0, evoClient_1.evoSendText)(groupKey, msg);
            else if (platform === 'line')
                sendFn = (msg) => (0, lineClient_1.pushMessage)(groupKey.replace('line:', ''), msg);
            else if (platform === 'wechat')
                sendFn = (msg) => (0, wechat_1.wechatSendText)(groupKey.replace('wechat:', ''), msg);
            else
                continue;
            try {
                const billMsg = await (0, sheets_1.getScheduledMessage)('final_bill', lang);
                if (billMsg)
                    await sendFn(billMsg);
                if (constants_1.CONFIG.ENABLE_EXPENSE_AUTO_SEND)
                    await (0, expenses_1.sendExpenseSummary)(uid, sendFn, groupKey);
                (0, sentMessages_1.markSent)(groupKey, 'final_bill');
                console.log(`💳 Final bill sent [${platform}/${lang}] → ${lead.guestName}`);
                sent++;
                if (platform === 'wa')
                    await randSleep(20000, 45000);
            }
            catch (e) {
                console.error(`❌ Final bill send [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }
    if (sent > 0) {
        await (0, notify_1.sendAlert)(`💳 <b>Final Bill Sent</b>\n─────────────────\n` +
            `✅ <b>Sent:</b> ${sent}\n` +
            `📅 <b>Date:</b> ${dateStr}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
    }
}
function kstHour() {
    return new Date(Date.now() + 9 * 3600000).getUTCHours();
}
async function preCheckWithLLM(sentKey, messageKey, leads, platformFilter) {
    for (const lead of leads) {
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid);
        for (const groupKey of groups) {
            if ((0, sentMessages_1.isSent)(groupKey, sentKey))
                continue;
            const platform = detectPlatform(groupKey);
            if (!platform)
                continue;
            if (platformFilter && platform !== platformFilter)
                continue;
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const template = await (0, sheets_1.getScheduledMessage)(messageKey, lang).catch(() => '');
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
async function alertMissedMessages(sentKey, label, dateStr, skipCheck, platformFilter) {
    const leads = (0, bookingStore_1.getBookingsCheckingOut)(dateStr);
    for (const lead of leads) {
        if (skipCheck && !await skipCheck(lead.leadUid)) {
            console.log(`⏭️ alertMissed(${label}): no expenses for ${lead.guestName} — skipped`);
            await (0, notify_1.sendAlert)(`⏭️ <b>${label} Skipped</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${lead.guestName}\n` +
                `📋 <b>Reason:</b> No expenses logged\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true }).catch(() => { });
            continue;
        }
        const groups = (0, groupLeads_1.getAllGroupsByLeadUid)(lead.leadUid);
        for (const groupKey of groups) {
            if ((0, sentMessages_1.isSent)(groupKey, sentKey))
                continue;
            const platform = detectPlatform(groupKey);
            if (platformFilter && platform !== platformFilter)
                continue;
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
function catchUpCheckout() {
    const h = kstHour();
    const today = getTodayKST();
    const tomorrow = getTomorrowKST();
    if (h === 7) {
        const leads = (0, bookingStore_1.getBookingsCheckingOut)(today);
        preCheckWithLLM('final_bill', 'final_bill', leads)
            .then(() => sendFinalBill())
            .catch(e => console.error('❌ catchUp finalBill:', e?.message));
    }
    else if (h > 7) {
        alertMissedMessages('final_bill', 'Final Bill', today, expenses_1.hasAnyExpenses).catch(e => console.error('❌ alertMissed finalBill:', e?.message));
    }
    if (h === 9) {
        const leads = (0, bookingStore_1.getBookingsCheckingOut)(today);
        preCheckWithLLM('checkout_instructions_am', 'checkout_reminder', leads, 'kakao')
            .then(() => sendCheckoutInstructionsAM())
            .catch(e => console.error('❌ catchUp checkoutInstructionsAM:', e?.message));
    }
    else if (h > 9) {
        alertMissedMessages('checkout_instructions_am', 'AM Checkout Instructions', today, undefined, 'kakao').catch(e => console.error('❌ alertMissed checkoutInstructionsAM:', e?.message));
    }
    if (h === 15) {
        const leads = (0, bookingStore_1.getBookingsCheckingOut)(today);
        preCheckWithLLM('farewell', 'farewell_reminder', leads)
            .then(() => sendFarewellMessages())
            .catch(e => console.error('❌ catchUp farewell:', e?.message));
    }
    else if (h > 15) {
        alertMissedMessages('farewell', 'Farewell Message', today).catch(e => console.error('❌ alertMissed farewell:', e?.message));
    }
    if (h === 21) {
        const leads = (0, bookingStore_1.getBookingsCheckingOut)(tomorrow);
        preCheckWithLLM('checkout_reminder', 'checkout_reminder', leads)
            .then(() => sendCheckoutReminders())
            .catch(e => console.error('❌ catchUp checkoutReminder:', e?.message));
    }
    else if (h > 21) {
        alertMissedMessages('checkout_reminder', 'Checkout Reminder', tomorrow).catch(e => console.error('❌ alertMissed checkoutReminder:', e?.message));
    }
}
function initCheckoutReminder() {
    node_cron_1.default.schedule('0 21 * * *', () => {
        sendCheckoutReminders().catch(e => console.error('❌ checkoutReminder crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    node_cron_1.default.schedule('0 7 * * *', () => {
        sendFinalBill().catch(e => console.error('❌ finalBill crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    node_cron_1.default.schedule('0 9 * * *', () => {
        sendCheckoutInstructionsAM().catch(e => console.error('❌ checkoutInstructionsAM crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    node_cron_1.default.schedule('0 15 * * *', () => {
        sendFarewellMessages().catch(e => console.error('❌ farewellReminder crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Checkout reminders scheduled: 21:00 | Final bill: 07:00 | AM instructions (Kakao): 09:00 | Farewell: 15:00 KST daily');
}
