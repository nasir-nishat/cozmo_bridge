import cron from 'node-cron';
import { getAllGroupsByLeadUid, getKakaoChatName } from './groupLeads';
import { getTipsMessage } from './sheets';
import { evoSendText } from '../platforms/whatsapp/evoClient';
import { pushMessage } from '../platforms/line/lineClient';
import { wechatSendText } from './wechat';
import { sendAlert } from './notify';
import { propertyCodeFromName } from '../platforms/whatsapp/groupNaming';
import { getBookingsCheckingIn } from './bookingStore';
import { CONFIG, skipsBreakfast } from '../config/constants';
import { markSent, isSent, MessageType } from './sentMessages';
import { wasAlreadySent } from './llm';
import { getGroupLang } from './groupLeads';
import { renderMessage } from '../utils/messageVariation';

type Lang = 'EN' | 'KR' | 'JA' | 'ZH';

function getTodayKST(): string {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstNow.toISOString().slice(0, 10);
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

function getStayNights(checkIn: string, checkOut: string): number {
    const inMs = new Date(`${checkIn}T00:00:00+09:00`).getTime();
    const outMs = new Date(`${checkOut}T00:00:00+09:00`).getTime();
    return Math.round((outMs - inMs) / (24 * 60 * 60 * 1000));
}

function detectPlatform(groupKey: string): 'wa' | 'line' | 'wechat' | 'kakao' | null {
    if (groupKey.endsWith('@g.us')) return 'wa';
    if (groupKey.startsWith('line:')) return 'line';
    if (groupKey.startsWith('wechat:')) return 'wechat';
    if (groupKey.startsWith('kakao:')) return 'kakao';
    return null;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const randSleep = (min: number, max: number) =>
    sleep(Math.floor(Math.random() * (max - min + 1)) + min);

import { enqueueKakaoMessage, isKakaoQueued, dropKakaoQueued } from '../routes/kakao';

async function sendToGroup(
    platform: 'wa' | 'line' | 'wechat' | 'kakao',
    groupKey: string,
    _chatName: string | null,
    message: string
): Promise<void> {
    if (platform === 'wa') await evoSendText(groupKey, message);
    else if (platform === 'line') await pushMessage(groupKey.replace('line:', ''), message);
    else if (platform === 'wechat') await wechatSendText(groupKey.replace('wechat:', ''), message);
    else if (platform === 'kakao') enqueueKakaoMessage(groupKey.replace('kakao:', ''), message);
}

async function sendCheckinTips(): Promise<void> {
    if (!CONFIG.ENABLE_CHECKIN_REMINDER) { console.log('⏸️ Check-in tips skipped — ENABLE_CHECKIN_REMINDER=false'); return; }
    const dateStr = getTodayKST();
    const leads = getBookingsCheckingIn(dateStr);
    console.log(`🏨 Check-in tips run for: ${dateStr} (${leads.length} lead(s))`);
    if (leads.length === 0) return;

    const TIP_KEYS = ['breakfast_tips', 'food_tips', 'van_tips'];
    let sent = 0;
    let skipped = 0;

    for (const lead of leads) {
        const groups = getAllGroupsByLeadUid(lead.leadUid);

        if (groups.length === 0) {
            console.log(`⏭️ No linked groups for ${lead.guestName} (${lead.leadUid})`);
            skipped++;
            continue;
        }

        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform) { console.warn(`⚠️ Unknown platform key: ${groupKey}`); continue; }

            const chatName = null;

            const lang = resolveGroupLang(groupKey, platform, lead.nationality);

            const nights = getStayNights(lead.checkIn, lead.checkOut);
            const tipKeys = (skipsBreakfast(lead.property) || nights < 4)
                ? TIP_KEYS.filter(k => k !== 'breakfast_tips')
                : TIP_KEYS;

            if (isSent(groupKey, 'checkin_tips')) {
                console.log(`⏭️ checkin_tips already sent: ${groupKey}`);
                continue;
            }
            if (platform === 'kakao') {
                if (!isKakaoQueued(groupKey, 'checkin_tips')) {
                    const chatId = groupKey.replace('kakao:', '');
                    const parts: string[] = [];
                    for (const key of tipKeys) {
                        const msg = await getTipsMessage(key, lang);
                        if (msg) parts.push(msg);
                    }
                    if (parts.length > 0) {
                        parts.forEach((p, i) => enqueueKakaoMessage(
                            chatId, p, i === parts.length - 1 ? { groupKey, sentType: 'checkin_tips' } : undefined
                        ));
                        console.log(`✅ Check-in tips queued [kakao/${lang}] → ${lead.guestName} (${parts.length} msgs)`);
                        sent++;
                    }
                } else {
                    console.log(`⏭️ checkin_tips already queued: ${groupKey}`);
                }
                continue;
            }
            let groupSent = 0;
            for (const key of tipKeys) {
                const msg = await getTipsMessage(key, lang);
                if (!msg) { console.warn(`⚠️ No tips message for: ${key}/${lang}`); continue; }
                try {
                    // WA: prepend a name greeting to the FIRST tip only (body stays the Sheet text verbatim),
                    // so the 3-message tip batch isn't 3 greetings but the group's messages are still unique.
                    const waMsg = renderMessage(msg, { name: lead.guestName }, { withOpener: groupSent === 0 });
                    await sendToGroup(platform, groupKey, chatName, platform === 'wa' ? waMsg : msg);
                    groupSent++;
                    if (groupSent < tipKeys.length) await sleep(3000);
                } catch (e: any) {
                    console.error(`❌ Tips send [${platform}/${key}] → ${groupKey}:`, e?.message);
                }
            }
            if (groupSent > 0) {
                markSent(groupKey, 'checkin_tips');
                console.log(`✅ Check-in tips sent [${platform}/${lang}] → ${lead.guestName} (${groupSent}/${tipKeys.length} msgs)`);
                sent++;
                if (platform === 'wa') await randSleep(20000, 45000);
            }
        }
    }

    await sendAlert(
        `🏨 <b>Check-in Tips Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `⏭️ <b>No group:</b> ${skipped}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    );
}

