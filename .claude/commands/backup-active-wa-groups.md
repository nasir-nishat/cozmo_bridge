---
description: Regenerate the backup list of in-house + upcoming WhatsApp groups ahead of the 360dialog account migration
allowed-tools: Bash(node scripts/backup-active-wa-groups.js:*), Read
---

Run the backup script and report the results.

1. Run: `node scripts/backup-active-wa-groups.js`
2. Read the CSV it just wrote (path is printed in the script's output, under `backups/wa-groups/`).
3. Report to the user:
   - The in-house count and upcoming count from the script output.
   - The full in-house list (guest name, property, phone, checkout date) inline in the response —
     these are the highest priority, since deleting/re-registering the WhatsApp account (see
     docs/whatsapp-groups-api-migration.md) would kick them out of their group mid-stay.
   - The path to the CSV for the full upcoming list.
   - A one-line reminder: this file is NOT gitignored and contains guest phone numbers — same
     handling as the existing tracked files under src/data/*.json, but flag it so the user is aware.

Do not modify src/data/group-leads.json, src/data/active-bookings.json, or any other live state —
this command only reads them and writes a new timestamped CSV under backups/wa-groups/.
