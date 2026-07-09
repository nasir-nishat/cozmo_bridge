# todo.md — COZMO Bridge

> Updated: 2026-06-30
> Rule: One task per Claude Code session.

---

## 🧠 COZMO AI — Central Employee

**Goal:** COZMO is the central AI employee — answers team, assists booked guests, talks to leads. Knowledge is editable from the dashboard so any team member can keep it accurate without touching files.

**North star check:** Every phase must reduce manual staff monitoring (CLAUDE.md rule). KB editor → brains are more accurate → fewer wrong escalations. @mention → guests self-serve → staff only act on what COZMO can't resolve. Team brain → staff get instant context without asking each other. All pass.

**What already exists — do not rebuild:**

- `knowledge-base.json` — 88 entries, 14 properties, 12 categories (triggers + facts + links)
- `kb.ts` — loads KB, `searchKBEntries()`, `reloadKB()`
- `router.ts` — trigger match → LLM classify → RouterResult (intent/risk/escalate)
- `replyAgent.ts` — builds prompt from KB facts + QA examples + chat history → GPT-4o reply
- `vibeGuide.ts` — VIBE_GUIDE tone string (covers the "vibe match" from whiteboard — no new file needed)
- `autoReplyPipeline.ts` — existing pipeline for WA auto-replies (guest brain will extend this)
- `adminKb.ts` — GET /admin/kb/entries, POST /admin/kb/sync-links (read-only today)
- `/kb` dashboard page — read-only view, property/category filters, search

**What is missing:**

1. KB is read-only — team cannot edit facts from the dashboard
2. No `@COZMO` mention trigger in group chats (guest brain not wired to platforms)
3. No team brain (staff DM → COZMO replies with ops context)
4. No daily memory snapshot (context COZMO draws on for team queries)
5. No feature flags for new brains — required by CLAUDE.md before any brain goes live
6. Dashboard home has basic stats — needs 5 operational columns from whiteboard

**Hard rules for all new code:**

- `ENABLE_GUEST_BRAIN` and `ENABLE_TEAM_BRAIN` flags must exist in `ecosystem.config.js` before any brain code runs — no exceptions (CLAUDE.md: all behavior flags in ecosystem.config.js)
- New brain files must stay under 200 lines — split if they grow
- @mention guest reply is additive — existing alert routing (request detection → Jandi/Telegram) still runs unchanged for all messages; @mention only adds a direct reply path on top

---

### Design System (apply to all phases)

Inspired by the Donezo reference — clean white base, generous whitespace, clear hierarchy, stat cards with large numbers. Brand colors from COZE Hospitality identity.

**Color tokens:**

- `--brand`: `#C4573B` — warm terracotta (primary accent, active nav, CTA buttons, stat highlights)
- `--brand-light`: `#F5EAE6` — tinted background for brand accents, hover states
- `--brand-dark`: `#A03D27` — pressed/active brand states
- `--slate`: `#5A6A7A` — secondary text, icons, muted labels
- `--slate-light`: `#F0F2F4` — card backgrounds, sidebar, chips
- `--border`: `#E4E7EB` — all card and divider borders
- `--text`: `#1A1F2E` — primary text (near-black, not pure black)
- `--text-muted`: `#7A8494` — secondary / caption text
- `--white`: `#FFFFFF` — card surfaces, content areas
- `--bg`: `#F6F7F9` — page background

**Layout:**

- Sidebar: 200px, white, `--border` right edge. Logo at top with COZE terracotta mark. Nav items grouped with small caps labels. Active item: `--brand` text + `--brand-light` background.
- Top header: white, 56px tall, `--border` bottom. Page title left, actions right.
- Page content: `--bg` background, `24px` padding, `max-width: none` (full width for columns).
- Cards: white, `border: 1px solid var(--border)`, `border-radius: 12px`, `padding: 20px`. No heavy shadows — keep it flat.

**Typography:**

- Stat numbers: `32–40px`, `font-weight: 700`, color varies by meaning
- Card titles: `13px`, `font-weight: 600`, `--text-muted`, uppercase, `letter-spacing: 0.06em`
- Body: `14px`, `--text`
- Captions: `12px`, `--text-muted`
- Font: system-ui (already in place)

**Status colors (consistent across all columns):**

