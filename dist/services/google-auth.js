"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoogleAuthStatus = getGoogleAuthStatus;
exports.isGoogleAuthAvailable = isGoogleAuthAvailable;
exports.assertGoogleAuthAvailable = assertGoogleAuthAvailable;
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const credentialsPath = path_1.default.join(__dirname, '../config/google-credentials.json');
const tokenPath = path_1.default.join(__dirname, '../config/google-token.json');
function readJsonIfExists(filePath) {
    if (!fs_1.default.existsSync(filePath))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
    }
    catch (e) {
        googleAuthStatus.error = `Invalid JSON in ${filePath}: ${e?.message || e}`;
        return null;
    }
}
const googleAuthStatus = {
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
const oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
const token = readJsonIfExists(tokenPath);
if (token) {
    oAuth2Client.setCredentials(token);
}
else {
    googleAuthStatus.missing.push('google-token.json');
    console.warn(`⚠️ Google token missing at ${tokenPath} - Google Calendar/Sheets features will be unavailable`);
}
googleAuthStatus.configured = !!(credentials && token && client_id && client_secret);
function getGoogleAuthStatus() {
    return { ...googleAuthStatus, missing: [...googleAuthStatus.missing] };
}
function isGoogleAuthAvailable() {
    return googleAuthStatus.configured;
}
function assertGoogleAuthAvailable(feature = 'Google API') {
    if (isGoogleAuthAvailable())
        return;
    const missing = googleAuthStatus.missing.length ? googleAuthStatus.missing.join(', ') : 'Google auth';
    throw new Error(`${feature} unavailable: missing ${missing}`);
}
exports.default = oAuth2Client;
