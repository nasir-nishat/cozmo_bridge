# Key Flows

## Booking → WA Group Creation

```
HF NEW_BOOKING webhook
→ fetch lead (skip if not BOOKED/PAID_IN_FULL)
→ fetch team from Sheets (dev: fixed 2 members)
→ create WA group via Evolution API
→ set group to non-announcement
→ set group: unlocked (all can share invite link)
→ set group: member_add_all (all members can add others)
→ set group: join_approval_on (invite-link joiners need admin approval)
→ set group picture (from Hostfully property image)
→ auto-link: groupId → lead_uid
→ send 3 messages with delays:
   1. brand_msg (from Sheets)
   2. business card image URL (from Sheets: business_card_url)
   3. intro_msg (from Sheets)
→ sendAlert: "WhatsApp Group Created"
```

## Guest Message → Alert

```
WA message arrives in linked group
→ skip if isOwnerMessage (COZMO AI / LID 234325463273604)
→ skip if team member phone
→ skip if quoted reply
→ debounce 30s per group
→ detectGuestIntentWithContext() → LM Studio
→ if result: saveGuestNote(lead_uid, result)
→ sendAlert: "💬 Guest Request Detected"
→ if CANCELLED: sendAlert: "🚫 Request Cancelled"
```

## Alert Format (all platforms)

```
💬 <b>Guest Request Detected</b>
─────────────────
👤 <b>Guest:</b> Name
📋 <b>Request:</b> description
📱 <b>Platform:</b> WhatsApp
─────────────────
<i>via COZMO · COZE Hospitality</i>
```
