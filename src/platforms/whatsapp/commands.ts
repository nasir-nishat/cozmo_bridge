import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fetchLead, fetchProperty, resolvePropertyNameForLead } from '../../services/hostfully';
import { linkGroup, getLeadUid, getWaGroupIdByLeadUid, saveGroupLang, getGroupLang } from '../../services/groupLeads';
import { detectGuestLanguage } from '../../services/llm';
import { sendAlert } from '../../services/notify';
import { getMessages, getScheduledMessage, getTipsMessage } from '../../services/sheets';
import { sendExpenseSummary } from '../../services/expenses';
import { evoSendText, evoApi, INSTANCE, getGroupInviteLink } from './evoClient';
import { createBookingGroup, getLastCreateFailure } from './groupCreation';
import { dequeue } from '../../services/pendingMessages';
import { markSent } from '../../services/sentMessages';
import { buildBookingGroupName, propertyCodeFromName } from './groupNaming';
import { CONFIG, skipsBreakfast } from '../../config/constants';
import { guestName, formatSeoulDate } from '../../utils/format';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function isStaffLid(lid: string): boolean {
    try {
        const staffIds = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/staff-ids.json'), 'utf8'));
        const lidNum = lid.replace(/@.*$/, '');
        return lidNum in (staffIds.whatsapp || {});
    } catch {
        return false;
    }
}

// Every command reply goes through here instead of `.catch(() => {})`. If the WhatsApp
// send itself fails (e.g. the account is reachout-restricted, same as the group-create
// failures), the sender must not just go silent — fall back to Jandi/Telegram so someone
// sees it instead of the requester being left hanging with no response at all.
async function replyOrEscalate(jid: string, text: string, context: string): Promise<void> {
    try {
        await evoSendText(jid, text);
    } catch (e: any) {
        const detail = e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || 'unknown error');
        console.error(`❌ Reply send failed [${context}] → ${jid}: ${detail}`);
        await sendAlert(
            `📵 <b>WhatsApp Reply Failed to Deliver</b>\n─────────────────\n` +
            `📍 <b>Command:</b> ${context}\n` +
            `📱 <b>Intended for:</b> <code>${jid}</code>\n` +
            `❗ <b>Send error:</b> ${detail}\n` +
            `─────────────────\n<b>Message that didn't get through:</b>\n${text}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`
        ).catch((alertErr: any) => {
            console.error(`❌ Fallback alert also failed [${context}]:`, alertErr?.message);
        });
    }
}

