// Quick test: send checkout_reminder_EN to a specific WA group
// Usage: node scripts/test-checkout-reminder.js <group_jid>
// Example: node scripts/test-checkout-reminder.js 120363426287380148@g.us

require('dotenv/config');
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || 'http://localhost:8081').replace('localhost', '127.0.0.1');
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'cozmo';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'cozmo_evo_k9x2mP4nQr8vL3wJ';
const SHEET_ID = '1xzDlJ9LXIXAtz6qpJfRqlEK5Fvmok9sgEMgYVpQmpc0';

const groupId = process.argv[2] || '120363426287380148@g.us';
const lang = process.argv[3] || 'EN';

async function run() {
    // Load Google Sheets auth
    const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-credentials.json'), 'utf-8'));
    const { client_id, client_secret } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-token.json'), 'utf-8')));
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

    // Fetch message
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'scheduled_messages!A1:B' });
    const row = (res.data.values || []).find(r => r[0] === `checkout_reminder_${lang}`);
    if (!row) { console.error(`❌ No message found for checkout_reminder_${lang}`); process.exit(1); }
    const message = row[1];
    console.log(`✅ Message fetched (${message.length} chars)`);

    // Send via Evolution API using native http to avoid localhost IPv6 issues
    const http = require('http');
    const payload = JSON.stringify({ number: groupId, text: message });
    await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port: 8081,
            path: `/message/sendText/${EVOLUTION_INSTANCE}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY, 'Content-Length': Buffer.byteLength(payload) }
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { console.log(`✅ Sent [${res.statusCode}]:`, d.slice(0, 100)); resolve(null); });
        });
        req.on('error', reject);
        req.write(payload); req.end();
    });
}

run().catch(e => { console.error('❌', e?.response?.status, JSON.stringify(e?.response?.data) || e?.message || String(e)); process.exit(1); });
