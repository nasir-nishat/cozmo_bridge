# WhatsApp Groups API — The Sanctioned Fix for Group Suspensions

**Researched:** 2026-07-15 · **Status:** recommendation, not yet implemented
**TL;DR:** Meta launched an **official WhatsApp Groups API** (GA 2025-10-06). It does *exactly* what our Baileys/Evolution flow does — programmatic group creation, ≤8 participants, invite links, templates, webhooks — but sanctioned, so **no suspensions or bans**. The catch: it requires an **Official Business Account (green tick)** and a **full Cloud-API migration** of the number, which is incompatible with the consumer app / Baileys. Path below is a gradual dual-number migration, not a big-bang cutover.
**Related:** [whatsapp-anti-ban.md](whatsapp-anti-ban.md) · [whatsapp.md](whatsapp.md)

---

## 1. Why our current setup keeps getting hit

Recap from [whatsapp-anti-ban.md](whatsapp-anti-ban.md): the concierge groups run on **Evolution API = Baileys**, an *unofficial* WhatsApp client. Until Oct 2025, Meta's official Cloud API had **no group support at all** — so there was literally no compliant way to do this, and unofficial clients were the only option. That is no longer true.

## 2. What changed: the official Groups API (GA 2025-10-06)

Meta now offers a first-party **Groups API** on the WhatsApp Business Platform (Cloud API). Confirmed capabilities vs. what COZE needs:

| COZE needs | Groups API provides | Match |
|---|---|---|
| Auto-create a group per booking | Create/delete groups programmatically | ✅ |
| ~8 members (guest + family + staff) | **Max 8 participants + the business number** | ✅ (exact fit) |
| Add guest & staff | **Invite-link only — members join, not force-added** | ⚠️ changes flow (see §4) |
| Welcome messages | Text, media, **text/media templates** | ✅ |
| Invite link | Generate/reset invite links, join requests | ✅ |
| Remove members, read group info | Supported | ✅ |
| Webhooks into the bridge | Supported | ✅ |
| Scale | **10,000 groups per business number** | ✅ |

**Not supported:** interactive buttons/lists, auth/commerce templates, disappearing/view-once, editing/deleting messages, calling. None are load-bearing for our concierge flow.

