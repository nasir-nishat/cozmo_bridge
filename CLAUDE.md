# CLAUDE.md — COZMO Bridge

> **Session rule:** One task = one Claude Code session.
> Start every session with: *"Read CLAUDE.md. Confirm you understand the project. Then we will work on [ONE TASK ONLY]."*
> If context feels large → ask questions to reduce scope before coding.

---

## Vision

**COZE Hospitality 3.0 — Seoul STR, 300+ properties. Same team, 10x capacity.**

Core problem: Staff manually monitor WhatsApp/LINE/KakaoTalk group chats for guest requests. This is the bottleneck.

North star: COZMO joins guest group chats → detects requests → routes alerts → staff only *acts*, never *monitors*.

**Rule:** If a feature doesn't reduce manual staff monitoring → deprioritize it.

---

## Architecture

```
Hostfully PMS
    │
    ▼ webhook (Cloudflare Tunnel → webhook.coze.care)
Express :3001
    │
    ├── /webhook          → telegram.ts   → Telegram + Jandi alerts
    ├── /wa/webhook       → whatsapp.ts   → WA message handling
    ├── /line/webhook     → line.ts       → LINE message handling
    ├── /kakao/webhook    → kakao.ts      → KakaoTalk message handling
    ├── /wechat/*         → wechat.ts     → WeChat message handling
    ├── /guest/note       → guest.ts      → Guest request → HF note
    └── /link             → whatsapp.ts   → Map group → lead_uid

Admin UI  → Next.js :3002 (admin.coze.care) — see docs/admin-ui.md
Alerts    → Telegram (bot: 8519469737) + Jandi (webhook)
AI        → LM Studio :1234 (google/gemma-4-e4b) — local
State     → src/data/group-leads.json — migrating to Supabase

KakaoTalk → MessengerBot R on LDPlayer (this Windows machine) — see docs/kakao.md
WeChat    → @wechatferry/agent on this Windows machine (WeChat PC must be open)
```

**Reference docs** (read when task touches that area):
- `docs/routes.md` — full route table (bridge + admin API)
- `docs/services.md` — all service files and exported functions
- `docs/flows.md` — booking → group creation, guest message → alert flows
- `docs/whatsapp.md` — WA safety rules, Evolution API quirks, patched image
- `docs/kakao.md` — KakaoTalk setup, MessengerBot R, kakaocli, slash commands
- `docs/properties.md` — all 18 properties, codes, and mapping notes
- `docs/calendar.md` — Google Calendar event format, bundle fan-out, sync rules
- `docs/sheets.md` — Google Sheets tabs and columns
- `docs/supabase.md` — Supabase schema (pending migration)
- `docs/admin-ui.md` — admin dashboard, auth, deploy
- `docs/booking-automation.md` — booking confirmation + messenger connect flow
- `docs/jandi-receipt-scan.md` — Jandi Playwright receipt OCR setup
- `docs/action-board.md` — unified Action Board spec (guest requests + ops tasks → kanban; supersedes property-ops-dashboard)
- `docs/property-ops-dashboard.md` — property ops kanban working spec (pest/plant; superseded by action-board for new work)
- `docs/ai-learning-inbox.md` — KB correction inbox (admin `/learn` command)
- `docs/jandi.md` — Jandi channel map, webhook config, alert channels
- `docs/automations-messaging.md` — automated guest message schedule (check-in/out times, triggers)
- `docs/automations-expenses.md` — expense tracking automation
- `docs/welcome-style.md` — guest communication tone and style guide
- `docs/cloudflare.md` — Cloudflare Tunnel setup and runbook
- `docs/remote-ops.md` — remote ops from Mac terminal

---

## Commands

```bash
npm run build               # TypeScript → dist/
pm2 restart cozmo-bridge    # ← always use this for the Express process
pm2 logs cozmo-bridge       # tail logs
.\scripts\restart.ps1       # full clean restart (kills orphans, builds, starts)
.\scripts\restart-admin.ps1 # build + restart admin-ui only
.\scripts\health-check.ps1  # manual health diagnostic
```

**Never** run `npm run prod` to manage the bridge. Only `pm2` commands.

---

## Mode Rules

| Mode | Jandi | WA Group Members |
|---|---|---|
| `APP_MODE=dev` | Telegram only | Nasir (821097802701) + COZMO only |
| `APP_MODE=prod` | Telegram + Jandi | Active team from Google Sheets |

Platform flags (all in `ecosystem.config.js`): `ENABLE_WHATSAPP`, `ENABLE_LINE`, `ENABLE_KAKAO`, `ENABLE_WECHAT`, `GROUP_CREATION_ENABLED`.

---

## Hard Rules

