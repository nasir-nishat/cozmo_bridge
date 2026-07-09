import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const credentialsPath = path.join(__dirname, '../config/google-credentials.json');
const tokenPath = path.join(__dirname, '../config/google-token.json');

function readJsonIfExists(filePath: string) {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const credentials = readJsonIfExists(credentialsPath);
const client_id = credentials?.installed?.client_id ?? '';
const client_secret = credentials?.installed?.client_secret ?? '';

if (!credentials) {
    console.warn(`⚠️ Google credentials missing at ${credentialsPath} - Google Calendar/Sheets features will be unavailable`);
}

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
const token = readJsonIfExists(tokenPath);

if (token) {
    oAuth2Client.setCredentials(token);
} else {
    console.warn(`⚠️ Google token missing at ${tokenPath} - Google Calendar/Sheets features will be unavailable`);
}

export default oAuth2Client;
