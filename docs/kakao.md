# KakaoTalk — COZMO Integration

KakaoTalk cannot be automated via API. COZMO uses **two tools together**:

| Tool | Role | Device |
|---|---|---|
| **MessengerBot R** | Receives messages, sends replies via `msg.reply()` | LDPlayer (Android emulator, this Windows machine) |
| **kakaocli** | Enricher only — provides `sender_id` from KakaoTalk SQLite DB | Mac Mini (nishat_coze@192.168.0.14) |

---

## Why two tools?

MessengerBot R handles receive/send but **cannot provide `sender_id`** (`msg.author.uid` = undefined). Without it, staff detection falls back to name-only matching.

kakaocli sees the same messages via KakaoTalk's local SQLite DB and **does provide `sender_id`** — but cannot send.

Both forward to `/kakao/webhook`. COZMO merges them into one enriched event.

---

## Message Flow

```
Guest sends message in KakaoTalk group
    │
    ├──► kakaocli (Mac Mini)
    │       polls KakaoTalk DB every 2s
    │       POST /kakao/webhook  ← has sender_id, stable chat_id
    │
    └──► MessengerBot R (LDPlayer)
            onMessage() fires
            POST /kakao/webhook  ← has msg.reply() capability, no sender_id
            caches msg object in channelCache[chat_id]

COZMO receives both within ~1-2s
    → merges sender_id from kakaocli into MessengerBot R event
    → processes ONCE (deduped by chat_name:text window)
    → queues reply in /kakao/dequeue

MessengerBot R polls /kakao/dequeue every 500ms
    → finds queued reply for chat_id
    → calls channelCache[chat_id].reply(text)
```

---

## Merge Logic

- MessengerBot R payload arrives → held in buffer for 2 seconds (keyed by `chat_name:text`)
- kakaocli payload arrives within 2s → `sender_id` merged in → processed once
- kakaocli does not arrive within 2s → processed as-is (graceful degradation)

---

## Payload Formats

### kakaocli (Mac Mini)
```json
{
  "chat_id": 468895758297077,
  "chat_name": "Guest Group Name",
  "sender": "Nishat Nasir",
  "sender_id": 298095162,
  "is_from_me": false,
  "message_type": 1,
  "text": "message text",
  "timestamp": "2026-06-05T09:00:00Z",
  "type": "message"
}
```

### MessengerBot R (LDPlayer)
Same shape but `sender_id` is `""` and `chat_id` is a string (not number).

---

## MessengerBot R Script

Runs inside LDPlayer. Script editor is inside the MessengerBot R app.

⚠️ **LDPlayer uses bridged networking — use `webhook.coze.care`, NOT `127.0.0.1` or `10.0.2.2`.**

```js
const bot = BotManager.getCurrentBot();
const COZMO_URL = "https://webhook.coze.care/kakao/webhook";
const DEQUEUE_URL = "https://webhook.coze.care/kakao/dequeue";
const channelCache = {};

function httpRequest(method, url, body) { /* HTTP helper — runs in background thread */ }

function onMessage(msg) {
  if (msg.isDebugRoom) return;
  const cid = msg.channelId ? msg.channelId.toString() : msg.room;
  channelCache[cid] = msg;

  httpRequest("POST", COZMO_URL, JSON.stringify({
    chat_id: cid,
    chat_name: msg.room,
    sender: msg.author.name,
    sender_id: "",   // unavailable in MessengerBot R on LDPlayer
    is_from_me: false,
    message_type: 1,
    text: msg.content,
    timestamp: new Date().toISOString(),
    type: "message"
  }));
}

setInterval(function() {
  const response = httpRequest("GET", DEQUEUE_URL, null);
  if (!response) return;
  const items = JSON.parse(response);
  for (let i = 0; i < items.length; i++) {
    const cached = channelCache[String(items[i].chat_id)];
    if (cached) cached.reply(items[i].text);
  }
}, 500);

bot.addListener(Event.MESSAGE, onMessage);
```

---

## kakaocli (Mac Mini)

```bash
ssh nishat_coze@192.168.0.14
pm2 restart kakaocli-sync
pm2 logs kakaocli-sync
```

KakaoTalk PC must be open and logged in on the Mac Mini.

---

## Slash Commands (in KakaoTalk group)

| Command | Action |
|---|---|
| `/link <lead_uid>` | Link group to Hostfully lead |
| `/link <lead_uid> welcome` | Link + send welcome messages |
| `/welcome` | Send brand + intro messages |
| `/ckin` | Send check-in tips + rules |
| `/ckout` | Send checkout reminder |
| `/ckout exp` | Send expense summary + payment reminder |
| `/exp <args>` | Expense ledger |

---

## Staff Detection

Staff identified by `sender_id` (from kakaocli) first, then name matching as fallback. Group stored as `kakao:<chat_id>` in `group-leads.json`.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| No sender ID from MessengerBot R | `msg.author.uid` / `msg.author.hash` unavailable — kakaocli enrichment required |
| kakaocli is read-only | Cannot send — only reads KakaoTalk SQLite DB |
| Text-only sends | `msg.reply()` is text-only — images sent as URL links |
| `is_from_me` always false | COZMO's own replies filtered by `COZMO_REPLY_REGEX` in detection |
| Manual group joining | COZMO must be manually added to each guest group |
| Cannot create groups | No scriptable API for KakaoTalk group creation |
| Cannot rename groups | MessengerBot R has no rename capability |
| Cannot list members | MessengerBot R has no member-listing capability |
| Cannot initiate DMs | MessengerBot R can only reply in existing groups |
| KakaoTalk PC must stay open | Required on Mac Mini for kakaocli to work |
| LDPlayer must stay running | KakaoTalk Android in LDPlayer must be logged in |

## Why Other Approaches Were Ruled Out

| Approach | Reason |
|---|---|
| kakaocli send (Mac Mini relay) | Replaced — fragile UI automation, relay server overhead |
| notification-webhook | Empty payload problem on modern KakaoTalk |
| Official Kakao Channel Bot | Command-triggered only — cannot see passive guest messages |
| @remote-kakao/core UDP bridge | Not needed — MessengerBot R inline HTTP response is simpler |

---

## Troubleshooting

| Symptom | Check |
|---|---|
| No messages arriving | `pm2 logs cozmo-bridge` — look for `/kakao/webhook` POSTs |
| sender_id always empty | kakaocli not running on Mac Mini (`pm2 logs kakaocli-sync`) |
| Replies not sending | Is LDPlayer + MessengerBot R running? Is channelCache populated? |
| Duplicate alerts | Check 2s merge window logic in `src/routes/kakao.ts` |
| Group not found | Run `/link <lead_uid>` in the group |
