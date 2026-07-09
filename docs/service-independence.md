# Service Independence & Architecture

**Version:** 1.0  
**Date:** 2026-07-01  
**Status:** Complete

---

## Overview

COZMO runs three completely **independent services**. Each service can restart, crash, or redeploy without affecting the others. The **only integration point** is the Health Dashboard, which independently checks all services.

```
┌─────────────────────────────────────────────────────────────┐
│                    Three Independent Services                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Bridge     │  │   Admin-UI   │  │   Owner      │       │
│  │   :3001      │  │   :3002      │  │   :3010      │       │
│  │ (Express)    │  │   (Next.js)  │  │ (Node/HTTP)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│        ▲                   ▲                    ▲            │
│        └───────────────────┼────────────────────┘            │
│                            │                                  │
│                    (Health Dashboard)                         │
│                  Independent Timeout Checks                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Services

### 1. Bridge (:3001)

**Purpose:** Webhook handler for Hostfully, WhatsApp, LINE, KakaoTalk, WeChat, Telegram, Jandi  
**Type:** Express.js server  
**Process:** `cozmo-bridge` (pm2)  
**Source:** `src/index.ts`

**Independence:**
- ✅ No dependencies on admin-ui or owner-site
- ✅ Provides REST APIs that admin-ui **optionally** consumes
- ✅ All admin endpoints have error handling (fail gracefully if admin-ui doesn't call them)

**Restart:**
```bash
.\scripts\restart.ps1
```

**What it does if admin-ui is down:** Fully functional — webhooks still fire, alerts still send, nothing breaks

---

### 2. Admin-UI (:3002)

**Purpose:** Staff dashboard, chat interface, health monitoring  
**Type:** Next.js server  
**Process:** `cozmo-admin-ui` (pm2)  
**Source:** `admin-ui/`

**Independence:**
- ✅ Completely independent Next.js application
- ✅ Can start/stop/restart without affecting bridge
- ✅ Bridge API calls are **optional** (graceful degradation)
  - Web search: fails silently, chat continues
  - Pricing lookup: fails silently, chat continues
  - Chat alerts: fire-and-forget with error handling
  - Health/platform status: shows "offline" if bridge is down

**Bridge URL Configuration:**
```bash
# Default: http://localhost:3001
# Override via environment variable:
export BRIDGE_URL=http://other-host:3001

# In ecosystem.config.js for admin-ui process:
env: {
  BRIDGE_URL: 'http://other-host:3001'
}
```

**Restart:**
```bash
.\scripts\restart-admin.ps1
```

**What it does if bridge is down:**
- Dashboard loads and shows "Bridge offline"
- Chat works without enriched features (web search, pricing)
- Health page displays all service statuses
- Admin can still manage KB, view historical data

---

### 3. Owner-Site (:3010)

**Purpose:** Public-facing landing page (owner.coze.care)  
**Type:** Static file server (Node.js)  
**Process:** `owner-site` (pm2)  
**Source:** `owner/server.mjs`  
**Files:** `owner/index.html` and assets

**Independence:**
- ✅ Completely isolated Node.js server
- ✅ No dependencies on bridge or admin-ui
- ✅ Can restart without affecting anything

**Restart:**
```bash
.\scripts\restart-owner.ps1
```

**What it does if bridge/admin is down:** Fully functional — serves HTML/CSS/JS normally

---

## Health Dashboard

**Location:** Admin-UI at `https://admin.coze.care/health`  
**Purpose:** Single pane of glass showing **all three services + bridge platforms**

### How It Works

Health page independently checks each service:

1. **Service Checks (independent, 3-second timeouts each):**
   - Pings Bridge :3001
   - Pings Admin :3002 (self-check)
   - Pings Owner :3010

2. **Bridge Details (only if bridge is online):**
   - Fetches `/admin/health` from bridge
   - Fetches `/admin/alerts/recent` from bridge
   - Displays platform status (WhatsApp, LINE, Kakao, WeChat)
   - Shows uptime, mode (dev/prod), alerts in last 24h

3. **Error Handling:**
   - If a service is offline → shows "Offline" with status indicator
   - If bridge offline → Bridge Details section hidden
   - Continues checking even if one service is down
   - Auto-refreshes every 10 seconds

### Dashboard Display

