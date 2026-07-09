import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const credentialsPath = path.join(__dirname, '../config/google-credentials.json');
const tokenPath = path.join(__dirname, '../config/google-token.json');

type GoogleAuthStatus = {
    configured: boolean;
    credentialsPath: string;
    tokenPath: string;
    missing: string[];
    error?: string;
};

function readJsonIfExists(filePath: string): any | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e: any) {
        googleAuthStatus.error = `Invalid JSON in ${filePath}: ${e?.message || e}`;
        return null;
    }
}

const googleAuthStatus: GoogleAuthStatus = {
    configured: false,
    credentialsPath,
    tokenPath,
    missing: [],
};

const credentials = readJsonIfExists(credentialsPath);
const client_id = credentials?.installed?.client_id ?? '';
const client_secret = credentials?.installed?.client_secret ?? '';

if (!credentials) {
    googleAuthStatus.missing.push('google-credentials.json');
    console.warn(`⚠️ Google credentials missing at ${credentialsPath} - Google Calendar/Sheets features will be unavailable`);
}

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
const token = readJsonIfExists(tokenPath);

if (token) {
    oAuth2Client.setCredentials(token);
} else {
    googleAuthStatus.missing.push('google-token.json');
    console.warn(`⚠️ Google token missing at ${tokenPath} - Google Calendar/Sheets features will be unavailable`);
}

googleAuthStatus.configured = !!(credentials && token && client_id && client_secret);

export function getGoogleAuthStatus(): GoogleAuthStatus {
    return { ...googleAuthStatus, missing: [...googleAuthStatus.missing] };
}

export function isGoogleAuthAvailable(): boolean {
    return googleAuthStatus.configured;
}

export function assertGoogleAuthAvailable(feature = 'Google API'): void {
    if (isGoogleAuthAvailable()) return;
    const missing = googleAuthStatus.missing.length ? googleAuthStatus.missing.join(', ') : 'Google auth';
    throw new Error(`${feature} unavailable: missing ${missing}`);
}

export default oAuth2Client;
