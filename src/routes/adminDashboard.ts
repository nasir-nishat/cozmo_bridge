import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { CONFIG } from '../config/constants';
import { isWaReady } from '../platforms/whatsapp/evoClient';
import { checkLineAuth } from '../platforms/line/lineClient';
import { getLastKakaoHeartbeat } from '../services/kakaoWatchdog';
import { isWeChatInitialized } from '../platforms/wechat/bot';
import { getAllBookings } from '../services/bookingStore';
import { getRecentAlerts, subscribeSSE } from '../services/alertStore';
import { getAllTeamMembers } from '../services/sheets';
import { sendAlert } from '../services/notify';
import { getLeadUid } from '../services/groupLeads';
import { getGroupSteps, MessageType } from '../services/sentMessages';
import { getLivePropertyPricingEntry } from '../knowledge/livePricing';
import { webSearch } from '../knowledge/webSearch';
import { getExpenseSummary } from '../services/expenses';
import { getGoogleAuthStatus, isGoogleAuthAvailable } from '../services/google-auth';
import { getBuilds, BUILD_STEP_PLAN } from '../services/groupBuildProgress';
import { getQueuedGroupCreations } from '../services/pendingGroupCreation';
import { canAutoCreateGroup, nextEligibleAt, getPacingToday } from '../services/groupCreationPacing';

const router = Router();

const startedAt = Date.now();

function googleUnavailableResponse() {
    const status = getGoogleAuthStatus();
    const missing = status.missing.length ? status.missing.join(', ') : 'Google auth';
    return {
        degraded: true,
        google: status,
        error: status.error || `Google Sheets unavailable: missing ${missing}`,
    };
}

// GET /admin/health
router.get('/admin/health', async (_req, res) => {
    const kakaoLastSeen = getLastKakaoHeartbeat();
    const kakaoAgeMs = kakaoLastSeen ? Date.now() - kakaoLastSeen : null;
    const lineStatus: { connected: boolean; checkedAt: number; error?: string } = CONFIG.ENABLE_LINE
        ? await checkLineAuth()
        : { connected: false, checkedAt: Date.now() };

    res.json({
        ok: true,
        bridge: {
            uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
            pid: process.pid,
            mode: CONFIG.APP_MODE,
        },
        platforms: {
            whatsapp: {
                enabled: CONFIG.ENABLE_WHATSAPP,
                connected: CONFIG.ENABLE_WHATSAPP && isWaReady(),
            },
            line: {
                enabled: CONFIG.ENABLE_LINE,
                connected: CONFIG.ENABLE_LINE && lineStatus.connected,
                checkedAt: lineStatus.checkedAt,
                error: lineStatus.error || null,
            },
            kakao: {
                enabled: CONFIG.ENABLE_KAKAO,
                lastHeartbeatMs: kakaoLastSeen || null,
                ageMs: kakaoAgeMs,
                connected: CONFIG.ENABLE_KAKAO && kakaoAgeMs !== null && kakaoAgeMs < 5 * 60 * 1000,
            },
            wechat: {
                enabled: CONFIG.ENABLE_WECHAT,
                connected: CONFIG.ENABLE_WECHAT && isWeChatInitialized(),
            },
        },
        google: getGoogleAuthStatus(),
        ts: Date.now(),
    });
});

// GET /admin/bookings
router.get('/admin/bookings', (_req, res) => {
    try {
        res.json({ ok: true, bookings: getAllBookings() });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message });
    }
});

// GET /admin/alerts/recent
router.get('/admin/alerts/recent', (_req, res) => {
    res.json({ ok: true, alerts: getRecentAlerts() });
});

// GET /admin/alerts/stream  — SSE
router.get('/admin/alerts/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send buffered alerts as initial batch
    for (const alert of getRecentAlerts(20).reverse()) {
        res.write(`data: ${JSON.stringify(alert)}\n\n`);
    }

    subscribeSSE(res);

    // Heartbeat every 25s to prevent proxy timeouts
    const hb = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { clearInterval(hb); }
    }, 25_000);
    req.on('close', () => clearInterval(hb));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, string> {
    try {
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return {}; }
}

function detectPlatform(groupId: string): string {
    if (groupId.endsWith('@g.us')) return 'whatsapp';
    if (groupId.startsWith('line:')) return 'line';
    if (groupId.startsWith('kakao:')) return 'kakao';
    if (groupId.startsWith('wechat:')) return 'wechat';
    return 'unknown';
}

// GET /admin/groups
router.get('/admin/groups', (_req, res) => {
    const root = process.cwd();
    const groupLeads = readJson(path.join(root, 'src/data/group-leads.json'));
    const groupNames = readJson(path.join(root, 'src/data/group-names.json'));
    const kakaoNames = readJson(path.join(root, 'src/data/kakao-chat-names.json'));
    const bookings = getAllBookings();

    const groups = Object.entries(groupLeads)
        .filter(([id]) => detectPlatform(id) !== 'unknown')
        .map(([groupId, leadUid]) => {
            const platform = detectPlatform(groupId);
            const name = platform === 'kakao' ? (kakaoNames[groupId] || null) : (groupNames[groupId] || null);
            const booking = bookings.find(b => b.leadUid === leadUid) || null;
            return { groupId, leadUid, platform, name, booking };
        });

    res.json({ ok: true, groups });
});

