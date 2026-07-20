import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/constants';
import { waReadyDurationMs } from '../platforms/whatsapp/evoClient';

const FILE = path.join(process.cwd(), 'src/data/group-creation-pacing.json');

interface PacingState {
    day: string;            // KST date the count belongs to
    count: number;          // groups created that day (auto + manual — WA sees them the same)
    lastCreatedAt: number;  // epoch ms of the most recent creation
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

export function canAutoCreateGroup(): { ok: boolean; reason?: string } {
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
