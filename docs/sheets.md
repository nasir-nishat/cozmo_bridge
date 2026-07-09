# Google Sheets (→ Supabase)

Spreadsheet: `COZMO_DATA` — 9 tabs

| Tab | Columns | Used by |
|---|---|---|
| `team_members` | A:Name, B:WhatsApp, C:Role, D:Active, E:Dev | `getActiveTeamMembers`, `getDevTeamMembers`, `getTeamNumbers`, `getTeamNames` |
| `group_creation_msgs` | A:Key, B:EN, C:KR, D:JA, E:ZH-CN, F:ZH-TW | `getMessages()` — brand_msg, intro_msg, business_card_url, etc. |
| `booking_msgs` | A:Key, B:EN, C:KR, D:JA, E:ZH-CN, F:ZH-TW | `getBookingMsg()`, `getBookingConfirmationMessage()` |
| `booking_msgs_kr` | A:Key, B+: property code headers (F09, L09, B09…) | `getBookingMsgKr()` — KR booking msg per property |
| `check_in_msgs` | A:Key, B:EN, C:KR, D:JA, E:ZH-CN, F:ZH-TW | `getTipsMessage()` — breakfast_tips, food_tips, van_tips, guest_rules |
| `check_out_msgs` | A:Key, B:EN, C:KR, D:JA, E:ZH-CN, F:ZH-TW | `getScheduledMessage()` — checkout_reminder, payment_reminder, farewell_reminder, final_bill |
| `guest_leads` | A:Phone, B:LeadUID | `getGuestLeads()`, `saveGuestLead()` |
| `pre_payment_msg` | A:Key, B:EN, C:KR, D:JA, E:ZH-CN, F:ZH-TW | `getPrePaymentMsg()` — keys: `pre_payment_msg_notice_booking`, `pre_payment_msg_notice_vrbo` |
| `expenses` | A:id, B:lead_uid, C:group_id, D:group_name, E:platform, F:item, G:amount_krw, H:vat_10, I:vat_145, J:logged_by, K:created_at, L:settled, M:card | `expenses.ts` |
