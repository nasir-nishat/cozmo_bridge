# API Routes

## Bridge (Express :3001)

| Method | Path | File | Purpose |
|---|---|---|---|
| POST | `/webhook` | telegram.ts | HF events → Telegram + Jandi alerts |
| POST | `/guest/note` | guest.ts | Guest request → HF note |
| POST | `/link` | whatsapp.ts | Map WA group → lead |
| POST | `/send` | whatsapp.ts | Send WA message directly |
| POST | `/webhook-test` | whatsapp.ts | Manual test group creation |
| POST | `/wa/webhook` | whatsapp.ts | Evolution API webhook (primary) |
| POST | `/webhook/wa` | whatsapp.ts | Evolution API webhook (Docker host alias) |
| POST | `/admin/toggle-groups` | whatsapp.ts | Enable/disable group creation |
| GET | `/admin/whatsapp-status` | whatsapp.ts | Health: waReady + groupCreationEnabled |
| POST | `/line/webhook` | line.ts | LINE webhook |
| POST | `/line/send` | line.ts | Send LINE message directly |
| POST | `/line/link` | line.ts | Map LINE group → lead |
| POST | `/kakao/webhook` | kakao.ts | MessengerBot R + kakaocli → message handling |
| GET | `/kakao/webhook` | kakao.ts | Health check |
| POST | `/kakao/link` | kakao.ts | Map Kakao group → lead |
| GET | `/kakao/dequeue` | kakao.ts | Health check (returns empty queue) |
| POST | `/wechat/connect` | wechat.ts | Trigger WeChat connection after login |
| GET | `/wechat/status` | wechat.ts | WeChat health check |
| GET | `/wechat/rooms` | wechat.ts | List all WeChat group rooms |
| POST | `/wechat/link` | wechat.ts | Map WeChat room → lead |
| POST | `/wechat/trans` | wechat.ts | Set translation language for a room |
| POST | `/wechat/welcome` | wechat.ts | Send welcome to WeChat group |
| POST | `/wechat/add-member` | wechat.ts | Add wxid to a group |
| POST | `/wechat/invite-guest` | wechat.ts | DM guest wxid before adding to group |
| POST | `/jandi/ask` | jandi.ts | Jandi slash command AI reply |
| POST | `/jandi/receipt` | jandi.ts | Jandi receipt OCR scan |

## Admin API (used by admin-ui at admin.coze.care)

| Method | Path | File | Purpose |
|---|---|---|---|
| GET | `/admin/health` | adminDashboard.ts | Platform health status |
| GET | `/admin/bookings` | adminDashboard.ts | All active bookings |
| GET | `/admin/alerts/recent` | adminDashboard.ts | Recent alert feed |
| GET | `/admin/alerts/stream` | adminDashboard.ts | SSE stream of live alerts |
| GET | `/admin/groups` | adminDashboard.ts | All linked groups |
| GET | `/admin/staff` | adminDashboard.ts | Team members list |
| POST | `/admin/lead-pricing` | adminDashboard.ts | Fetch live pricing for a lead |
| POST | `/admin/web-search` | adminDashboard.ts | Web search proxy |
| POST | `/admin/chat-alert` | adminDashboard.ts | Send alert from admin chat |
| GET | `/admin/kakao/groups` | adminKakao.ts | List Kakao groups |
| POST | `/admin/kakao/scan-expenses` | adminKakao.ts | Trigger expense OCR scan |
| GET | `/admin/kakao/ui` | adminKakao.ts | Kakao admin UI page |
| GET | `/admin/properties` | adminAnalytics.ts | Active property list (uid + name) for filter dropdowns |
| GET | `/admin/bookings/analytics` | adminAnalytics.ts | Daily new-vs-cancelled booking counts; live-scans Hostfully leads (no server-side date/status filter upstream), `?propertyUid=&from=&to=&cursor=` |
