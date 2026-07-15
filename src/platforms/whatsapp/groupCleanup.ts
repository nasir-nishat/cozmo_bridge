import { evoSendText } from './evoClient';
import {
    unlinkGroup, getLeadUid, getWaGroupIdByLeadUid,
    deleteGroupLang, deleteGroupName, getStoredGroupName,
} from '../../services/groupLeads';
import { clearSentForGroup } from '../../services/sentMessages';
import { clearWelcomed } from '../../services/welcomedGroups';
import { markReplied } from '../../services/replyWatchdog';
import { cancelReminder } from '../../services/groupReminders';
import { isStaffLid } from './commands';

/**
 * /ungroup — wipe COZMO's local state for a WA group so /group <uid> can
 * create a fresh one. Does NOT touch the booking, lead-level hf: records,
 * or the WhatsApp group itself (delete that from the phone).
 *
 * Usage:
 *   /ungroup              (inside the group to clean)
 *   /ungroup <lead_uid>   (resolves the linked WA group)
 *   /ungroup <id>@g.us    (explicit group id)
 */
export async function handleUngroupCommand(from: string, arg: string, senderJid: string): Promise<void> {
    const isGroup = from.endsWith('@g.us');
    const replyTo = isGroup ? senderJid : from;
    if (isGroup && !isStaffLid(senderJid)) {
        return; // silent — non-staff in group, don't expose command exists
    }

    let groupId: string;
    if (!arg) {
        if (!isGroup) {
            await evoSendText(replyTo, '❌ Usage: /ungroup <lead_uid | group_id>\nOr send /ungroup inside the group you want to unlink.').catch(() => { });
            return;
        }
        groupId = from;
    } else if (arg.endsWith('@g.us')) {
        groupId = arg;
    } else {
        const resolved = getWaGroupIdByLeadUid(arg);
        if (!resolved) {
            await evoSendText(replyTo, `❌ No WA group linked to lead ${arg}`).catch(() => { });
            return;
        }
        groupId = resolved;
    }

    const leadUid = getLeadUid(groupId);
    const groupName = getStoredGroupName(groupId) || groupId;

    unlinkGroup(groupId);
    deleteGroupLang(groupId);
    deleteGroupName(groupId);
    clearWelcomed(groupId);
    markReplied(groupId); // removes reply-watchdog entry
    cancelReminder(groupId, '/ungroup');
    const clearedMsgs = clearSentForGroup(groupId);

    console.log(`🗑️ /ungroup: cleared local state for ${groupId} (${groupName})`);

    await evoSendText(replyTo,
        `🗑️ Group unlinked: ${groupName}\n` +
        (leadUid ? `🔑 Lead: ${leadUid}\n` : '') +
        `Cleared: lead link, group name, language, welcome flag, reply watchdog, reminders, ${clearedMsgs} sent-message record(s).\n\n` +
        (leadUid ? `✅ /group ${leadUid} will now create a fresh group.\n` : '') +
        `⚠️ The WhatsApp group itself still exists — exit/delete it from the phone.`
    ).catch(() => { });
}
