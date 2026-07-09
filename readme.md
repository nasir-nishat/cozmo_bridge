# COZE Hospitality 3.0 — COZMO Bridge

> **Last updated:** June 2026

---

## Overview

COZMO is an AI-powered hospitality operations bridge for COZE Hospitality (Seoul STR, 300+ properties).

**Problem:** Staff manually monitor WhatsApp/LINE/WeChat/KakaoTalk group chats for guest requests.
**Solution:** COZMO joins guest group chats, detects requests via local AI, and routes alerts to staff. Staff only *acts*, never *monitors*.

---

## What COZMO Does Today

| Feature | Platform | Status |
|---|---|---|
| Hostfully webhook → Telegram + Jandi alerts | All | ✅ |
| Auto WA group creation on booking | WhatsApp | ✅ |
| `/link <uid> [welcome]` in group | WhatsApp, LINE, WeChat, KakaoTalk | ✅ |
| `/welcome` command | WhatsApp, LINE, WeChat, KakaoTalk | ✅ |
| `/group <uid>` manual WA group creation | WhatsApp | ✅ |
| `/ckin` — send check-in tips + rules | WhatsApp, LINE, KakaoTalk, WeChat | ✅ |
| `/ckout` / `/ckout exp` — checkout message | WhatsApp, LINE, KakaoTalk, WeChat | ✅ |
| `/exp` — expense logging | WhatsApp, LINE, KakaoTalk, WeChat | ✅ |
| `/trans [cn/jp/tw/th/en]` translation | LINE, WeChat | ✅ |
| `/members` — list group members | WeChat | ✅ |
| Bidirectional translation (staff ↔ guest) | LINE, WeChat | ✅ |
| Cancellation detection | WhatsApp, LINE, KakaoTalk | ✅ |
| Welcome messages (from Google Sheets) | WhatsApp, LINE, WeChat, KakaoTalk | ✅ |
| Guest request detection (AI) | WhatsApp, LINE, WeChat, KakaoTalk | ✅ |
| Check-in auto-messages (tips 15:00, rules 19:00) | All platforms | ✅ |
| Checkout auto-messages (21:00, 07:00, 15:00) | All platforms | ✅ |
| Expense auto-send at checkout 21:00 | All platforms | ✅ |
| PM2 + Windows Task Scheduler auto-restart | System | ✅ |
| Watchdog health checks every 5 min | System | ✅ |
| Anti-ban guards (debounce, delays, waReady) | WhatsApp | ✅ |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| HTTP server | Express :3001 |
| Process manager | PM2 |
| Booking PMS | Hostfully API v3 |
| WhatsApp | Evolution API v2 (Docker, localhost:8081) |
| LINE | LINE Messaging API |
| KakaoTalk | MessengerBot R (LDPlayer) — receive + send via inline response |
| WeChat | WechatFerry (@wechatferry/agent) — requires WeChat PC open |
| Telegram alerts | Telegram Bot API |
| AI (local) | LM Studio — Gemma 4 E4B (localhost:1234) |
| Data sync | Google Sheets API v4 |
| Tunnel | Cloudflare (`webhook.coze.care` → localhost:3001) |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook` | Hostfully webhook receiver |
| `POST` | `/wa/webhook` | Evolution API WA webhook |
| `POST` | `/webhook/wa` | Docker host alias for WA webhook |
| `POST` | `/link` | API: map WA group → lead UID |
| `POST` | `/send` | Send WA message directly |
| `POST` | `/admin/toggle-groups` | Enable/disable WA group creation |
| `GET`  | `/admin/whatsapp-status` | WA health: waReady + groupCreationEnabled |
| `POST` | `/webhook-test` | Manual test group creation |
| `POST` | `/line/webhook` | LINE webhook |
| `POST` | `/line/send` | Send LINE message directly |
| `POST` | `/line/link` | API: map LINE group → lead UID |
| `POST` | `/kakao/webhook` | KakaoTalk (MessengerBot R + kakaocli) |
| `POST` | `/kakao/link` | API: map Kakao group → lead UID |
| `GET`  | `/kakao/dequeue` | Health check |
| `POST` | `/wechat/connect` | Trigger WeChat connection (after login) |
| `GET`  | `/wechat/status` | WeChat health check |
| `GET`  | `/wechat/rooms` | List all WeChat group rooms |
| `POST` | `/wechat/link` | API: map WeChat room → lead UID |
| `POST` | `/wechat/trans` | Set translation language for a room |
| `POST` | `/wechat/welcome` | Send welcome message to WeChat group |
| `POST` | `/wechat/add-member` | Add wxid to an existing WeChat group |
| `POST` | `/wechat/invite-guest` | DM guest wxid before adding to group |
| `POST` | `/guest/note` | Save note to lead manually |

---

## App Modes & Feature Flags

| Mode | Jandi | WA Group Members |
|---|---|---|
| `APP_MODE=dev` | Telegram only | Nasir (821097802701) + COZMO only |
| `APP_MODE=prod` | Telegram + Jandi | Active team from Google Sheets |

| Flag | Prod Value | Description |
|---|---|---|
| `ENABLE_WHATSAPP` | `true` | WA webhook + group creation |
| `ENABLE_LINE` | `true` | LINE webhook + translation |
| `ENABLE_WECHAT` | `true` | WeChat bot |
| `ENABLE_KAKAO` | `true` | KakaoTalk webhook |
| `GROUP_CREATION_ENABLED` | `true` | Auto-create WA group on booking |
| `ENABLE_CHECKOUT_REMINDER` | `true` | Checkout cron messages |
| `ENABLE_CHECKIN_REMINDER` | `true` | Check-in cron messages |
| `ENABLE_EXPENSE_AUTO_SEND` | `true` | Auto-send expense summary at checkout |
| `ENABLE_GOOGLE_CALENDAR` | `true` | Sync bookings to Google Calendar |
| `USE_TEST_JANDI_WEBHOOK` | `false` | Route Jandi to test webhook |

---

## WeChat Setup (after every server restart)

WeChat PC must be open and logged in before COZMO can connect.

1. `pm2 restart cozmo-bridge`
2. Open WeChat PC → confirm login on phone
3. `.\scripts\wechat-connect.ps1`
4. Check `pm2 logs` — should show `🤖 WeChat agent started`

If WeChat disconnects mid-session, a Telegram alert fires automatically.

---

## Message Content

**All guest-facing messages are written by the team in the `COZMO_DATA` Google Sheet. COZMO fetches and delivers them as-is — never generates, modifies, or wraps content.**

| Sheet tab | Contains | Fetched by |
|---|---|---|
| `group_creation_msgs` | brand_msg, intro_msg, business_card_url | `getMessages()` |
| `check_in_msgs` | breakfast_tips, food_tips, van_tips, guest_rules | `getTipsMessage()` |
| `check_out_msgs` | checkout_reminder, payment_reminder, farewell_reminder, final_bill | `getScheduledMessage()` |

All tabs have columns: Key / EN / KR / JA / ZH-CN / ZH-TW

LLM (Gemma 4) is used only for: guest request detection, staff↔guest translation (LINE/WeChat), and language detection. Never for composing messages.

---

## Guest Lifecycle

Every step tracked via `isSent()` / `markSent()` — nothing fires twice, even across restarts.

| Step | sentKey | Trigger | When |
|---|---|---|---|
| HF inbox step 1 | `hf_step1` | `NEW_BOOKING` webhook | Immediate |
| HF inbox step 2 | `hf_step2` | Queue | 30 min after booking |
| WA brand message | `welcome_brand` | Auto group creation | On group created |
| WA business card | `welcome_card` | Auto group creation | After brand |
| WA intro message | `welcome_intro` | Auto group creation | After card |
| Check-in tips | `checkin_tips` | Cron | Check-in day 15:00 KST |
| Check-in rules | `checkin_rules` | Cron | Check-in day 19:00 KST |
| Checkout reminder | `checkout_reminder` | Cron | Day before checkout 21:00 KST |
| Final bill | `final_bill` | Cron | Checkout day 07:00 KST |
| Farewell | `farewell` | Cron | Checkout day 15:00 KST |

**After checkout + 7 days:** COZMO goes silent. Staff commands (`/exp`, `/link`) still work.

**Restart resilience:** On restart, checks if message was already sent (Gemma 4 similarity). If not sent and within 1-hour window → sends. If window passed → Jandi alert to staff.

---

## Webhook Events

| Event | Action |
|-------|--------|
| `NEW_BOOKING` | WA group creation + platform alerts |
| `BOOKING_UPDATED` | WA group if status = BOOKED |
| `BOOKING_CANCELLED` | Telegram + Jandi alert |
| `NEW_INQUIRY` | Telegram alert |
| `NEW_HOLD` | Telegram alert |
| `NEW_BOOKING_REQUEST` | Telegram alert |
| `UNIT_CHANGED` | Telegram alert |
| `NEW_BLOCKED_DATES` | Telegram alert (15s delayed) |
| `NEW_INBOX_MESSAGE` | Telegram alert |

---

## Health Check

```powershell
.\scripts\health-check.ps1
.\scripts\health-check.ps1 -SkipWebhookTest
```

---

*COZMO Bridge — Internal Docs · Managed by Nasir | cozmo@coze.care*
