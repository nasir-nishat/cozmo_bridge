"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTelegramPhone = checkTelegramPhone;
// MTProto personal account lookup disabled — using a personal account for automated
// phone lookups violates Telegram ToS and caused the previous account to be banned.
async function checkTelegramPhone(_phone) {
    return false;
}
exports.default = { checkTelegramPhone };
