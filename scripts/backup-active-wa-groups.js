// Backup list of WhatsApp groups whose guest is currently in-house or still upcoming (i.e. NOT
// yet checked out), for the 360dialog Cloud API migration — see docs/whatsapp-groups-api-migration.md.
// If the current WA account gets deleted/re-registered, every group on it is destroyed instantly;
// this is the punch list of guests who'd need a heads-up + a manually recreated group afterward.
// "Checked out" and "no matching booking in active-bookings.json" groups are deliberately excluded —
// only in-house + upcoming guests matter for this backup.
//
// Run: node scripts/backup-active-wa-groups.js
// Output: backups/wa-groups/wa-groups-backup-<YYYY-MM-DD>.csv (timestamped, never overwritten)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const groupLeads = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/group-leads.json'), 'utf-8'));
const bookings = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/active-bookings.json'), 'utf-8'));

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD KST

const byLeadUid = {};
for (const b of bookings) byLeadUid[b.leadUid] = b;

const waGroupEntries = Object.entries(groupLeads).filter(([k]) => k.endsWith('@g.us'));

const rows = [];
let unmatched = 0;
for (const [groupId, leadUid] of waGroupEntries) {
    const b = byLeadUid[leadUid];
    if (!b || !b.checkOut || b.checkOut < today) {
        if (!b) unmatched++;
        continue; // checked out, or no booking record — not in scope
    }
    rows.push({
        category: b.checkIn <= today ? 'in-house' : 'upcoming',
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        guestName: b.guestName,
        property: b.property,
        phone: b.phone,
        groupId,
        leadUid,
        status: b.status,
    });
}

// In-house first (most urgent), then soonest checkout within each group
rows.sort((a, b) => {
    if (a.category !== b.category) return a.category === 'in-house' ? -1 : 1;
    return a.checkOut.localeCompare(b.checkOut);
});

const inHouse = rows.filter(r => r.category === 'in-house').length;
const upcoming = rows.filter(r => r.category === 'upcoming').length;

const outDir = path.join(ROOT, 'backups/wa-groups');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `wa-groups-backup-${today}.csv`);

const header = 'category,checkIn,checkOut,guestName,property,phone,groupId,leadUid,status';
const csvEscape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
const lines = [header, ...rows.map(r =>
    [r.category, r.checkIn, r.checkOut, r.guestName, r.property, r.phone, r.groupId, r.leadUid, r.status]
        .map(csvEscape).join(',')
)];
fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');

console.log(`📦 WA groups backup (as of ${today} KST)`);
console.log(`   In-house:  ${inHouse}`);
console.log(`   Upcoming:  ${upcoming}`);
console.log(`   Total:     ${rows.length}`);
console.log(`   Skipped (checked out or no booking record, ${unmatched} unmatched): ${waGroupEntries.length - rows.length}`);
console.log(`   Written:   ${path.relative(ROOT, outFile)}`);
