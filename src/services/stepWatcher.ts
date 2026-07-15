// Always-on watcher: detects guest-lifecycle steps that a HUMAN completed manually in a group
// (e.g. a team member pasted the checkout reminder) and checkmarks them as done-by-team, so COZMO
// won't re-send them and the admin-ui shows an accurate per-group checklist.
//
// Hybrid triggering: near-real-time (debounced) when a human posts in a group, plus a periodic
// sweep as a backstop. Detection reuses the existing local-LLM similarity check (wasAlreadySent).

import { MessageType, isSent, markSent } from './sentMessages';
import { getGroupLang } from './groupLeads';
import { getActiveGroupKeys, getRecentMessages } from './messageBuffer';
import { getScheduledMessage, getTipsMessage } from './sheets';
import { wasAlreadySent } from './llm';
import { sendAlert } from './notify';
import { propertyCodeFromName } from '../platforms/whatsapp/groupNaming';
import { getStoredGroupName } from './groupLeads';

const LOOKBACK_MIN = 180;

// Steps whose completion a human might do by hand, each with the sheet template to match against.
// final_bill is intentionally excluded — it embeds variable expense data, so template matching is unreliable.
const WATCHED: Array<{ step: MessageType; label: string; fetch: (lang: string) => Promise<string> }> = [
    { step: 'checkin_tips', label: 'Check-in tips', fetch: (l) => getTipsMessage('breakfast_tips', l) },
    { step: 'checkin_rules', label: 'Check-in rules', fetch: (l) => getTipsMessage('guest_rules', l) },
    { step: 'checkout_reminder', label: 'Checkout reminder', fetch: (l) => getScheduledMessage('checkout_reminder', l) },
    { step: 'farewell', label: 'Farewell', fetch: (l) => getScheduledMessage('farewell_reminder', l) },
];

// Per-group scan lock + last-scan time so real-time bursts and the sweep don't pile up LLM calls
const scanning = new Set<string>();
const lastScanAt = new Map<string, number>();
const MIN_RESCAN_MS = 90 * 1000;

async function scanGroup(groupKey: string): Promise<void> {
    // Scope to WhatsApp — that's the platform with the ban-sensitive automation and template steps
    if (!groupKey.endsWith('@g.us')) return;
    if (scanning.has(groupKey)) return;
    if (Date.now() - (lastScanAt.get(groupKey) ?? 0) < MIN_RESCAN_MS) return;

    // Nothing to detect if every watched step is already done
    const pending = WATCHED.filter(w => !isSent(groupKey, w.step));
    if (!pending.length) return;

    // No human activity in window → nothing could have been done manually
    if (getRecentMessages(groupKey, LOOKBACK_MIN).length === 0) return;

    scanning.add(groupKey);
    lastScanAt.set(groupKey, Date.now());
    try {
        const lang = getGroupLang(groupKey) || 'EN';
        for (const w of pending) {
            const template = await w.fetch(lang).catch(() => '');
            if (!template) continue;
            const doneByHuman = await wasAlreadySent(groupKey, template, LOOKBACK_MIN).catch(() => false);
            if (!doneByHuman) continue;
            if (isSent(groupKey, w.step)) continue; // re-check: may have been marked meanwhile
            markSent(groupKey, w.step, 'team');
            const name = getStoredGroupName(groupKey) || groupKey;
            console.log(`🕵️ Step watcher: "${w.label}" detected done-by-team in ${name}`);
            sendAlert(
                `☑️ <b>Step Auto-Checked (done by team)</b>\n─────────────────\n` +
                `💬 <b>Group:</b> ${name}\n` +
                `✅ <b>Step:</b> ${w.label}\n` +
                `─────────────────\n` +
                `🤖 <i>COZMO saw the team handled this and marked it done — it won't re-send.</i>`,
                { telegramOnly: true, propertyCode: propertyCodeFromName(name) || undefined }
            ).catch(() => {});
        }
    } finally {
        scanning.delete(groupKey);
    }
}

// ── Real-time trigger (debounced) ────────────────────────────────────────────
const debounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 60 * 1000;

// Call when a human posts in a group. Waits for the burst to settle, then scans once.
export function noteGroupActivity(groupKey: string): void {
    if (!groupKey.endsWith('@g.us')) return;
    const existing = debounce.get(groupKey);
    if (existing) clearTimeout(existing);
    debounce.set(groupKey, setTimeout(() => {
        debounce.delete(groupKey);
        scanGroup(groupKey).catch(e => console.error('❌ stepWatcher scan error:', e?.message));
    }, DEBOUNCE_MS));
}

// ── Periodic sweep (backstop) ────────────────────────────────────────────────
export async function sweepStepWatcher(): Promise<void> {
    const groups = getActiveGroupKeys(LOOKBACK_MIN).filter(g => g.endsWith('@g.us'));
    for (const groupKey of groups) {
        await scanGroup(groupKey).catch(e => console.error('❌ stepWatcher sweep error:', e?.message));
    }
}
