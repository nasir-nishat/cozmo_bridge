# COZMO Automated Guest Messages

> All times are **KST (Asia/Seoul)**. Messages are only sent to guests whose check-in or check-out date matches the trigger — never broadcast to everyone.

---

## Overview

COZMO automatically sends messages to guests at the right time based on their booking dates. Staff don't need to do anything — messages go out on their own.

### Check-In Day

**3:00 PM — Stay Tips** (3 messages, a few seconds apart)
1. How to use the breakfast groceries — **only sent for stays of 4+ nights** (skipped under 4 nights, same as JTS property)
2. How to order food delivery
3. How to book a van / taxi

**7:00 PM — House Rules**
Noise policy, furniture rules, checkout time reminder, etc.

### Night Before Checkout

**9:00 PM — Checkout Pack** (sent only to guests checking out tomorrow)
1. Checkout instructions
2. Expense summary + total — skipped if no expenses logged
3. Payment methods — skipped if no expenses

### Checkout Day

**7:00 AM — Final Bill** *(coming soon)*
Only sent if new expenses were added after the 9PM summary.

**9:00 AM — AM Checkout Instructions** *(KakaoTalk only)*
Re-sends the same checkout instructions text (`checkout_reminder`, KR) as a same-day morning reminder for domestic guests. Independent of the 9PM night-before send — tracked as its own `checkout_instructions_am` sent-type so neither blocks the other.

**3:00 PM — Farewell**
A goodbye message.

### Languages

| Platform | Language |
|----------|---------|
| KakaoTalk | Always Korean |
| WeChat | Always Chinese |
| WhatsApp / LINE | Based on guest nationality — KR→Korean, JP→Japanese, CN/TW→Chinese, else English |

If a translation is missing, English is sent automatically.

### Editing Message Content

All message text lives in the **COZMO_DATA Google Sheet**. Edit the text there — no code changes needed.

| Sheet tab | Contents |
|-----------|---------|
| `check_in_msgs` | Breakfast tips, food ordering, van taxi, house rules |
| `check_out_msgs` | Checkout instructions, payment info, farewell |
| `group_creation_msgs` | Welcome messages sent when a group is first created |
| `booking_msgs` | Booking confirmation message |

---

## Technical Details

### Services

| Service | File | Flag |
|---------|------|------|
| Check-in reminders | `src/services/checkinReminder.ts` | `ENABLE_CHECKIN_REMINDER=true` |
| Checkout reminders | `src/services/checkoutReminder.ts` | `ENABLE_CHECKOUT_REMINDER=true` |

Flags live in `ecosystem.config.js`. Set to `'false'` to pause without touching code.

### Full Schedule

```
CHECK-IN DAY  (booking.checkIn === today KST)
  15:00  → breakfast_tips      (check_in_msgs tab)
  15:03  → food_tips           (check_in_msgs tab, 3s delay)
  15:06  → van_tips            (check_in_msgs tab, 3s delay)
  19:00  → guest_rules         (check_in_msgs tab)

NIGHT BEFORE CHECKOUT  (booking.checkOut === tomorrow KST)
  21:00  → checkout_reminder   (check_out_msgs tab)
           → expense summary   (settled=false rows for leadUid — skipped if none)
           → payment_reminder  (check_out_msgs tab — skipped if no expenses)

CHECKOUT DAY  (booking.checkOut === today KST)
  07:00  → final_bill               (check_out_msgs tab — skipped if no new expenses since 9PM)
  09:00  → checkout_reminder (KR)   (Kakao only — re-sent as "checkout_instructions_am")
  15:00  → farewell_reminder        (check_out_msgs tab)
```

### Trigger Logic

Bookings come from the in-memory `bookingStore` (backed by `src/data/active-bookings.json`, refreshed daily at 15:00 KST and on startup via Hostfully API).

```ts
getBookingsCheckingIn(dateStr)   // checkIn === dateStr
getBookingsCheckingOut(dateStr)  // checkOut === dateStr
// dateStr = YYYY-MM-DD in KST
```

### Platform Delivery

Each booking can have multiple linked groups across platforms. The reminder loops over all of them via `getAllGroupsByLeadUid(leadUid)`.

| Group key format | Platform | Send method |
|------------------|----------|------------|
| `xxxxxxxxx@g.us` | WhatsApp | `evoSendText()` |
| `line:xxxxxxxx` | LINE | `pushMessage()` |
| `wechat:xxxxxxxx` | WeChat | `wechatSendText()` |
| `kakao:xxxxxxxx` | KakaoTalk | MessengerBot R inline HTTP response (`{ reply: ... }`) |

### Language Selection

```ts
if (platform === 'kakao')  lang = 'KR';
if (platform === 'wechat') lang = 'ZH';
// WhatsApp + LINE: nationality-based
// KR→KR, JP→JA, CN/TW→ZH, else EN
// ZH normalizes to ZH-CN for sheet column lookup
```

### Sheet Functions (`src/services/sheets.ts`)

| Function | Tab | Used by |
|----------|-----|---------|
| `getMessages(lang)` | `group_creation_msgs` | Group creation welcome flow |
| `getBookingConfirmationMessage(lang)` | `booking_msgs` | Hostfully inbox message |
| `getTipsMessage(key, lang)` | `check_in_msgs` | Check-in tips & rules |
| `getScheduledMessage(key, lang)` | `check_out_msgs` | Checkout / farewell messages |

All tabs share the same column layout: `A: key | B: EN | C: KR | D: JA | E: ZH-CN | F: ZH-TW`

Fallback: empty translation cell → EN value returned automatically.

### Anti-Spam

Check-in tips are sent with a **3-second delay** between each message to avoid WhatsApp anti-ban triggers.

### Adding a New Scheduled Message

1. Add a row to the relevant sheet tab with the key and all language columns.
2. Call `getTipsMessage(key, lang)` or `getScheduledMessage(key, lang)` to fetch it.
3. Add the send call at the right cron time in the appropriate reminder service.
4. No other files need to change.