async function sendCheckinRules(): Promise<void> {
    if (!CONFIG.ENABLE_CHECKIN_REMINDER) { console.log('⏸️ Check-in rules skipped — ENABLE_CHECKIN_REMINDER=false'); return; }
    const dateStr = getTodayKST();
    const leads = getBookingsCheckingIn(dateStr);
    console.log(`📋 Check-in rules run for: ${dateStr} (${leads.length} lead(s))`);
    if (leads.length === 0) return;

    let sent = 0;

    for (const lead of leads) {
        const groups = getAllGroupsByLeadUid(lead.leadUid);

        for (const groupKey of groups) {
            const platform = detectPlatform(groupKey);
            if (!platform) continue;
            if (isSent(groupKey, 'checkin_rules')) {
                console.log(`⏭️ checkin_rules already sent: ${groupKey}`);
                continue;
            }

            const lang = resolveGroupLang(groupKey, platform, lead.nationality);

            if (platform === 'kakao') {
                if (!isKakaoQueued(groupKey, 'checkin_rules')) {
                    const kakaoMsg = await getTipsMessage('guest_rules', lang);
                    if (kakaoMsg) {
                        enqueueKakaoMessage(groupKey.replace('kakao:', ''), kakaoMsg, { groupKey, sentType: 'checkin_rules' });
                        console.log(`✅ Guest rules queued [kakao/${lang}] → ${lead.guestName}`);
                        sent++;
                    }
                } else {
                    console.log(`⏭️ checkin_rules already queued: ${groupKey}`);
                }
                continue;
            }

            const msg = await getTipsMessage('guest_rules', lang);
            if (!msg) { console.warn(`⚠️ No guest_rules for lang: ${lang}`); continue; }

            try {
                await sendToGroup(platform, groupKey, null, platform === 'wa' ? renderMessage(msg, { name: lead.guestName }, { withOpener: true }) : msg);
                markSent(groupKey, 'checkin_rules');
                console.log(`✅ Guest rules sent [${platform}/${lang}] → ${lead.guestName}`);
                sent++;
                if (platform === 'wa') await randSleep(20000, 45000);
            } catch (e: any) {
                console.error(`❌ Rules send [${platform}] → ${groupKey}:`, e?.message);
            }
        }
    }

    await sendAlert(
        `📋 <b>Guest Rules Sent</b>\n─────────────────\n` +
        `✅ <b>Sent:</b> ${sent}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    );
}

function kstHour(): number {
    return new Date(Date.now() + 9 * 3600000).getUTCHours();
}

async function preCheckWithLLM(sentKey: MessageType, messageKey: string, leads: ReturnType<typeof getBookingsCheckingIn>): Promise<void> {
    for (const lead of leads) {
        const groups = getAllGroupsByLeadUid(lead.leadUid);
        for (const groupKey of groups) {
            if (isSent(groupKey, sentKey)) continue;
            const platform = detectPlatform(groupKey);
            if (!platform) continue;
            const lang = resolveGroupLang(groupKey, platform, lead.nationality);
            const template = await getTipsMessage(messageKey, lang).catch(() => '');
            if (!template) continue;
            const detected = await wasAlreadySent(groupKey, template).catch(() => false);
            if (detected) {
                markSent(groupKey, sentKey);
                console.log(`🤖 LLM pre-check: ${sentKey} already sent → ${groupKey}`);
            }
        }
    }
}

async function alertMissedCheckin(sentKey: import('./sentMessages').MessageType, label: string): Promise<void> {
    const dateStr = getTodayKST();
    const leads = getBookingsCheckingIn(dateStr);
    for (const lead of leads) {
        const groups = getAllGroupsByLeadUid(lead.leadUid);
        for (const groupKey of groups) {
            if (isSent(groupKey, sentKey)) continue;
            const platform = detectPlatform(groupKey);
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

export function catchUpCheckin(): void {
    const h = kstHour();

    if (h === 15) {
        const leads = getBookingsCheckingIn(getTodayKST());
        preCheckWithLLM('checkin_tips', 'breakfast_tips', leads)
            .then(() => sendCheckinTips())
            .catch(e => console.error('❌ catchUp checkinTips:', e?.message));
    } else if (h > 15) {
        alertMissedCheckin('checkin_tips', 'Check-in Tips').catch(e => console.error('❌ alertMissed checkinTips:', e?.message));
    }

    if (h === 19) {
        const leads = getBookingsCheckingIn(getTodayKST());
        preCheckWithLLM('checkin_rules', 'guest_rules', leads)
            .then(() => sendCheckinRules())
            .catch(e => console.error('❌ catchUp checkinRules:', e?.message));
    } else if (h > 19) {
        alertMissedCheckin('checkin_rules', 'Check-in Rules').catch(e => console.error('❌ alertMissed checkinRules:', e?.message));
    }
}

export function initCheckinReminder(): void {
    cron.schedule('0 15 * * *', () => {
        sendCheckinTips().catch(e => console.error('❌ checkinTips crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    cron.schedule('0 19 * * *', () => {
        sendCheckinRules().catch(e => console.error('❌ checkinRules crash:', e?.message));
    }, { timezone: 'Asia/Seoul' });
    console.log('⏰ Check-in reminders scheduled: Tips 15:00 KST | Rules 19:00 KST daily');
}