```
System Health
┌─ Services ────────────────────────────────┐
│ 🌉 Bridge        :3001  ● Online          │
│ ⚙️  Admin UI      :3002  ● Online          │
│ 👔 Owner Site    :3010  ● Online          │
└───────────────────────────────────────────┘

┌─ Bridge Details ──────────────────────────┐
│ Uptime: 2h 45m                            │
│ Mode: PROD                                │
│ Alerts (24h): 23                          │
│                                           │
│ ┌─ Platform Status ─────────────────────┐ │
│ │ 📱 WhatsApp  ● OK                     │ │
│ │ 💚 LINE      ● OK                     │ │
│ │ 💬 KakaoTalk ● Heartbeat 12s ago      │ │
│ │ 🟢 WeChat    ● Down                   │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘

Last updated: 14:23:45
```

---

## Restart Procedures

### Quick Reference

| Service | Command | Port | Process Name |
|---------|---------|------|--------------|
| Bridge | `.\scripts\restart.ps1` | 3001 | `cozmo-bridge` |
| Admin-UI | `.\scripts\restart-admin.ps1` | 3002 | `cozmo-admin-ui` |
| Owner | `.\scripts\restart-owner.ps1` | 3010 | `owner-site` |

### What Each Script Does

**restart.ps1 (Bridge only)**
1. Stops `cozmo-bridge` via pm2
2. Kills any orphan processes on :3001
3. Builds bridge TypeScript (`npm run build`)
4. Starts `cozmo-bridge` via pm2
5. Verifies port :3001 is listening
6. Verifies health endpoint `/wa/webhook`

**restart-admin.ps1 (Admin-UI only)**
1. Stops `cozmo-admin-ui` via pm2
2. Kills any orphan processes on :3002
3. Builds admin-ui (`npm run build` in admin-ui/)
4. Starts `cozmo-admin-ui` via pm2
5. Verifies port :3002 is listening

**restart-owner.ps1 (Owner-Site only)**
1. Stops `owner-site` via pm2
2. Kills any orphan processes on :3010
3. Starts `owner-site` via pm2
4. Verifies port :3010 is listening

### No Cross-Contamination

Each script:
- ✅ Touches **only** its own service
- ✅ Builds **only** its own code
- ✅ Doesn't call other services
- ✅ Can run in parallel (no conflicts)

---

## Scenarios

### Scenario 1: Bridge Crashes

**Status:** Admin-UI still running, Owner still running  
**Impact:**
- Admin dashboard works but shows Bridge offline
- Staff can still access KB, chat (without web search/pricing)
- Webhooks not firing (no new bookings processed)
- Health page shows 1 of 3 services offline

**Recovery:**
```bash
.\scripts\restart.ps1
```

---

### Scenario 2: Admin-UI Crashes

**Status:** Bridge still running, Owner still running  
**Impact:**
- Webhooks still fire normally
- Alerts still send to Telegram/Jandi
- Staff can't access dashboard
- Guests unaffected

**Recovery:**
```bash
.\scripts\restart-admin.ps1
```

---

### Scenario 3: Owner-Site Crashes

**Status:** Bridge still running, Admin still running  
**Impact:**
- Webhooks still fire
- Admin dashboard works
- owner.coze.care returns 503
- Staff unaffected

**Recovery:**
```bash
.\scripts\restart-owner.ps1
```

---

### Scenario 4: Deploy Admin Features

**Steps:**
1. Edit `admin-ui/app/**/*`
2. Run `.\scripts\restart-admin.ps1`
3. Bridge keeps running — webhooks never interrupted
4. Guest operations unaffected

---

### Scenario 5: Deploy Bridge Features

**Steps:**
1. Edit `src/**/*`
2. Run `.\scripts\restart.ps1`
3. Admin dashboard keeps running
4. Staff can continue working while bridge restarts

---

## Architecture Decisions

### Why Independent Services?

1. **Reliability:** If admin-ui crashes, webhooks still process
2. **Development:** Change one service without rebuilding others
3. **Deployment:** Hot-swap any service without downtime
4. **Scaling:** Run each on separate machines later if needed
5. **Debugging:** Isolate issues to a single service

### Why Health Dashboard?

