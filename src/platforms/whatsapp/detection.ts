import fs   from 'fs';
import path from 'path';
import { CONFIG } from '../../config/constants';
import { getLeadUid, saveGroupLang, getGroupLang } from '../../services/groupLeads';
import { getTeamNumbers, getTeamNames } from '../../services/sheets';
import { fetchLead, saveGuestNote, resolvePropertyNameForLead } from '../../services/hostfully';
import { propertyCodeFromName } from './groupNaming';
import { sendAlert } from '../../services/notify';
import { detectGuestIntentWithContext } from '../../services/requestDetection';
import { isWaReady, fetchGroupName } from './evoClient';
import { guestName } from '../../utils/format';
import { handleLinkCommand, handleWelcomeCommand, handleGroupCommand, handleCkoutCommand, handleCkinCommand } from './commands';
import { handleUngroupCommand } from './groupCleanup';
import { handleExpCommand } from '../../services/expenses';
import { getStoredGroupName } from '../../services/groupLeads';
import { evoSendText, evoSendTyping } from './evoClient';
import { hasPendingReminder, cancelReminder } from '../../services/groupReminders';
import { detectGroupRejection } from '../../services/llm';
import { isLeadExpired, getBookingByLeadUid, getBookingByPhone } from '../../services/bookingStore';
import { addToBuffer } from '../../services/messageBuffer';
import { markReplied } from '../../services/replyWatchdog';
import { LANG_MAP, groupGuestLang, groupTranslationOn, handleWaTranslation, isWaStaff } from './translation';
import { runAutoReplyPipeline, shouldAttemptAutoReply } from '../../knowledge/autoReplyPipeline';

const INSTANCE_OWNER_PHONE = '821026226935';
const CANCELLATION_HINT_REGEX =
    /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now)\b/i;
const STAFF_SIGNATURE_REGEX = /guest care team|coze hospitality|cozmo ai/i;
const DM_GREETING_REGEX = /^\s*(hi|hello|hey|good morning|good afternoon|good evening)\s*[!.?]*\s*$/i;

const groupDebounce = new Map<string, number>();
// Staff can DM /testproperty BS to set property context for their test session.
// Cleared on /testproperty clear or when bridge restarts.
const dmTestProperty = new Map<string, string>(); // dmJid → propertyCode
// Tracks the last auto-reply per DM so /fix has context for the correction.
const dmLastReply = new Map<string, { question: string; reply: string }>();

const LEARNING_INBOX = path.join(process.cwd(), 'docs', 'ai-learning-inbox.md');

function saveDmFix(dmJid: string, correction: string, last: { question: string; reply: string } | undefined, propertyCode?: string) {
    try {
        if (!fs.existsSync(path.dirname(LEARNING_INBOX))) fs.mkdirSync(path.dirname(LEARNING_INBOX), { recursive: true });
        if (!fs.existsSync(LEARNING_INBOX)) {
            fs.writeFileSync(LEARNING_INBOX, '# AI Learning Inbox\n\nCorrections from staff DM testing. Review before promoting into `knowledge-base.json`.\n\n');
        }
        fs.appendFileSync(LEARNING_INBOX, [
            `## ${new Date().toISOString()}`,
            '',
            `- Source: WhatsApp DM /fix`,
            `- DM: ${dmJid}`,
            `- Property: ${propertyCode || 'not set'}`,
            `- Guest message: ${last?.question || '(not captured)'}`,
            `- COZMO reply: ${last?.reply || '(not captured)'}`,
            `- Correction: ${correction}`,
            `- Status: pending KB review`,
            '',
        ].join('\n'));
    } catch (e: any) {
        console.error('❌ saveDmFix failed:', e?.message);
    }
}

function normalizeWaDmJid(jid: string): string {
    const phone = jid.replace(/@.*$/, '').replace(/\D/g, '');
    return phone ? `${phone}@c.us` : jid;
}

function waSendTarget(jid: string): string {
    return jid.endsWith('@g.us') ? jid : jid.replace(/@.*$/, '').replace(/\D/g, '');
}