- Arriving / active: `#2D7D46` (green)
- Departing / warning: `#D97706` (amber)
- Alert / offline: `#DC2626` (red)
- Linked / ok: `#16A34A`
- Brand action: `#C4573B`

---

### Phase 1 — Dashboard Columns ← START HERE

Replace the home dashboard (`/`) with the 5 operational columns from the whiteboard. Team gets a daily ops view before any brain is live.

- [ ] **Coming Today** — arriving + departing today: guest name, property, platform badge, group status. Data from existing `/admin/bookings` + `/admin/groups` APIs — no new backend needed.
- [ ] **Active Groups** — every linked group: guest name, property, platform (WA/LINE/KT/WC), linked/unlinked badge. Data from `/admin/groups`.
- [ ] **Tasks** — open tasks from `tasks.json` grouped by property, kanban-style status pills. Data from `/admin/tasks`.
- [ ] **Expenses** — per-group expense totals from the `/exp` ledger per active group. Needs new API: `GET /admin/expenses/summary`.
- [ ] **COZMO Todo** — generated list: no-group arrivals, open tasks unassigned, groups with unread requests. Derived client-side from the above data — no new backend.
- [ ] Layout: horizontal scroll on mobile, 5-column grid on desktop (≥1280px)

---

### Phase 2 — KB Editor (Dashboard)

Make `/kb` editable so the team can fix or add knowledge without touching JSON files directly.

#### 2A — Bridge API: write endpoints in `src/routes/adminKb.ts` (currently 55 lines — safe to extend)

