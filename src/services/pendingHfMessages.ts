import fs from 'fs';
import path from 'path';
import { sendInboxMessage, sendNoWaFallbackMessage, sendStep2Message, sendPrePaymentMessage } from './hostfully';
import { sendAlert } from './notify';
import { isSent, markSent, MessageType } from './sentMessages';

const QUEUE_FILE = path.join(process.cwd(), 'src/data/pending-hf-messages.json');

export interface PendingHfMsg {
    leadUid: string;
    guestName: string;
    step: 1 | 2 | 'no_wa' | 'pre_payment';
    country?: 'KR' | 'JP' | 'TW' | 'CN' | 'OTHER';
    langCode?: 'EN' | 'JA' | 'ZH' | 'KO';
    propertyCode?: string;
    leadType: string;
    fireAt: string;
    createdAt: string;
}

function sentKey(leadUid: string): string { return `hf:${leadUid}`; }
function sentType(step: PendingHfMsg['step']): MessageType {
    if (step === 1) return 'hf_step1';
    if (step === 2) return 'hf_step2';
    if (step === 'pre_payment') return 'hf_pre_payment';
    return 'hf_no_wa';
}

function load(): PendingHfMsg[] {
    try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8')); }
    catch { return []; }
}

function save(q: PendingHfMsg[]): void {
    try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2)); }
    catch (e: any) { console.error('❌ pendingHfMessages save:', e?.message); }
}

export function enqueueHfMessage(msg: Omit<PendingHfMsg, 'createdAt'>): void {
    if (isSent(sentKey(msg.leadUid), sentType(msg.step))) {
        console.log(`⏭️ HF step${msg.step} already sent — skipping enqueue: ${msg.leadUid}`);
        return;
    }
    const q = load();
    if (q.some(m => m.leadUid === msg.leadUid && m.step === msg.step)) return;
    q.push({ ...msg, createdAt: new Date().toISOString() });
    save(q);
    console.log(`📋 Queued HF inbox step${msg.step}: ${msg.guestName} (${msg.leadUid})`);
}

function dequeue(leadUid: string, step: PendingHfMsg['step']): void {
    save(load().filter(m => !(m.leadUid === leadUid && m.step === step)));
}

const stuckAlertedAt = new Map<string, number>(); // key = `${leadUid}:${step}`
const STUCK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const STUCK_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // re-alert every 1 hour max

export async function checkForStuckHfMessages(): Promise<void> {
    const now = Date.now();
    const queue = load();
    for (const msg of queue) {
        const ageMs = now - new Date(msg.createdAt).getTime();
        if (ageMs < STUCK_THRESHOLD_MS) continue;
        const key = `${msg.leadUid}:${msg.step}`;
        const lastAlert = stuckAlertedAt.get(key) ?? 0;
        if (now - lastAlert < STUCK_ALERT_COOLDOWN_MS) continue;
        stuckAlertedAt.set(key, now);
        const hours = Math.floor(ageMs / 3_600_000);
        await sendAlert(
            `⚠️ <b>HF Inbox Message Stuck</b>\n─────────────────\n` +
            `👤 <b>Guest:</b> ${msg.guestName}\n` +
            `📋 <b>Step:</b> ${msg.step}\n` +
            `⏱️ <b>Waiting:</b> ${hours}h\n` +
            `─────────────────\n<i>Queue entry may need manual check · COZMO</i>`
        ).catch(() => { });
    }
}

let flushing = false;
export async function flushPendingHfMessages(): Promise<void> {
    if (flushing) return;
    const now = Date.now();
    const due = load().filter(m => new Date(m.fireAt).getTime() <= now);
    if (!due.length) return;

    flushing = true;
    console.log(`🔄 Flushing ${due.length} pending HF inbox message(s)...`);
    try {
        for (const msg of due) {
            const sk = sentKey(msg.leadUid);
            const st = sentType(msg.step);
            if (isSent(sk, st)) {
                dequeue(msg.leadUid, msg.step);
                console.log(`⏭️ HF step${msg.step} already sent — dequeued: ${msg.leadUid}`);
                continue;
            }
            try {
                if (msg.step === 1) {
                    await sendInboxMessage(msg.leadUid, msg.guestName, msg.langCode ?? 'EN', msg.leadType, msg.propertyCode);
                } else if (msg.step === 2) {
                    await sendStep2Message(msg.leadUid, msg.guestName, msg.country ?? 'OTHER', msg.leadType);
                } else if (msg.step === 'no_wa') {
                    await sendNoWaFallbackMessage(msg.leadUid, msg.guestName);
                } else if (msg.step === 'pre_payment') {
                    await sendPrePaymentMessage(msg.leadUid, msg.guestName, msg.langCode ?? 'EN', msg.leadType);
                }
                dequeue(msg.leadUid, msg.step);
                markSent(sk, st);
                console.log(`✅ HF inbox step${msg.step} sent: ${msg.guestName}`);
            } catch (e: any) {
                const status = e?.response?.status;
                if (status && status >= 400 && status < 500) {
                    dequeue(msg.leadUid, msg.step);
                    console.error(`❌ HF inbox step${msg.step} permanent failure (${status}) — dequeued: ${msg.leadUid}`);
                } else {
                    console.error(`❌ HF inbox step${msg.step} failed (${msg.leadUid}):`, e?.message);
                }
            }
        }
    } finally {
        flushing = false;
    }
}
