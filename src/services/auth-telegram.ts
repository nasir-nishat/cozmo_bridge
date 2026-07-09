import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CONFIG } from '../config/constants';
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));

async function main() {
    const client = new TelegramClient(
        new StringSession(''),
        CONFIG.TELEGRAM_API_ID,
        CONFIG.TELEGRAM_API_HASH,
        { connectionRetries: 5 }
    );

    await client.start({
        phoneNumber: async () => await ask('Phone number (+82...): '),
        password: async () => await ask('2FA password (if any): '),
        phoneCode: async () => await ask('Code from Telegram app: '),
        onError: console.error,
    });

    console.log('✅ Session string:');
    console.log(client.session.save());
    rl.close();
    await client.disconnect();
}

main();