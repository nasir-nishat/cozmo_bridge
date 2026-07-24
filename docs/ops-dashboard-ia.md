# Ops Dashboard IA — Reference

> **Status: parked.** Not building today. This captures the agreed nav structure
> for the internal ops dashboard so it's ready when we pick it up.

Audience: **COZE ops team** (internal office tool) — so members can see what's
going on across the operation. Not the customer-facing product.

---

## Guiding rule

> **Show state, not feeds. Pull, not push.**

"See what's going on" must not become a monitoring surface (the trap
`action-board.md` warns about).

- **State** = counts + ownership: *N open · M unassigned · K overdue · who's on what.*
  That's situational awareness without babysitting a stream.
- **Feed** = the raw scroll of every message/alert. Stays in Jandi.

Anything chat-like (e.g. Guest Chats) is a **read-only lookup** — a place you go
to check one thing, never a second inbox to sit and watch.

---

## Nav structure

**Live** — what's happening now
- Today — `/` (heartbeat: guests in/arriving/departing + open/unassigned/overdue)
- To-Do Board — `/ops` (the execution surface; the heart of the tool)
- System Status — `/health`

**Guests** — reference / lookup (pull)
- Bookings — `/bookings`
- Guests — 🆕 directory (no page yet)
- Guest Chats — `/messages` (read-only lookup; `/wa-archive` is the WA history)
- Guest Checklist — `/checklist`

**COZMO** — supervise the AI
- AI Tasks — `/tasks`
- Ask COZMO — `/chat`
- Agent Memory — evolve `/kb` (Knowledge Base + learning inbox)
- Evidence — 🆕 audit trail: what COZMO detected & did

**Admin** — the machinery (internal only)
- Staff — `/staff`
- Groups — `/groups`
- Group Builds — `/group-builds`
- KakaoTalk — `/kakao`
- Trends — `/analytics`
- Alerts — `/alerts` (demoted to debug/audit; no longer a primary surface)

---

## Deltas from the current `Sidebar.tsx`

Current groups: `COZMO / Operations / Platforms`. This regroups to
`Live / Guests / COZMO / Admin` and renames to plain-language labels.

- **To-Do Board** and **System Status** move up into **Live** (first glance =
  "what needs a human, is anything on fire?").
- Plumbing (Staff, Groups, Group Builds, KakaoTalk) is **kept**, not hidden —
  internal team needs it — but demoted to **Admin**.
- New pages required: **Guests** (directory), **Evidence** (audit trail).
- **Copy for AI** deferred until it has a concrete job.

## Missing feature to add when built

Since the point is *multiple members* seeing what's going on: **ownership +
presence** must be front-and-center — every card shows who owns it, and **Today**
shows a per-person split of who's handling what right now. That's what makes this
a shared workspace rather than a status board.
