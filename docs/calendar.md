# Google Calendar — COZMO Integration

COZMO syncs Hostfully bookings to per-property Google Calendars in real time.

## Event Title Format

```
PROPERTY_CODE/SOURCE/Guest Name occupancy
```

Examples: `BS/AB/Hong YunSoo 2A2K` · `JTS/BK/Yamada Taro 3A` · `GKA/DR/Smith John 4A2K`

**Occupancy codes:** `A`=Adults · `K`=Kids · `I`=Infants · `P`=Pets

**Source codes (`lead.type` → code):**

| lead.type | Code |
|---|---|
| `AIRBNB` | `AB` |
| `BOOKING_COM` | `BK` |
| `DIRECT` | `DR` |
| `HOMEAWAY` / `VRBO` | `VR` |
| `EXPEDIA` | `EX` |
| `TRIPADVISOR` | `TR` |
| anything else | `DR` |

---

## Property → Calendar Mapping

| Code | Google Calendar | Hostfully Name |
|---|---|---|
| BS | `BS_COZMO` | BS_JOYHASLA |
| SG | `SG_COZMO` | SG_JOYHASLA |
| SJ | `SJ_COZMO` | SJ_JOYHASLA |
| SA | `SA_COZMO` | SA_ACHAE |
| JT | `JT_COZMO` | JT_TEVA |
| JTS | `JTS_COZMO` | JTS_TEVA |
| HTA | `HTA_COZMO` | HTA_TEVA WELLNESS |
| HTB | `HTB_COZMO` | HTB_TEVA AERIS GARDEN |
| GKA | `GKA_COZMO` | GKA_KELLY ANANDA |
| GKB | `GKB_COZMO` | GKB_KELLY PRANA |
| B9 | `YTA_B9_COZMO` | YT_BIRD_09 |
| L9 | `YTB_L9_COZMO` | YT_LOTUS_09 |
| F9 | `YTC_F9_COZMO` | YT_FISH_09 |

---

## Bundle Fan-out

Bundle properties have no calendar of their own — bookings are written to each constituent unit.

| Bundle | Fans out to |
|---|---|
| `HT` | HTA, HTB |
| `FB` | F9, B9 |
| `GK` | GKA, GKB |
| `YT` | L9, F9, B9 |

---

## Sync Triggers

| Event | Action |
|---|---|
| `NEW_BOOKING` | Create event |
| `BOOKING_UPDATED` | Update event |
| `BOOKING_CANCELLED` | Delete event |
| `NEW_BLOCKED_DATES` | **Ignored — not synced** (see below) |

---

## Important Rules

**⚠️ End date — do NOT add +1 day.** COZMO passes the real checkout date as-is. Google Calendar's exclusive end means June 15 checkout displays as ending June 14, preventing visual overlap on same-day turnovers.

**🚫 `NEW_BLOCKED_DATES` not synced.** Hostfully fires it as a processing artifact in two cases:
1. USD double-webhook (e.g. VRBO) — fires before the real `NEW_BOOKING`
2. Cross-unit blocks when a Yeonnam sub-unit is booked — floods sibling calendars with noise

Telegram alert still fires for `NEW_BLOCKED_DATES` (15s delayed, cancelled if `NEW_BOOKING` arrives first). Only the calendar write is skipped.

---

## Backfill

If events are missing after an outage or a new calendar is added:

```bash
node scripts/backfill-calendar.js                 # all active bookings from today
node scripts/backfill-calendar.js --dry-run       # preview only
node scripts/backfill-calendar.js --prop=GK       # one property (bundle fans out automatically)
node scripts/backfill-calendar.js --from=2026-01-01
```
