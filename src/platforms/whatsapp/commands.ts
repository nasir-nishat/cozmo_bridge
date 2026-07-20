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

export async function handleLinkCommand(
    from: string,
    uid: string,
    welcomeOpts?: { senderJid: string; pushName: string }
): Promise<void> {
    if (!uid) {
        await evoSendText(from, '❌ Usage: /link <lead_uid>').catch(() => { });
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
        await evoSendText(from, `✅ Linked with UID\n👤 ${guest_name}\n🏠 ${propertyName}\n🔑 ${uid}\n📅 ${check_in}`).catch((e: any) => {
            console.error('❌ /link reply send failed:', JSON.stringify(e?.response?.data || e?.message));
            console.error('❌ /link reply number was:', from);
        });
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
        await evoSendText(
            from,
            is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error linking group'
        ).catch(() => { });
    }
}

export async function handleWelcomeCommand(
    from: string,
    senderJid: string,
    pushName: string
): Promise<void> {
    console.log(`🔍 /welcome check: pushName="${pushName}" senderJid="${senderJid}"`);
    if (!isStaffLid(senderJid)) {
        await evoSendText(from, '❌ Only team members can send /welcome').catch(() => { });
        return;
    }
    const lead_uid = getLeadUid(from);
    if (!lead_uid) {
        await evoSendText(from, '❌ Group not linked. Use /link <lead_uid> first').catch(() => { });
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

        await evoSendText(from, '⏳ Sending welcome messages...').catch(() => { });

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
            await evoSendText(from, `⚠️ Some messages failed: ${failures.join(', ')}`).catch(() => { });
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
        await evoSendText(from, '❌ Failed to send welcome messages').catch(() => { });
    }
}

export async function handleCkoutCommand(from: string, senderJid: string, text = '/ckout'): Promise<void> {
    if (!isStaffLid(senderJid)) {
        await evoSendText(from, '❌ Only team members can send /ckout').catch(() => {});
        return;
    }
    const lead_uid = getLeadUid(from);
    if (!lead_uid) {
        await evoSendText(from, '❌ Group not linked. Use /link <lead_uid> first').catch(() => {});
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
            await evoSendText(from, '❌ Checkout message not found in Sheets').catch(() => {});
            return;
        }
        await evoSendText(from, message);
        console.log(`✅ /ckout sent → ${from}`);
    } catch (e: any) {
        console.error('❌ /ckout error:', e?.message);
        await evoSendText(from, '❌ Failed to send checkout message').catch(() => {});
    }
}

export async function handleCkinCommand(from: string, senderJid: string): Promise<void> {
    if (!isStaffLid(senderJid)) {
        await evoSendText(from, '❌ Only team members can send /ckin').catch(() => {});
        return;
    }
    const lead_uid = getLeadUid(from);
    if (!lead_uid) {
        await evoSendText(from, '❌ Group not linked. Use /link <lead_uid> first').catch(() => {});
        return;
    }
    try {
        const lead = await fetchLead(lead_uid);
        const stored = getGroupLang(from);
        const lang = stored || 'EN';
        const propertyName = lead?.propertyName || lead?.unit?.name || '';
        const tipKeys = skipsBreakfast(propertyName) ? ['food_tips', 'van_tips'] : ['breakfast_tips', 'food_tips', 'van_tips'];
        await evoSendText(from, '⏳ Sending check-in messages...').catch(() => {});
        for (const key of tipKeys) {
            const msg = await getTipsMessage(key, lang);
            if (msg) { await evoSendText(from, msg); await sleep(3000); }
        }
        const rules = await getTipsMessage('guest_rules', lang);
        if (rules) { await sleep(3000); await evoSendText(from, rules); }
        console.log(`✅ /ckin sent → ${from}`);
    } catch (e: any) {
        console.error('❌ /ckin error:', e?.message);
        await evoSendText(from, '❌ Failed to send check-in messages').catch(() => {});
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
        await evoSendText(replyTo, '❌ Usage: /group <lead_uid>').catch(() => { });
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
        await evoSendText(replyTo, `⚠️ Group already exists for this booking\n${groupRef}`).catch(() => { });
        return;
    }

    // Already in progress — add to notify list and bail
    if (groupCreationInProgress.has(uid)) {
        const { startedBy } = groupCreationInProgress.get(uid)!;
        groupCreationInProgress.get(uid)!.replyJids.push(replyTo);
        await evoSendText(replyTo,
            `⏳ Already being set up by ${startedBy}.\n\n` +
            `You'll be notified when the group is ready.`
        ).catch(() => { });
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

        await evoSendText(replyTo,
            `⏳ Creating group for ${guest_name}...\n\n` +
            `Everything is handled. Welcome messages will arrive in the group within 30–40 minutes (slow-paced on purpose).\n\n` +
            `No action needed.`
        ).catch(() => { });

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
                await evoSendText(jid,
                    `✅ Group ready!\n` +
                    `👤 ${guest_name}\n` +
                    `🏠 ${propertyName}\n` +
                    `🆔 ${groupId}\n\n` +
                    `Welcome messages will arrive in the group shortly.\n\n` +
                    `Please send a message in the group today to keep it active.`
                ).catch(() => { });
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
                await evoSendText(jid, msg).catch(() => { });
            }
        }
    } catch (e: any) {
        groupCreationInProgress.delete(uid);
        const is404 = e?.response?.status === 404 || (e as any).status === 404;
        console.error('❌ /group command error:', e?.message);
        await evoSendText(
            replyTo,
            is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error creating group'
        ).catch(() => { });
    }
}
