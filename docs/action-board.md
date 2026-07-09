# Action Board — Dashboard Plan

> Supersedes the narrow scope of `docs/property-ops-dashboard.md`.
> That spec covered pest control + plant watering only. This extends the same
> task model to **guest requests** — the bigger source of manual monitoring.

---

## Why this exists

We already run two systems that the dashboard must **not** rebuild:

| System | Owns | Dashboard must NOT duplicate |
|---|---|---|
| **Hostfully** | Bookings, calendar, property/guest data | A calendar or booking browser |
| **Jandi** | Team conversation + raw alert stream | A chat or a scrolling alert feed |
| **COZMO Dashboard** | **The open loop** — every detected signal → tracked, owned, closed action | — |

North star (CLAUDE.md): *staff only act, never monitor.*

Jandi alerts force monitoring — you must watch the feed so nothing is missed.
**The dashboard's only job is to kill that monitoring**: every request becomes a
card that cannot disappear until someone closes it.

The dashboard is not a viewer. It is an execution surface. One question on screen
at all times: **what needs a human now, who owns it, is it done?**

---

## The gap today

- AI already detects guest requests (`detectGuestIntentWithContext`).
- On detection it saves a Hostfully note + fires **one** Jandi/Telegram alert.
- Then the signal is gone. No record of "is this handled, who owns it."
- `/ops` kanban is real UI but runs on hardcoded `INITIAL_TASKS` — no backend.
- `/bookings` duplicates Hostfully. `/alerts` duplicates Jandi.

---

## Core idea: one unified task model

Merge **guest requests** and **property ops tasks** into a single board.
Three columns: `new → doing → done`. Every card carries a property, optional
guest, an owner, and a source.

Cards are created from three feeds COZMO already produces but currently discards:

1. **Guest requests** — AI intent detection, funneled from WA / LINE / Kakao /
   WeChat. *Biggest win, reuses existing detection code.*
2. **Property routines** — pest control, plant watering, cleaning turnovers
   (recurring schedules).
3. **Booking lifecycle** — check-in / checkout today auto-spawn ops cards
   (clean, key handoff), driven off booking data the dashboard already fetches.

Jandi stays the input channel **and** the mirror:
- Card created → Jandi ping.
- Card closed → Jandi update in the same thread.
- Card ignored too long → Jandi reminder to the owner.

Nobody watches two places.

---

## Task schema (`src/data/tasks.json`)

Same JSON-store pattern as `group-leads.json`. Migrate to Supabase later.

```ts
interface Task {
  id: string;
  property: string;          // property name / code
  title: string;             // what to do
  type: 'guest_request' | 'pest_control' | 'plant_watering' | 'cleaning' | 'iot';
  status: 'new' | 'doing' | 'done';
  assignee: string | null;   // AI-assigned on creation (see below)
  source: 'whatsapp' | 'line' | 'kakao' | 'wechat' | 'jandi' | 'schedule' | 'booking';
  leadUid?: string;          // links back to Hostfully lead when guest-originated
  guestName?: string;
  notes: string;
  createdAt: string;         // ISO, Asia/Seoul
  updatedAt: string;
}
```

---

## Assignment: AI auto-assigns from the start

Decision: COZMO picks property + assignee at card creation. Not self-assign-first.

- Property is usually already known (guest request → `leadUid` → property;
  routines/booking events carry the property).
- Assignee chosen by COZMO from the active team (Google Sheets) using simple
  rules first (round-robin / property ownership), LLM tie-break later.
- Staff can always reassign on the card. AI assignment is a starting point,
  not a lock.
- **Flag required** (CLAUDE.md config rule): `AI_AUTO_ASSIGN` in
  `ecosystem.config.js`. Off → cards arrive unassigned.

---

## Build order

### 🔴 Phase 1 — Make requests stop disappearing
- Add `src/data/tasks.json` store + service (`src/services/tasks.ts`).
- Guest-message flow: on AI detection, write a task card **in addition to** the
  existing alert. AI sets property + assignee.
- New bridge API: `GET/POST/PATCH /admin/tasks`.
- Rewire `/ops` from `INITIAL_TASKS` mock → real store. Status changes persist.
- Card actions: drag `new → doing → done`, reassign.

### 🟡 Phase 2 — Close the Jandi loop
- Card created → Jandi message. Card done → Jandi update, same thread.
- Booking lifecycle (checkin / checkout today) auto-spawns ops cards.

### 🟡 Phase 3 — Recurring + reminders
- Recurring schedules generate pest / plant / cleaning cards.
- Card stale in `new` beyond threshold → COZMO DMs owner in Jandi.
  - **Flag required:** `ENABLE_TASK_REMINDERS` + kill switch (any loop-send
    feature MUST have a boolean flag — CLAUDE.md hard rule).

### 🟠 Phase 4 — Trim duplication
- `/bookings` → thin context lookup, link out to Hostfully for detail.
- `/alerts` → demoted to debug/audit view. Action Board replaces it as primary.

---

## Home screen

- Keep the existing "guests in / arriving / departing" heartbeat card — genuine
  at-a-glance value Hostfully does not give in one number.
- Replace the long nav list with the live Action Board summary:
  **N open · M unassigned · K overdue.** The screen a manager opens 20×/day.

---

## Out of scope (for now)

- Finance / CEO reporting layer.
- IoT-linked tasks (after first workflows are stable).
- Due-time fields on cards.
- Rebuilding anything Hostfully or Jandi already does well.

---

## Open questions to resolve during build

- Jandi thread mapping: how to tie a card back to its originating Jandi message
  for the status mirror.
- Reminder threshold: what counts as "forgotten" (per task type?).
- Round-robin vs. property-ownership for the first AI assignment rule.
