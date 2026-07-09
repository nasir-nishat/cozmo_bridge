// Finds duplicate Blocked calendar events (same property + same start date) and deletes extras.
// Keeps the oldest (first created) per group.
// Run: node scripts/dedup-blocked-events.js [calendarId]
// Default calendarId: primary (cozmo@coze.care)

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const credentials = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/config/google-credentials.json'), 'utf-8')
);
const { client_id, client_secret } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(
    JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-token.json'), 'utf-8'))
);

const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
const calendarId = process.argv[2] || 'primary';
const DRY_RUN = process.argv.includes('--dry-run');

async function fetchAllEvents() {
    const events = [];
    let pageToken;
    do {
        const res = await calendar.events.list({
            calendarId,
            maxResults: 250,
            pageToken,
            showDeleted: false,
            singleEvents: true,
        });
        events.push(...(res.data.items || []));
        pageToken = res.data.nextPageToken;
    } while (pageToken);
    return events;
}

async function dedupBlocked() {
    console.log(`🔍 Fetching events from: ${calendarId}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

    const events = await fetchAllEvents();
    const blocked = events.filter(e => e.summary && e.summary.endsWith('/Blocked'));
    console.log(`📋 Total events: ${events.length} | Blocked events: ${blocked.length}\n`);

    // Group by "SUMMARY:START_DATE"
    const groups = {};
    for (const ev of blocked) {
        const startDate = ev.start?.date || ev.start?.dateTime?.slice(0, 10) || 'unknown';
        const key = `${ev.summary}:${startDate}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(ev);
    }

    let duplicateGroups = 0;
    let deleted = 0;

    for (const [key, group] of Object.entries(groups)) {
        if (group.length <= 1) continue;
        duplicateGroups++;

        // Sort by created timestamp ascending — keep oldest
        group.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
        const [keep, ...remove] = group;

        console.log(`⚠️  Duplicate: ${key} (${group.length} copies)`);
        console.log(`   ✅ Keep:   ${keep.id} (created ${keep.created})`);

        for (const ev of remove) {
            console.log(`   🗑️  Delete: ${ev.id} (created ${ev.created})`);
            if (!DRY_RUN) {
                try {
                    await calendar.events.delete({ calendarId, eventId: ev.id });
                    deleted++;
                } catch (e) {
                    console.warn(`   ⚠️  Failed to delete ${ev.id}: ${e.message}`);
                }
            } else {
                deleted++;
            }
        }
        console.log();
    }

    if (duplicateGroups === 0) {
        console.log('✅ No duplicates found.');
    } else {
        console.log(`✅ Done. ${duplicateGroups} duplicate group(s), ${deleted} event(s) ${DRY_RUN ? 'would be' : ''} deleted.`);
    }
}

dedupBlocked().catch(console.error);