export async function handleIncomingMessage(data: any) {
    const key = data.key || {};
    if (!isWaReady()) return;

    const from: string = key.remoteJid || '';
    if (!from) return;
    const remoteJidAlt: string = key.remoteJidAlt || data.remoteJidAlt || '';

    // Skip outgoing messages — except self-DM (COZMO chatting with itself).
    // WhatsApp's LID addressing means remoteJid may be a LID ("...@lid") with the real number only
    // in remoteJidAlt — match on the normalized phone number, not an exact JID string, so this
    // still works across @c.us / @s.whatsapp.net / @lid delivery formats.
    const isSelfDm = (remoteJidAlt || from).replace(/@.*$/, '').replace(/\D/g, '') === INSTANCE_OWNER_PHONE;
    if (data.key?.fromMe && !isSelfDm) return;

    const text: string =
        data.message?.conversation ||
        data.message?.extendedTextMessage?.text ||
        data.message?.imageMessage?.caption ||
        '';
    if (!text) return;

    const isGroup = from.endsWith('@g.us');
    const dmJid = !isGroup ? normalizeWaDmJid(remoteJidAlt || from) : from;
    const replyTo = isGroup ? from : waSendTarget(dmJid);
    const participantPhone = (data.participant || data.key?.participant || (!isGroup ? dmJid : '')).split('@')[0];
    const isOwnerMessage =
        participantPhone === INSTANCE_OWNER_PHONE ||
        data.pushName === 'COZMO AI' ||
        participantPhone === '234325463273604'; // COZMO's LID

    const senderJid: string = isGroup ? (data.participant || key.participant || '') : dmJid;

    addToBuffer(isGroup ? from : dmJid, data.pushName || senderJid, text);

    // Human posted in a group → let the step watcher check (debounced) whether a team member
    // just completed a lifecycle step manually, so COZMO can checkmark it and not re-send.
    if (isGroup && !isOwnerMessage) {
        import('../../services/stepWatcher')
            .then(m => m.noteGroupActivity(from))
            .catch(() => {});
    }

    // /link command
    if (text.startsWith('/link ')) {
        const parts = text.trim().split(/\s+/);
        const uid = parts[1];
        const sendWelcome = parts[2]?.toLowerCase() === 'welcome';
        await handleLinkCommand(from, uid, sendWelcome ? { senderJid, pushName: data.pushName || '' } : undefined);
        return;
    }

    // /ckin command — manually send check-in tips + rules to this group
    if (text.startsWith('/ckin')) {
        await handleCkinCommand(from, senderJid);
        return;
    }

    // /ckout command — send checkout instructions to this group
    if (text.startsWith('/ckout')) {
        await handleCkoutCommand(from, senderJid, text);
        return;
    }

    // /welcome command — team members only
    if (text.startsWith('/welcome')) {
        await handleWelcomeCommand(from, senderJid, data.pushName || '');
        return;
    }

    // /ungroup command — team members only, wipe local state for a group so /group can recreate
    if (text.startsWith('/ungroup')) {
        const arg = text.split(/\s+/)[1]?.trim() || '';
        await handleUngroupCommand(from, arg, senderJid);
        return;
    }

    // /group command — team members only, manual group creation for existing bookings
    if (text.startsWith('/group')) {
        const uid = text.split(/\s+/)[1]?.trim();
        await handleGroupCommand(from, uid, senderJid, data.pushName || '');
        return;
    }

    // /trans command — bidirectional translation (staff only, group only)
    if (text.startsWith('/trans')) {
        if (!isGroup) return;
        if (!isWaStaff(senderJid)) {
            await evoSendText(from, '❌ Only team members can use /trans').catch(() => {});
            return;
        }
        const arg = text.split(' ')[1]?.toLowerCase().trim();
        if (!arg) {
            const cur = groupGuestLang.get(from);
            const on = groupTranslationOn.get(from) !== false;
            await evoSendText(from, `Translation: ${cur ? `${cur} (${on ? 'ON' : 'OFF'})` : 'not set'}`).catch(() => {});
        } else if (arg === 'off') {
            groupTranslationOn.set(from, false);
            await evoSendText(from, 'Translation paused. /trans on to resume.').catch(() => {});
        } else if (arg === 'on') {
            groupTranslationOn.set(from, true);
            const lang = groupGuestLang.get(from);
            await evoSendText(from, lang ? `Translation resumed: ${lang}` : 'No language set. Use /trans cn first.').catch(() => {});
        } else {
            const newLang = LANG_MAP[arg];
            if (newLang) {
                groupGuestLang.set(from, newLang);
                groupTranslationOn.set(from, true);
                saveGroupLang(from, newLang);
                await evoSendText(from, `Translation set: ${newLang}`).catch(() => {});
                console.log(`🌐 WA /trans [${newLang}] | group=${from}`);
            } else {
                await evoSendText(from, 'Unknown language. Use: cn, tw, jp, th, en').catch(() => {});
            }
        }
        return;
    }

    // /exp command — expense logging
    if (text.startsWith('/exp')) {
        const groupName = getStoredGroupName(from) || await fetchGroupName(from) || from;
        await handleExpCommand(
            'whatsapp',
            from,
            groupName,
            senderJid,
            getLeadUid(from),
            text,
            async (msg) => evoSendText(from, msg)
        );
        return;
    }

    // /fix — DM only, saves a correction to the AI learning inbox for KB review
    if (!isGroup && text.startsWith('/fix ')) {
        const correction = text.slice(5).trim();
        if (correction) {
            saveDmFix(dmJid, correction, dmLastReply.get(dmJid), dmTestProperty.get(dmJid));
            await evoSendText(replyTo, '✅ Noted. Saved for KB review.\nThe team can promote this into the knowledge base from docs/ai-learning-inbox.md').catch(() => {});
        }
        return;
    }

    // /testproperty — DM only, sets KB scope for staff test sessions
    if (!isGroup && text.startsWith('/testproperty')) {
        const arg = text.split(/\s+/)[1]?.toUpperCase().trim();
        if (!arg) {
            const current = dmTestProperty.get(dmJid);
            await evoSendText(replyTo, current
                ? `🧪 Test property: ${current}\nSend /testproperty clear to reset.`
                : '🧪 No test property set.\nSend /testproperty BS (or SG, JT, HT, etc.) to scope KB replies.'
            ).catch(() => {});
        } else if (arg === 'CLEAR' || arg === 'OFF') {
            dmTestProperty.delete(dmJid);
            await evoSendText(replyTo, '🧪 Test property cleared.').catch(() => {});
        } else {
            dmTestProperty.set(dmJid, arg);
            await evoSendText(replyTo, `🧪 Test property set to *${arg}*. COZMO will now reply using ${arg}-scoped knowledge.`).catch(() => {});
        }
        return;
    }

    if (isOwnerMessage && !isSelfDm) return;

    // Any non-COZMO message in a group clears the reply watchdog for that group
    if (isGroup) markReplied(from);

    // Bidirectional translation (if enabled for this group)
    if (isGroup) {
        if (!groupGuestLang.has(from)) {
            const persisted = getGroupLang(from);
            if (persisted) {
                groupGuestLang.set(from, persisted as any);
                // WA translation defaults OFF — staff must run /trans <lang> to enable
            }
        }
        const guestLang = groupGuestLang.get(from);
        if (guestLang && groupTranslationOn.get(from) === true) {
            handleWaTranslation(from, text, senderJid, guestLang).catch(e =>
                console.error('❌ WA translation error:', e?.message)
            );
        }
    }

    const isCancellationHint = CANCELLATION_HINT_REGEX.test(text);

    // Per-group debounce (allow immediate cancellation messages).
    // Personal DMs must process each message because guests often clarify in quick bursts.
    const now = Date.now();
    const lastProcessed = groupDebounce.get(from) || 0;
    if (isGroup) {
        if (!isCancellationHint && now - lastProcessed < 30000) return;
        groupDebounce.set(from, now);
    }

    const [teamNumbers, teamNames] = await Promise.all([getTeamNumbers(), getTeamNames()]);
    const senderPhone = senderJid ? '+' + senderJid.split('@')[0].replace(/\D/g, '') : '';
    const senderName = (data.pushName || '').trim().toLowerCase();
    const isTeamPhone = !CONFIG.IS_APP_DEV && senderPhone && teamNumbers.includes(senderPhone);
    const isTeamName = senderName && teamNames.some(n => senderName.includes(n) || n.includes(senderName));
    const isTeamMember = !!(isTeamPhone || isTeamName);
    if (isGroup && isTeamMember) {
        if (hasPendingReminder(from)) cancelReminder(from, 'team member active in group');
        console.log(`⏭️ Skipping team member message in group (phone=${isTeamPhone}, name=${isTeamName})`);
        return;
    }

    // Guest replied — cancel the follow-up reminder
    if (isGroup && hasPendingReminder(from)) {
        cancelReminder(from, 'guest replied');
    }

    const personalBooking = !isGroup ? getBookingByPhone(dmJid) : undefined;
    const lead_uid = getLeadUid(from) || (!isGroup ? getLeadUid(dmJid) : null) || personalBooking?.leadUid || null;
    const isStaffTest = !lead_uid && !isGroup && isTeamMember;
    if (!lead_uid) {
        // Staff DM with no guest booking → allow as test run (no HF note will be saved)
        if (isStaffTest) {
            console.log(`🧪 Staff DM test mode — no booking for ${dmJid}, alerts → dev channel`);
        } else {
            if (!isGroup) console.log(`⏭️ WA DM auto-reply skipped: no active booking matched ${dmJid}`);
            return;
        }
    }
    if (lead_uid && isLeadExpired(lead_uid)) return;

    if (!isGroup && DM_GREETING_REGEX.test(text)) {
        await evoSendText(replyTo, 'Hello 😊').catch(e =>
            console.error('❌ WA DM greeting reply failed:', e?.message)
        );
        return;
    }

    if (data.message?.extendedTextMessage?.contextInfo?.quotedMessage) return;

    if (STAFF_SIGNATURE_REGEX.test(text)) {
        console.log('⏭️ Skipping staff-signed message');
        return;
    }

    const { result, usedHistoryFallback, saveToHostfully } = await detectGuestIntentWithContext({
        platform: 'whatsapp',
        sourceId: isGroup ? from : dmJid,
        text,
        senderName: data.pushName || '',
        isCancellationHint,
    });

    console.log(`🧠 detectGuestIntent result: "${result}" | fallback: ${usedHistoryFallback}`);

    if (usedHistoryFallback && result) {
        console.log(`🧠 WhatsApp history fallback matched | group=${from} | result=${result.slice(0, 80)}`);
    }
    if (!result) {
        console.log(`⏭️ No result from detectGuestIntent for: "${text}"`);
        const booking = lead_uid ? getBookingByLeadUid(lead_uid) : undefined;
        const bookingPropertyCode = booking?.property ? propertyCodeFromName(booking.property) ?? undefined : undefined;
        const propertyCode = (isStaffTest ? dmTestProperty.get(dmJid) : undefined) ?? bookingPropertyCode;

        if (!isGroup && shouldAttemptAutoReply(text, propertyCode)) {
            runAutoReplyPipeline({
                leadUid: lead_uid || '',
                platform: 'whatsapp',
                guestMessage: text,
                propertyCode,
                sourceId: dmJid,
                testMode: isStaffTest,
                bypassFlagCheck: CONFIG.ENABLE_WA_DM_AUTO_REPLY,
                sendReply: async (reply) => {
                    await evoSendText(replyTo, reply);
                    dmLastReply.set(dmJid, { question: text, reply });
                },
            }).catch(e => console.error('❌ WA auto-reply pipeline error:', e?.message));
        }
        return;
    }

    try {
        const lead = lead_uid ? await fetchLead(lead_uid) : null;
        const info = lead?.guestInformation;
        const guest_name = guestName(info);

        const today = new Date();
        const checkIn = lead?.checkInLocalDateTime ? new Date(lead.checkInLocalDateTime) : null;
        const isPostCheckIn = checkIn && today >= checkIn;
        if (lead_uid && saveToHostfully && !isPostCheckIn) await saveGuestNote(lead_uid, result);

        const propertyName = await resolvePropertyNameForLead(lead);
        const resolvedPropertyCode = propertyCodeFromName(propertyName) || undefined;
        const propertyCode = (isStaffTest ? dmTestProperty.get(dmJid) : undefined) ?? resolvedPropertyCode;

        const alertOpts = { propertyCode, ...(isStaffTest ? { useTestJandi: true, telegramOnly: true } : {}) };
        if (result.startsWith('CANCELLED:')) {
            const cancelledText = (result.replace(/^CANCELLED:\s*/i, '').trim() || 'Previous request').slice(0, 200);
            await sendAlert(
                `🚫 <b>Request Cancelled</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${propertyName}\n` +
                `📋 <b>Cancelled:</b> ${cancelledText}\n` +
                `📱 <b>Platform:</b> WhatsApp\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                alertOpts
            );
        } else {
            await sendAlert(
                `💬 <b>Guest Request Detected</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${propertyName}\n` +
                `📋 <b>Request:</b> ${result}\n` +
                `📱 <b>Platform:</b> WhatsApp\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
                alertOpts
            );
            if (!isGroup) runAutoReplyPipeline({
                leadUid: lead_uid || '',
                platform: 'whatsapp',
                guestMessage: text,
                propertyCode,
                sourceId: dmJid,
                testMode: isStaffTest,
                bypassFlagCheck: CONFIG.ENABLE_WA_DM_AUTO_REPLY,
                sendReply: async (reply) => {
                    await evoSendText(replyTo, reply);
                    dmLastReply.set(dmJid, { question: text, reply });
                },
            }).catch(e => console.error('❌ WA auto-reply pipeline error:', e?.message));
        }
    } catch (e: any) {
        console.error('❌ Message handler error:', e?.message);
    }
}