// GET /admin/group-steps — per-group guest-lifecycle checklist (done / by whom / when)
// Powers the admin-ui checklist so the team can see what COZMO did vs what they handled manually.
router.get('/admin/group-steps', (_req, res) => {
    const root = process.cwd();
    const groupLeads = readJson(path.join(root, 'src/data/group-leads.json'));
    const groupNames = readJson(path.join(root, 'src/data/group-names.json'));

    // Ordered guest lifecycle — labels are what the team sees in the UI
    const STEPS: Array<{ type: MessageType; label: string }> = [
        { type: 'welcome', label: 'Welcome' },
        { type: 'checkin_tips', label: 'Check-in tips' },
        { type: 'checkin_rules', label: 'Check-in rules' },
        { type: 'checkout_reminder', label: 'Checkout reminder' },
        { type: 'farewell', label: 'Farewell' },
        { type: 'final_bill', label: 'Final bill' },
    ];
    const types = STEPS.map(s => s.type);

    const groups = Object.entries(groupLeads)
        .filter(([id]) => detectPlatform(id) === 'whatsapp')
        .map(([groupId, leadUid]) => {
            const steps = getGroupSteps(groupId, types).map((s, i) => ({
                type: s.type,
                label: STEPS[i].label,
                done: s.done,
                by: s.by,       // 'cozmo' | 'team' | null
                at: s.at,
            }));
            const doneCount = steps.filter(s => s.done).length;
            return {
                groupId,
                leadUid,
                name: groupNames[groupId] || null,
                steps,
                progress: `${doneCount}/${steps.length}`,
            };
        });

    res.json({ ok: true, groups });
});

// GET /admin/group-builds — live WA group-creation pipeline for the admin-ui:
// pacing gate state, queued jobs with ETAs, and per-build step progress ("what happens after what")
router.get('/admin/group-builds', (_req, res) => {
    const pacing = getPacingToday();
    const gate = canAutoCreateGroup();
    const baseEta = nextEligibleAt().getTime();

    const queue = getQueuedGroupCreations().map((job, i) => ({
        leadUid: job.leadUid,
        guestName: job.guestName,
        property: job.property,
        checkIn: job.checkIn,
        queuedAt: job.createdAt,
        // Same estimate the "Group Scheduled" Jandi alert uses: each job ~one min-gap after the previous
        eta: new Date(Math.max(new Date(job.fireAt).getTime(), baseEta + i * CONFIG.GROUP_CREATION_MIN_GAP_MS)).toISOString(),
    }));

    res.json({
        ok: true,
        pacing: {
            todayCount: pacing.count,
            dailyCap: CONFIG.GROUP_CREATION_DAILY_CAP,
            minGapMinutes: Math.round(CONFIG.GROUP_CREATION_MIN_GAP_MS / 60000),
            activeHours: `${CONFIG.GROUP_CREATION_HOUR_START}:00–${CONFIG.GROUP_CREATION_HOUR_END}:00 KST`,
            canCreateNow: gate.ok,
            holdReason: gate.reason || null,
            nextEligibleAt: new Date(baseEta).toISOString(),
        },
        plan: BUILD_STEP_PLAN,
        queue,
        builds: getBuilds(),
    });
});

// GET /admin/staff
router.get('/admin/staff', async (_req, res) => {
    if (!isGoogleAuthAvailable()) {
        return res.json({ ok: true, staff: [], ...googleUnavailableResponse() });
    }

    try {
        const staff = await getAllTeamMembers();
        res.json({ ok: true, staff });
    } catch (e: any) {
        res.json({ ok: true, staff: [], degraded: true, error: e?.message });
    }
});

// POST /admin/lead-pricing — returns live Hostfully pricing facts for a group
// Called by admin-ui chat when staff has a group selected and asks about pricing
router.post('/admin/lead-pricing', async (req, res) => {
    const { groupKey, message = '' } = req.body || {};
    if (!groupKey) return res.status(400).json({ ok: false, error: 'groupKey required' });

    const leadUid = getLeadUid(groupKey);
    if (!leadUid) return res.json({ ok: true, facts: [] });

    try {
        const entry = await getLivePropertyPricingEntry(leadUid, message || 'price rate cost');
        res.json({ ok: true, facts: entry?.facts ?? [], title: entry?.title ?? '' });
    } catch (e: any) {
        res.json({ ok: true, facts: [] });
    }
});

// POST /admin/web-search — proxies Serper search for admin-ui chat (key lives in bridge env)
router.post('/admin/web-search', async (req, res) => {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ ok: false, error: 'query required' });

    try {
        const result = await webSearch(String(query));
        res.json({ ok: true, found: result.found, text: result.text, source: result.source });
    } catch (e: any) {
        res.json({ ok: true, found: false, text: '' });
    }
});

// GET /admin/expenses/summary — unsettled expense totals per group (hits Google Sheets)
router.get('/admin/expenses/summary', async (_req, res) => {
    if (!isGoogleAuthAvailable()) {
        return res.json({ ok: true, summary: [], ...googleUnavailableResponse() });
    }

    try {
        const summary = await getExpenseSummary();
        res.json({ ok: true, summary });
    } catch (e: any) {
        res.json({ ok: true, summary: [], degraded: true, error: e?.message });
    }
});

// POST /admin/chat-alert — fired by admin-ui when a guest_draft response is generated
router.post('/admin/chat-alert', async (req, res) => {
    res.json({ ok: true });
    const { guestMessage, draft, propertyCode } = req.body || {};
    if (!guestMessage) return;

    const property = propertyCode ? ` (${propertyCode})` : '';
    const draftStr = draft ? String(draft) : ''
    const draftLine = draftStr
        ? `\n📝 <b>Draft:</b> ${draftStr.slice(0, 300)}${draftStr.length > 300 ? '…' : ''}`
        : '';

    await sendAlert(
        `🙋 <b>Guest Needs Staff</b>\n─────────────────\n` +
        `💬 <b>Guest asked:</b> ${guestMessage}${property}${draftLine}\n` +
        `─────────────────\n<i>COZMO couldn't answer — staff take over in Admin Chat · COZE Hospitality</i>`,
        { useTestJandi: true },
    ).catch(() => {});
});

export default router;
