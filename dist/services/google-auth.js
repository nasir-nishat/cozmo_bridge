"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const credentials = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../config/google-credentials.json'), 'utf-8'));
const { client_id, client_secret } = credentials.installed;
const oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../config/google-token.json'), 'utf-8')));
exports.default = oAuth2Client;
