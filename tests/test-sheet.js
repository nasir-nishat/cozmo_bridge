const { google } = require('googleapis');
const fs = require('fs');

const SHEET_ID = '1xzDlJ9LXIXAtz6qpJfRqlEK5Fvmok9sgEMgYVpQmpc0';
const TOKEN_PATH = './google-token.json';
const CREDENTIALS_PATH = './google-credentials.json';

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_id, client_secret } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));

const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

async function getTeam() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Sheet1!A2:D',
    });
    console.log('Team members:', res.data.values);
}

getTeam().catch(console.error);