The only place services **intentionally** talk to each other is the health page because:
- It's read-only (doesn't affect operations)
- It has timeouts (won't hang if a service is slow)
- It's graceful (shows partial status if any service is down)
- It's optional (doesn't block the app from loading)

### Why Environment Variables?

Bridge URL in admin-ui is configurable:
```javascript
// admin-ui/app/api/chat/route.ts
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3001'
```

This allows:
- Local development with different hosts
- Future migration to separate machines
- Testing bridge failover scenarios

---

## Common Mistakes to Avoid

### ❌ DON'T

- Hardcode service URLs in code (violates independence)
- Add cross-service database dependencies
- Make admin-ui features depend on bridge being up
- Call admin-ui endpoints from bridge
- Share pm2 restart logic between services

### ✅ DO

- Use environment variables for external URLs
- Implement graceful degradation (features fail silently)
- Add timeouts to all inter-service calls
- Document why a feature is optional
- Keep restart scripts independent

---

## Future: Multi-Host Deployment

When ready to split services across machines:

```
Machine 1 (Ubuntu VPS):
  • Bridge :3001

Machine 2 (Ubuntu VPS):
  • Admin-UI :3002

Machine 3 (Windows):
  • Owner-Site :3010
  • WeChat PC
  • LDPlayer (KakaoTalk)
```

No code changes needed — just update:
- `admin-ui/.env.production` → `BRIDGE_URL=https://bridge.coze.care`
- Cloudflare routes unchanged
- Each machine runs independent restart scripts

---

## Maintenance

### Monitoring

Use the Health Dashboard at `/health` to monitor all services.

### Logs

```bash
# Bridge logs
pm2 logs cozmo-bridge

# Admin-UI logs
pm2 logs cozmo-admin-ui

# Owner-Site logs
pm2 logs owner-site

# All logs
pm2 logs
```

### Restart All (if needed)

```bash
pm2 kill              # Stop all
.\scripts\restart.ps1
.\scripts\restart-admin.ps1
.\scripts\restart-owner.ps1
```

But avoid this — restart individual services to reduce downtime.

---

## Configuration

### ecosystem.config.js

Defines all three services. Each has:
- Independent `name` (cozmo-bridge, cozmo-admin-ui, owner-site)
- Independent `script` entry point
- Independent `cwd` (working directory)
- Independent environment variables
- Independent `watch`, `autorestart`, `max_restarts`

### env Vars

**Bridge (src/index.ts):**
- `NODE_ENV=production`
- `APP_MODE=prod`
- Platform tokens (Telegram, Hostfully, etc.)
- Checked via `ecosystem.config.js`

**Admin-UI (admin-ui/):**
- `NODE_ENV=production`
- `OPENAI_API_KEY`
- `BRIDGE_URL` (optional, defaults to localhost:3001)
- Loaded in `next.config.js` and `app/api/chat/route.ts`

**Owner-Site (owner/server.mjs):**
- `OWNER_PORT` (default 3010)
- `OWNER_ROOT` (default ./owner)

---

## FAQ

**Q: Can I restart bridge without restarting admin-ui?**  
A: Yes. Run `.\scripts\restart.ps1` only. Admin-UI keeps running (with bridge offline briefly).

**Q: What if health dashboard calls bridge and bridge is restarting?**  
A: Health check times out after 3 seconds and shows "Offline" — app never hangs.

**Q: Can I move bridge to a different host?**  
A: Yes, update `BRIDGE_URL` in admin-ui env vars. No code changes needed.

**Q: What happens if all three services are down?**  
A: Restart in order: bridge → admin-ui → owner. Each restart is independent.

**Q: Should admin-ui chat route fail if bridge is down?**  
A: No — chat works, just without web search and pricing features. Bridge calls are wrapped in try-catch.

**Q: Why can't admin-ui do web search without bridge?**  
A: Bridge holds the Serper API key (external service). Future: move to admin-ui's own API key if needed.

**Q: Can I run services on different machines now?**  
A: Not yet recommended (would need reverse proxy). Single-machine only, but architecture supports it.

---

## Related Docs

- `docs/routes.md` — Bridge API endpoints
- `docs/services.md` — All service functions
- `docs/deployment.md` — Production checklist (TBD)
- `docs/troubleshooting.md` — Common issues (TBD)

---

**Last Updated:** 2026-07-01  
**Maintained by:** COZMO Team