- [ ] `PATCH /admin/kb/entry/:id` — update one entry's facts, triggers, title, sensitive flag
  - Read `knowledge-base.json` → find entry by id → merge changes → write file → call `reloadKB()`
  - Body: `{ facts?, triggers?, title?, sensitive? }` (partial update, only what's sent)
- [ ] `POST /admin/kb/entry` — create new entry
  - Body: `{ propertyCode, category, title, facts, triggers }` → generate id (slug from title) → append → write → reload
- [ ] `DELETE /admin/kb/entry/:id` — remove entry by id → write → reload
- [ ] All three write to `knowledge-base.json` and call `reloadKB()` so live bridge picks up instantly without restart

#### 2B — Dashboard UI: make `/kb` page editable

- [ ] **Inline fact edit** — click any fact bullet → becomes textarea → shows Save / Cancel → calls PATCH
- [ ] **Add fact** — "+" button at bottom of fact list → new inline textarea → Save appends to facts array
- [ ] **Delete fact** — "×" on hover next to each fact → removes from array → auto-saves
- [ ] **Trigger pill editor** — click "×" on trigger chip to remove; input field to add new trigger; auto-saves on Enter
- [ ] **Sensitive toggle** — small toggle on each card header → PATCH sensitive flag
- [ ] **Add entry** — "+ New Entry" button at top → slide-in inline form (not a modal): title, property code dropdown, category dropdown, facts (one per line textarea), triggers (comma-separated) → POST → card appears in list
- [ ] **Delete entry** — "Delete" on card → inline confirm ("Delete this entry?  Yes / Cancel") → DELETE
- [ ] After any save: show brief green "Saved" badge on card, no full page reload

#### 2C — Properties tab on `/kb` page

- [ ] Tab switcher: `All Entries` | `By Property`
- [ ] By Property view: one card per property code (B9, BS, F9, etc.)
  - Structured fields pulled from existing KB entries for that property: check-in time, check-out time, wifi, door code (masked, tap to reveal), house rules, capacity, nearby tips
  - Each field inline-editable → saves back to the matching KB entry's facts array
  - "Sensitive" fields (door code, wifi password) masked by default

---

### Phase 3 — Daily Memory Snapshot

Auto-generate context COZMO draws on when team asks "what's going on today".

- [ ] **`src/knowledge/memory.json`** — written by cron, read by team brain
  - Structure: `{ generatedAt, teamLevel: { todayCheckIns[], todayCheckOuts[], inHouseCount, openTasks, openExpenses }, groups: { [groupId]: { guestName, property, platform, lastActivity, openRequests[], recentExpenses[] } } }`
  - Source: `group-leads.json` + `active-bookings.json` + `tasks.json` + expense ledger
  - Written by: new function `generateDailyMemory()` in `src/services/memorySnapshot.ts`
  - Triggered: extend existing 03:00 KST cron job in bridge (reuse the buffer prune schedule)
  - Also triggered on-demand: `POST /admin/memory/refresh` (for manual refresh from dashboard)

---

### Phase 4 — COZMO Chat Brains

Wire knowledge into live chat. Both brains reuse the existing `replyAgent.ts` pipeline.

**3A — Flags first (required before any brain code)**

- [ ] Add `ENABLE_GUEST_BRAIN=false` and `ENABLE_TEAM_BRAIN=false` to `ecosystem.config.js`
- [ ] Add both to `CONFIG` in `src/config/constants.ts`
- [ ] All brain code checks the flag at runtime — if false, skip silently

**3B — Guest brain: `@COZMO` mention in linked group chats**

- [ ] **`src/knowledge/guestBrain.ts`** — new file, must stay under 200 lines
  - Input: `{ groupId, message, platform, lang }`
  - Guard: `ENABLE_GUEST_BRAIN` flag check
  - Look up property code from `group-leads.json`; if not linked → return null (stay silent)
  - `isLeadExpired()` guard — no reply post-checkout+7d
  - Call existing `routeGuestMessage()` → `generateReply()` with property-scoped KB (reuse, don't rebuild)
  - Rate limit: skip if last reply for this group < 30s ago (in-memory Map, cleared on restart)
  - Fallback if LLM unavailable: "Let me check and get back to you 🙏"
  - Reply in guest's detected language
- [ ] **WA** (`src/platforms/whatsapp/detection.ts`) — detect `@cozmo` before existing AI detection; strip mention; await guestBrain(); existing alert routing still runs after
- [ ] **LINE** (`src/routes/line.ts`) — detect `@cozmo` text; call guestBrain
- [ ] **KakaoTalk** (`src/routes/kakao.ts`) — detect `@코즈모` or `@cozmo`; call guestBrain
- [ ] **WeChat** — detect `@COZMO`; call guestBrain

**3C — Team brain: staff DM → COZMO replies**

- [ ] **`src/knowledge/teamBrain.ts`** — new file, must stay under 200 lines
  - Input: `{ senderId, platform, message }`
  - Guard: `ENABLE_TEAM_BRAIN` flag + `senderId` must be in `staff-ids.json`
  - Reads `memory.json` (daily snapshot) + live `group-leads.json` + `tasks.json`
  - Handles: "what's going on today", "summary of [property]", "who's checking in/out", "total expenses"
  - GPT-4o with team-focused prompt (direct, factual — different from guest tone in `vibeGuide.ts`)
- [ ] **WA DM entry point** — in WA detection, if `!isGroup` and staff sender → teamBrain
- [ ] **Telegram entry point** — in `src/routes/telegram.ts`, DM to bot from known staff → teamBrain

**3D — Lead brain (future — channel decision needed first)**

- [ ] Decide channel: WA DM from unknown number, LINE OA, or web widget
- [ ] Implement after guest + team brains are stable and tested

---

## Now

- [ ] **WeChat `/exp` — fix for COZMO PC account** — coded, needs restart + test
  - WechatFerry omits `msg.sender` on self-messages → `senderWxid=""` → `getStaffName` returns null → silent fail
  - Fix applied in `bot.ts`: fallback to `wxid_0u4ov1mylu8k22` when `is_self=true && !msg.sender`
  - Test: send `/exp total` from COZMO PC WeChat, check log shows correct sender

- [ ] **[PC] Remove "COZMO AI" ghost account from login screen**
  - Shows on login screen without logo — likely a leftover or Microsoft account duplicate

- [ ] **[PC] Auto-login — remove password + PIN requirement on boot**
  - Need to configure Windows auto-login (netplwiz or registry)

- [ ] **[AI learning] Review correction:** no, this is fine — `docs/ai-learning-inbox.md`
- [ ] **[AI learning] Review correction:** this is okay — `docs/ai-learning-inbox.md`
- [ ] **[AI learning] Review correction:** halal stores, but mostly not on Coupang Eats — `docs/ai-learning-inbox.md`
- [ ] **[AI learning] Review correction:** didn't mention Gimpo van details — `docs/ai-learning-inbox.md`

---

## 📋 Refactor queue

- [ ] Split `src/knowledge/replyAgent.ts` — over 200 lines; split retrieval scoring into shared module with `admin-ui/app/api/chat/route.ts`
- [ ] Split `scripts/build-knowledge-corpus.mjs` — over 200 lines after stricter corpus filtering
- [ ] Split `scripts/build-wa-knowledge-data.mjs` — curated fact definitions should move to JSON/YAML
- [ ] Split `admin-ui/app/ops/page.tsx` — over 200 lines; split task card, lane, summary into components
- [ ] Split `admin-ui/app/wa-archive/page.tsx` — over 200 lines; split filter controls and fact cards
- [ ] Split `admin-ui/app/api/chat/route.ts` — over 200 lines; split retrieval, prompt building, streaming
- [ ] Split `admin-ui/app/chat/page.tsx` — over 200 lines; split role controls, message list, composer
- [ ] Split `src/platforms/whatsapp/detection.ts` — over 200 lines; split commands, guest detection, auto-reply hooks
- [ ] Split `COZMO_AUTOREPLY_PLAN.md` — over 200 lines; split architecture, safety, data pipeline, rollout
- [ ] Split `docs/rag-pipeline.md` — over 200 lines; split current impl, target arch, rollout plan
- [ ] Split `src/services/checkoutReminder.ts` — 485 lines (was 431 before AM checkout instructions add); split send functions from catch-up/missed-alert logic
- [ ] Split `src/services/checkinReminder.ts` — 300 lines; split send functions from catch-up/missed-alert logic

---

## ✅ Done

- [x] Hostfully webhooks (9 events) → Telegram + Jandi alerts
- [x] WhatsApp message reading + AI request detection (Gemma 4)
- [x] Auto WA group creation on NEW_BOOKING
- [x] `/link <uid>` command in WA group
- [x] `/welcome` command in WA group (owner only)
- [x] `/welcome <uid>` command in LINE group (auto-links + sends messages)
- [x] Request cancellation detection (regex + AI)
- [x] Platform detection on new booking (WA + Telegram check)
- [x] LM Studio local AI (Gemma 4 E4B) integration
- [x] Google Sheets team + message templates (EN/KR)
- [x] Telegram MTProto session for phone lookup
- [x] pm2 auto-restart + Windows Task Scheduler
- [x] Watchdog health checks every 5 min → Telegram alert on failure
- [x] Anti-ban protections (delays, debounce 30s, waReady flag)
- [x] Evolution API migration (replaced Baileys/Puppeteer)
- [x] Owner detection fix (participant LID vs body.sender)
- [x] Message deduplication (double webhook fix)
- [x] GROUP_CREATION_ENABLED persistent via ecosystem.config.js
- [x] Standardized alert format (all platforms consistent)
- [x] LINE integration (webhook, request detection, welcome messages)
- [x] KakaoTalk integration via MessengerBot R (LDPlayer) + kakaocli sender_id enrichment
- [x] WeChat integration via @wechatferry/agent on Windows
- [x] Kakao send via MessengerBot R on LDPlayer (inline HTTP response)
- [x] Full booking automation — HF inbox Step 1 (immediate) + Step 2 (30 min delay)
- [x] Nationality detection → platform routing (WA / KakaoTalk / WeChat / LINE)
- [x] WA privacy fallback (team-only group + invite link to HF inbox)
- [x] `/link <uid> welcome` shortcut on all platforms
- [x] Expense ledger (`/exp`, `/exp list`, `/exp total`, `/exp done`) — all platforms
- [x] Checkin reminders — 15:00 tips, 19:00 rules (cron, all platforms)
- [x] Checkout reminders — 21:00 reminder, 07:00 final bill, 15:00 farewell (cron)
- [x] Restart resilience — pending-messages.json + pending-hf-messages.json queues
- [x] Deduplication — sent-messages.json prevents double sends across restarts
- [x] `/ckin` command — manual checkin tips + rules on WA, LINE, KakaoTalk
- [x] Removed startup reconciliation — was spamming old guests on every restart
- [x] catchUpCheckout + catchUpCheckin 1-hour grace window
- [x] Post-checkout silence — `isLeadExpired()` injected across all platforms
- [x] Message buffer + LLM catchup check — `messageBuffer.ts`, 70% similarity guard
- [x] KakaoTalk — production test passed
- [x] KakaoTalk — business card confirmed text-only (send as URL link)
- [x] MessengerBot R script — debug log lines cleaned up
- [x] MessengerBot R auto-start inside LDPlayer — configured
