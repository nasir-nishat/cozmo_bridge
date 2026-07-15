"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setGroupCreationEnabled = exports.groupCreationEnabled = void 0;
exports.getPropertyImageBase64 = getPropertyImageBase64;
exports.sendBookingMessages = sendBookingMessages;
exports.createBookingGroup = createBookingGroup;
exports.flushPendingMessages = flushPendingMessages;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const sharp_1 = __importDefault(require("sharp"));
const constants_1 = require("../../config/constants");
const hostfully_1 = require("../../services/hostfully");
const sheets_1 = require("../../services/sheets");
const groupLeads_1 = require("../../services/groupLeads");
const llm_1 = require("../../services/llm");
const notify_1 = require("../../services/notify");
const evoClient_1 = require("./evoClient");
const groupNaming_1 = require("./groupNaming");
const contacts_1 = require("../../services/contacts");
const pendingMessages_1 = require("../../services/pendingMessages");
const sentMessages_1 = require("../../services/sentMessages");
const format_1 = require("../../utils/format");
const groupReminders_1 = require("../../services/groupReminders");
const staffCache_1 = require("../../services/staffCache");
const replyWatchdog_1 = require("../../services/replyWatchdog");
const groupCreationPacing_1 = require("../../services/groupCreationPacing");
const messageVariation_1 = require("../../utils/messageVariation");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function phoneCountry(phone) {
    if (phone.startsWith('886'))
        return 'TW'; // must check before '86'
    if (phone.startsWith('82'))
        return 'KR';
    if (phone.startsWith('81'))
        return 'JP';
    if (phone.startsWith('86'))
        return 'CN';
    return 'OTHER';
}
const randSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);
// Actively queries Evolution API — never trusts the stale in-memory flag
async function waitForEvoConnection(maxWaitMs = 90000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await evoClient_1.evoApi.get(`/instance/connectionState/${evoClient_1.INSTANCE}`);
            const state = res.data?.instance?.state || res.data?.state;
            if (state === 'open') {
                (0, evoClient_1.setWaReady)(true);
                return true;
            }
            console.log(`⏳ WA connection state: "${state}" — retrying in 5s...`);
        }
        catch (e) {
            console.warn(`⚠️ connectionState check failed:`, e?.message);
        }
        await sleep(5000);
    }
    (0, evoClient_1.setWaReady)(false);
    return false;
}
const PROPERTY_IMAGE_MAP = {
    BS: 'BS.jpg', SG: 'SG.jpg', SJ: 'SJ.jpg', SA: 'SA.jpg',
    JT: 'JT.png', JTS: 'JTS.jpg',
    HT: 'HT.png', HTA: 'HTA.jpg', HTB: 'HTB.png',
    B9: 'B9.jpg', F9: 'F9.jpg', L9: 'L9.jpg', FB: 'FB.jpg', YT: 'YT.jpg',
    GK: 'gk_luxury.jpeg', GKA: 'gka_ananda.jpeg', GKB: 'gkb_prana.jpeg',
};
const HOMES_DIR = path_1.default.join(__dirname, '../../../assets/coze_homes');
async function getPropertyImageBase64(propertyNameOrCode) {
    const code = (0, groupNaming_1.propertyCodeFromName)(propertyNameOrCode || '');
    const filename = PROPERTY_IMAGE_MAP[code] || 'COZE.jpg';
    const filepath = path_1.default.join(HOMES_DIR, filename);
    try {
        const resized = await (0, sharp_1.default)(filepath)
            .resize(640, 640, { fit: 'cover' })
            .jpeg({ quality: 70 })
            .toBuffer();
        return resized.toString('base64');
    }
    catch {
        return null;
    }
}
let lastGroupCreatedAt = 0;
exports.groupCreationEnabled = false;
const setGroupCreationEnabled = (val) => { exports.groupCreationEnabled = val; };
exports.setGroupCreationEnabled = setGroupCreationEnabled;
let creationChain = Promise.resolve();
const leadCooldown = new Map();
async function waitForRateLimit() {
    const elapsed = Date.now() - lastGroupCreatedAt;
    if (lastGroupCreatedAt && elapsed < constants_1.CONFIG.GROUP_CREATION_DELAY_MS) {
        const wait = constants_1.CONFIG.GROUP_CREATION_DELAY_MS - elapsed;
        console.log(`⏳ Rate limit: waiting ${Math.round(wait / 1000)}s...`);
        await sleep(wait);
    }
    lastGroupCreatedAt = Date.now();
}
function isAllowedForRollout(leadUid, propertyName) {
    if (!constants_1.CONFIG.GROUP_CREATION_REQUIRE_ALLOWLIST)
        return true;
    const leadAllowed = constants_1.CONFIG.GROUP_CREATION_LEAD_ALLOWLIST.includes(leadUid);
    const propertyAllowed = constants_1.CONFIG.GROUP_CREATION_PROPERTY_ALLOWLIST.includes(propertyName);
    return leadAllowed || propertyAllowed;
}
// Returns false if connection was not available (caller should enqueue for retry)
async function sendBookingMessages(groupId, { nationality, skipInitialDelay, guestName, property }, warnings) {
    const varyCtx = { name: guestName, property };
    let sessionLost = false;
    const safeSend = async (label, fn, sentStep) => {
        if (sessionLost)
            return;
        if (sentStep && (0, sentMessages_1.isSent)(groupId, sentStep)) {
            console.log(`⏭️ ${label} already sent — skipping`);
            return;
        }
        try {
            console.log(`📤 Sending: ${label} → ${groupId}`);
            await fn();
            console.log(`✅ Sent: ${label}`);
            if (sentStep)
                (0, sentMessages_1.markSent)(groupId, sentStep);
        }
        catch (e) {
            const detail = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 150) : '';
            const errStr = JSON.stringify(e?.response?.data || '');
            if (errStr.includes('SessionError')) {
                console.warn(`⚠️ SessionError on "${label}" — waiting 20s then retrying once...`);
                await sleep(20000);
                try {
                    await fn();
                    console.log(`✅ Sent (retry): ${label}`);
                    if (sentStep)
                        (0, sentMessages_1.markSent)(groupId, sentStep);
                    return;
                }
                catch (e2) {
                    const detail2 = e2?.response?.data ? JSON.stringify(e2.response.data).slice(0, 150) : '';
                    console.error(`❌ Retry failed for "${label}" — aborting send, will re-queue`);
                    sessionLost = true;
                    (0, evoClient_1.setWaReady)(false);
                    (0, notify_1.sendAlert)(`📵 <b>WhatsApp Session Lost</b>\n─────────────────\n` +
                        `⚠️ Failed during: ${label}\n` +
                        `📋 Messages will retry on reconnect\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true }).catch(() => { });
                    warnings.push(`${label} (retry): ${e2?.message || 'unknown error'}${detail2 ? ` → ${detail2}` : ''}`);
                    return;
                }
            }
            if (errStr.includes('not-acceptable')) {
                console.warn(`⚠️ not-acceptable on "${label}" — re-applying not_announcement and retrying...`);
                await evoClient_1.evoApi.post(`/group/updateSetting/${evoClient_1.INSTANCE}`, { groupJid: groupId, action: 'not_announcement' }).catch(() => { });
                await sleep(8000);
                try {
                    await fn();
                    console.log(`✅ Sent (retry): ${label}`);
                    if (sentStep)
                        (0, sentMessages_1.markSent)(groupId, sentStep);
                    return;
                }
                catch (e2) {
                    const detail2 = e2?.response?.data ? JSON.stringify(e2.response.data).slice(0, 150) : '';
                    console.warn(`⚠️ Retry also failed for "${label}":`, detail2);
                    warnings.push(`${label} (retry): ${e2?.message || 'unknown error'}${detail2 ? ` → ${detail2}` : ''}`);
                    return;
                }
            }
            console.warn(`⚠️ ${label} failed:`, e?.message, detail);
            warnings.push(`${label}: ${e?.message || 'unknown error'}${detail ? ` → ${detail}` : ''}`);
        }
    };
    const stored = (0, groupLeads_1.getGroupLang)(groupId);
    const langCode = stored || 'EN';
    let msgs = {};
    try {
        msgs = await (0, sheets_1.getMessages)(langCode);
        console.log(`📋 Messages loaded (${langCode}): ${Object.keys(msgs).join(', ') || 'none'}`);
    }
    catch (e) {
        console.error('❌ getMessages failed:', e?.message);
        warnings.push(`getMessages: ${e?.message || 'unknown error'}`);
        return false;
    }
    // 8–15 min cooldown after group creation before sending any messages
    if (!skipInitialDelay) {
        console.log(`⏳ Waiting 8–15 min before sending messages to ${groupId}...`);
        await randSleep(480000, 900000);
    }
    const ready = await waitForEvoConnection(90000);
    if (!ready) {
        console.error('❌ sendBookingMessages: WA session not open after 90s — will retry on reconnect');
        return false;
    }
    if (msgs['brand_msg']) {
        await safeSend('brand message', () => (0, evoClient_1.evoSendText)(groupId, (0, messageVariation_1.renderMessage)(msgs['brand_msg'].replace(/\\n/g, '\n'), varyCtx, { withOpener: true })), 'welcome_brand');
        await randSleep(120000, 300000);
    }
    if (msgs['intro_msg']) {
        await safeSend('intro message', () => (0, evoClient_1.evoSendText)(groupId, (0, messageVariation_1.renderMessage)(msgs['intro_msg'].replace(/\\n/g, '\n'), varyCtx)), 'welcome_intro');
        await randSleep(120000, 300000);
    }
    const cardUrl = msgs['business_card_url'];
    if (cardUrl) {
        await safeSend('business card image', async () => {
            const imgRes = await axios_1.default.get(cardUrl, { responseType: 'arraybuffer' });
            const media = Buffer.from(imgRes.data).toString('base64');
            await evoClient_1.evoApi.post(`/message/sendMedia/${evoClient_1.INSTANCE}`, {
                number: groupId,
                mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg',
            });
        }, 'welcome_card');
    }
    else if (fs_1.default.existsSync(constants_1.CONFIG.BUSINESS_CARD_PATH)) {
        const media = fs_1.default.readFileSync(constants_1.CONFIG.BUSINESS_CARD_PATH).toString('base64');
        await safeSend('business card image', () => evoClient_1.evoApi.post(`/message/sendMedia/${evoClient_1.INSTANCE}`, {
            number: groupId,
            mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg',
        }).then(() => { }), 'welcome_card');
    }
    if (sessionLost)
        return false;
    return true;
}
async function createBookingGroup(args) {
    const { force, lead_uid, lead_status, property } = args;
    if (!(0, evoClient_1.isWaReady)()) {
        console.warn(`⏭️ Skip group creation (${lead_uid}): WA not ready`);
        return '';
    }
    if (!force && !exports.groupCreationEnabled) {
        console.log(`⏭️ Skip group creation (${lead_uid}): disabled`);
        return '';
    }
    if (!force && !['BOOKED', 'PAID_IN_FULL'].includes(lead_status || '')) {
        console.log(`⏭️ Skip group creation (${lead_uid}): status=${lead_status}`);
        return '';
    }
    if (!isAllowedForRollout(lead_uid, property)) {
        console.log(`⏭️ Skip group creation (${lead_uid}): not in allowlist`);
        return '';
    }
    const existingGroupId = (0, groupLeads_1.getWaGroupIdByLeadUid)(lead_uid);
    if (existingGroupId) {
        console.log(`⏭️ Skip group creation (${lead_uid}): already linked to ${existingGroupId}`);
        return existingGroupId;
    }
    const leadLastCreatedAt = leadCooldown.get(lead_uid) || 0;
    if (leadLastCreatedAt && Date.now() - leadLastCreatedAt < constants_1.CONFIG.GROUP_CREATION_DELAY_MS) {
        console.log(`⏭️ Skip group creation (${lead_uid}): lead cooldown active`);
        return '';
    }
    // Serialize — one group created at a time to prevent Evolution API 500 rate-limit errors
    let groupId = '';
    const myTurn = creationChain.then(async () => {
        groupId = await _doCreateBookingGroup(args).catch((e) => {
            console.error(`❌ createBookingGroup error (${lead_uid}):`, e?.message);
            return '';
        });
    });
    creationChain = myTurn.catch(() => { });
    await myTurn;
    return groupId;
}
async function _doCreateBookingGroup({ guest_name, phone, property, check_in, check_out, nationality, lead_uid, property_uid, lead_status, group_name, force, lead_type }) {
    // Re-check after acquiring queue slot — may have been created manually while we waited
    const existingGroupId = (0, groupLeads_1.getWaGroupIdByLeadUid)(lead_uid);
    if (existingGroupId) {
        console.log(`⏭️ Skip group creation (${lead_uid}): already linked to ${existingGroupId} (created while queued)`);
        return existingGroupId;
    }
    await waitForRateLimit();
    const groupName = (group_name || '').toString().trim() || `COZE | ${guest_name} | ${property}`;
    const guestPhone = phone ? phone.replace(/\D/g, '') : '';
    const useDevMembers = constants_1.CONFIG.IS_APP_DEV || constants_1.CONFIG.FORCE_DEV_GROUP_MEMBERS;
    let teamRaw = useDevMembers ? await (0, sheets_1.getDevTeamMembers)() : await (0, sheets_1.getActiveTeamMembers)();
    let memberSource = useDevMembers ? 'sheet-isDev' : 'sheet-active';
    if (useDevMembers && !teamRaw.length) {
        teamRaw = constants_1.CONFIG.DEV_GROUP_MEMBER_JIDS.map((j) => j.replace(/@.*$/, ''));
        memberSource = 'dev-fixed-fallback';
    }
    console.log(`ℹ️ Group member source (${lead_uid}): ${memberSource}`);
    const teamPhones = teamRaw
        .map((j) => j.replace(/@.*$/, '').replace(/\D/g, ''))
        .filter(Boolean);
    // KR phones never get a WA group — phone prefix only, regardless of WA availability → KakaoTalk only
    if (!force && guestPhone && phoneCountry(guestPhone) === 'KR') {
        console.log(`⏭️ Skipping WA group for KR phone (+${guestPhone}) — KakaoTalk only`);
        return '';
    }
    // Always include guest — if not on WA, Evolution API skips them silently; we check after creation
    let guestOnWA = false;
    if (guestPhone) {
        try {
            guestOnWA = await evoClient_1.waClient.isRegisteredUser(guestPhone);
        }
        catch {
            guestOnWA = true; // assume on WA if check fails — better to try than miss the guest
        }
        if (!guestOnWA) {
            console.warn(`⚠️ Guest phone +${guestPhone} not confirmed on WhatsApp — will attempt to add anyway`);
        }
    }
    if (guestOnWA && lead_uid) {
        const propertyCode = (0, groupNaming_1.propertyCodeFromName)(property || '');
        (0, contacts_1.saveGuestContact)(guest_name, guestPhone, propertyCode).catch((e) => console.warn('⚠️ saveGuestContact failed:', e?.message));
    }
    const allParticipants = [...new Set([...(guestPhone ? [guestPhone] : []), ...teamPhones])].filter(Boolean);
    const propertyImageBase64 = await getPropertyImageBase64(property || '');
    const warnings = [];
    await randSleep(1000, 3000);
    console.log(`✅ Execute group creation (${lead_uid})`);
    console.log(`👥 Creating group: ${groupName} (${allParticipants.length} participants)`);
    let groupId;
    try {
        const res = await evoClient_1.evoApi.post(`/group/create/${evoClient_1.INSTANCE}`, {
            subject: groupName,
            participants: allParticipants,
        });
        console.log('📦 groupCreate raw response:', JSON.stringify(res.data));
        groupId = res.data?.groupJid || res.data?.id || res.data?.data?.groupJid || res.data?.data?.id;
        if (!groupId)
            throw new Error('No groupJid in response: ' + JSON.stringify(res.data));
    }
    catch (e) {
        console.error('❌ groupCreate failed:', e?.message);
        throw e;
    }
    (0, groupCreationPacing_1.recordGroupCreated)();
    // 1–2 min: let WA register the new group before any settings changes
    console.log(`⏳ Waiting 1–2 min before group settings (${lead_uid})...`);
    await randSleep(60000, 120000);
    try {
        await evoClient_1.evoApi.post(`/group/updateSetting/${evoClient_1.INSTANCE}`, { groupJid: groupId, action: 'not_announcement' });
        console.log(`✅ Group set to non-announcement`);
        await randSleep(25000, 50000);
    }
    catch (e) {
        console.warn('⚠️ Could not set group to non-announcement:', e?.message);
        warnings.push(`non-announcement: ${e?.message || 'unknown error'}`);
    }
    try {
        await evoClient_1.evoApi.post(`/group/updateSetting/${evoClient_1.INSTANCE}`, { groupJid: groupId, action: 'unlocked' });
        console.log(`✅ Group invite link enabled for all participants`);
        await randSleep(25000, 50000);
    }
    catch (e) {
        console.warn('⚠️ Could not enable invite link for all participants:', e?.message);
        warnings.push(`invite-link: ${e?.message || 'unknown error'}`);
    }
    try {
        await evoClient_1.evoApi.post(`/group/updateSetting/${evoClient_1.INSTANCE}`, { groupJid: groupId, action: 'member_add_all' });
        console.log(`✅ All members can add others`);
        await randSleep(25000, 50000);
    }
    catch (e) {
        console.warn('⚠️ Could not set member_add_all:', e?.message);
        warnings.push(`member-add-all: ${e?.message || 'unknown error'}`);
    }
    try {
        await evoClient_1.evoApi.post(`/group/updateSetting/${evoClient_1.INSTANCE}`, { groupJid: groupId, action: 'join_approval_off' });
        console.log(`✅ Invite link joins do not require admin approval`);
        await randSleep(25000, 50000);
    }
    catch (e) {
        console.warn('⚠️ Could not disable join approval:', e?.message);
        warnings.push(`join-approval: ${e?.message || 'unknown error'}`);
    }
    // 3–5 min more: let the group fully stabilize before any participant writes
    console.log(`⏳ Waiting 3–5 min before admin promotion (${lead_uid})...`);
    await randSleep(180000, 300000);
    // PRIORITY 1: Promote staff to admin — verify after each attempt, retry until confirmed
    const staffLids = (0, staffCache_1.getStaffWhatsAppLids)();
    const staffLidBases = new Set(staffLids.map(l => l.replace(/@.*$/, '')));
    let staffNotAdmin = [...staffLids];
    const STAFF_MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= STAFF_MAX_ATTEMPTS && staffNotAdmin.length > 0; attempt++) {
        if (attempt > 1) {
            // Jittered backoff — mirrors the same anti-ban pattern used for message sends
            const delay = attempt === 2 ? randSleep(30000, 40000) : randSleep(45000, 60000);
            console.log(`⏳ Staff promote attempt ${attempt} — backing off before retry...`);
            await delay;
        }
        try {
            await evoClient_1.evoApi.post(`/group/updateParticipant/${evoClient_1.INSTANCE}`, {
                groupJid: groupId,
                action: 'promote',
                participants: staffNotAdmin,
            });
            console.log(`👑 Staff promote attempt ${attempt}: called for ${staffNotAdmin.length} member(s)`);
        }
        catch (e) {
            console.warn(`⚠️ Staff promote attempt ${attempt} API error:`, e?.message);
        }
        // Verify — wait with jitter then re-fetch to see who is actually admin now
        await randSleep(8000, 12000);
        try {
            const verRes = await evoClient_1.evoApi.get(`/group/participants/${evoClient_1.INSTANCE}`, { params: { groupJid: groupId } });
            const verParts = verRes.data?.participants || [];
            const confirmedAdminBases = new Set(verParts
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => (p.id || '').replace(/@.*$/, '')));
            staffNotAdmin = staffNotAdmin.filter(lid => !confirmedAdminBases.has(lid.replace(/@.*$/, '')));
            console.log(`✅ Staff admin check (attempt ${attempt}): ${staffNotAdmin.length} still not admin`);
        }
        catch (e) {
            console.warn(`⚠️ Could not verify staff admin status (attempt ${attempt}):`, e?.message);
        }
    }
    if (staffNotAdmin.length > 0) {
        const msg = `${staffNotAdmin.length} staff member(s) still not admin after ${STAFF_MAX_ATTEMPTS} attempts`;
        console.error(`❌ ${msg}`);
        warnings.push(`staff promote: ${msg}`);
        (0, notify_1.sendAlert)(`🚨 <b>Staff Not Made Admin — Action Required</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            `📋 <b>Action needed:</b> Group Info → Group Admins → Make Admin for all staff\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined }).catch(() => { });
    }
    else if (staffLids.length > 0) {
        console.log(`✅ All ${staffLids.length} staff confirmed admin`);
    }
    await sleep(5000);
    // PRIORITY 2: Promote guest to admin — retry loop mirrors staff pattern
    const GUEST_MAX_ATTEMPTS = 2;
    let guestPromoted = false;
    for (let attempt = 1; attempt <= GUEST_MAX_ATTEMPTS && !guestPromoted; attempt++) {
        if (attempt > 1) {
            const delay = attempt === 2 ? randSleep(30000, 40000) : randSleep(45000, 60000);
            console.log(`⏳ Guest promote attempt ${attempt} — backing off before retry...`);
            await delay;
        }
        try {
            const partRes = await evoClient_1.evoApi.get(`/group/participants/${evoClient_1.INSTANCE}`, { params: { groupJid: groupId } });
            const participants = partRes.data?.participants || [];
            const guestToPromote = [];
            for (const p of participants) {
                const lidBase = (p.id || '').replace(/@.*$/, '');
                if (lidBase === '234325463273604' || staffLidBases.has(lidBase) || p.admin === 'superadmin' || p.admin === 'admin')
                    continue;
                guestToPromote.push(p.id);
            }
            if (!guestToPromote.length) {
                console.log(`ℹ️ Guest promote attempt ${attempt}: guest not yet in group — will retry`);
                continue;
            }
            await evoClient_1.evoApi.post(`/group/updateParticipant/${evoClient_1.INSTANCE}`, {
                groupJid: groupId,
                action: 'promote',
                participants: guestToPromote,
            });
            await randSleep(8000, 12000);
            const verRes = await evoClient_1.evoApi.get(`/group/participants/${evoClient_1.INSTANCE}`, { params: { groupJid: groupId } });
            const verParts = verRes.data?.participants || [];
            const confirmedAdminBases = new Set(verParts
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => (p.id || '').replace(/@.*$/, '')));
            const stillNotAdmin = guestToPromote.filter(id => !confirmedAdminBases.has(id.replace(/@.*$/, '')));
            if (stillNotAdmin.length === 0) {
                console.log(`✅ Guest promoted to admin (attempt ${attempt})`);
                guestPromoted = true;
            }
            else {
                console.warn(`⚠️ Guest promote attempt ${attempt}: ${stillNotAdmin.length} still not admin`);
            }
        }
        catch (e) {
            const detail = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : '';
            console.warn(`⚠️ Guest promote attempt ${attempt} error:`, e?.message, detail);
        }
    }
    await sleep(5000);
    if (propertyImageBase64) {
        // Fully deferred — fires 30–45 minutes after group creation, well after all messages are sent
        const capturedGroupId = groupId;
        const capturedImage = propertyImageBase64;
        sleep(1800000 + Math.floor(Math.random() * 900000)).then(() => evoClient_1.evoApi.post(`/group/updateGroupPicture/${evoClient_1.INSTANCE}`, { groupJid: capturedGroupId, image: capturedImage }, { timeout: 30000 })).then(() => {
            console.log(`✅ Group icon set (deferred): ${capturedGroupId}`);
        }).catch((e) => {
            console.warn('⚠️ Could not set group icon (deferred):', e?.message);
        });
    }
    if (lead_uid) {
        (0, groupLeads_1.linkGroup)(groupId, lead_uid);
        (0, groupLeads_1.saveGroupName)(groupId, groupName);
        leadCooldown.set(lead_uid, Date.now());
        (0, llm_1.detectGuestLanguage)(guest_name, guestPhone).then(lang => {
            (0, groupLeads_1.saveGroupLang)(groupId, lang);
            console.log(`🌐 Group lang detected [auto-create]: ${lang} → ${groupId}`);
        }).catch(() => { });
        console.log(`🔗 Auto-linked: ${groupId} → ${lead_uid}`);
        await (0, notify_1.sendAlert)(`👥 <b>WhatsApp Group Created</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            (guestPhone ? `📱 <b>Phone:</b> +${guestPhone}\n` : '') +
            `🏠 <b>Property:</b> ${property}\n` +
            `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            `⏱️ Welcome messages will arrive in the group within ~30 min (slow-paced on purpose)\n` +
            `💬 Please send a message in the group today to keep it active\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { useTestJandi: constants_1.CONFIG.IS_APP_DEV, propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined });
    }
    // Enqueue BEFORE sending — if server restarts mid-sleep sequence, messages retry on next reconnect
    const pendingMeta = {
        guestName: guest_name,
        phone: guestPhone,
        property,
        guestOnWA,
        checkIn: (0, format_1.formatSeoulDate)(check_in),
        checkOut: (0, format_1.formatSeoulDate)(check_out),
    };
    (0, pendingMessages_1.enqueue)(groupId, nationality, `${guest_name} @ ${property}`, pendingMeta);
    const sent = await sendBookingMessages(groupId, { nationality, guestName: guest_name, property }, warnings);
    if (sent) {
        (0, pendingMessages_1.dequeue)(groupId);
        (0, sentMessages_1.markSent)(groupId, 'welcome');
        (0, replyWatchdog_1.addToReplyWatchdog)(groupId, guest_name, property, groupName);
        if (lead_uid)
            (0, groupReminders_1.scheduleReminder)(groupId, lead_uid);
    }
    else {
        await (0, notify_1.sendAlert)(`⏳ <b>Messages Queued for Retry</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n<i>Will send when WA reconnects · COZMO</i>`, { telegramOnly: true });
    }
    if (warnings.length) {
        await (0, notify_1.sendAlert)(`⚠️ <b>Group Setup — Partial Failures</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            warnings.map(w => `• ${w}`).join('\n') + '\n' +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
    }
    // Check if guest is in the group — by now WA has had ample time to add them
    let guestInGroup = false;
    let guestIsAdmin = false;
    if (guestPhone) {
        try {
            const partRes = await evoClient_1.evoApi.get(`/group/participants/${evoClient_1.INSTANCE}`, { params: { groupJid: groupId } });
            const parts = partRes.data?.participants || [];
            const allLids = parts.length > 0 && parts.every((p) => (p.id || '').endsWith('@lid'));
            if (allLids) {
                // Can't match guest by phone when all IDs are LIDs — assume ok to avoid false alarms
                guestInGroup = guestOnWA;
                guestIsAdmin = guestOnWA;
            }
            else {
                const guestPart = parts.find((p) => {
                    const pid = (p.id || '').replace(/@.*$/, '').replace(/\D/g, '');
                    return pid === guestPhone;
                });
                guestInGroup = !!guestPart;
                guestIsAdmin = !!(guestPart && (guestPart.admin === 'admin' || guestPart.admin === 'superadmin'));
            }
            console.log(`ℹ️ Guest in group: ${guestInGroup}, admin: ${guestIsAdmin} (phone: ${guestPhone}, allLids: ${allLids})`);
        }
        catch (e) {
            console.warn('⚠️ Could not verify guest in participants:', e?.message);
            guestInGroup = guestOnWA;
            guestIsAdmin = guestOnWA;
        }
    }
    if (guestPhone && !guestInGroup) {
        const phone = `+${guestPhone}`;
        console.warn(`⚠️ Guest not in group: ${guest_name} (${phone})`);
        // Fetch invite link once — reused for DM, alert, and HF inbox
        const inviteLink = await (0, evoClient_1.getGroupInviteLink)(groupId).catch(() => null);
        if (constants_1.CONFIG.SEND_GUEST_INVITE_DM && inviteLink) {
            await (0, evoClient_1.evoSendText)(guestPhone, `Hi ${guest_name}! 👋 Your COZE Hospitality guest group is ready.\n\nPlease join here:\n${inviteLink}\n\n— COZMO AI | Guest Care Team | COZE Hospitality 3.0`).catch((e) => console.warn('⚠️ Could not send invite link to guest:', e?.message));
        }
        await (0, notify_1.sendAlert)(`⚠️ <b>Guest Not Added to Group</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name} (${phone})\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            (inviteLink && constants_1.CONFIG.SEND_GUEST_INVITE_DM ? `🔗 <b>Invite link sent to guest</b>\n` : `📋 <b>Action needed:</b> Add guest manually\n`) +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`).catch(() => { });
        // Send invite link via HF inbox — with actual link if available, template-only otherwise
        if (lead_uid) {
            if (inviteLink) {
                (0, hostfully_1.sendHfInviteLink)(lead_uid, guest_name, inviteLink).catch((e) => console.warn('⚠️ sendHfInviteLink failed:', e?.message));
            }
            else {
                (0, hostfully_1.sendWaInviteFallbackMessage)(lead_uid, guest_name).catch((e) => console.warn('⚠️ sendWaInviteFallbackMessage failed:', e?.message));
            }
        }
    }
    if (guestPhone && guestInGroup && !guestIsAdmin) {
        console.warn(`⚠️ Guest in group but not promoted to admin: ${guest_name} (+${guestPhone})`);
        await (0, notify_1.sendAlert)(`⚠️ <b>Guest Not Made Admin in Group</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name} (+${guestPhone})\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            `📋 <b>Action needed:</b> Group Info → Group Admins → Make Admin for ${guest_name}\n` +
            `💡 Guest cannot add family/friends without admin rights\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { propertyCode: (0, groupNaming_1.propertyCodeFromName)(property) || undefined }).catch(() => { });
        if (lead_uid) {
            (0, hostfully_1.saveGuestNote)(lead_uid, `[COZMO] Could not promote ${guest_name} to admin in WhatsApp group (${groupId}). ` +
                `Please open the group → Group Info → Make Admin for the guest. ` +
                `Without admin rights the guest cannot add family or friends.`).catch((e) => console.warn('⚠️ saveGuestNote (admin fail) failed:', e?.message));
        }
    }
    console.log(`✅ Group created: ${groupName}`);
    return groupId;
}
let flushing = false;
async function flushPendingMessages() {
    if (flushing)
        return;
    const pending = (0, pendingMessages_1.getPending)();
    if (!pending.length)
        return;
    flushing = true;
    console.log(`🔄 Flushing ${pending.length} pending message job(s)...`);
    try {
        for (const job of pending) {
            if ((0, sentMessages_1.isSent)(job.groupId, 'welcome')) {
                console.log(`⏭️ Already welcomed — skipping queue entry: ${job.groupId} (${job.label})`);
                (0, pendingMessages_1.dequeue)(job.groupId);
                continue;
            }
            const warnings = [];
            (0, pendingMessages_1.incrementAttempts)(job.groupId);
            console.log(`📤 Retrying messages for ${job.groupId} (${job.label}, attempt ${job.attempts + 1})`);
            const sent = await sendBookingMessages(job.groupId, {
                nationality: job.nationality,
                skipInitialDelay: true,
                guestName: job.meta?.guestName,
                property: job.meta?.property,
            }, warnings);
            if (sent) {
                (0, pendingMessages_1.dequeue)(job.groupId);
                (0, sentMessages_1.markSent)(job.groupId, 'welcome');
                if (job.meta)
                    (0, replyWatchdog_1.addToReplyWatchdog)(job.groupId, job.meta.guestName, job.meta.property);
                console.log(`✅ Pending messages delivered: ${job.groupId}`);
                await (0, notify_1.sendAlert)(`✅ <b>Queued Messages Delivered</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${job.label}\n` +
                    `🆔 <b>Group:</b> <code>${job.groupId}</code>\n` +
                    `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, { telegramOnly: true });
            }
            else {
                console.warn(`⚠️ Still can't send to ${job.groupId} — will retry next reconnect`);
                await (0, notify_1.sendAlert)(`⚠️ <b>Messages Still Pending</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${job.label}\n` +
                    `🆔 <b>Group:</b> <code>${job.groupId}</code>\n` +
                    `─────────────────\n<i>Will retry on next WA reconnect · COZMO</i>`, { telegramOnly: true }).catch(() => { });
            }
            if (warnings.length) {
                console.warn(`⚠️ Flush warnings for ${job.groupId}:`, warnings.join(', '));
            }
        }
    }
    finally {
        flushing = false;
    }
}