export async function handleLinkCommand(
    from: string,
    uid: string,
    welcomeOpts?: { senderJid: string; pushName: string }
): Promise<void> {
    if (!uid) {
        await replyOrEscalate(from, '❌ Usage: /link <lead_uid>', '/link usage');
        return;
    }
    try {
        const lead = await fetchLead(uid);
        linkGroup(from, uid);
        const info = lead.guestInformation;
        const guest_name = guestName(info);
        const phone = info?.phoneNumber || info?.cellPhoneNumber || '';
        detectGuestLanguage(guest_name, phone).then(lang => {
            saveGroupLang(from, lang);
            console.log(`🌐 Group lang detected [/link]: ${lang} → ${from}`);
        }).catch(() => {});
        const check_in = formatSeoulDate(lead.checkInLocalDateTime);
        const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy || '';
        let propertyName = lead?.propertyName || lead?.unit?.name || '';
        if (!propertyName && propertyUid) {
            try {
                const prop = await fetchProperty(propertyUid);
                propertyName = prop?.name || 'N/A';
            } catch { }
        }
        await replyOrEscalate(from, `✅ Linked with UID\n👤 ${guest_name}\n🏠 ${propertyName}\n🔑 ${uid}\n📅 ${check_in}`, '/link success');
        await sendAlert(
            `🔗 <b>Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📅 <b>Check-in:</b> ${check_in}\n` +
            `🔑 <b>Lead UID:</b> <code>${uid}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { useTestJandi: uid === '70778c3a-d60b-4473-a597-a5d6292628f5', propertyCode: propertyCodeFromName(propertyName) || undefined }
        );
        if (welcomeOpts) {
            await handleWelcomeCommand(from, welcomeOpts.senderJid, welcomeOpts.pushName);
        }
    } catch (e: any) {
        const is404 = e?.response?.status === 404 || (e as any).status === 404;
        console.error('❌ /link command error:', e?.message);
        await replyOrEscalate(
            from,
            is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error linking group',
            '/link error'
        );
    }
}

export async function handleWelcomeCommand(
    from: string,
    senderJid: string,
    pushName: string
): Promise<void> {
    console.log(`🔍 /welcome check: pushName="${pushName}" senderJid="${senderJid}"`);
    if (!isStaffLid(senderJid)) {
        await replyOrEscalate(from, '❌ Only team members can send /welcome', '/welcome staff-check');
        return;
    }
    const lead_uid = getLeadUid(from);
    if (!lead_uid) {
        await replyOrEscalate(from, '❌ Group not linked. Use /link <lead_uid> first', '/welcome not-linked');
        return;
    }
    try {
        const lead = await fetchLead(lead_uid);
        const info = lead?.guestInformation;
        const guest_name = guestName(info);
        const property = await resolvePropertyNameForLead(lead);
        const check_in = formatSeoulDate(lead.checkInLocalDateTime);
        const check_out = formatSeoulDate(lead.checkOutLocalDateTime);
        const storedLang = getGroupLang(from);
        const langCode: string = storedLang || 'EN';

        console.log(`📨 /welcome triggered by ${senderJid} for lead ${lead_uid}`);

        await replyOrEscalate(from, '⏳ Sending welcome messages...', '/welcome progress');

        const msgs = await getMessages(langCode);
        console.log(`📋 /welcome messages loaded (${langCode}): ${Object.keys(msgs).join(', ') || 'none'}`);

        const failures: string[] = [];

        // brand_msg
        if (msgs['brand_msg']) {
            try {
                await evoSendText(from, msgs['brand_msg'].replace(/\\n/g, '\n'));
                console.log(`✅ /welcome brand_msg sent`);
                await sleep(5000);
            } catch (e: any) {
                console.warn('⚠️ /welcome brand_msg failed:', e?.message);
                failures.push('brand message');
            }
        }

        // intro_msg
        if (msgs['intro_msg']) {
            try {
                await evoSendText(from, msgs['intro_msg'].replace(/\\n/g, '\n'));
                console.log(`✅ /welcome intro_msg sent`);
                await sleep(5000);
            } catch (e: any) {
                console.warn('⚠️ /welcome intro_msg failed:', e?.message);
                failures.push('intro message');
            }
        }

        // business card
        try {
            const cardUrl = msgs['business_card_url'];
            let media: string | null = null;
            if (cardUrl) {
                const imgRes = await axios.get(cardUrl, { responseType: 'arraybuffer' });
                media = Buffer.from(imgRes.data).toString('base64');
            } else if (fs.existsSync(CONFIG.BUSINESS_CARD_PATH)) {
                media = fs.readFileSync(CONFIG.BUSINESS_CARD_PATH).toString('base64');
            }
            if (media) {
                await evoApi.post(`/message/sendMedia/${INSTANCE}`, {
                    number: from,
                    mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg',
                });
                console.log(`✅ /welcome business card sent`);
            }
        } catch (e: any) {
            console.warn('⚠️ /welcome business card failed:', e?.message);
            failures.push('business card');
        }

        if (failures.length > 0) {
            await replyOrEscalate(from, `⚠️ Some messages failed: ${failures.join(', ')}`, '/welcome partial-failure');
            await sendAlert(
                `⚠️ <b>Welcome Partial Failure (WA)</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${property}\n` +
                `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
                `📱 <b>Triggered by:</b> ${pushName}\n` +
                `⚠️ <b>Failed:</b> ${failures.join(', ')}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`
            );
        } else {
            dequeue(from);
            markSent(from, 'welcome');
            await sendAlert(
                `👋 <b>Welcome Sent (WA)</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${property}\n` +
                `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
                `📱 <b>Triggered by:</b> ${pushName}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                { propertyCode: propertyCodeFromName(property) || undefined }
            );
        }
    } catch (e: any) {
        console.error('❌ /welcome error:', e?.message);
        await replyOrEscalate(from, '❌ Failed to send welcome messages', '/welcome error');
    }
}

