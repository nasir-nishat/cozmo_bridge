# toggle-groups

Use this skill when the user wants to enable or disable WhatsApp group creation.

Trigger phrases:
- "disable group creation"
- "enable group creation"
- "turn off groups"
- "turn on groups"
- "stop creating groups"
- "start creating groups"

Action:
POST http://localhost:3001/admin/toggle-groups
Content-Type: application/json

Body:
- If disabling: { "enabled": false }
- If enabling: { "enabled": true }

Response to user:
- On disable: "✅ Group creation has been disabled. Alerts will still work normally."
- On enable: "✅ Group creation has been enabled. New bookings will create WhatsApp groups."