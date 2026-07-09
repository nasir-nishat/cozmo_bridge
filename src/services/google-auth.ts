import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const credentials = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/google-credentials.json'), 'utf-8')
);
const { client_id, client_secret } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(
    JSON.parse(fs.readFileSync(path.join(__dirname, '../config/google-token.json'), 'utf-8'))
);

export default oAuth2Client;