export async function handleCkoutCommand(from: string, senderJid: string, text = '/ckout'): Promise<void> {
    if (!isStaffLid(senderJid)) {
        await replyOrEscalate(from, '❌ Only team members can send /ckout', '/ckout staff-check');
        return;
    }
    const lead_uid = getLeadUid(from);
    if (!lead_uid) {
        await replyOrEscalate(from, '❌ Group not linked. Use /link <lead_uid> first', '/ckout not-linked');
        return;
    }
    try {
        if (text.trim() === '/ckout exp') {
            const had = await sendExpenseSummary(lead_uid, async (msg) => evoSendText(from, msg), from);
            if (!had) return;
            const payMsg = await getScheduledMessage('payment_reminder', 'EN');
            if (payMsg) await evoSendText(from, payMsg);
            console.log(`✅ /ckout exp sent → ${from}`);
            return;
        }
        const message = await getScheduledMessage('checkout_reminder', 'EN');
        if (!message) {
            await replyOrEscalate(from, '❌ Checkout message not found in Sheets', '/ckout missing-message');
            return;
        }
        await evoSendText(from, message);
        console.log(`✅ /ckout sent → ${from}`);
    } catch (e: any) {
        console.error('❌ /ckout error:', e?.message);
        await replyOrEscalate(from, '❌ Failed to send checkout message', '/ckout error');
    }
}

export async function handleCkinCommand(from: string, senderJid: string): Promise<void> {
    if (!isStaffLid(senderJid)) {
        await replyOrEscalate(from, '❌ Only team members can send /ckin', '/ckin staff-check');
        return;
    }
    const lead_uid = getLeadUid(from);
    if (!lead_uid) {
        await replyOrEscalate(from, '❌ Group not linked. Use /link <lead_uid> first', '/ckin not-linked');
        return;
    }
    try {
        const lead = await fetchLead(lead_uid);
        const stored = getGroupLang(from);
        const lang = stored || 'EN';
        const propertyName = lead?.propertyName || lead?.unit?.name || '';
        const tipKeys = skipsBreakfast(propertyName) ? ['food_tips', 'van_tips'] : ['breakfast_tips', 'food_tips', 'van_tips'];
        await replyOrEscalate(from, '⏳ Sending check-in messages...', '/ckin progress');
        for (const key of tipKeys) {
            const msg = await getTipsMessage(key, lang);
            if (msg) { await evoSendText(from, msg); await sleep(3000); }
        }
        const rules = await getTipsMessage('guest_rules', lang);
        if (rules) { await sleep(3000); await evoSendText(from, rules); }
        console.log(`✅ /ckin sent → ${from}`);
    } catch (e: any) {
        console.error('❌ /ckin error:', e?.message);
        await replyOrEscalate(from, '❌ Failed to send check-in messages', '/ckin error');
    }
}

// Tracks in-progress /group creations: leadUid → { startedBy, replyJids }
const groupCreationInProgress = new Map<string, { startedBy: string; replyJids: string[] }>();

