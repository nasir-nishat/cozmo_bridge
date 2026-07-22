"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIncomingMessage = handleIncomingMessage;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../config/constants");
const groupLeads_1 = require("../../services/groupLeads");
const sheets_1 = require("../../services/sheets");
const hostfully_1 = require("../../services/hostfully");
const groupNaming_1 = require("./groupNaming");
const notify_1 = require("../../services/notify");
const requestDetection_1 = require("../../services/requestDetection");
const evoClient_1 = require("./evoClient");
const format_1 = require("../../utils/format");
const commands_1 = require("./commands");
const groupCleanup_1 = require("./groupCleanup");
const expenses_1 = require("../../services/expenses");
const groupLeads_2 = require("../../services/groupLeads");
const evoClient_2 = require("./evoClient");
const groupReminders_1 = require("../../services/groupReminders");
const bookingStore_1 = require("../../services/bookingStore");
const messageBuffer_1 = require("../../services/messageBuffer");
const replyWatchdog_1 = require("../../services/replyWatchdog");
const translation_1 = require("./translation");
const autoReplyPipeline_1 = require("../../knowledge/autoReplyPipeline");
// The phone number the Evolution instance is logged in as (COZMO's own number). Used to
// recognize self-DM ("Message Yourself") test messages and to skip the bot's own messages.
// Env-driven so it tracks whatever number is linked — MUST match the linked WhatsApp number.
const INSTANCE_OWNER_PHONE = (process.env.INSTANCE_OWNER_PHONE || '821097802701').replace(/\D/g, '');
const CANCELLATION_HINT_REGEX = /\b(no need|never mind|cancel|dont need|don't need|no thanks|it'?s okay|we can do it (?:ourselves|ourself)|we'?ll do it ourselves|all good now)\b/i;
const STAFF_SIGNATURE_REGEX = /guest care team|coze hospitality|cozmo ai/i;
const DM_GREETING_REGEX = /^\s*(hi|hello|hey|good morning|good afternoon|good evening)\s*[!.?]*\s*$/i;
const groupDebounce = new Map();
// Staff can DM /testproperty BS to set property context for their test session.
// Cleared on /testproperty clear or when bridge restarts.
const dmTestProperty = new Map(); // dmJid → propertyCode
// Tracks the last auto-reply per DM so /fix has context for the correction.
const dmLastReply = new Map();
const LEARNING_INBOX = path_1.default.join(process.cwd(), 'docs', 'ai-learning-inbox.md');
function saveDmFix(dmJid, correction, last, propertyCode) {
    try {
        if (!fs_1.default.existsSync(path_1.default.dirname(LEARNING_INBOX)))
            fs_1.default.mkdirSync(path_1.default.dirname(LEARNING_INBOX), { recursive: true });
        if (!fs_1.default.existsSync(LEARNING_INBOX)) {
            fs_1.default.writeFileSync(LEARNING_INBOX, '# AI Learning Inbox\n\nCorrections from staff DM testing. Review before promoting into `knowledge-base.json`.\n\n');
        }
        fs_1.default.appendFileSync(LEARNING_INBOX, [
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
    }
    catch (e) {
        console.error('❌ saveDmFix failed:', e?.message);
    }
}
function normalizeWaDmJid(jid) {
    const phone = jid.replace(/@.*$/, '').replace(/\D/g, '');
    return phone ? `${phone}@c.us` : jid;
}
function waSendTarget(jid) {
    return jid.endsWith('@g.us') ? jid : jid.replace(/@.*$/, '').replace(/\D/g, '');
}
async function handleIncomingMessage(data) {
    const key = data.key || {};
    if (!(0, evoClient_1.isWaReady)())
        return;
    const from = key.remoteJid || '';
    if (!from)
        return;
    const remoteJidAlt = key.remoteJidAlt || data.remoteJidAlt || '';
    // Skip outgoing messages — except self-DM (COZMO chatting with itself).
    // WhatsApp's LID addressing means remoteJid may be a LID ("...@lid") with the real number only
    // in remoteJidAlt — match on the normalized phone number, not an exact JID string, so this
    // still works across @c.us / @s.whatsapp.net / @lid delivery formats.
    const isSelfDm = (remoteJidAlt || from).replace(/@.*$/, '').replace(/\D/g, '') === INSTANCE_OWNER_PHONE;
    if (data.key?.fromMe && !isSelfDm)
        return;
    const text = data.message?.conversation ||
        data.message?.extendedTextMessage?.text ||
        data.message?.imageMessage?.caption ||
        '';
    if (!text)
        return;
    const isGroup = from.endsWith('@g.us');
    const dmJid = !isGroup ? normalizeWaDmJid(remoteJidAlt || from) : from;
    const replyTo = isGroup ? from : waSendTarget(dmJid);
    const participantPhone = (data.participant || data.key?.participant || (!isGroup ? dmJid : '')).split('@')[0];
    const isOwnerMessage = participantPhone === INSTANCE_OWNER_PHONE ||
        data.pushName === 'COZMO AI' ||
        participantPhone === '234325463273604'; // COZMO's LID
    const senderJid = isGroup ? (data.participant || key.participant || '') : dmJid;
    (0, messageBuffer_1.addToBuffer)(isGroup ? from : dmJid, data.pushName || senderJid, text);
    // Human posted in a group → let the step watcher check (debounced) whether a team member
    // just completed a lifecycle step manually, so COZMO can checkmark it and not re-send.
    if (isGroup && !isOwnerMessage) {
        Promise.resolve().then(() => __importStar(require('../../services/stepWatcher'))).then(m => m.noteGroupActivity(from))
            .catch(() => { });
    }
    // /link command
    if (text.startsWith('/link ')) {
        const parts = text.trim().split(/\s+/);
        const uid = parts[1];
        const sendWelcome = parts[2]?.toLowerCase() === 'welcome';
        await (0, commands_1.handleLinkCommand)(from, uid, sendWelcome ? { senderJid, pushName: data.pushName || '' } : undefined);
        return;
    }
    // /ckin command — manually send check-in tips + rules to this group
    if (text.startsWith('/ckin')) {
        await (0, commands_1.handleCkinCommand)(from, senderJid);
        return;
    }
    // /ckout command — send checkout instructions to this group
    if (text.startsWith('/ckout')) {
        await (0, commands_1.handleCkoutCommand)(from, senderJid, text);
        return;
    }
    // /welcome command — team members only
    if (text.startsWith('/welcome')) {
        await (0, commands_1.handleWelcomeCommand)(from, senderJid, data.pushName || '');
        return;
    }
    // /ungroup command — team members only, wipe local state for a group so /group can recreate
    if (text.startsWith('/ungroup')) {
        const arg = text.split(/\s+/)[1]?.trim() || '';
        await (0, groupCleanup_1.handleUngroupCommand)(from, arg, senderJid);
        return;
    }
    // /group command — team members only, manual group creation for existing bookings
    if (text.startsWith('/group')) {
        const uid = text.split(/\s+/)[1]?.trim();
        await (0, commands_1.handleGroupCommand)(from, uid, senderJid, data.pushName || '');
        return;
    }
    // /trans command — bidirectional translation (staff only, group only)
    if (text.startsWith('/trans')) {
        if (!isGroup)
            return;
        if (!(0, translation_1.isWaStaff)(senderJid)) {
            await (0, evoClient_2.evoSendText)(from, '❌ Only team members can use /trans').catch(() => { });
            return;
        }
        const arg = text.split(' ')[1]?.toLowerCase().trim();
        if (!arg) {
            const cur = translation_1.groupGuestLang.get(from);
            const on = translation_1.groupTranslationOn.get(from) !== false;
            await (0, evoClient_2.evoSendText)(from, `Translation: ${cur ? `${cur} (${on ? 'ON' : 'OFF'})` : 'not set'}`).catch(() => { });
        }
        else if (arg === 'off') {
            translation_1.groupTranslationOn.set(from, false);
            await (0, evoClient_2.evoSendText)(from, 'Translation paused. /trans on to resume.').catch(() => { });
        }
        else if (arg === 'on') {
            translation_1.groupTranslationOn.set(from, true);
            const lang = translation_1.groupGuestLang.get(from);
            await (0, evoClient_2.evoSendText)(from, lang ? `Translation resumed: ${lang}` : 'No language set. Use /trans cn first.').catch(() => { });
        }
        else {
            const newLang = translation_1.LANG_MAP[arg];
            if (newLang) {
                translation_1.groupGuestLang.set(from, newLang);
                translation_1.groupTranslationOn.set(from, true);
                (0, groupLeads_1.saveGroupLang)(from, newLang);
                await (0, evoClient_2.evoSendText)(from, `Translation set: ${newLang}`).catch(() => { });
                console.log(`🌐 WA /trans [${newLang}] | group=${from}`);
            }
            else {
                await (0, evoClient_2.evoSendText)(from, 'Unknown language. Use: cn, tw, jp, th, en').catch(() => { });
            }
        }
        return;
    }
    // /exp command — expense logging
    if (text.startsWith('/exp')) {
        const groupName = (0, groupLeads_2.getStoredGroupName)(from) || await (0, evoClient_1.fetchGroupName)(from) || from;
        await (0, expenses_1.handleExpCommand)('whatsapp', from, groupName, senderJid, (0, groupLeads_1.getLeadUid)(from), text, async (msg) => (0, evoClient_2.evoSendText)(from, msg));
        return;
    }
    // /fix — DM only, saves a correction to the AI learning inbox for KB review
    if (!isGroup && text.startsWith('/fix ')) {
        const correction = text.slice(5).trim();
        if (correction) {
            saveDmFix(dmJid, correction, dmLastReply.get(dmJid), dmTestProperty.get(dmJid));
            await (0, evoClient_2.evoSendText)(replyTo, '✅ Noted. Saved for KB review.\nThe team can promote this into the knowledge base from docs/ai-learning-inbox.md').catch(() => { });
        }
        return;
    }
    // /testproperty — DM only, sets KB scope for staff test sessions
    if (!isGroup && text.startsWith('/testproperty')) {
        const arg = text.split(/\s+/)[1]?.toUpperCase().trim();
        if (!arg) {
            const current = dmTestProperty.get(dmJid);
            await (0, evoClient_2.evoSendText)(replyTo, current
                ? `🧪 Test property: ${current}\nSend /testproperty clear to reset.`
                : '🧪 No test property set.\nSend /testproperty BS (or SG, JT, HT, etc.) to scope KB replies.').catch(() => { });
        }
        else if (arg === 'CLEAR' || arg === 'OFF') {
            dmTestProperty.delete(dmJid);
            await (0, evoClient_2.evoSendText)(replyTo, '🧪 Test property cleared.').catch(() => { });
        }
        else {
            dmTestProperty.set(dmJid, arg);
            await (0, evoClient_2.evoSendText)(replyTo, `🧪 Test property set to *${arg}*. COZMO will now reply using ${arg}-scoped knowledge.`).catch(() => { });
        }
        return;
    }
    if (isOwnerMessage && !isSelfDm)
        return;
    // Any non-COZMO message in a group clears the reply watchdog for that group
    if (isGroup)
        (0, replyWatchdog_1.markReplied)(from);
    // Bidirectional translation (if enabled for this group)
    if (isGroup) {
        if (!translation_1.groupGuestLang.has(from)) {
            const persisted = (0, groupLeads_1.getGroupLang)(from);
            if (persisted) {
                translation_1.groupGuestLang.set(from, persisted);
                // WA translation defaults OFF — staff must run /trans <lang> to enable
            }
        }
        const guestLang = translation_1.groupGuestLang.get(from);
        if (guestLang && translation_1.groupTranslationOn.get(from) === true) {
            (0, translation_1.handleWaTranslation)(from, text, senderJid, guestLang).catch(e => console.error('❌ WA translation error:', e?.message));
        }
    }
    const isCancellationHint = CANCELLATION_HINT_REGEX.test(text);
    // Per-group debounce (allow immediate cancellation messages).
    // Personal DMs must process each message because guests often clarify in quick bursts.
    const now = Date.now();
    const lastProcessed = groupDebounce.get(from) || 0;
    if (isGroup) {
        if (!isCancellationHint && now - lastProcessed < 30000)
            return;
        groupDebounce.set(from, now);
    }
    const [teamNumbers, teamNames] = await Promise.all([(0, sheets_1.getTeamNumbers)(), (0, sheets_1.getTeamNames)()]);
    const senderPhone = senderJid ? '+' + senderJid.split('@')[0].replace(/\D/g, '') : '';
    const senderName = (data.pushName || '').trim().toLowerCase();
    const isTeamPhone = !constants_1.CONFIG.IS_APP_DEV && senderPhone && teamNumbers.includes(senderPhone);
    const isTeamName = senderName && teamNames.some(n => senderName.includes(n) || n.includes(senderName));
    const isTeamMember = !!(isTeamPhone || isTeamName);
    if (isGroup && isTeamMember) {
        if ((0, groupReminders_1.hasPendingReminder)(from))
            (0, groupReminders_1.cancelReminder)(from, 'team member active in group');
        console.log(`⏭️ Skipping team member message in group (phone=${isTeamPhone}, name=${isTeamName})`);
        return;
    }
    // Guest replied — cancel the follow-up reminder
    if (isGroup && (0, groupReminders_1.hasPendingReminder)(from)) {
        (0, groupReminders_1.cancelReminder)(from, 'guest replied');
    }
    const personalBooking = !isGroup ? (0, bookingStore_1.getBookingByPhone)(dmJid) : undefined;
    const lead_uid = (0, groupLeads_1.getLeadUid)(from) || (!isGroup ? (0, groupLeads_1.getLeadUid)(dmJid) : null) || personalBooking?.leadUid || null;
    const isStaffTest = !lead_uid && !isGroup && isTeamMember;
    if (!lead_uid) {
        // Staff DM with no guest booking → allow as test run (no HF note will be saved)
        if (isStaffTest) {
            console.log(`🧪 Staff DM test mode — no booking for ${dmJid}, alerts → dev channel`);
        }
        else {
            if (!isGroup)
                console.log(`⏭️ WA DM auto-reply skipped: no active booking matched ${dmJid}`);
            return;
        }
    }
    if (lead_uid && (0, bookingStore_1.isLeadExpired)(lead_uid))
        return;
    if (!isGroup && DM_GREETING_REGEX.test(text)) {
        await (0, evoClient_2.evoSendText)(replyTo, 'Hello 😊').catch(e => console.error('❌ WA DM greeting reply failed:', e?.message));
        return;
    }
    if (data.message?.extendedTextMessage?.contextInfo?.quotedMessage)
        return;
    if (STAFF_SIGNATURE_REGEX.test(text)) {
        console.log('⏭️ Skipping staff-signed message');
        return;
    }
    const { result, usedHistoryFallback, saveToHostfully } = await (0, requestDetection_1.detectGuestIntentWithContext)({
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
        const booking = lead_uid ? (0, bookingStore_1.getBookingByLeadUid)(lead_uid) : undefined;
        const bookingPropertyCode = booking?.property ? (0, groupNaming_1.propertyCodeFromName)(booking.property) ?? undefined : undefined;
        const propertyCode = (isStaffTest ? dmTestProperty.get(dmJid) : undefined) ?? bookingPropertyCode;
        if (!isGroup && (0, autoReplyPipeline_1.shouldAttemptAutoReply)(text, propertyCode)) {
            (0, autoReplyPipeline_1.runAutoReplyPipeline)({
                leadUid: lead_uid || '',
                platform: 'whatsapp',
                guestMessage: text,
                propertyCode,
                sourceId: dmJid,
                testMode: isStaffTest,
                bypassFlagCheck: constants_1.CONFIG.ENABLE_WA_DM_AUTO_REPLY,
                sendReply: async (reply) => {
                    await (0, evoClient_2.evoSendText)(replyTo, reply);
                    dmLastReply.set(dmJid, { question: text, reply });
                },
            }).catch(e => console.error('❌ WA auto-reply pipeline error:', e?.message));
        }
        return;
    }
    try {
        const lead = lead_uid ? await (0, hostfully_1.fetchLead)(lead_uid) : null;
        const info = lead?.guestInformation;
        const guest_name = (0, format_1.guestName)(info);
        const today = new Date();
        const checkIn = lead?.checkInLocalDateTime ? new Date(lead.checkInLocalDateTime) : null;
        const isPostCheckIn = checkIn && today >= checkIn;
        if (lead_uid && saveToHostfully && !isPostCheckIn)
            await (0, hostfully_1.saveGuestNote)(lead_uid, result);
        const propertyName = await (0, hostfully_1.resolvePropertyNameForLead)(lead);
        const resolvedPropertyCode = (0, groupNaming_1.propertyCodeFromName)(propertyName) || undefined;
        const propertyCode = (isStaffTest ? dmTestProperty.get(dmJid) : undefined) ?? resolvedPropertyCode;
        const alertOpts = { propertyCode, ...(isStaffTest ? { useTestJandi: true, telegramOnly: true } : {}) };
        if (result.startsWith('CANCELLED:')) {
            const cancelledText = (result.replace(/^CANCELLED:\s*/i, '').trim() || 'Previous request').slice(0, 200);
            await (0, notify_1.sendAlert)(`🚫 <b>Request Cancelled</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${propertyName}\n` +
                `📋 <b>Cancelled:</b> ${cancelledText}\n` +
                `📱 <b>Platform:</b> WhatsApp\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, alertOpts);
        }
        else {
            await (0, notify_1.sendAlert)(`💬 <b>Guest Request Detected</b>\n─────────────────\n` +
                `👤 <b>Guest:</b> ${guest_name}\n` +
                `🏠 <b>Property:</b> ${propertyName}\n` +
                `📋 <b>Request:</b> ${result}\n` +
                `📱 <b>Platform:</b> WhatsApp\n` +
                `─────────────────\n<i>via COZMO · COZE Hospitality</i>`, alertOpts);
            if (!isGroup)
                (0, autoReplyPipeline_1.runAutoReplyPipeline)({
                    leadUid: lead_uid || '',
                    platform: 'whatsapp',
                    guestMessage: text,
                    propertyCode,
                    sourceId: dmJid,
                    testMode: isStaffTest,
                    bypassFlagCheck: constants_1.CONFIG.ENABLE_WA_DM_AUTO_REPLY,
                    sendReply: async (reply) => {
                        await (0, evoClient_2.evoSendText)(replyTo, reply);
                        dmLastReply.set(dmJid, { question: text, reply });
                    },
                }).catch(e => console.error('❌ WA auto-reply pipeline error:', e?.message));
        }
    }
    catch (e) {
        console.error('❌ Message handler error:', e?.message);
    }
}
