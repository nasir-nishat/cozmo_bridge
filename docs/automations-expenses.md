# COZMO Expense Tracking

---

## Overview

Staff log expenses by typing `/exp AMOUNT REASON` in any linked guest group chat. COZMO saves it and automatically sends the summary to the guest at the right time before checkout.

### Commands

| Command | What it does |
|---------|-------------|
| `/exp 50000 Airport van` | Log an expense (₩ KRW) |
| `/exp -50000 Airport van` | Refund or correct an expense |
| `/exp list` | Show all unsettled expenses for this booking |

COZMO replies instantly in the group to confirm the log.

### Automated Schedule

```
Night before checkout  →  21:00 KST
    1. Checkout instructions
    2. Expense summary + total         (skipped if no expenses)
    3. Payment methods                 (skipped if no expenses)

Checkout morning       →  07:00 KST
    Final bill — only if new expenses were added after the 9PM send
    Skipped entirely if nothing new

Checkout day           →  15:00 KST
    Farewell message
```

### Guest-Facing Expense Message

```
🧾 Expense Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2026-05-27 | Airport van      ₩50,000
2026-05-28 | Convenience store ₩15,000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total:  ₩65,000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
via COZMO · COZE Hospitality
```

### Cleanup

All expense records are deleted **7 days after checkout** automatically.

---

## Technical Details

### Data Flow

```
Staff types /exp 50000 Taxi in group
    → handleExpCommand() — platform-agnostic handler
    → guard: group must be linked to a booking (leadUid required)
    → guard: sender must be in staff-ids.json for this platform
    → appended as a new row to Google Sheets `expenses` tab (settled: false)
    → COZMO replies in group: "✅ Expense logged"
```

### Automated Send Logic

```
21:00 KST — night before checkout  (checkOut === tomorrow KST)
    → sendExpenseSummary(leadUid): reads all settled=false rows for leadUid
    → if any: send guest message → mark all as settled=true
    → send payment_reminder if expenses were sent

07:00 KST — checkout morning  (checkOut === today KST)  ⚠️ NOT YET IMPLEMENTED
    → check for settled=false expenses for this leadUid
    → these are rows logged AFTER the 9PM run (9PM marks everything settled)
    → if any: send final_bill message + new list + new total
    → if none: skip entirely

15:00 KST — checkout day
    → farewell_reminder
```

### Google Sheets (`expenses` tab) — Source of Truth

One row per expense. All bookings share the same tab, filtered by `lead_uid`.

| id | lead_uid | group_id | group_name | platform | item | amount_krw | VAT 10% | VAT 10% + 4.5% | logged_by | created_at | settled |
|----|----------|----------|------------|----------|------|-----------|--------|---------|-----------|------------|---------|
| abc1 | lead-001 | 120xxx@g.us | BS_HongYunSoo | wa | Airport van | 50000 | 55000 | 57250 | Ricky | 2026-05-27T10:00:00Z | false |
| abc2 | lead-001 | 120xxx@g.us | BS_HongYunSoo | wa | Convenience store | 15000 | 16500 | 17175 | Gaya | 2026-05-27T14:30:00Z | false |
| abc3 | lead-002 | 120yyy@g.us | SG_KimMinJi | line | Taxi | 30000 | 33000 | 34350 | Ricky | 2026-05-28T09:00:00Z | true |

### Cleanup

`deleteOldExpenses()` runs daily at **03:00 KST**.
Removes rows where `settled = true` AND `created_at < 7 days ago`.
Unsettled expenses are never auto-deleted.

### Key Files

| File | Purpose |
|------|---------|
| `src/services/expenses.ts` | `handleExpCommand`, `sendExpenseSummary`, `deleteOldExpenses` |
| `src/services/checkoutReminder.ts` | 21:00 checkout + 07:00 final bill + 15:00 farewell crons |
| `src/platforms/whatsapp/detection.ts` | WA `/exp` entry point |
| `src/routes/line.ts` | LINE `/exp` entry point |
| `src/routes/kakao.ts` | Kakao `/exp` entry point |
| `src/platforms/wechat/bot.ts` | WeChat `/exp` entry point |

### Status

| Feature | Status |
|---------|--------|
| `/exp` command — all 4 platforms | ✅ Done |
| 21:00 checkout expense automation | ✅ Done |
| 07:00 final bill (new expenses only) | ✅ Done |
| 7-day cleanup | ✅ Done |