export async function handleGroupCommand(
    from: string,
    uid: string,
    senderJid: string,
    pushName: string,
): Promise<void> {
    // Always reply 1:1 to the sender, not in the group
    const replyTo = from.endsWith('@g.us') ? senderJid : from;

    if (!uid) {
        await replyOrEscalate(replyTo, '❌ Usage: /group <lead_uid>', '/group usage');
        return;
    }
    const isDM = !from.endsWith('@g.us');
    if (!isDM && !isStaffLid(senderJid)) {
        return; // silent — non-staff in group, don't expose command exists
    }

    // Already fully created and linked
    const existingGroupId = getWaGroupIdByLeadUid(uid);
    if (existingGroupId) {
        const inviteLink = await getGroupInviteLink(existingGroupId).catch(() => null);
        const groupRef = inviteLink ? `🔗 ${inviteLink}` : `🆔 ${existingGroupId}`;
        await replyOrEscalate(replyTo, `⚠️ Group already exists for this booking\n${groupRef}`, '/group already-exists');
        return;
    }

    // Already in progress — add to notify list and bail
    if (groupCreationInProgress.has(uid)) {
        const { startedBy } = groupCreationInProgress.get(uid)!;
        groupCreationInProgress.get(uid)!.replyJids.push(replyTo);
        await replyOrEscalate(replyTo,
            `⏳ Already being set up by ${startedBy}.\n\n` +
            `You'll be notified when the group is ready.`,
            '/group already-in-progress'
        );
        return;
    }

    try {
        const lead = await fetchLead(uid);
        const info = lead?.guestInformation;
        const guest_name = guestName(info);
        const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy || '';
        let propertyName = lead?.propertyName || lead?.unit?.name || '';
        let propertyObj: any = null;
        if (propertyUid) {
            try {
                propertyObj = await fetchProperty(propertyUid);
                if (!propertyName) propertyName = propertyObj?.name || '';
            } catch { }
        }

        // Register as in-progress
        const starterName = pushName || 'a team member';
        groupCreationInProgress.set(uid, { startedBy: starterName, replyJids: [replyTo] });

        await replyOrEscalate(replyTo,
            `⏳ Creating group for ${guest_name}...\n\n` +
            `Everything is handled. Welcome messages will arrive in the group within 30–40 minutes (slow-paced on purpose).\n\n` +
            `No action needed.`,
            '/group progress'
        );

        const phone = info?.phoneNumber || info?.cellPhoneNumber || '';
        const nationality = (info?.countryCode || 'US').toUpperCase();
        const groupId = await createBookingGroup({
            guest_name,
            phone,
            property: propertyName || 'COZE Property',
            check_in: lead.checkInLocalDateTime,
            check_out: lead.checkOutLocalDateTime,
            nationality,
            lead_uid: uid,
            property_uid: propertyUid,
            lead_status: lead.status,
            group_name: buildBookingGroupName(lead, propertyObj, guest_name),
            lead_type: lead.type || 'DIRECT',
            force: true,
        });

        // Notify everyone who asked
        const { replyJids } = groupCreationInProgress.get(uid) || { replyJids: [replyTo] };
        groupCreationInProgress.delete(uid);

        if (groupId) {
            for (const jid of replyJids) {
                await replyOrEscalate(jid,
                    `✅ Group ready!\n` +
                    `👤 ${guest_name}\n` +
                    `🏠 ${propertyName}\n` +
                    `🆔 ${groupId}\n\n` +
                    `Welcome messages will arrive in the group shortly.\n\n` +
                    `Please send a message in the group today to keep it active.`,
                    '/group success'
                );
            }
        } else {
            const failure = getLastCreateFailure(uid);
            const msg = failure
                ? `❌ Group creation failed\n\n` +
                  `📋 ${failure.reason}\n` +
                  (failure.restricted ? `⛔ Auto-create is now paused 24h to avoid making it worse.\n` : '') +
                  `\n🏷️ Create it manually with this exact name:\n${failure.groupName}`
                : '❌ Group creation failed — check logs';
            for (const jid of replyJids) {
                await replyOrEscalate(jid, msg, '/group failure');
            }
        }
    } catch (e: any) {
        groupCreationInProgress.delete(uid);
        const is404 = e?.response?.status === 404 || (e as any).status === 404;
        console.error('❌ /group command error:', e?.message);
        await replyOrEscalate(
            replyTo,
            is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error creating group',
            '/group error'
        );
    }
}
