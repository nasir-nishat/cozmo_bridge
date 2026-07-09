# WhatsApp — Safety Rules & Quirks

## Safety Rules

- COZMO uses a **dedicated business WA number** — anti-ban is priority over speed
- `GROUP_CREATION_ENABLED=true` is set permanently in `ecosystem.config.js`
- Never send bulk/rapid messages or create groups in bursts
- Keep delays/jitter and per-group debounce (30s) enabled always
- If WA is stable → do not change its flow while building LINE/Kakao; use feature flags
- If disconnect storms or spam-like behavior appears → rollback first

## Owner Detection (important — Evolution API quirk)

Evolution API sends `sender: 821026226935@s.whatsapp.net` on ALL messages (not just COZMO's).
Real sender is in `participant` field as LID. COZMO's own messages are identified by:

```ts
const isOwnerMessage = participantPhone === INSTANCE_OWNER_PHONE ||
                       data.pushName === 'COZMO AI' ||
                       participantPhone === '234325463273604'; // COZMO LID
```

## Evolution API Quirks

- Fires webhooks twice (global + instance) → deduplicated by message ID set (max 500)
- `sender` field is always COZMO's number regardless of who sent → use `participant`
- LID format (`@lid`) is used for group participants, not phone numbers

## Evolution API — Custom Patched Image

Evolution API v2.3.6 does not expose `groupJoinApprovalMode` or `groupMemberAddMode` (Baileys functions) via REST. We patched the container and committed it as a custom image.

**Running image:** `evoapicloud/evolution-api:v2.3.6-cozmo` (committed 2026-06-25)

**What was patched (inside the container):**
- `/evolution/dist/validate/group.schema.js` — added `join_approval_on`, `join_approval_off`, `member_add_all`, `member_add_admin` to the `updateSetting` action enum
- `/evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js` — extended `updateGSetting()` to route those actions to the correct Baileys calls

**New `updateSetting` actions available:**

| action | Baileys call | Effect |
|---|---|---|
| `join_approval_on` | `groupJoinApprovalMode(jid, 'on')` | Invite-link joiners need admin approval |
| `join_approval_off` | `groupJoinApprovalMode(jid, 'off')` | Anyone with link can join freely |
| `member_add_all` | `groupMemberAddMode(jid, 'all_member_add')` | All members can add others |
| `member_add_admin` | `groupMemberAddMode(jid, 'admin_add')` | Only admins can add members |

**If you ever recreate the Evolution API container**, use the committed image OR run the re-patch script:

```powershell
# Option A: start container from committed image (preferred)
docker run ... evoapicloud/evolution-api:v2.3.6-cozmo

# Option B: re-apply patches to a fresh base container
.\scripts\patch-evo-api.ps1
```
