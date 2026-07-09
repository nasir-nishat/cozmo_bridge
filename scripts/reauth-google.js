// One-time re-authorization for Google Sheets, Contacts, and Calendar scopes.
// Run: node scripts/reauth-google.js
// Sign in as cozmo@coze.care when the browser opens.
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/calendar',
];

const credentials = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/config/google-credentials.json'), 'utf-8')
);
const { client_id, client_secret } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
});

console.log('\n👉 Open this URL in your browser (sign in as cozmo@coze.care):\n');
console.log(authUrl);
console.log('\nWaiting for callback on http://localhost:3333 ...\n');

const server = http.createServer(async (req, res) => {
    try {
        const code = new URL(req.url, 'http://localhost:3333').searchParams.get('code');
        if (!code) { res.end('No code found'); return; }
        const { tokens } = await oAuth2Client.getToken(code);
        fs.writeFileSync(
            path.join(__dirname, '../src/config/google-token.json'),
            JSON.stringify(tokens, null, 2)
        );
        res.end('<h1>✅ Authorized! You can close this tab.</h1>');
        console.log('✅ Token saved → src/config/google-token.json');
        server.close();
        process.exit(0);
    } catch (e) {
        res.end('Error: ' + e.message);
        console.error('❌ Auth error:', e.message);
        server.close();
        process.exit(1);
    }
}).listen(3333, () => console.log('Listening on http://localhost:3333'));
