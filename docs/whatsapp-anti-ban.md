# WhatsApp Anti-Ban — Incident, Enforcement Model & Fixes

**Status:** active mitigation shipped 2026-07-15 · auto group creation KEPT (core product), slowed & de-robotized
**Owner number:** +82 10 2622 6935 (dedicated COZMO business number, ~190 active guest groups)
**Related:** [whatsapp.md](whatsapp.md) · [welcome-style.md](welcome-style.md) · [booking-automation.md](booking-automation.md)

---

## 1. The incident (2026-07-15)

In one afternoon the COZMO concierge number hit WhatsApp enforcement **twice**, then got its device logged out:

1. **~14:47 KST** — bridge auto-created `COZE FB 31stOct Layton Liew 12A` (8 participants): 4 setting changes, 3 rounds of admin-promotion, welcome message blast. → **suspended pending review**.
2. **`COZE GKA 15thJul Ryan Thompson 1A2K`** (guest checking in that day) → also **suspended pending review**.
3. **~16:39 KST** — bridge started building a 3rd group (`COZE YT … Dylan Teh`). ~4 minutes in, WhatsApp force-closed the Evolution API session with `connection.update state:"close", statusReason:401` — a **server-side device logout**, not a network drop. Phone + Desktop stayed logged in; the linked (Baileys) device was kicked.

The bridge then sat in a `WA connection state:"close" — retrying in 5s` loop, unable to reconnect without a fresh QR scan.

"Group suspended pending review / Admin requested review / result within ~24h" = the group-level enforcement, one rung below a full number ban.

---

## 2. How WhatsApp engineers the blocking

Enforcement is a **layered risk score**, not one rule. Signals relevant to our flow (WhatsApp Help Center + anti-ban engineering write-ups, researched 2026-07-15):

| Layer | Signal | Danger threshold | What we were doing |
|---|---|---|---|
| Client | **Unofficial-client fingerprint** (Evolution API = Baileys) | instant / permanent | Whole flow runs on it — **root risk** |
| Content | **Identical template to many recipients** | >15/hr | Byte-identical welcome blast to every group |
| Graph | **Adding / messaging unsaved contacts** | heavily weighted | Guests force-added, never saved our number |
| Engagement | **Low received-to-sent reply ratio** + 2026 **unanswered-message counter** (30-day rolling) | reply <15% | Guests added, often never reply |
| Behavior | **Robotic burst / regular timing** | >60 grp actions, unnatural regularity | ~15 API writes in 15 min, fixed delays, 3× retry loops |
| Volume | msg/hr · new contacts/day | <30 · <20 (safe) | Two full group builds back-to-back |

**Root cause:** the account was scored as a bot — unofficial client + mechanical timing + identical marketing text to non-repliers who never saved the number. Two group builds in ~2h pushed it over the line.

**What is NOT fixable in code:** the Baileys fingerprint. As long as WhatsApp is driven by an unofficial client, residual permanent-ban risk remains on this number. Everything below *lowers the odds*; it does not zero them.

---

## 3. Fixes shipped (2026-07-15)

Auto-creation stays on. The strategy is **slow, low-volume, human-shaped, unique-per-guest**.

### 3.1 Pacing gate — `src/services/groupCreationPacing.ts`
Persists to `src/data/group-creation-pacing.json` (survives restarts). Gates `flushPendingGroupCreations` — **one group per flush cycle**, rest stay queued.

| Rule | Default | Env override |
|---|---|---|
| Min gap between groups | 1 h | `GROUP_CREATION_MIN_GAP_MS` |
| Daily cap (KST, counts manual + auto) | 5 | `GROUP_CREATION_DAILY_CAP` |
| Active hours (KST) | 10:00–21:00 | `GROUP_CREATION_HOUR_START` / `_HOUR_END` |
| Warm-up after WA reconnect | 30 min | `GROUP_CREATION_WARMUP_MS` |

The warm-up is measured via `evoClient.waReadyDurationMs()` and directly prevents the "blast right after re-linking the QR" ban pattern.

### 3.2 De-robotized per-group script — `src/platforms/whatsapp/groupCreation.ts`
All inter-step sleeps randomized & lengthened:
- Initial cooldown before messages: **8–15 min** (was fixed 3 min)
- Group setting changes: **25–50 s** apart (was fixed 3 s)
- Admin-promotion: **2 attempts** (was 3)
- Welcome messages: **2–5 min** apart (was 35–45 s)
- Group icon: deferred **30–45 min** (was 8 min)

### 3.3 Message variation — `src/utils/messageVariation.ts`
Makes every group's welcome text unique → defeats the identical-template signal and lifts reply ratio.
- `spin("{a|b|c}")` → random option (author-controlled variety)
- `{{name}}` / `{{property}}` placeholder fill
- Rotating personalized opener (`Hey Layton! 🙌` / `Welcome, Dylan! 🌿` …)
- Applied to `brand_msg` + `intro_msg` in `sendBookingMessages`. Plain text (no spintax) passes through unchanged — nothing breaks.

---

## 4. Still TODO (needs a human decision)

- [ ] **Add spintax variants to the Google-Sheet welcome bodies.** Code supports `{We don't just rent homes|We curate your entire stay}`, but the sheet still holds one fixed string — so today only the *opener* varies. Varying the body is the bigger anti-detection win. (Copy owner: Nishat/Gaya.)
- [ ] **Guest joins via invite link instead of being force-added.** Strongest structural fix — kills the "added an unsaved contact" signal *and* raises reply ratio (a link-tapper is far likelier to say hello). Product change: guest might not click. Needs Nishat's call.
- [ ] **Fixed staff member `8210-2862-1620`** fails admin promotion in every group → triggers the retry loop every time (pure bot noise). Fix their LID mapping or drop them from auto-promote.

---

## 5. Operational runbook

**Re-linking the QR after a logout:**
1. Do NOT re-scan while group creation is hot — the pending-message queue auto-flushes on reconnect. The 30-min warm-up now guards this, but confirm no group build is mid-flight.
2. Reconnect the device; first auto-group won't fire until 30 min after the session reports open.

**Kill switch (if enforcement recurs):**
- Env: `GROUP_CREATION_ENABLED=false` in `ecosystem.config.js` (persists across restarts — the real switch).
- Runtime (temporary, resets on restart): `POST http://localhost:3001/admin/toggle-groups {"enabled": false}`.

**Suspended groups:** review is auto-requested (~24h). Do NOT tap "Delete group for me." Keep normal human chatting in other groups from the phone/Desktop.

**Guest of a frozen group needs contact today:** reach them from a staff member's personal number or another channel (Kakao/LINE/WeChat) — do NOT spin up a replacement group via the bridge.

---

## 6. Strategic note

WhatsApp's official Business API does **not** support groups at all — so the group-concierge model can only ever run on a ToS-violating unofficial client. There is no "compliant" WhatsApp version of this flow to migrate to. Long-term, the WhatsApp leg should be the **most human-driven** of the four messengers; Kakao / LINE / WeChat don't carry this ban sword and are the safer rails to lean on.