Sources: [Meta Groups API docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups), [Meta group management reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference), [Coral Messaging — alpha partner notes](https://www.coralmessaging.com/blog/whatsapp-groups-api-what-we-learned-as-an-alpha-partner).

## 3. The two hard requirements (these are the real work)

### 3.1 Official Business Account (OBA / green tick) — **mandatory, non-negotiable**
Groups API is gated to OBA numbers. Standard business accounts are excluded. To get OBA:
- WhatsApp Business **API** account via an approved BSP
- **Meta Business verification** (legal docs: incorporation, tax ID)
- Two-step auth enabled
- **Brand notability** — historically 3–5 organic press articles, OR the newer **Meta Verified for Business** paid subscription (faster, buys the badge without the notability bar)
- Timeline: **2–8 weeks** (typically 7–30 working days). **This is the long pole — start it first.**

Sources: [Kanal — green tick 2026](https://getkanal.com/blog/whatsapp-business-verification-green-tick), [Meta: verified business accounts](https://faq.whatsapp.com/794517045178057).

### 3.2 Full Cloud-API migration — **incompatible with the app/Baileys**
- Groups API explicitly **excludes** "WhatsApp Business app" numbers and **Multi-solution Conversations (coexistence)** numbers. So the coexistence trick (keep app + API) does **not** unlock Groups.
- Migrating a number to Cloud API requires **deleting its consumer/app account first** → the number **leaves WhatsApp app**, loses history, and **cannot manage any existing app/Baileys-created groups** (the API only manages groups *it* created).
- **Consequence:** the current number's **~190 live Baileys groups cannot be carried over.** They'd be orphaned the moment the number migrates.

Sources: [Meta — migrate existing number](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account/), [respond.io migration guide](https://respond.io/help/whatsapp/phone-number-migration-to-whatsapp-cloud-api).

## 4. What the guest experience becomes

Today (Baileys): we **force-add** the guest to a group by their phone number — the single most ban-prone action (adding an unsaved contact). New flow (Groups API):

1. Bridge creates the group via API (business number is admin, visible to all).
2. Bridge generates an **invite link**.
3. Guest receives the link — via an approved **utility template** on WhatsApp, or piggybacked on the existing Hostfully/email touch.
4. **Guest taps the link and joins.** Family joins the same way. Staff (on their personal consumer app) join too — and **their messages are free**.

This is *true opt-in*, which is exactly the safe pattern. Downside: a guest who ignores the link never joins — so join-rate becomes a metric to watch (mitigate with a good template + reminder). It also **lifts reply ratio**, since a link-tapper is an engaged user.

## 4a. Seat allocation — fit staff + guests into the 8-cap

The cap is **8 participants + the business number**. Don't burn seats on staff:

- **The business API number IS the concierge.** All 7 team members operate *behind* that single number via the bridge / shared inbox — they are **not** individual group members. So staff cost **0 seats** (later we can custom-add specific staff if a booking needs it).
- That leaves the **full 8 seats for guests.**
- **Large parties (10–20):** the 8-cap is a hard Meta limit — one group can't hold them. Put the **lead booker + key companions** in the group; the booker relays to the rest of their party (already how it works in practice). Genuinely all-hands big groups stay on the legacy/broadcast channel — the rare exception, not the default.

This also *reduces ban surface*: fewer participant-add actions per group = fewer bot-like operations.

## 4b. Minimising ban risk on the interim Baileys pipe

Until the Groups API is live, the current unofficial number must survive. Defaults now set to **max-safety** (`constants.ts`, all env-overridable):

| Control | Default | Rationale |
|---|---|---|
| Groups per day | **6** | fits a normal booking day at 2h gaps; overflow rolls to next day |
| Gap between groups | **2 h** | kills burst/velocity signal |
| Active hours | **10:00–21:00 KST** | human daytime only |
| Warm-up after reconnect | **60 min** | never act right after a (re)link — that's what triggered the 401 |
| Queue order | **soonest check-in first** | imminent arrivals never wait behind far-future bookings |
| Welcome messages | 2–5 min apart, **varied per guest** | defeats identical-template matching |
| Admin-promote attempts | 2 (was 3) | fewer robotic retries |

**Team visibility (Jandi):** when a group is queued/deferred, the team gets a one-time **"🗓️ WA Group Scheduled"** alert with the estimated creation time and when admin access will be ready. When the group is created, the **"👥 Group Created"** alert confirms **admin access is active** and prompts staff to **manually add the guest's family/friends** (the human touch) — COZMO stays in the group and keeps monitoring. Alerts are guarded to fire once per booking (no repeat spam).

**Biggest remaining lever (recommended):** switch the Baileys guest flow from **force-add → invite-link join**, mirroring the Groups API. Force-adding an unsaved guest number is the single most ban-prone action we still do. Trade-off: a guest who ignores the link never joins, so it needs a good invite message + reminder. Worth doing given survival is the priority.

## 5. Cost model (favorable for concierge)

Per-message pricing, four categories (marketing / utility / auth / service):
- **Messages from participants on the consumer app: free.**
- When **any member sends a message, the 24h window opens for the whole group** — free-form sends during that window aren't billed.
- Business-initiated **templates outside the window are billable per delivered recipient** at the destination-country rate (deliver to 4 of 5 → charged for 4).
- **Use utility templates, not marketing** — "marketing templates get rate-limited faster and WhatsApp is watching closely" (Coral). Our welcome copy should be framed as utility (stay logistics), not promo.

For a handful of templates per stay across a micro-group, cost is modest. Source: [Groups API pricing](https://www.wuseller.com/whatsapp-business-knowledge-hub/whatsapp-groups-api-create-manage-groups-2026-guide/).

## 6. Recommended migration plan (gradual, no loss of active stays)

**Do NOT big-bang migrate the current number** — that kills 190 active guest groups. Instead:

**Phase 0 — now (already done):** hardened Baileys pacing/variation ([whatsapp-anti-ban.md](whatsapp-anti-ban.md)) keeps the current number alive as the interim pipe.

**Phase 1 — start immediately (2–8 wk lead):** begin **OBA/green-tick verification** for COZE (pursue **Meta Verified for Business** if press-notability is thin — it's the faster route). This is the gating item; everything else waits on it.

**Phase 2 — stand up a NEW number on Cloud API** via a BSP that **explicitly exposes the Groups API** (confirm this before signing — it's new and not all BSPs have it; **360dialog** = lowest markup / direct, or self-serve **direct Cloud API**, or a groups-specialist BSP). New number, so **zero disruption** to the 190 legacy groups.

**Phase 3 — build the API group flow in the bridge:** swap the `groupCreation.ts` Evolution calls for Cloud API Groups endpoints; welcome messages become approved **utility templates**; guest gets an **invite link** instead of being force-added. Reuse existing lead/booking plumbing and webhooks.

**Phase 4 — cut new bookings over** to the API number. Let the **Baileys number wind down naturally** — it stops *creating* groups (the ban trigger) and only services existing groups until those guests check out. Retire it once drained.

**End state:** all new concierge groups run on the sanctioned Groups API. No suspensions, no 401 device-removals, no ban roulette.

## 7. Alternatives considered (and why the above wins)

- **Keep hardened Baileys forever:** residual *permanent-ban* risk never goes away; one bad week loses the number + all groups. Interim only.
- **Coexistence (app + API):** disqualifies the number from Groups API. Non-starter for this use case.
- **Telegram Bot API:** free, fully supports group automation, zero ban risk — but guests don't use Telegram. Viable only as an internal/ops channel.
- **Lean harder on LINE/Kakao/WeChat:** correct for KR/JP/CN/TW guests (already the moat). But WhatsApp is the channel for SEA/global guests — Groups API is how we keep *that* segment compliantly.

## 8. Open items to confirm before committing

- [ ] Does COZE's Meta Business account already have (or can it get) **OBA**? Check current verification tier in Business Manager.
- [ ] Confirm a chosen **BSP actually exposes Groups API endpoints today** (ask directly — GA is recent).
- [ ] Whether the historical **alpha "100k+ outbound tier"** gate still applies at GA (Meta docs say GA is open to "all businesses with an OBA" — likely relaxed, but verify).
- [ ] Draft the **utility-category welcome template(s)** for Meta approval (utility, not marketing).
- [ ] Decide: dedicated **new number** (recommended) vs. eventually migrating the flagship number once legacy groups drain.
