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
