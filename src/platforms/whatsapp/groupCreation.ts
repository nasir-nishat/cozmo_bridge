import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';

import { CONFIG } from '../../config/constants';
import { sendWaInviteFallbackMessage, sendHfInviteLink, saveGuestNote } from '../../services/hostfully';
import { getActiveTeamMembers, getDevTeamMembers, getMessages } from '../../services/sheets';
import { linkGroup, getWaGroupIdByLeadUid, saveGroupName, saveGroupLang, getGroupLang } from '../../services/groupLeads';
import { detectGuestLanguage } from '../../services/llm';
import { sendAlert } from '../../services/notify';
import { isWaReady, setWaReady, evoApi, evoSendText, waClient, INSTANCE, getGroupInviteLink } from './evoClient';
import { propertyCodeFromName } from './groupNaming';
import { saveGuestContact } from '../../services/contacts';
import { enqueue, dequeue, getPending, incrementAttempts, PendingMeta } from '../../services/pendingMessages';
import { markSent, isSent, MessageType } from '../../services/sentMessages';
import { formatSeoulDate } from '../../utils/format';
import { scheduleReminder } from '../../services/groupReminders';
import { getStaffWhatsAppLids } from '../../services/staffCache';
import { addToReplyWatchdog } from '../../services/replyWatchdog';
import { recordGroupCreated } from '../../services/groupCreationPacing';
import { buildStarted, buildStep, buildStepLate, buildGroupId, buildFinished, buildFailed } from '../../services/groupBuildProgress';
import { renderMessage } from '../../utils/messageVariation';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function phoneCountry(phone: string): 'KR' | 'JP' | 'TW' | 'CN' | 'OTHER' {
    if (phone.startsWith('886')) return 'TW'; // must check before '86'
    if (phone.startsWith('82')) return 'KR';
    if (phone.startsWith('81')) return 'JP';
    if (phone.startsWith('86')) return 'CN';
    return 'OTHER';
}

const randSleep = (min: number, max: number) =>
    sleep(Math.floor(Math.random() * (max - min + 1)) + min);

// Actively queries Evolution API — never trusts the stale in-memory flag
async function waitForEvoConnection(maxWaitMs = 90000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await evoApi.get(`/instance/connectionState/${INSTANCE}`);
            const state = res.data?.instance?.state || res.data?.state;
            if (state === 'open') {
                setWaReady(true);
                return true;
            }
            console.log(`⏳ WA connection state: "${state}" — retrying in 5s...`);
        } catch (e: any) {
            console.warn(`⚠️ connectionState check failed:`, e?.message);
        }
        await sleep(5000);
    }
    setWaReady(false);
    return false;
}

const PROPERTY_IMAGE_MAP: Record<string, string> = {
    BS: 'BS.jpg', SG: 'SG.jpg', SJ: 'SJ.jpg', SA: 'SA.jpg',
    JT: 'JT.png', JTS: 'JTS.jpg',
    HT: 'HT.png', HTA: 'HTA.jpg', HTB: 'HTB.png',
    B9: 'B9.jpg', F9: 'F9.jpg', L9: 'L9.jpg', FB: 'FB.jpg', YT: 'YT.jpg',
    GK: 'gk_luxury.jpeg', GKA: 'gka_ananda.jpeg', GKB: 'gkb_prana.jpeg',
};
const HOMES_DIR = path.join(__dirname, '../../../assets/coze_homes');

export async function getPropertyImageBase64(propertyNameOrCode: string): Promise<string | null> {
    const code = propertyCodeFromName(propertyNameOrCode || '');
    const filename = PROPERTY_IMAGE_MAP[code] || 'COZE.jpg';
    const filepath = path.join(HOMES_DIR, filename);
    try {
        const resized = await sharp(filepath)
            .resize(640, 640, { fit: 'cover' })
            .jpeg({ quality: 70 })
            .toBuffer();
        return resized.toString('base64');
    } catch {
        return null;
    }
}

let lastGroupCreatedAt = 0;
export let groupCreationEnabled = false;
export const setGroupCreationEnabled = (val: boolean) => { groupCreationEnabled = val; };
let creationChain: Promise<void> = Promise.resolve();
const leadCooldown = new Map<string, number>();

