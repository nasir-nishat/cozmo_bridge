# Dashboard Audit

## Remove / Simplify

- **Nav group list on home page** — redundant with the sidebar. The home page re-lists every nav item with notes, but that's just a duplicate of the sidebar. Wastes prime real estate.
- **Active property chips** — low signal. Just shows property codes, not what's happening at them.
- **"Ops heartbeat" card is underpowered** — one big number (guests in) is fine, but the card gives no actionable context (no guest names, no room, no alert count).

## Fix

- **Alerts page has no history on load** — SSE stream only shows alerts from the moment you open the page. Open it 5 minutes later and it's blank. Needs an initial batch fetch of recent alerts.
- **Health page shows PID** — PID is useless to a hospitality operator. Replace with something meaningful (e.g., last alert received, message queue depth).
- **Bookings "All" tab is noise** — checked-out past bookings don't need to be visible by default. "All" should be "Past 30 days" max.

## Add (high value, priority order)

1. **Today's arrivals + departures with guest names** — the dashboard shows counts but not *who*. Staff need to see "Kim Jihyun checking in at GK today" not just "2 arriving."
2. **Active alerts count badge on home** — pull last 24h alert count from bridge so staff know if something needs attention without going to the alerts page.
3. **Messenger connect status per active booking** — is COZMO in that guest's group? Yes/no indicator next to each checked-in guest. Critical for knowing if the guest is reachable.
4. **Quick actions on dashboard** — link to `/ops` for today's tasks + a "Create group" shortcut for whoever is handling check-ins.
5. **Alerts page: load last 50 on mount** — so the page isn't empty when you first open it.

## Most Impactful Change

Replace the nav link list on the home page with a **Today card** — arrivals + departures with names, property, and messenger status. That's what staff actually need to see first thing.
