// Deletes ALL events from cozmo@coze.care's primary calendar.
// Run: node scripts/clear-calendar.js
// Optional: node scripts/clear-calendar.js <calendarId>
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

async function clearCalendar() {
    console.log(`🗑️  Clearing calendar: ${calendarId}\n`);
    let pageToken;
    let deleted = 0;

    do {
        const res = await calendar.events.list({
            calendarId,
            maxResults: 250,
            pageToken,
            showDeleted: false,
        });
        const events = res.data.items || [];
        if (!events.length) break;

        for (const event of events) {
            try {
                await calendar.events.delete({ calendarId, eventId: event.id });
                console.log(`  ✅ Deleted: ${event.summary || '(no title)'}`);
                deleted++;
            } catch (e) {
                console.warn(`  ⚠️  Skip: ${event.summary} — ${e.message}`);
            }
        }
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    console.log(`\n✅ Done. ${deleted} event(s) deleted from "${calendarId}".`);
}

clearCalendar().catch(console.error);
