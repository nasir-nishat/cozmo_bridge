// MTProto personal account lookup disabled — using a personal account for automated
// phone lookups violates Telegram ToS and caused the previous account to be banned.
export async function checkTelegramPhone(_phone: string): Promise<boolean> {
    return false;
}

export default { checkTelegramPhone };
