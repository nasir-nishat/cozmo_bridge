import cron from 'node-cron';
import { getAllGroupsByLeadUid, getKakaoChatName } from './groupLeads';
import { enqueueKakaoMessage, isKakaoQueued, dropKakaoQueued } from '../routes/kakao';
import { getScheduledMessage } from './sheets';
import { evoSendText } from '../platforms/whatsapp/evoClient';
import { pushMessage } from '../platforms/line/lineClient';
import { wechatSendText } from './wechat';
import { sendAlert } from './notify';
import { propertyCodeFromName } from '../platforms/whatsapp/groupNaming';
import { getBookingsCheckingOut } from './bookingStore';
import { sendExpenseSummary, hasAnyExpenses } from './expenses';
import { CONFIG } from '../config/constants';
import { markSent, isSent, MessageType } from './sentMessages';
import { wasAlreadySent } from './llm';
import { getGroupLang } from './groupLeads';


type Lang = 'EN' | 'KR' | 'JA' | 'ZH';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const randSleep = (min: number, max: number) =>
    sleep(Math.floor(Math.random() * (max - min + 1)) + min);

function getTodayKST(): string {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstNow.toISOString().slice(0, 10);
}

function getTomorrowKST(): string {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(kstNow.getTime() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
}

function getNationalityLang(nationality: string): string {
    if (nationality === 'KR') return 'KR';
    if (nationality === 'JP') return 'JA';
    if (nationality === 'TW' || nationality === 'CN') return 'ZH-CN';
    return 'EN';
}

function resolveGroupLang(groupKey: string, platform: string, nationality: string): string {
    const stored = getGroupLang(groupKey);
    if (stored) return stored;
    if (platform === 'kakao') return 'KR';
    if (platform === 'wechat') return 'ZH-CN';
    if (platform === 'wa') return 'EN';
    return getNationalityLang(nationality);
}

function detectPlatform(groupKey: string): 'wa' | 'line' | 'wechat' | 'kakao' | null {
    if (groupKey.endsWith('@g.us')) return 'wa';
    if (groupKey.startsWith('line:')) return 'line';
    if (groupKey.startsWith('wechat:')) return 'wechat';
    if (groupKey.startsWith('kakao:')) return 'kakao';
    return null;
}


async function sendCheckoutReminders(): Promise<void> {
    if (!CONFIG.ENABLE_CHECKOUT_REMINDER) { console.log('⏸️ Checkout reminders skipped — ENABLE_CHECKOUT_REMINDER=false'); return; }
    const dateStr = getTomorrowKST();
    console.log(`📅 Checkout reminder run for: ${dateStr}`);

    const leads = getBookingsCheckingOut(dateStr);
    console.log(`📋 Leads checking out tomorrow (${dateStr}): ${leads.length}`);
    if (leads.length === 0) return;

    // Fetch each message once per language per run
    const msgCache = new Map<string, string>();
    const getMessage = async (key: string, lang = 'EN'): Promise<string> => {
        const cacheKey = `${key}_${lang}`;
        if (!msgCache.has(cacheKey)) {
            msgCache.set(cacheKey, await getScheduledMessage(key, lang));
        }
        return msgCache.get(cacheKey)!;
    };

    let sent = 0;
    let skipped = 0;

    for (const lead of leads) {
        const uid: string = lead.leadUid;
        const name = lead.guestName;
        const groups = getAllGroupsByLeadUid(uid);

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
            if (isSent(groupKey, 'checkout_reminder')) {
                console.log(`⏭️ checkout_reminder already sent: ${groupKey}`);
                continue;
            }
            if (platform === 'kakao') {
                const chatId = groupKey.replace('kakao:', '');
                if (isKakaoQueued(groupKey, 'checkout_reminder')) {
                    console.log(`⏭️ checkout_reminder already queued: ${groupKey}`);
                    continue;
                }
                const message = await getMessage('checkout_reminder', 'KR');
                if (!message) { console.warn(`⚠️ No message in sheet for: checkout_reminder/KR`); continue; }
                // Collect the whole burst, then enqueue — the LAST item carries the sentType so the
                // message is marked "sent" only after MessengerBot R has dequeued all parts.
                const parts: string[] = [message];
                const payMsg = await getMessage('payment_reminder', 'KR');
                if (payMsg) parts.push(payMsg);
                if (CONFIG.ENABLE_EXPENSE_AUTO_SEND && lead.checkIn >= CONFIG.EXPENSE_AUTO_SEND_CHECKIN_FROM) {
                    await sendExpenseSummary(uid, async (msg) => { parts.push(msg); }, groupKey);
                }
                parts.forEach((p, i) => enqueueKakaoMessage(
                    chatId, p, i === parts.length - 1 ? { groupKey, sentType: 'checkout_reminder' } : undefined
                ));
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

            let sendFn: (msg: string) => Promise<void>;
            try {
                if (platform === 'wa') {
                    sendFn = async (msg) => evoSendText(groupKey, msg);
                    await evoSendText(groupKey, message);
                } else if (platform === 'line') {
                    const lineId = groupKey.replace('line:', '');
                    sendFn = async (msg) => pushMessage(lineId, msg);
                    await pushMessage(lineId, message);
                } else if (platform === 'wechat') {
                    const wcId = groupKey.replace('wechat:', '');
                    sendFn = async (msg) => wechatSendText(wcId, msg);
                    await wechatSendText(wcId, message);
                } else {
                    continue;
                }
                markSent(groupKey, 'checkout_reminder');
                console.log(`✅ Checkout reminder sent [${platform}/${lang}] → ${name}`);
                sent++;

                const payMsg = await getMessage('payment_reminder', lang);
                if (payMsg) await sendFn!(payMsg);
                if (CONFIG.ENABLE_EXPENSE_AUTO_SEND && lead.checkIn >= CONFIG.EXPENSE_AUTO_SEND_CHECKIN_FROM) {
                    const hadExpenses = await sendExpenseSummary(uid, sendFn!, groupKey);
                    if (hadExpenses) console.log(`💰 Expense summary sent [${platform}] → ${name}`);
                }
                if (platform === 'wa') await randSleep(20000, 45000);
            } catch (e: any) {
                console.error(`❌ Send failed [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }

    await sendAlert(
        `📅 <b>Checkout Reminders Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `⏭️ <b>No group linked:</b> ${skipped}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    );
}

async function sendCheckoutInstructionsAM(): Promise<void> {
    if (!CONFIG.ENABLE_CHECKOUT_REMINDER) { console.log('⏸️ AM checkout instructions skipped — ENABLE_CHECKOUT_REMINDER=false'); return; }
    const dateStr = getTodayKST();
    const leads = getBookingsCheckingOut(dateStr);
    console.log(`🌅 AM checkout instructions run for: ${dateStr} (${leads.length} lead(s))`);
    if (leads.length === 0) return;

    const message = await getScheduledMessage('checkout_reminder', 'KR');
    if (!message) { console.warn(`⚠️ No message in sheet for: checkout_reminder/KR`); return; }

    let sent = 0;

    for (const lead of leads) {
        const groups = getAllGroupsByLeadUid(lead.leadUid).filter(g => detectPlatform(g) === 'kakao');

        for (const groupKey of groups) {
            if (isSent(groupKey, 'checkout_instructions_am')) {
                console.log(`⏭️ checkout_instructions_am already sent: ${groupKey}`);
                continue;
            }
            if (isKakaoQueued(groupKey, 'checkout_instructions_am')) {
                console.log(`⏭️ checkout_instructions_am already queued: ${groupKey}`);
                continue;
            }

            const chatId = groupKey.replace('kakao:', '');
            enqueueKakaoMessage(chatId, message, { groupKey, sentType: 'checkout_instructions_am' });
            console.log(`✅ AM checkout instructions queued [kakao/KR] → ${lead.guestName}`);
            sent++;
        }
    }

    await sendAlert(
        `🌅 <b>AM Checkout Instructions Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    );
}

async function sendFarewellMessages(): Promise<void> {
    if (!CONFIG.ENABLE_CHECKOUT_REMINDER) { console.log('⏸️ Farewell skipped — ENABLE_CHECKOUT_REMINDER=false'); return; }
    const dateStr = getTodayKST();
    const leads = getBookingsCheckingOut(dateStr);
    if (leads.length === 0) return;

    console.log(`👋 Farewell run for: ${dateStr} (${leads.length} lead(s))`);
    let sent = 0;

    for (const lead of leads) {
        const uid: string = lead.leadUid;
        const groups = getAllGroupsByLeadUid(uid);

        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform) continue;
            if (isSent(groupKey, 'farewell')) {
                console.log(`⏭️ farewell already sent: ${groupKey}`);
                continue;
            }

            if (platform === 'kakao') {
                const chatId = groupKey.replace('kakao:', '');
                if (isKakaoQueued(groupKey, 'farewell')) { console.log(`⏭️ farewell already queued: ${groupKey}`); continue; }
                const msg = await getScheduledMessage('farewell_reminder', 'KR');
                if (!msg) continue;
                enqueueKakaoMessage(chatId, msg, { groupKey, sentType: 'farewell' });
                sent++;
                continue;
            }

            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const msg = await getScheduledMessage('farewell_reminder', lang);
            if (!msg) continue;

            try {
                if (platform === 'wa') await evoSendText(groupKey, msg);
                else if (platform === 'line') await pushMessage(groupKey.replace('line:', ''), msg);
                else if (platform === 'wechat') await wechatSendText(groupKey.replace('wechat:', ''), msg);
                markSent(groupKey, 'farewell');
                console.log(`✅ Farewell sent [${platform}/${lang}] → ${lead.guestName}`);
                sent++;
                if (platform === 'wa') await randSleep(20000, 45000);
            } catch (e: any) {
                console.error(`❌ Farewell send [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }

    await sendAlert(
        `👋 <b>Farewell Messages Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    );
}

async function sendFinalBill(): Promise<void> {
    if (!CONFIG.ENABLE_CHECKOUT_REMINDER) { console.log('⏸️ Final bill skipped — ENABLE_CHECKOUT_REMINDER=false'); return; }
    const dateStr = getTodayKST();
    const leads = getBookingsCheckingOut(dateStr);
    if (leads.length === 0) return;

    console.log(`💳 Final bill run for: ${dateStr} (${leads.length} lead(s))`);
    let sent = 0;

    for (const lead of leads) {
        const uid: string = lead.leadUid;

        const hasExpenses = await hasAnyExpenses(uid);
        if (!hasExpenses) {
            console.log(`⏭️ No expenses for ${lead.guestName} — final bill skipped`);
            continue;
        }

        const groups = getAllGroupsByLeadUid(uid);

        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform) continue;

            if (isSent(groupKey, 'final_bill')) {
                console.log(`⏭️ final_bill already sent: ${groupKey}`);
                continue;
            }

            if (platform === 'kakao') {
                const chatId = groupKey.replace('kakao:', '');
                if (isKakaoQueued(groupKey, 'final_bill')) { console.log(`⏭️ final_bill already queued: ${groupKey}`); continue; }
                const parts: string[] = [];
                const billMsg = await getScheduledMessage('final_bill', 'KR');
                if (billMsg) parts.push(billMsg);
                if (CONFIG.ENABLE_EXPENSE_AUTO_SEND) await sendExpenseSummary(uid, async (msg) => { parts.push(msg); }, groupKey);
                if (parts.length === 0) continue;
                parts.forEach((p, i) => enqueueKakaoMessage(
                    chatId, p, i === parts.length - 1 ? { groupKey, sentType: 'final_bill' } : undefined
                ));
                console.log(`💳 Final bill queued [kakao] → ${lead.guestName} (${parts.length} msgs)`);
                sent++;
                continue;
            }

            const lang = resolveGroupLang(groupKey, platform, lead.nationality);

            let sendFn: (msg: string) => Promise<void>;
            if (platform === 'wa') sendFn = (msg) => evoSendText(groupKey, msg);
            else if (platform === 'line') sendFn = (msg) => pushMessage(groupKey.replace('line:', ''), msg);
            else if (platform === 'wechat') sendFn = (msg) => wechatSendText(groupKey.replace('wechat:', ''), msg);
            else continue;

            try {
                const billMsg = await getScheduledMessage('final_bill', lang);
                if (billMsg) await sendFn(billMsg);
                if (CONFIG.ENABLE_EXPENSE_AUTO_SEND) await sendExpenseSummary(uid, sendFn, groupKey);
                markSent(groupKey, 'final_bill');
                console.log(`💳 Final bill sent [${platform}/${lang}] → ${lead.guestName}`);
                sent++;
                if (platform === 'wa') await randSleep(20000, 45000);
            } catch (e: any) {
                console.error(`❌ Final bill send [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }

    if (sent > 0) {
        await sendAlert(
            `💳 <b>Final Bill Sent</b>\n─────────────────\n` +
            `✅ <b>Sent:</b> ${sent}\n` +
            `📅 <b>Date:</b> ${dateStr}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { telegramOnly: true }
        );
    }
}

function kstHour(): number {
    return new Date(Date.now() + 9 * 3600000).getUTCHours();
}

async function preCheckWithLLM(sentKey: MessageType, messageKey: string, leads: ReturnType<typeof getBookingsCheckingOut>, platformFilter?: 'kakao'): Promise<void> {
    for (const lead of leads) {
        const groups = getAllGroupsByLeadUid(lead.leadUid);
        for (const groupKey of groups) {
            if (isSent(groupKey, sentKey)) continue;
            const platform = detectPlatform(groupKey);
            if (!platform) continue;
            if (platformFilter && platform !== platformFilter) continue;
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const template = await getScheduledMessage(messageKey, lang).catch(() => '');
            if (!template) continue;
            const detected = await wasAlreadySent(groupKey, template).catch(() => false);
            if (detected) {
                markSent(groupKey, sentKey);
                console.log(`🤖 LLM pre-check: ${sentKey} already sent → ${groupKey}`);
            }
        }
    }
}

async function alertMissedMessages(
    sentKey: import('./sentMessages').MessageType,
    label: string,
    dateStr: string,
    skipCheck?: (leadUid: string) => Promise<boolean>,
    platformFilter?: 'kakao'
): Promise<void> {
    const leads = getBookingsCheckingOut(dateStr);
    for (const lead of leads) {
        if (skipCheck && !await skipCheck(lead.leadUid)) {
            console.log(`⏭️ alertMissed(${label}): no expenses for ${lead.guestName} — skipped`);
            await sendAlert(
                `⏭️ <b>${label} Skipped</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${lead.guestName}\n` +
                `📋 <b>Reason:</b> No expenses logged\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                { telegramOnly: true }
            ).catch(() => {});
            continue;
        }
        const groups = getAllGroupsByLeadUid(lead.leadUid);
        for (const groupKey of groups) {
            if (isSent(groupKey, sentKey)) continue;
            const platform = detectPlatform(groupKey);
            if (platformFilter && platform !== platformFilter) continue;
            // Declared missed → drop any pending kakao queue item so a late-recovering bot doesn't
            // auto-deliver it after the team has already sent it manually.
            if (platform === 'kakao') {
                const dropped = dropKakaoQueued(groupKey, sentKey);
                if (dropped) console.log(`🗑️ Dropped ${dropped} pending kakao ${sentKey} for ${groupKey} (missed)`);
            }
            const platformName = platform === 'wa' ? 'WhatsApp'
                : platform === 'line' ? 'LINE'
                : platform === 'wechat' ? 'WeChat'
                : platform === 'kakao' ? 'KakaoTalk'
                : 'Unknown';
            const chatName = platform === 'kakao'
                ? (getKakaoChatName(groupKey.replace('kakao:', '')) ?? groupKey)
                : groupKey;
            await sendAlert(
                `⚠️ <b>Missed: ${label}</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${lead.guestName}\n` +
                `📱 <b>Platform:</b> ${platformName}\n` +
                `💬 <b>Group:</b> ${chatName}\n` +
                `─────────────────\n` +
                `<i>Server was down at scheduled time. Please send manually.</i>`,
                { propertyCode: propertyCodeFromName(lead.property) || undefined }
            ).catch(() => {});
        }
    }
}

export function catchUpCheckout(): void {
    const h = kstHour();
    const today = getTodayKST();
    const tomorrow = getTomorrowKST();

    if (h === 7) {
        const leads = getBookingsCheckingOut(today);
        preCheckWithLLM('final_bill', 'final_bill', leads)
            .then(() => sendFinalBill())
            .catch(e => console.error('❌ catchUp finalBill:', e?.message));
    } else if (h > 7) {
        alertMissedMessages('final_bill', 'Final Bill', today, hasAnyExpenses).catch(e => console.error('❌ alertMissed finalBill:', e?.message));
    }

    if (h === 9) {
        const leads = getBookingsCheckingOut(today);
        preCheckWithLLM('checkout_instructions_am', 'checkout_reminder', leads, 'kakao')
            .then(() => sendCheckoutInstructionsAM())
            .catch(e => console.error('❌ catchUp checkoutInstructionsAM:', e?.message));
    } else if (h > 9) {
        alertMissedMessages('checkout_instructions_am', 'AM Checkout Instructions', today, undefined, 'kakao').catch(e => console.error('❌ alertMissed checkoutInstructionsAM:', e?.message));
    }

    if (h === 15) {
        const leads = getBookingsCheckingOut(today);
        preCheckWithLLM('farewell', 'farewell_reminder', leads)
            .then(() => sendFarewellMessages())
            .catch(e => console.error('❌ catchUp farewell:', e?.message));
    } else if (h > 15) {
        alertMissedMessages('farewell', 'Farewell Message', today).catch(e => console.error('❌ alertMissed farewell:', e?.message));
    }

    if (h === 21) {
        const leads = getBookingsCheckingOut(tomorrow);
        preCheckWithLLM('checkout_reminder', 'checkout_reminder', leads)
            .then(() => sendCheckoutReminders())
            .catch(e => console.error('❌ catchUp checkoutReminder:', e?.message));
    } else if (h > 21) {
        alertMissedMessages('checkout_reminder', 'Checkout Reminder', tomorrow).catch(e => console.error('❌ alertMissed checkoutReminder:', e?.message));
    }
}

export function initCheckoutReminder(): void {
    cron.schedule('0 21 * * *', () => {
        sendCheckoutReminders().catch(e => console.error('❌ checkoutReminder crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    cron.schedule('0 7 * * *', () => {
        sendFinalBill().catch(e => console.error('❌ finalBill crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    cron.schedule('0 9 * * *', () => {
        sendCheckoutInstructionsAM().catch(e => console.error('❌ checkoutInstructionsAM crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    cron.schedule('0 15 * * *', () => {
        sendFarewellMessages().catch(e => console.error('❌ farewellReminder crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Checkout reminders scheduled: 21:00 | Final bill: 07:00 | AM instructions (Kakao): 09:00 | Farewell: 15:00 KST daily');
}
