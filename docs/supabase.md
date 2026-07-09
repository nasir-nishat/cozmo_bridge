# Supabase Schema

URL: `https://fapnuilpvibejsszoopp.supabase.co` — connected, migrations pending.

```sql
properties(code PK, name, brand, parent_code, wifi_ssid, wifi_password,
           door_code_formula, jandi_topic_id, address_ko, address_en, naver_map_url)

group_leads(group_id PK, lead_uid, platform, property_code FK, linked_at)
-- replaces src/data/group-leads.json

staff(id UUID PK, name, whatsapp_number, role, active)
-- replaces Sheets team_members

messages(key PK, en, ko, zh, jp)
-- replaces group_creation_msgs, check_in_msgs, check_out_msgs tabs

expenses(id UUID PK, lead_uid, amount_krw, description, logged_by,
         platform, created_at, settled BOOL)
```
