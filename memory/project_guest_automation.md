---
name: project-guest-automation
description: Full guest communication automation timeline — check-in and check-out scheduled messages. All items complete as of 2026-06.
metadata:
  type: project
---

## Check-Out Flow (auto-send)
| Step | Time | Status |
|---|---|---|
| Checkout instructions | 9 PM day before | ✅ Done |
| Expense summary | 9 PM day before | ✅ Done |
| Payment method message | 9 PM day before | ✅ Done |
| Final bill (new expenses only) | 7 AM checkout day | ✅ Done |
| Farewell message | 3 PM checkout day | ✅ Done |

## Check-In Flow (auto-send)
| Step | Time | Status |
|---|---|---|
| Tips for stay | 3 PM check-in day | ✅ Done |
| Guest rules | 7 PM check-in day | ✅ Done |

**Why:** Guest-facing communication is fully automated — no manual staff sending required.
**How to apply:** All messages come from Google Sheets. Crons in `checkinReminder.ts` and `checkoutReminder.ts`. Restart resilience via `messageBuffer.ts` catchup check (1-hour window).

## Platform Stability Memory

- KakaoTalk is now considered stable for the overall COZMO system as of 2026-06-18.
- Current KakaoTalk setup is more stable than the previous Mac Mini relay approach: MessengerBot R on LDPlayer handles receive/send, and kakaocli on the Mac Mini is sender_id enrichment only.
- Still treat KakaoTalk as operationally sensitive. It may need future updates, and reliability depends on LDPlayer + MessengerBot R running on Windows and kakaocli running on the Mac Mini.