async function waitForRateLimit() {
    const elapsed = Date.now() - lastGroupCreatedAt;
    if (lastGroupCreatedAt && elapsed < CONFIG.GROUP_CREATION_DELAY_MS) {
        const wait = CONFIG.GROUP_CREATION_DELAY_MS - elapsed;
        console.log(`⏳ Rate limit: waiting ${Math.round(wait / 1000)}s...`);
        await sleep(wait);
    }
    lastGroupCreatedAt = Date.now();
}

function isAllowedForRollout(leadUid: string, propertyName: string): boolean {
    if (!CONFIG.GROUP_CREATION_REQUIRE_ALLOWLIST) return true;
    const leadAllowed = CONFIG.GROUP_CREATION_LEAD_ALLOWLIST.includes(leadUid);
    const propertyAllowed = CONFIG.GROUP_CREATION_PROPERTY_ALLOWLIST.includes(propertyName);
    return leadAllowed || propertyAllowed;
}

interface BookingMeta {
    guestName: string;
    phone: string;
    property: string;
    guestOnWA: boolean;
    checkIn?: string;
    checkOut?: string;
}

// Returns false if connection was not available (caller should enqueue for retry)
export async function sendBookingMessages(
    groupId: string,
    { nationality, skipInitialDelay, guestName, property }:
        { nationality: string; skipInitialDelay?: boolean; guestName?: string; property?: string },
    warnings: string[]
): Promise<boolean> {
    const varyCtx = { name: guestName, property };
    let sessionLost = false;
    const safeSend = async (label: string, fn: () => Promise<void>, sentStep?: MessageType) => {
        if (sessionLost) return;
        if (sentStep && isSent(groupId, sentStep)) {
            console.log(`⏭️ ${label} already sent — skipping`);
            return;
        }
        try {
            console.log(`📤 Sending: ${label} → ${groupId}`);
            await fn();
            console.log(`✅ Sent: ${label}`);
            if (sentStep) markSent(groupId, sentStep);
        } catch (e: any) {
            const detail = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 150) : '';
            const errStr = JSON.stringify(e?.response?.data || '');
            if (errStr.includes('SessionError')) {
                console.warn(`⚠️ SessionError on "${label}" — waiting 20s then retrying once...`);
                await sleep(20000);
                try {
                    await fn();
                    console.log(`✅ Sent (retry): ${label}`);
                    if (sentStep) markSent(groupId, sentStep);
                    return;
                } catch (e2: any) {
                    const detail2 = e2?.response?.data ? JSON.stringify(e2.response.data).slice(0, 150) : '';
                    console.error(`❌ Retry failed for "${label}" — aborting send, will re-queue`);
                    sessionLost = true;
                    setWaReady(false);
                    sendAlert(
                        `📵 <b>WhatsApp Session Lost</b>\n─────────────────\n` +
                        `⚠️ Failed during: ${label}\n` +
                        `📋 Messages will retry on reconnect\n` +
                        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                        { telegramOnly: true }
                    ).catch(() => {});
                    warnings.push(`${label} (retry): ${e2?.message || 'unknown error'}${detail2 ? ` → ${detail2}` : ''}`);
                    return;
                }
            }
            if (errStr.includes('not-acceptable')) {
                console.warn(`⚠️ not-acceptable on "${label}" — re-applying not_announcement and retrying...`);
                await evoApi.post(`/group/updateSetting/${INSTANCE}`,
                    { groupJid: groupId, action: 'not_announcement' }
                ).catch(() => {});
                await sleep(8000);
                try {
                    await fn();
                    console.log(`✅ Sent (retry): ${label}`);
                    if (sentStep) markSent(groupId, sentStep);
                    return;
                } catch (e2: any) {
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

    const stored = getGroupLang(groupId);
    const langCode = stored || 'EN';
    let msgs: Record<string, string> = {};
    try {
        msgs = await getMessages(langCode);
        console.log(`📋 Messages loaded (${langCode}): ${Object.keys(msgs).join(', ') || 'none'}`);
    } catch (e: any) {
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
        await safeSend('brand message', () =>
            evoSendText(groupId, renderMessage(msgs['brand_msg'].replace(/\\n/g, '\n'), varyCtx, { withOpener: true })),
        'welcome_brand');
        await randSleep(120000, 300000);
    }

    if (msgs['intro_msg']) {
        await safeSend('intro message', () =>
            evoSendText(groupId, renderMessage(msgs['intro_msg'].replace(/\\n/g, '\n'), varyCtx)),
        'welcome_intro');
        await randSleep(120000, 300000);
    }

    const cardUrl = msgs['business_card_url'];
    if (cardUrl) {
        await safeSend('business card image', async () => {
            const imgRes = await axios.get(cardUrl, { responseType: 'arraybuffer' });
            const media = Buffer.from(imgRes.data).toString('base64');
            await evoApi.post(`/message/sendMedia/${INSTANCE}`, {
                number: groupId,
                mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg',
            });
        }, 'welcome_card');
    } else if (fs.existsSync(CONFIG.BUSINESS_CARD_PATH)) {
        const media = fs.readFileSync(CONFIG.BUSINESS_CARD_PATH).toString('base64');
        await safeSend('business card image', () =>
            evoApi.post(`/message/sendMedia/${INSTANCE}`, {
                number: groupId,
                mediatype: 'image', media, fileName: 'business_card.jpg', mimetype: 'image/jpeg',
            }).then(() => { }),
        'welcome_card');
    }

    if (sessionLost) return false;
    return true;
}

export async function createBookingGroup(args: any): Promise<string> {
    const { force, lead_uid, lead_status, property } = args;
    if (!isWaReady()) { console.warn(`⏭️ Skip group creation (${lead_uid}): WA not ready`); return ''; }
    if (!force && !groupCreationEnabled) { console.log(`⏭️ Skip group creation (${lead_uid}): disabled`); return ''; }
    if (!force && !['BOOKED', 'PAID_IN_FULL'].includes(lead_status || '')) {
        console.log(`⏭️ Skip group creation (${lead_uid}): status=${lead_status}`);
        return '';
    }
    if (!isAllowedForRollout(lead_uid, property)) {
        console.log(`⏭️ Skip group creation (${lead_uid}): not in allowlist`);
        return '';
    }
    const existingGroupId = getWaGroupIdByLeadUid(lead_uid);
    if (existingGroupId) {
        console.log(`⏭️ Skip group creation (${lead_uid}): already linked to ${existingGroupId}`);
        return existingGroupId;
    }
    const leadLastCreatedAt = leadCooldown.get(lead_uid) || 0;
    if (leadLastCreatedAt && Date.now() - leadLastCreatedAt < CONFIG.GROUP_CREATION_DELAY_MS) {
        console.log(`⏭️ Skip group creation (${lead_uid}): lead cooldown active`);
        return '';
    }

    // Serialize — one group created at a time to prevent Evolution API 500 rate-limit errors
    let groupId = '';
    const myTurn = creationChain.then(async () => {
        groupId = await _doCreateBookingGroup(args).catch((e: any) => {
            console.error(`❌ createBookingGroup error (${lead_uid}):`, e?.message);
            buildFailed(lead_uid, e?.message);
            return '';
        });
    });
    creationChain = myTurn.catch(() => {});
    await myTurn;
    return groupId;
}

async function _doCreateBookingGroup({
    guest_name, phone, property, check_in, check_out, nationality, lead_uid, property_uid, lead_status, group_name, force, lead_type
}: any): Promise<string> {
    // Re-check after acquiring queue slot — may have been created manually while we waited
    const existingGroupId = getWaGroupIdByLeadUid(lead_uid);
    if (existingGroupId) {
        console.log(`⏭️ Skip group creation (${lead_uid}): already linked to ${existingGroupId} (created while queued)`);
        return existingGroupId;
    }

    await waitForRateLimit();

    const groupName = (group_name || '').toString().trim() || `COZE | ${guest_name} | ${property}`;
    const guestPhone = phone ? phone.replace(/\D/g, '') : '';

    const useDevMembers = CONFIG.IS_APP_DEV || CONFIG.FORCE_DEV_GROUP_MEMBERS;
    let teamRaw = useDevMembers ? await getDevTeamMembers() : await getActiveTeamMembers();
    let memberSource = useDevMembers ? 'sheet-isDev' : 'sheet-active';
    if (useDevMembers && !teamRaw.length) {
        teamRaw = CONFIG.DEV_GROUP_MEMBER_JIDS.map((j: string) => j.replace(/@.*$/, ''));
        memberSource = 'dev-fixed-fallback';
    }
    console.log(`ℹ️ Group member source (${lead_uid}): ${memberSource}`);

    const teamPhones = teamRaw
        .map((j: string) => j.replace(/@.*$/, '').replace(/\D/g, ''))
        .filter(Boolean);

    // KR phones never get a WA group — phone prefix only, regardless of WA availability → KakaoTalk only
    if (!force && guestPhone && phoneCountry(guestPhone) === 'KR') {
        console.log(`⏭️ Skipping WA group for KR phone (+${guestPhone}) — KakaoTalk only`);
        return '';
    }

    // Invite-only mode: the guest is NOT force-added; they join via link (respects "who can add me
    // to groups" privacy and avoids the failed/forced-add spam signal that triggers suspensions).
    const guestInviteOnly = CONFIG.GROUP_CREATION_GUEST_INVITE_ONLY;

    // Still check WA registration — decides whether we DM the join link or use HF inbox only
    let guestOnWA = false;
    if (guestPhone) {
        try {
            guestOnWA = await waClient.isRegisteredUser(guestPhone);
        } catch {
            guestOnWA = true; // assume on WA if check fails
        }
        if (!guestOnWA) {
            console.warn(`⚠️ Guest phone +${guestPhone} not confirmed on WhatsApp`);
        }
    }

    if (guestOnWA && lead_uid) {
        const propertyCode = propertyCodeFromName(property || '');

        saveGuestContact(guest_name, guestPhone, propertyCode).catch((e: any) =>
            console.warn('⚠️ saveGuestContact failed:', e?.message)
        );
    }

    const allParticipants = [...new Set([
        ...(!guestInviteOnly && guestPhone ? [guestPhone] : []),
        ...teamPhones,
    ])].filter(Boolean);

    const propertyImageBase64 = await getPropertyImageBase64(property || '');
    const warnings: string[] = [];

    await randSleep(1000, 3000);
    console.log(`✅ Execute group creation (${lead_uid})`);
    console.log(`👥 Creating group: ${groupName} (${allParticipants.length} participants)`);
    buildStarted({ leadUid: lead_uid, guestName: guest_name, property, groupName });

    let groupId: string;
    try {
        const res = await evoApi.post(`/group/create/${INSTANCE}`, {
            subject: groupName,
            participants: allParticipants,
        });
        console.log('📦 groupCreate raw response:', JSON.stringify(res.data));
        groupId = res.data?.groupJid || res.data?.id || res.data?.data?.groupJid || res.data?.data?.id;
        if (!groupId) throw new Error('No groupJid in response: ' + JSON.stringify(res.data));
    } catch (e: any) {
        console.error('❌ groupCreate failed:', e?.message);
        throw e;
    }
    recordGroupCreated();
    buildGroupId(lead_uid, groupId);
    buildStep(lead_uid, 'create', 'done', `${allParticipants.length} participants`);
    buildStep(lead_uid, 'settings', 'active');

    // 1–2 min: let WA register the new group before any settings changes
    console.log(`⏳ Waiting 1–2 min before group settings (${lead_uid})...`);
    await randSleep(60000, 120000);

    try {
        await evoApi.post(`/group/updateSetting/${INSTANCE}`,
            { groupJid: groupId, action: 'not_announcement' }
        );
        console.log(`✅ Group set to non-announcement`);
        await randSleep(25000, 50000);
    } catch (e: any) {
        console.warn('⚠️ Could not set group to non-announcement:', e?.message);
        warnings.push(`non-announcement: ${e?.message || 'unknown error'}`);
    }

    try {
        await evoApi.post(`/group/updateSetting/${INSTANCE}`,
            { groupJid: groupId, action: 'unlocked' }
        );
        console.log(`✅ Group invite link enabled for all participants`);
        await randSleep(25000, 50000);
    } catch (e: any) {
        console.warn('⚠️ Could not enable invite link for all participants:', e?.message);
        warnings.push(`invite-link: ${e?.message || 'unknown error'}`);
    }

    try {
        await evoApi.post(`/group/updateSetting/${INSTANCE}`,
            { groupJid: groupId, action: 'member_add_all' }
        );
        console.log(`✅ All members can add others`);
        await randSleep(25000, 50000);
    } catch (e: any) {
        console.warn('⚠️ Could not set member_add_all:', e?.message);
        warnings.push(`member-add-all: ${e?.message || 'unknown error'}`);
    }

    try {
        await evoApi.post(`/group/updateSetting/${INSTANCE}`,
            { groupJid: groupId, action: 'join_approval_off' }
        );
        console.log(`✅ Invite link joins do not require admin approval`);
        await randSleep(25000, 50000);
    } catch (e: any) {
        console.warn('⚠️ Could not disable join approval:', e?.message);
        warnings.push(`join-approval: ${e?.message || 'unknown error'}`);
    }

    // 3–5 min more: let the group fully stabilize before any participant writes
    buildStep(lead_uid, 'settings', warnings.length ? 'warn' : 'done', warnings.length ? warnings.join('; ') : undefined);
    buildStep(lead_uid, 'stabilize', 'active');
    console.log(`⏳ Waiting 3–5 min before admin promotion (${lead_uid})...`);
    await randSleep(180000, 300000);
    buildStep(lead_uid, 'stabilize', 'done');
    buildStep(lead_uid, 'admins', 'active');

    // PRIORITY 1: Promote staff to admin — verify after each attempt, retry until confirmed
    const staffLids = getStaffWhatsAppLids();
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
            await evoApi.post(`/group/updateParticipant/${INSTANCE}`, {
                groupJid: groupId,
                action: 'promote',
                participants: staffNotAdmin,
            });
            console.log(`👑 Staff promote attempt ${attempt}: called for ${staffNotAdmin.length} member(s)`);
        } catch (e: any) {
            console.warn(`⚠️ Staff promote attempt ${attempt} API error:`, e?.message);
        }
        // Verify — wait with jitter then re-fetch to see who is actually admin now
        await randSleep(8000, 12000);
        try {
            const verRes = await evoApi.get(`/group/participants/${INSTANCE}`, { params: { groupJid: groupId } });
            const verParts: any[] = verRes.data?.participants || [];
            const confirmedAdminBases = new Set(
                verParts
                    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                    .map(p => (p.id || '').replace(/@.*$/, ''))
            );
            staffNotAdmin = staffNotAdmin.filter(lid => !confirmedAdminBases.has(lid.replace(/@.*$/, '')));
            console.log(`✅ Staff admin check (attempt ${attempt}): ${staffNotAdmin.length} still not admin`);
        } catch (e: any) {
            console.warn(`⚠️ Could not verify staff admin status (attempt ${attempt}):`, e?.message);
        }
    }

    if (staffNotAdmin.length > 0) {
        const msg = `${staffNotAdmin.length} staff member(s) still not admin after ${STAFF_MAX_ATTEMPTS} attempts`;
        console.error(`❌ ${msg}`);
        warnings.push(`staff promote: ${msg}`);
        sendAlert(
            `🚨 <b>Staff Not Made Admin — Action Required</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            `📋 <b>Action needed:</b> Group Info → Group Admins → Make Admin for all staff\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { propertyCode: propertyCodeFromName(property) || undefined }
        ).catch(() => {});
    } else if (staffLids.length > 0) {
        console.log(`✅ All ${staffLids.length} staff confirmed admin`);
    }
    await sleep(5000);

    // PRIORITY 2: Promote guest to admin — retry loop mirrors staff pattern.
    // Skipped in invite-only mode: the guest isn't in the group yet (they join via link later),
    // so there's nobody to promote here. Their admin rights are handled on join (see below).
    const GUEST_MAX_ATTEMPTS = 2;
    let guestPromoted = false;

    for (let attempt = 1; !guestInviteOnly && attempt <= GUEST_MAX_ATTEMPTS && !guestPromoted; attempt++) {
        if (attempt > 1) {
            const delay = attempt === 2 ? randSleep(30000, 40000) : randSleep(45000, 60000);
            console.log(`⏳ Guest promote attempt ${attempt} — backing off before retry...`);
            await delay;
        }
        try {
            const partRes = await evoApi.get(`/group/participants/${INSTANCE}`, { params: { groupJid: groupId } });
            const participants: any[] = partRes.data?.participants || [];

            const guestToPromote: string[] = [];
            for (const p of participants) {
                const lidBase = (p.id || '').replace(/@.*$/, '');
                if (lidBase === '234325463273604' || staffLidBases.has(lidBase) || p.admin === 'superadmin' || p.admin === 'admin') continue;
                guestToPromote.push(p.id);
            }

            if (!guestToPromote.length) {
                console.log(`ℹ️ Guest promote attempt ${attempt}: guest not yet in group — will retry`);
                continue;
            }

            await evoApi.post(`/group/updateParticipant/${INSTANCE}`, {
                groupJid: groupId,
                action: 'promote',
                participants: guestToPromote,
            });

            await randSleep(8000, 12000);
            const verRes = await evoApi.get(`/group/participants/${INSTANCE}`, { params: { groupJid: groupId } });
            const verParts: any[] = verRes.data?.participants || [];
            const confirmedAdminBases = new Set(
                verParts
                    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                    .map(p => (p.id || '').replace(/@.*$/, ''))
            );
            const stillNotAdmin = guestToPromote.filter(id => !confirmedAdminBases.has(id.replace(/@.*$/, '')));
            if (stillNotAdmin.length === 0) {
                console.log(`✅ Guest promoted to admin (attempt ${attempt})`);
                guestPromoted = true;
            } else {
                console.warn(`⚠️ Guest promote attempt ${attempt}: ${stillNotAdmin.length} still not admin`);
            }
        } catch (e: any) {
            const detail = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : '';
            console.warn(`⚠️ Guest promote attempt ${attempt} error:`, e?.message, detail);
        }
    }
    await sleep(5000);
    buildStep(lead_uid, 'admins',
        staffNotAdmin.length > 0 ? 'warn' : 'done',
        staffNotAdmin.length > 0 ? `${staffNotAdmin.length} staff still not admin` : undefined);

    if (propertyImageBase64) {
        // Fully deferred — fires 30–45 minutes after group creation, well after all messages are sent
        const capturedGroupId = groupId;
        const capturedImage = propertyImageBase64;
        const capturedLeadUid = lead_uid;
        sleep(1800000 + Math.floor(Math.random() * 900000)).then(() =>
            evoApi.post(`/group/updateGroupPicture/${INSTANCE}`,
                { groupJid: capturedGroupId, image: capturedImage },
                { timeout: 30000 }
            )
        ).then(() => {
            console.log(`✅ Group icon set (deferred): ${capturedGroupId}`);
            buildStepLate(capturedLeadUid, 'icon', 'done');
        }).catch((e: any) => {
            console.warn('⚠️ Could not set group icon (deferred):', e?.message);
            buildStepLate(capturedLeadUid, 'icon', 'warn', e?.message);
        });
    } else {
        buildStep(lead_uid, 'icon', 'warn', 'no property image found — set manually');
    }

    if (lead_uid) {
        linkGroup(groupId, lead_uid);
        saveGroupName(groupId, groupName);
        leadCooldown.set(lead_uid, Date.now());
        detectGuestLanguage(guest_name, guestPhone).then(lang => {
            saveGroupLang(groupId, lang);
            console.log(`🌐 Group lang detected [auto-create]: ${lang} → ${groupId}`);
        }).catch(() => {});
        console.log(`🔗 Auto-linked: ${groupId} → ${lead_uid}`);
        await sendAlert(
            `👥 <b>WhatsApp Group Created</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            (guestPhone ? `📱 <b>Phone:</b> +${guestPhone}\n` : '') +
            `🏠 <b>Property:</b> ${property}\n` +
            `🔑 <b>Lead UID:</b> <code>${lead_uid}</code>\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            `⏱️ Welcome messages will arrive in the group within ~30 min (slow-paced on purpose)\n` +
            `💬 Please send a message in the group today to keep it active\n` +
            `─────────────────\n` +
            (staffNotAdmin.length === 0
                ? `👑 <b>Admin access: ACTIVE</b> — staff are admins & "all members can add others" is on.\n` +
                  `🤝 You can now <b>manually add the guest's family/friends</b> — human touch encouraged!\n`
                : `⚠️ <b>Admin access: ${staffLids.length - staffNotAdmin.length}/${staffLids.length} staff</b> — some still pending, check Group Info.\n`) +
            `🤖 <i>COZMO stays in the group and keeps monitoring updates</i>\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { useTestJandi: CONFIG.IS_APP_DEV, propertyCode: propertyCodeFromName(property) || undefined }
        );
        buildStep(lead_uid, 'link', 'done');
    }
    buildStep(lead_uid, 'welcome', 'active', 'quiet cooldown 8–15 min, then messages 2–5 min apart');

    // Enqueue BEFORE sending — if server restarts mid-sleep sequence, messages retry on next reconnect
    const pendingMeta: PendingMeta = {
        guestName: guest_name,
        phone: guestPhone,
        property,
        guestOnWA,
        checkIn: formatSeoulDate(check_in),
        checkOut: formatSeoulDate(check_out),
    };
    enqueue(groupId, nationality, `${guest_name} @ ${property}`, pendingMeta);

    const sent = await sendBookingMessages(groupId, { nationality, guestName: guest_name, property }, warnings);
    if (sent) {
        dequeue(groupId);
        markSent(groupId, 'welcome');
        buildStep(lead_uid, 'welcome', 'done');
        addToReplyWatchdog(groupId, guest_name, property, groupName);
        if (lead_uid) scheduleReminder(groupId, lead_uid);
    } else {
        buildStep(lead_uid, 'welcome', 'warn', 'queued — will send when WA reconnects');
        await sendAlert(
            `⏳ <b>Messages Queued for Retry</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n<i>Will send when WA reconnects · COZMO</i>`,
            { telegramOnly: true }
        );
    }

    if (warnings.length) {
        await sendAlert(
            `⚠️ <b>Group Setup — Partial Failures</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name}\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            warnings.map(w => `• ${w}`).join('\n') + '\n' +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { telegramOnly: true }
        );
    }

    // Check if guest is in the group — by now WA has had ample time to add them
    let guestInGroup = false;
    let guestIsAdmin = false;
    if (guestPhone) {
        try {
            const partRes = await evoApi.get(`/group/participants/${INSTANCE}`, { params: { groupJid: groupId } });
            const parts: any[] = partRes.data?.participants || [];
            const allLids = parts.length > 0 && parts.every((p: any) => (p.id || '').endsWith('@lid'));
            if (allLids) {
                // Can't match guest by phone when all IDs are LIDs — assume ok to avoid false alarms
                guestInGroup = guestOnWA;
                guestIsAdmin = guestOnWA;
            } else {
                const guestPart = parts.find((p: any) => {
                    const pid = (p.id || '').replace(/@.*$/, '').replace(/\D/g, '');
                    return pid === guestPhone;
                });
                guestInGroup = !!guestPart;
                guestIsAdmin = !!(guestPart && (guestPart.admin === 'admin' || guestPart.admin === 'superadmin'));
            }
            console.log(`ℹ️ Guest in group: ${guestInGroup}, admin: ${guestIsAdmin} (phone: ${guestPhone}, allLids: ${allLids})`);
        } catch (e: any) {
            console.warn('⚠️ Could not verify guest in participants:', e?.message);
            guestInGroup = guestOnWA;
            guestIsAdmin = guestOnWA;
        }
    }

    if (guestPhone && !guestInGroup) {
        const phone = `+${guestPhone}`;
        console.log(guestInviteOnly
            ? `🔗 Invite-only: sending join link to guest ${guest_name} (${phone})`
            : `⚠️ Guest not in group: ${guest_name} (${phone})`);

        // Fetch invite link once — reused for DM, alert, and HF inbox
        const inviteLink = await getGroupInviteLink(groupId).catch(() => null);

        if (CONFIG.SEND_GUEST_INVITE_DM && inviteLink) {
            await evoSendText(guestPhone,
                `Hi ${guest_name}! 👋 Your private COZE Hospitality concierge channel is ready.\n\nTap to join us here:\n${inviteLink}\n\nOnce you're in, just say hello and our team will take care of everything for your stay. 🌿\n\n— COZMO AI | Guest Care Team | COZE Hospitality 3.0`
            ).catch((e: any) => console.warn('⚠️ Could not send invite link to guest:', e?.message));
        }

        await sendAlert(
            (guestInviteOnly ? `🔗 <b>Guest Invite Link Sent</b>` : `⚠️ <b>Guest Not Added to Group</b>`) +
            `\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name} (${phone})\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            (inviteLink && CONFIG.SEND_GUEST_INVITE_DM
                ? `🔗 <b>Join link sent</b> — guest opts in (privacy-safe, no force-add)\n` +
                  `🤝 If they haven't joined in a while, a quick personal nudge helps\n`
                : `📋 <b>Action needed:</b> send guest the group invite link manually\n`) +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { propertyCode: propertyCodeFromName(property) || undefined }
        ).catch(() => {});

        // Send invite link via HF inbox — with actual link if available, template-only otherwise
        if (lead_uid) {
            if (inviteLink) {
                sendHfInviteLink(lead_uid, guest_name, inviteLink).catch((e: any) =>
                    console.warn('⚠️ sendHfInviteLink failed:', e?.message)
                );
            } else {
                sendWaInviteFallbackMessage(lead_uid, guest_name).catch((e: any) =>
                    console.warn('⚠️ sendWaInviteFallbackMessage failed:', e?.message)
                );
            }
        }
    }

    if (guestPhone && guestInGroup && !guestIsAdmin) {
        console.warn(`⚠️ Guest in group but not promoted to admin: ${guest_name} (+${guestPhone})`);
        await sendAlert(
            `⚠️ <b>Guest Not Made Admin in Group</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${guest_name} (+${guestPhone})\n` +
            `🏠 <b>Property:</b> ${property}\n` +
            `🆔 <b>Group ID:</b> <code>${groupId}</code>\n` +
            `─────────────────\n` +
            `📋 <b>Action needed:</b> Group Info → Group Admins → Make Admin for ${guest_name}\n` +
            `💡 Guest cannot add family/friends without admin rights\n` +
            `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
            { propertyCode: propertyCodeFromName(property) || undefined }
        ).catch(() => {});
        if (lead_uid) {
            saveGuestNote(lead_uid,
                `[COZMO] Could not promote ${guest_name} to admin in WhatsApp group (${groupId}). ` +
                `Please open the group → Group Info → Make Admin for the guest. ` +
                `Without admin rights the guest cannot add family or friends.`
            ).catch((e: any) => console.warn('⚠️ saveGuestNote (admin fail) failed:', e?.message));
        }
    }

    console.log(`✅ Group created: ${groupName}`);
    buildFinished(lead_uid);
    return groupId;
}

let flushing = false;
export async function flushPendingMessages(): Promise<void> {
    if (flushing) return;
    const pending = getPending();
    if (!pending.length) return;

    flushing = true;
    console.log(`🔄 Flushing ${pending.length} pending message job(s)...`);
    try {
        for (const job of pending) {
            if (isSent(job.groupId, 'welcome')) {
                console.log(`⏭️ Already welcomed — skipping queue entry: ${job.groupId} (${job.label})`);
                dequeue(job.groupId);
                continue;
            }
            const warnings: string[] = [];
            incrementAttempts(job.groupId);
            console.log(`📤 Retrying messages for ${job.groupId} (${job.label}, attempt ${job.attempts + 1})`);
            const sent = await sendBookingMessages(job.groupId, {
                nationality: job.nationality,
                skipInitialDelay: true,
                guestName: job.meta?.guestName,
                property: job.meta?.property,
            }, warnings);
            if (sent) {
                dequeue(job.groupId);
                markSent(job.groupId, 'welcome');
                if (job.meta) addToReplyWatchdog(job.groupId, job.meta.guestName, job.meta.property);
                console.log(`✅ Pending messages delivered: ${job.groupId}`);
                await sendAlert(
                    `✅ <b>Queued Messages Delivered</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${job.label}\n` +
                    `🆔 <b>Group:</b> <code>${job.groupId}</code>\n` +
                    `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                    { telegramOnly: true }
                );
            } else {
                console.warn(`⚠️ Still can't send to ${job.groupId} — will retry next reconnect`);
                await sendAlert(
                    `⚠️ <b>Messages Still Pending</b>\n─────────────────\n` +
                    `👤 <b>Guest:</b> ${job.label}\n` +
                    `🆔 <b>Group:</b> <code>${job.groupId}</code>\n` +
                    `─────────────────\n<i>Will retry on next WA reconnect · COZMO</i>`,
                    { telegramOnly: true }
                ).catch(() => {});
            }
            if (warnings.length) {
                console.warn(`⚠️ Flush warnings for ${job.groupId}:`, warnings.join(', '));
            }
        }
    } finally {
        flushing = false;
    }
}
