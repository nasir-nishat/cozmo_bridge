import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/constants';
import { waReadyDurationMs } from '../platforms/whatsapp/evoClient';

const FILE = path.join(process.cwd(), 'src/data/group-creation-pacing.json');

interface PacingState {
    day: string;            // KST date the count belongs to
    count: number;          // groups created that day (auto + manual — WA sees them the same)
    lastCreatedAt: number;  // epoch ms of the most recent creation
    restrictedUntil?: number;  // epoch ms — set when WA itself rejects group creation (account-level, not transient)
    restrictedReason?: string;
}

const kstNow = () => new Date(Date.now() + 9 * 3600_000);
const kstDay = () => kstNow().toISOString().slice(0, 10);
const kstHour = () => kstNow().getUTCHours();

function load(): PacingState {
    try {
        const s = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        if (s && typeof s.count === 'number' && typeof s.day === 'string') return s;
    } catch { }
    return { day: kstDay(), count: 0, lastCreatedAt: 0 };
}

function save(s: PacingState): void {
    try { fs.writeFileSync(FILE, JSON.stringify(s, null, 2)); }
    catch (e: any) { console.error('❌ groupCreationPacing save:', e?.message); }
}

// Called after every successful group creation, including manual/forced ones —
// the account's daily footprint is what matters, not who triggered it
export function recordGroupCreated(): void {
    const s = load();
    const today = kstDay();
    if (s.day !== today) { s.day = today; s.count = 0; }
    s.count += 1;
    s.lastCreatedAt = Date.now();
    save(s);
    console.log(`🐢 Pacing: group ${s.count}/${CONFIG.GROUP_CREATION_DAILY_CAP} for ${s.day} (KST)`);
}

// Read-only snapshot for the admin-ui Group Builds page
export function getPacingToday(): { day: string; count: number } {
    const s = load();
    return s.day === kstDay() ? { day: s.day, count: s.count } : { day: kstDay(), count: 0 };
}

// Trip when WA/Evolution rejects group creation with an account-level restriction (e.g.
// account_reachout_restricted) rather than a transient error. That signal means the *account*,
// not this one job, is being throttled by WhatsApp — retrying every 2-min cycle would keep
// hammering a restricted number, which is exactly what risks escalating a strike into a ban.
// Persisted so it survives a pm2 restart; must be cleared manually once staff confirm WA is clear.
export function markAccountRestricted(reason: string, pauseHours = 24): void {
    const s = load();
    s.restrictedUntil = Date.now() + pauseHours * 3600_000;
    s.restrictedReason = reason;
    save(s);
    console.error(`🚫 WA account restriction detected — auto group creation paused ${pauseHours}h: ${reason}`);
}

export function clearAccountRestriction(): void {
    const s = load();
    delete s.restrictedUntil;
    delete s.restrictedReason;
    save(s);
    console.log('✅ WA account restriction cleared — auto group creation resumed');
}

export function getAccountRestriction(): { restricted: boolean; reason?: string; until?: string } {
    const s = load();
    if (s.restrictedUntil && Date.now() < s.restrictedUntil) {
        return { restricted: true, reason: s.restrictedReason, until: new Date(s.restrictedUntil).toISOString() };
    }
    return { restricted: false };
}

export function canAutoCreateGroup(): { ok: boolean; reason?: string } {
    const restriction = getAccountRestriction();
    if (restriction.restricted) {
        const left = Math.ceil((new Date(restriction.until!).getTime() - Date.now()) / 3600_000);
        return { ok: false, reason: `⛔ WA account restricted (${restriction.reason || 'rejected by WhatsApp'}) — ${left}h left or manual clear` };
    }
    const readyFor = waReadyDurationMs();
    if (readyFor < CONFIG.GROUP_CREATION_WARMUP_MS) {
        const left = Math.ceil((CONFIG.GROUP_CREATION_WARMUP_MS - readyFor) / 60000);
        return { ok: false, reason: readyFor === 0 ? 'WA session not open' : `session warm-up, ${left} min left` };
    }
    const hour = kstHour();
    if (hour < CONFIG.GROUP_CREATION_HOUR_START || hour >= CONFIG.GROUP_CREATION_HOUR_END) {
        return { ok: false, reason: `outside active hours (${CONFIG.GROUP_CREATION_HOUR_START}:00–${CONFIG.GROUP_CREATION_HOUR_END}:00 KST)` };
    }
    const s = load();
    if (s.day === kstDay() && s.count >= CONFIG.GROUP_CREATION_DAILY_CAP) {
        return { ok: false, reason: `daily cap reached (${s.count}/${CONFIG.GROUP_CREATION_DAILY_CAP})` };
    }
    const sinceLast = Date.now() - s.lastCreatedAt;
    if (s.lastCreatedAt && sinceLast < CONFIG.GROUP_CREATION_MIN_GAP_MS) {
        const left = Math.ceil((CONFIG.GROUP_CREATION_MIN_GAP_MS - sinceLast) / 60000);
        return { ok: false, reason: `min gap between groups, ${left} min left` };
    }
    return { ok: true };
}

// Roll a candidate epoch forward into the next allowed KST active-hours window
function clampToActiveHours(epoch: number): number {
    let d = new Date(epoch + 9 * 3600_000); // shift to KST wall-clock
    const h = d.getUTCHours();
    if (h < CONFIG.GROUP_CREATION_HOUR_START) {
        d.setUTCHours(CONFIG.GROUP_CREATION_HOUR_START, 0, 0, 0);
    } else if (h >= CONFIG.GROUP_CREATION_HOUR_END) {
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(CONFIG.GROUP_CREATION_HOUR_START, 0, 0, 0);
    }
    return d.getTime() - 9 * 3600_000; // shift back to real epoch
}

// Best estimate of when the NEXT queued group will actually be created,
// accounting for warm-up, daily cap (rolls to tomorrow), min gap, and active hours.
export function nextEligibleAt(): Date {
    const now = Date.now();
    let candidate = now;

    const readyFor = waReadyDurationMs();
    if (readyFor < CONFIG.GROUP_CREATION_WARMUP_MS) {
        candidate = Math.max(candidate, now + (CONFIG.GROUP_CREATION_WARMUP_MS - readyFor));
    }

    const s = load();
    if (s.restrictedUntil && now < s.restrictedUntil) {
        candidate = Math.max(candidate, s.restrictedUntil);
    }
    if (s.lastCreatedAt) {
        candidate = Math.max(candidate, s.lastCreatedAt + CONFIG.GROUP_CREATION_MIN_GAP_MS);
    }

    // Daily cap reached today → earliest is tomorrow's window opening
    if (s.day === kstDay() && s.count >= CONFIG.GROUP_CREATION_DAILY_CAP) {
        const t = new Date(now + 9 * 3600_000);
        t.setUTCDate(t.getUTCDate() + 1);
        t.setUTCHours(CONFIG.GROUP_CREATION_HOUR_START, 0, 0, 0);
        candidate = Math.max(candidate, t.getTime() - 9 * 3600_000);
    }

    return new Date(clampToActiveHours(candidate));
}
