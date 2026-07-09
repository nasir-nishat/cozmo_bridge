"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const credentials = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../src/config/google-credentials.json'), 'utf-8'));
const { client_id, client_secret } = credentials.installed;
const oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../src/config/google-token.json'), 'utf-8')));
const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oAuth2Client });
const PROPERTIES = [
    { code: 'BS', name: 'BS · Joyhasla', color: 'sage' },
    { code: 'SG', name: 'SG · Joyhasla', color: 'sage' },
    { code: 'SJ', name: 'SJ · Joyhasla', color: 'sage' },
    { code: 'SA', name: 'SA · Achae', color: 'flamingo' },
    { code: 'JT', name: 'JT · Teva', color: 'peacock' },
    { code: 'JTS', name: 'JTS · Teva', color: 'peacock' },
    { code: 'B9', name: 'B9 · Yeonnam', color: 'banana' },
    { code: 'L9', name: 'L9 · Yeonnam', color: 'banana' },
    { code: 'F9', name: 'F9 · Yeonnam', color: 'banana' },
];
async function main() {
    console.log('Creating property calendars under cozmo@coze.care...\n');
    const results = {};
    for (const prop of PROPERTIES) {
        try {
            const res = await calendar.calendars.insert({
                requestBody: {
                    summary: prop.name,
                    timeZone: 'Asia/Seoul',
                },
            });
            const id = res.data.id;
            results[prop.code] = id;
            console.log(`✅ ${prop.code}: ${id}`);
            // Set color
            await calendar.calendarList.patch({
                calendarId: id,
                requestBody: { colorId: prop.color },
            }).catch(() => { });
        }
        catch (e) {
            console.error(`❌ ${prop.code}: ${e?.message}`);
        }
    }
    console.log('\n--- ecosystem.config.js entries ---');
    for (const [code, id] of Object.entries(results)) {
        console.log(`      CALENDAR_ID_${code}: '${id}',`);
    }
}
main().catch(console.error);
