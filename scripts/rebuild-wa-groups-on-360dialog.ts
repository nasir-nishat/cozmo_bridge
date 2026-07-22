// Rebuilds guest concierge groups on the NEW 360dialog Cloud API number, from the backup CSV
// produced by scripts/backup-active-wa-groups.js — for use AFTER the old WhatsApp account has
// been deleted and the same (or a new) number re-registered on 360dialog.
//
// What this does NOT do (know before running):
//   - It cannot restore the actual old group chats — Meta's Groups API only manages groups it
//     creates. Every group here is a brand-new group; the guest re-joins via a fresh invite link.
//   - Scheduled messages (check-in tips, checkout reminder, farewell, final bill) will NOT reach
//     these new groups yet — checkoutReminder.ts/checkinReminder.ts's detectPlatform() doesn't
//     recognize the "360:" prefix used here. That's a separate, not-yet-built wiring task.
//   - No slash commands (/exp, /ckin, /ckout, /link, /welcome) work in these groups yet — same
//     reason: command handling was never ported to the 360dialog platform (see
//     src/platforms/whatsapp360/README context in groupCreation.ts header).
// What it DOES do: creates one group per guest row (idempotent — skips leads that already have a
// "360:" group linked), relinks the SAME leadUid to the new group so existing lead-based lookups
// keep working, and sends the invite link via the Hostfully inbox (sendHfInviteLink) — a channel
// that doesn't depend on the WhatsApp account's state at all, so it works even on a freshly
// re-registered number with no prior guest conversation.
//
// Run: npx ts-node scripts/rebuild-wa-groups-on-360dialog.ts [--file=backups/wa-groups/xxx.csv]
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../src/config/constants';
import { isDialog360Configured } from '../src/platforms/whatsapp360/dialogClient';
import { createGuestGroup } from '../src/platforms/whatsapp360/groupCreation';
import { linkGroup, getDialog360GroupIdByLeadUid } from '../src/services/groupLeads';
import { sendHfInviteLink } from '../src/services/hostfully';
import { propertyCodeFromName, formatGroupCheckIn } from '../src/platforms/whatsapp/groupNaming';
import { sendAlert } from '../src/services/notify';

const ROOT = path.join(__dirname, '..');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface BackupRow {
    category: string; checkIn: string; checkOut: string;
    guestName: string; property: string; phone: string;
    groupId: string; leadUid: string; status: string;
}

function findLatestBackupFile(): string {
    const dir = path.join(ROOT, 'backups/wa-groups');
    const files = fs.readdirSync(dir).filter(f => f.startsWith('wa-groups-backup-') && f.endsWith('.csv'));
    if (!files.length) throw new Error(`No backup CSV found in ${dir} — run scripts/backup-active-wa-groups.js first`);
    files.sort();
    return path.join(dir, files[files.length - 1]);
}

// Minimal CSV parser matched to backup-active-wa-groups.js's own output format (double-quoted
// fields, "" escaping) — not a general-purpose parser.
function parseCsv(content: string): BackupRow[] {
    const lines = content.trim().split('\n');
    const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const fields = line.match(/(?:"(?:[^"]|"")*"|[^,]*)(?:,|$)/g)!
            .filter((_, i, arr) => i < arr.length - 1 || arr[i] !== '')
            .map(f => f.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
        const row: any = {};
        header.forEach((h, i) => { row[h] = fields[i] ?? ''; });
        return row as BackupRow;
    });
}

async function run() {
    const fileArg = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
    const csvPath = fileArg ? path.join(ROOT, fileArg) : findLatestBackupFile();

    if (!isDialog360Configured()) {
        console.error('❌ DIALOG360_API_KEY not set — configure the new number before running this.');
        process.exit(1);
    }
    if (!CONFIG.ENABLE_360DIALOG_GROUPS) {
        console.error('❌ ENABLE_360DIALOG_GROUPS is false — flip it on once the number is confirmed live.');
        process.exit(1);
    }

    console.log(`📂 Reading backup: ${path.relative(ROOT, csvPath)}`);
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
    console.log(`👥 ${rows.length} guest(s) to rebuild\n`);

    let created = 0, skipped = 0;
    const failures: { guestName: string; leadUid: string; error: string }[] = [];

    for (const row of rows) {
        if (!row.leadUid || !row.guestName) continue;

        const existing = getDialog360GroupIdByLeadUid(row.leadUid);
        if (existing) {
            console.log(`⏭️  ${row.guestName} — already rebuilt (${existing})`);
            skipped++;
            continue;
        }

        const groupName = ['COZE', propertyCodeFromName(row.property), formatGroupCheckIn(row.checkIn), row.guestName]
            .filter(Boolean).join(' ');

        try {
            console.log(`👥 Creating group for ${row.guestName} (${row.property})...`);
            const { groupId, inviteLink } = await createGuestGroup(groupName);
            linkGroup(`360:${groupId}`, row.leadUid);
            console.log(`✅ Created + linked: 360:${groupId} → ${row.leadUid}`);

            if (inviteLink) {
                await sendHfInviteLink(row.leadUid, row.guestName, inviteLink);
                console.log(`📨 Invite link sent via Hostfully inbox`);
            } else {
                console.warn(`⚠️ No invite link yet for ${row.guestName} — fetch it later via getInviteLink('${groupId}') and send manually`);
            }
            created++;
        } catch (e: any) {
            const msg = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : (e?.message || 'unknown error');
            console.error(`❌ Failed for ${row.guestName}: ${msg}`);
            failures.push({ guestName: row.guestName, leadUid: row.leadUid, error: msg });
        }

        await sleep(3000); // polite pacing between creates — not anti-ban jitter, just rate-limit courtesy
    }

    console.log(`\n📊 Done — created: ${created}, already done: ${skipped}, failed: ${failures.length}`);
    if (failures.length) {
        console.log('Failures (retry by re-running — script is idempotent):');
        failures.forEach(f => console.log(`  - ${f.guestName} (${f.leadUid}): ${f.error}`));
    }
    console.log('\n⚠️ Reminder: scheduled messages and slash commands do NOT work in these new groups yet — see file header.');

    await sendAlert(
        `📦 <b>360dialog Group Rebuild Complete</b>\n─────────────────\n` +
        `✅ Created: ${created}\n⏭️ Already done: ${skipped}\n❌ Failed: ${failures.length}\n` +
        `─────────────────\n<i>via COZMO · COZE Hospitality</i>`,
        { telegramOnly: true }
    ).catch(() => {});
}

run().catch(e => {
    console.error('❌ Fatal:', e?.message);
    process.exit(1);
});