- Never break existing webhook flow
- No bulk messaging, no rapid group creation — WA ban risk is real
- All secrets in `src/config/constants.ts` (no `.env` — move to env before VPS)
- `NODE_ENV=production` → platform.hostfully.com, `development` → sandbox
- WA chat history backfill not possible (E2E encryption) — COZMO only reads post-/link messages
- **NEVER send bulk messages to any platform without a kill switch.** Any loop-send feature MUST have a boolean flag in `ecosystem.config.js`. No exceptions.
- **NEVER modify `scripts/restart.ps1`** — it is locked. If restart behavior needs changing, update `ecosystem.config.js` or the relevant source file instead.
- **This system is LIVE and stable — every change must be blast-radius checked.** Before modifying any shared service (`src/services/*`), grep for ALL callers and verify each one still behaves correctly (does it catch? is it in a route with try/catch?). Prefer additive changes (new exports, new files) over rewriting existing functions. No drive-by refactors.
- **NEVER `catch { return {} }` around a state-file read that precedes a save.** A transient read failure then saves an empty store — this wiped all 228 group links on 2026-07-15 (`/link` + locked `group-leads.json`). Pattern to follow: `readStrict`/`readLenient`/`writeAtomic` in `src/services/groupLeads.ts` — mutations abort on read failure, getters stay lenient, saves are atomic with a `.backup.json`.
- **Never test against live `src/data`.** Verify risky logic in a sandbox dir (chdir + fake data files) with outbound sends stubbed.

---

## COZMO Identity & Message Policy

- Silent in groups by default — replies only when KB auto-reply is explicitly enabled
- Never shares internal info (door codes, team contacts) with guests
- Escalates to Nasir (+821097802701) always
- Sign off: `COZMO AI | Guest Care Team | COZE Hospitality 3.0`
- Tone: direct and concise, warm but professional, always action-oriented
- Always responds in the guest's language
- Never makes up information — if unknown, escalates

**All guest-facing lifecycle messages come from Google Sheets — COZMO never generates or wraps them.**
Fetch via `getMessages(lang)`, `getTipsMessage(key, lang)`, `getScheduledMessage(key, lang)`. Send exactly as returned.

**LLM is used only for:** guest intent detection, KB-backed auto-replies (`ENABLE_AUTO_REPLY`), staff message translation (LINE/WeChat), language detection on `/link`, and `wasAlreadySent()` checks. Never for scheduled lifecycle messages.

---

## Coding Patterns

### Adding a new Hostfully event alert
```ts
// constants.ts — add one line to ALERT_EVENTS
NEW_EVENT_TYPE: '🔔 <b>Event Title</b>',
// telegram.ts handles it automatically
```

### Adding a new WA/LINE command
```ts
// In handleIncomingMessage(), BEFORE the isOwnerMessage guard:
if (text.startsWith('/mycommand')) {
    // handle it
    return; // always return — never fall through to AI detection
}
if (isOwnerMessage) return;
```

### Adding a new platform
1. Create `src/routes/<platform>.ts` — copy LINE or kakao pattern
2. Add `ENABLE_<PLATFORM>` flag to `constants.ts` + `ecosystem.config.js`
3. Register route in `src/index.ts` behind the flag
4. Never modify existing WA, LINE, Kakao, or WeChat routes

### Alert format
```ts
await sendAlert(
    `🎯 <b>Title</b>\n─────────────────\n` +
    `👤 <b>Guest:</b> ${guest_name}\n` +
    `📋 <b>Field:</b> ${value}\n` +
    `─────────────────\n<i>via COZMO · COZE Hospitality</i>`
);
```

### File size rule
If any `src/` file exceeds **200 lines** → split it before adding more features.

### Config change rule
All behavior flags go in `ecosystem.config.js`. Never hardcode `true/false` for feature toggles. Always read via `CONFIG.FLAG_NAME` from `constants.ts`.

---

## Build Queue

| Priority | Feature |
|---|---|
| 🔴 | Commit stable v1.0.0 to GitHub |
| 🔴 | Move secrets to env vars (before VPS migration) |
| 🔴 | WA disconnect alert in watchdog |
| 🟡 | Populate Supabase properties table |
| 🟡 | Migrate group-leads.json → Supabase |
| 🟡 | Auto info dispatch (new member joins → property KB) |
| 🟡 | JANDI slash commands (`/eta /door /clean /ops`) |
| 🟡 | Guest KB auto-reply |
| 🟠 | VPS migration (4GB + Claude API) |

---

## Session End Checklist

1. Did I break any existing webhook flow? Check `pm2 logs`
2. Any edge cases missed? Ask: *"What could go wrong?"*
3. Is any file over 200 lines? Add refactor note to `todo.md`
4. Commit: `git add . && git commit -m "feat/fix: description"`
5. If stable on `dev` → merge to `main` + tag
