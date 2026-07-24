"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStaffLid = isStaffLid;
exports.handleLinkCommand = handleLinkCommand;
exports.handleWelcomeCommand = handleWelcomeCommand;
exports.handleCkoutCommand = handleCkoutCommand;
exports.handleCkinCommand = handleCkinCommand;
exports.handleGroupCommand = handleGroupCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const hostfully_1 = require("../../services/hostfully");
const groupLeads_1 = require("../../services/groupLeads");
const llm_1 = require("../../services/llm");
const notify_1 = require("../../services/notify");
const sheets_1 = require("../../services/sheets");
const expenses_1 = require("../../services/expenses");
const evoClient_1 = require("./evoClient");
const groupCreation_1 = require("./groupCreation");
const pendingMessages_1 = require("../../services/pendingMessages");
const sentMessages_1 = require("../../services/sentMessages");
const groupNaming_1 = require("./groupNaming");
const constants_1 = require("../../config/constants");
const format_1 = require("../../utils/format");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const INSTANCE_OWNER_PHONE = (process.env.INSTANCE_OWNER_PHONE || '821097802701').replace(/\D/g, '');
function isStaffLid(lid) {
    try {
        const staffIds = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../../data/staff-ids.json'), 'utf8'));
        const lidNum = lid.replace(/@.*$/, '');
        return lidNum in (staffIds.whatsapp || {});
    }
    catch {
        return false;
    }
}
function isInstanceOwnerSender(jid) {
    const senderPhone = jid.replace(/@.*$/, '').replace(/\D/g, '');
    return Boolean(INSTANCE_OWNER_PHONE && senderPhone === INSTANCE_OWNER_PHONE);
}
function isStaffSender(jid) {
    return isStaffLid(jid) || isInstanceOwnerSender(jid);
}
// Every command reply goes through here instead of `.catch(() => {})`. If the WhatsApp
// send itself fails (e.g. the account is reachout-restricted, same as the group-create
// failures), the sender must not just go silent — fall back to Jandi/Telegram so someone
// sees it instead of the requester being left hanging with no response at all.
async function replyOrEscalate(jid, text, context) {
    try {
        await (0, evoClient_1.evoSendText)(jid, text);
    }
    catch (e) {
        const detail = e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || 'unknown error');
        console.error(`❌ Reply send failed [${context}] → ${jid}: ${detail}`);
        await (0, notify_1.sendAlert)(`📵 <b>WhatsApp Reply Failed to Deliver</b>\n─────────────────\n` +
            `📍 <b>Command:</b> ${context}\n` +
            `📱 <b>Intended for:</b> <code>${jid}</code>\n` +
            `❗ <b>Send error:</b> ${detail}\n` +
            `─────────────────\n<b>Message that didn't get through:</b>\n${text}\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`).catch((alertErr) => {
            console.error(`❌ Fallback alert also failed [${context}]:`, alertErr?.message);
        });
    }
}
async function handleLinkCommand(from, uid, welcomeOpts) {
    if (!uid) {
        await replyOrEscalate(from, '❌ Usage: /link <lead_uid>', '/link usage');
        return;
    }
    try {
        const lead = await (0, hostfully_1.fetchLead)(uid);
        (0, groupLeads_1.linkGroup)(from, uid);
        const info = lead.guestInformation;
        const guest_name = (0, format_1.guestName)(info);
        const phone = info?.phoneNumber || info?.cellPhoneNumber || '';
        (0, llm_1.detectGuestLanguage)(guest_name, phone).then(lang => {
            (0, groupLeads_1.saveGroupLang)(from, lang);
            console.log(`🌐 Group lang detected [/link]: ${lang} → ${from}`);
        }).catch(() => { });
        const check_in = (0, format_1.formatSeoulDate)(lead.checkInLocalDateTime);
        const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy || '';
        let propertyName = lead?.propertyName || lead?.unit?.name || '';
        if (!propertyName && propertyUid) {
            try {
                const prop = await (0, hostfully_1.fetchProperty)(propertyUid);
                propertyName = prop?.name || 'N/A';
            }
            catch { }
        }
        await replyOrEscalate(from, `✅ Linked with UID\n👤 ${guest_name}\n🏠 ${propertyName}\n🔑 ${uid}\n📅 ${check_in}`, '/link success');
        await (0, notify_1.sendAlert)(`🔗 <b>Group Linked</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${propertyName}\n` +
            `📅 <b>Check-in:</b> ${check_in}\n` +
            `🔑 <b>Lead UID:</b> <code>${uid}</code>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { useTestJandi: uid === '70778c3a-d60b-4473-a597-a5d6292628f5', propertyCode: (0, groupNaming_1.propertyCodeFromName)(propertyName) || undefined });
        if (welcomeOpts) {
            await handleWelcomeCommand(from, welcomeOpts.senderJid, welcomeOpts.pushName);
        }
    }
    catch (e) {
        const is404 = e?.response?.status === 404 || e.status === 404;
        console.error('❌ /link command error:', e?.message);
        await replyOrEscalate(from, is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error linking group', '/link error');
    }
}
async function handleWelcomeCommand(from, senderJid, pushName) {
    console.log(`🔍 /welcome check: pushName="${pushName}" senderJid="${senderJid}"`);
    if (!isStaffSender(senderJid)) {
        await replyOrEscalate(from, '❌ Only team members can send /welcome', '/welcome staff-check');
        return;
    }
    const lead_uid = (0, groupLeads_1.getLeadUid)(from);
    if (!lead_uid) {
        await replyOrEscalate(from, '❌ Group not linked. Use /link <lead_uid> first', '/welcome not-linked');
        return;
    }
    try {
        const lead = await (0, hostfully_1.fetchLead)(lead_uid);
        const info = lead?.guestInformation;
        const guest_name = (0, format_1.guestName)(info);
        const property = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
        const check_in = (0, format_1.formatSeoulDate)(lead.checkInLocalDateTime);
        const check_out = (0, format_1.formatSeoulDate)(lead.checkOutLocalDateTime);
        const storedLang = (0, groupLeads_1.getGroupLang)(from);
        const langCode = storedLang || 'EN';
        console.log(`📨 /welcome triggered by ${senderJid} for lead ${lead_uid}`);
        await replyOrEscalate(from, '⏳ Sending welcome messages...', '/welcome progress');
        const msgs = await (0, sheets_1.getMessages)(langCode);
        console.log(`📋 /welcome messages loaded (${langCode}): ${Object.keys(msgs).join(', ') || 'none'}`);
        const failures = [];
        // brand_msg
        if (msgs['brand_msg']) {
            try {
                await (0, evoClient_1.evoSendText)(from, msgs['brand_msg'].replace(/\\n/g, '\n'));
                console.log(`✅ /welcome brand_msg sent`);
                await sleep(5000);
            }
            catch (e) {
                console.warn('⚠️ /welcome brand_msg failed:', e?.message);
                failures.push('brand message');
            }
        }
        // intro_msg
        if (msgs['intro_msg']) {
            try {
                await (0, evoClient_1.evoSendText)(from, msgs['intro_msg'].replace(/\\n/g, '\n'));
                console.log(`✅ /welcome intro_msg sent`);
                await sleep(5000);
            }
            catch (e) {
                console.warn('⚠️ /welcome intro_msg failed:', e?.message);
                failures.push('intro message');
            }
        }
        // business card
        try {
            const cardUrl = msgs['business_card_url'];
            let media = null;
            if (cardUrl) {
                const imgRes = await axios_1.default.get(cardUrl, { responseType: 'arraybuffer' });
                media = Buffer.from(imgRes.data).toString('base64');
            }
            else if (fs_1.default.existsSync(constants_1.CONFIG.BUSINESS_CARD_PATH)) {
                media = fs_1.default.readFileSync(constants_1.CONFIG.BUSINESS_CARD_PATH).toString('base64');
            }
            if (media) {
                await evoClient_1.evoApi.post(`/message/sendMedia/${evoClient_1.INSTANCE}`, {
                    number: from,
                    mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg',
                });
                console.log(`✅ /welcome business card sent`);
            }
        }
        catch (e) {
            console.warn('⚠️ /welcome business card failed:', e?.message);
            failures.push('business card');
        }
        if (failures.length > 0) {
            await replyOrEscalate(from, `⚠️ Some messages failed: ${failures.join(', ')}`, '/welcome partial-failure');
            await (0, notify_1.sendAlert)(`⚠️ <b>Welcome Partial Failure (WA)</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${property}\n` +
                `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
                `📱 <b>Triggered by:</b> ${pushName}\n` +
                `⚠️ <b>Failed:</b> ${failures.join(', ')}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`);
        }
        else {
            (0, pendingMessages_1.dequeue)(from);
            (0, sentMessages_1.markSent)(from, 'welcome');
            await (0, notify_1.sendAlert)(`👋 <b>Welcome Sent (WA)</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${property}\n` +
                `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
                `📱 <b>Triggered by:</b> ${pushName}\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined });
        }
    }
    catch (e) {
        console.error('❌ /welcome error:', e?.message);
        await replyOrEscalate(from, '❌ Failed to send welcome messages', '/welcome error');
    }
}
async function handleCkoutCommand(from, senderJid, text = '/ckout') {
    if (!isStaffSender(senderJid)) {
        await replyOrEscalate(from, '❌ Only team members can send /ckout', '/ckout staff-check');
        return;
    }
    const lead_uid = (0, groupLeads_1.getLeadUid)(from);
    if (!lead_uid) {
        await replyOrEscalate(from, '❌ Group not linked. Use /link <lead_uid> first', '/ckout not-linked');
        return;
    }
    try {
        if (text.trim() === '/ckout exp') {
            const had = await (0, expenses_1.sendExpenseSummary)(lead_uid, async (msg) => (0, evoClient_1.evoSendText)(from, msg), from);
            if (!had)
                return;
            const payMsg = await (0, sheets_1.getScheduledMessage)('payment_reminder', 'EN');
            if (payMsg)
                await (0, evoClient_1.evoSendText)(from, payMsg);
            console.log(`✅ /ckout exp sent → ${from}`);
            return;
        }
        const message = await (0, sheets_1.getScheduledMessage)('checkout_reminder', 'EN');
        if (!message) {
            await replyOrEscalate(from, '❌ Checkout message not found in Sheets', '/ckout missing-message');
            return;
        }
        await (0, evoClient_1.evoSendText)(from, message);
        console.log(`✅ /ckout sent → ${from}`);
    }
    catch (e) {
        console.error('❌ /ckout error:', e?.message);
        await replyOrEscalate(from, '❌ Failed to send checkout message', '/ckout error');
    }
}
async function handleCkinCommand(from, senderJid) {
    if (!isStaffSender(senderJid)) {
        await replyOrEscalate(from, '❌ Only team members can send /ckin', '/ckin staff-check');
        return;
    }
    const lead_uid = (0, groupLeads_1.getLeadUid)(from);
    if (!lead_uid) {
        await replyOrEscalate(from, '❌ Group not linked. Use /link <lead_uid> first', '/ckin not-linked');
        return;
    }
    try {
        const lead = await (0, hostfully_1.fetchLead)(lead_uid);
        const stored = (0, groupLeads_1.getGroupLang)(from);
        const lang = stored || 'EN';
        const propertyName = lead?.propertyName || lead?.unit?.name || '';
        const tipKeys = (0, constants_1.skipsBreakfast)(propertyName) ? ['food_tips', 'van_tips'] : ['breakfast_tips', 'food_tips', 'van_tips'];
        await replyOrEscalate(from, '⏳ Sending check-in messages...', '/ckin progress');
        for (const key of tipKeys) {
            const msg = await (0, sheets_1.getTipsMessage)(key, lang);
            if (msg) {
                await (0, evoClient_1.evoSendText)(from, msg);
                await sleep(3000);
            }
        }
        const rules = await (0, sheets_1.getTipsMessage)('guest_rules', lang);
        if (rules) {
            await sleep(3000);
            await (0, evoClient_1.evoSendText)(from, rules);
        }
        console.log(`✅ /ckin sent → ${from}`);
    }
    catch (e) {
        console.error('❌ /ckin error:', e?.message);
        await replyOrEscalate(from, '❌ Failed to send check-in messages', '/ckin error');
    }
}
// Tracks in-progress /group creations: leadUid → { startedBy, replyJids }
const groupCreationInProgress = new Map();
async function handleGroupCommand(from, uid, senderJid, pushName) {
    // Always reply 1:1 to the sender, not in the group
    const replyTo = from.endsWith('@g.us') ? senderJid : from;
    if (!uid) {
        await replyOrEscalate(replyTo, '❌ Usage: /group <lead_uid>', '/group usage');
        return;
    }
    const isDM = !from.endsWith('@g.us');
    if (!isDM && !isStaffSender(senderJid)) {
        return; // silent — non-staff in group, don't expose command exists
    }
    // Already fully created and linked
    const existingGroupId = (0, groupLeads_1.getWaGroupIdByLeadUid)(uid);
    if (existingGroupId) {
        const inviteLink = await (0, evoClient_1.getGroupInviteLink)(existingGroupId).catch(() => null);
        const groupRef = inviteLink ? `🔗 ${inviteLink}` : `🆔 ${existingGroupId}`;
        await replyOrEscalate(replyTo, `⚠️ Group already exists for this booking\n${groupRef}`, '/group already-exists');
        return;
    }
    // Already in progress — add to notify list and bail
    if (groupCreationInProgress.has(uid)) {
        const { startedBy } = groupCreationInProgress.get(uid);
        groupCreationInProgress.get(uid).replyJids.push(replyTo);
        await replyOrEscalate(replyTo, `⏳ Already being set up by ${startedBy}.\n\n` +
            `You'll be notified when the group is ready.`, '/group already-in-progress');
        return;
    }
    try {
        const lead = await (0, hostfully_1.fetchLead)(uid);
        const info = lead?.guestInformation;
        const guest_name = (0, format_1.guestName)(info);
        const propertyUid = lead?.propertyUid || lead?.propertyUidLegacy || '';
        let propertyName = lead?.propertyName || lead?.unit?.name || '';
        let propertyObj = null;
        if (propertyUid) {
            try {
                propertyObj = await (0, hostfully_1.fetchProperty)(propertyUid);
                if (!propertyName)
                    propertyName = propertyObj?.name || '';
            }
            catch { }
        }
        // Register as in-progress
        const starterName = pushName || 'a team member';
        groupCreationInProgress.set(uid, { startedBy: starterName, replyJids: [replyTo] });
        await replyOrEscalate(replyTo, `⏳ Creating group for ${guest_name}...\n\n` +
            `Everything is handled. Welcome messages will arrive in the group within 30–40 minutes (slow-paced on purpose).\n\n` +
            `No action needed.`, '/group progress');
        const phone = info?.phoneNumber || info?.cellPhoneNumber || '';
        const nationality = (info?.countryCode || 'US').toUpperCase();
        const groupId = await (0, groupCreation_1.createBookingGroup)({
            guest_name,
            phone,
            property: propertyName || 'COZE Property',
            check_in: lead.checkInLocalDateTime,
            check_out: lead.checkOutLocalDateTime,
            nationality,
            lead_uid: uid,
            property_uid: propertyUid,
            lead_status: lead.status,
            group_name: (0, groupNaming_1.buildBookingGroupName)(lead, propertyObj, guest_name),
            lead_type: lead.type || 'DIRECT',
            force: true,
        });
        // Notify everyone who asked
        const { replyJids } = groupCreationInProgress.get(uid) || { replyJids: [replyTo] };
        groupCreationInProgress.delete(uid);
        if (groupId) {
            for (const jid of replyJids) {
                await replyOrEscalate(jid, `✅ Group ready!\n` +
                    `👤 ${guest_name}\n` +
                    `🏠 ${propertyName}\n` +
                    `🆔 ${groupId}\n\n` +
                    `Welcome messages will arrive in the group shortly.\n\n` +
                    `Please send a message in the group today to keep it active.`, '/group success');
            }
        }
        else {
            const failure = (0, groupCreation_1.getLastCreateFailure)(uid);
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
    }
    catch (e) {
        groupCreationInProgress.delete(uid);
        const is404 = e?.response?.status === 404 || e.status === 404;
        console.error('❌ /group command error:', e?.message);
        await replyOrEscalate(replyTo, is404 ? '❌ Lead UID not found — check the UID is correct' : '❌ Error creating group', '/group error');
    }
}
