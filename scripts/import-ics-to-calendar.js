// Imports historical events from Joyhasla ICS exports into COZMO Google Calendars.
// Run: node scripts/import-ics-to-calendar.js [--dry-run]

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ─── Google Auth ──────────────────────────────────────────────────────────────
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-credentials.json'), 'utf-8'));
const { client_id, client_secret } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-token.json'), 'utf-8')));
const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

// ─── ICS files → target calendar IDs ─────────────────────────────────────────
const ICS_DIR = path.join(__dirname, '../booking@joyhasla.com.ical');

const IMPORT_MAP = [
    {
        file: 'HTA GYM&SPA_c_c6c51cc77947862e4594e455a9d5b5b6c1a2b39afcb2bffdc2a2b5bfe991458b@group.calendar.google.com.ics',
        calendarId: 'c_b735387dbb7894c08e3f9416e93557bff79513adf1aa0189f037aacc88205b89@group.calendar.google.com',
        label: 'HTA',
    },
    {
        file: 'HTB HOME&GARDEN_c_3dcfa1b473fc908646939e8c049c433106304a70168af785534d7fa5b14109dd@group.calendar.google.com.ics',
        calendarId: 'c_9e850106c89c5e3a2f2061971dbc5ba8544c93efe05dfe29c5346e6a4e329ef9@group.calendar.google.com',
        label: 'HTB',
    },
];

// ─── ICS parser ───────────────────────────────────────────────────────────────
function parseIcs(filePath) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const events = [];
    let current = null;

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === 'BEGIN:VEVENT') { current = {}; continue; }
        if (line === 'END:VEVENT') { if (current) events.push(current); current = null; continue; }
        if (!current) continue;

        if (line.startsWith('DTSTART')) {
            current.start = line.replace(/^DTSTART[^:]*:/, '');
        } else if (line.startsWith('DTEND')) {
            current.end = line.replace(/^DTEND[^:]*:/, '');
        } else if (line.startsWith('SUMMARY:')) {
            current.summary = line.slice(8);
        } else if (line.startsWith('UID:')) {
            current.uid = line.slice(4);
        }
    }
    return events;
}

function toIsoDate(icsDate) {
    // YYYYMMDD → YYYY-MM-DD
    return `${icsDate.slice(0, 4)}-${icsDate.slice(4, 6)}-${icsDate.slice(6, 8)}`;
}

// ─── Duplicate check ──────────────────────────────────────────────────────────
async function eventExists(calendarId, startDate, summary) {
    try {
        const res = await calendar.events.list({
            calendarId,
            timeMin: `${startDate}T00:00:00+09:00`,
            timeMax: `${startDate}T23:59:59+09:00`,
            singleEvents: true,
            maxResults: 20,
        });
        return (res.data.items || []).some(e => e.summary === summary);
    } catch { return false; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log(`📅 ICS import${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

    for (const { file, calendarId, label } of IMPORT_MAP) {
        const filePath = path.join(ICS_DIR, file);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File not found: ${file}`);
            continue;
        }

        const events = parseIcs(filePath);
        console.log(`\n── ${label} (${events.length} events from ICS) ──`);

        let created = 0, skipped = 0, failed = 0;

        for (const ev of events) {
            if (!ev.start || !ev.end || !ev.summary) { skipped++; continue; }
            const startDate = toIsoDate(ev.start);
            const endDate   = toIsoDate(ev.end);

            const exists = await eventExists(calendarId, startDate, ev.summary);
            if (exists) {
                console.log(`  ⏭️  ${ev.summary}  (${startDate}) — already exists`);
                skipped++;
                continue;
            }

            console.log(`  ➕ ${ev.summary}  (${startDate} → ${endDate})`);

            if (!DRY_RUN) {
                try {
                    await calendar.events.insert({
                        calendarId,
                        requestBody: {
                            summary: ev.summary,
                            start: { date: startDate, timeZone: 'Asia/Seoul' },
                            end:   { date: endDate,   timeZone: 'Asia/Seoul' },
                        },
                    });
                    created++;
                } catch (e) {
                    console.warn(`    ❌ failed: ${e.message}`);
                    failed++;
                }
            } else {
                created++;
            }
        }

        console.log(`  → ${created} imported | ${skipped} skipped | ${failed} failed`);
    }

    console.log('\n✅ Done.');
}

main().catch(console.error);
