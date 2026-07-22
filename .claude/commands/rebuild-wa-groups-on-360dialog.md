---
description: Recreate guest concierge groups on the new 360dialog number from the latest backup, after the old WA account is deleted/re-registered
allowed-tools: Bash(npx ts-node scripts/rebuild-wa-groups-on-360dialog.ts:*), Read
---

Only run this after the new 360dialog number is live: `DIALOG360_API_KEY` set and
`ENABLE_360DIALOG_GROUPS=true` in `ecosystem.config.js`, with the bridge restarted to pick it up
(the user restarts — never run pm2/restart yourself).

1. Confirm those two conditions with the user if not obviously true from context.
2. Run: `npx ts-node scripts/rebuild-wa-groups-on-360dialog.ts` (uses the most recent file in
   `backups/wa-groups/` automatically — suggest running `/backup-active-wa-groups` first if the
   existing backup is more than a day or two old, since bookings change).
3. Report the summary: created / already-done / failed counts, and list any failures by guest name
   for manual follow-up (the script is idempotent — safe to re-run to retry just the failures).
4. Remind the user of the two known gaps (also in the script's file header):
   - Scheduled messages (check-in tips, checkout reminder, farewell, final bill) do not reach these
     new groups yet — `detectPlatform()` in `checkoutReminder.ts`/`checkinReminder.ts` doesn't
     recognize the new `"360:"` group-id prefix.
   - No slash commands (`/exp`, `/ckin`, `/ckout`, `/link`, `/welcome`) work in these groups yet —
     command handling was never ported to the 360dialog platform.
   Both are real follow-up work, not something this command silently fixes.

Do not modify `src/data/active-bookings.json`. This command only reads the backup CSV and writes
to `src/data/group-leads.json` via `linkGroup()` (additive — new `"360:"` keys only).
