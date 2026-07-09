# Admin UI

Next.js dashboard at `admin-ui/` — port 3002, public at `https://admin.coze.care`.

## Auth

Single account, JWT stored in `localStorage` (30-day TTL, HMAC-SHA256 signed).

- Email: `cozmo@coze.care` · Password: `Coze2026`
- Credentials: `admin-ui/app/api/auth/login/route.ts`
- Token verify: `admin-ui/app/api/auth/verify/route.ts`

## Structure

```
admin-ui/
  app/
    login/page.tsx          ← standalone login page (no sidebar)
    api/auth/login/         ← POST: validate creds → return signed token
    api/auth/verify/        ← POST: validate token signature + expiry
    layout.tsx              ← delegates to ClientLayout
  components/
    ClientLayout.tsx        ← skips AuthGuard on /login; wraps all other pages
    AuthGuard.tsx           ← checks localStorage token on every route; redirects to /login
    Sidebar.tsx             ← includes "Sign out" button (clears token, redirects)
```

## Cloudflare Tunnel routing (`~/.cloudflared/config.yml`)

```
admin.coze.care   → localhost:3002  (admin-ui)
webhook.coze.care → localhost:3001  (bridge)
```

## Deploy

```powershell
.\scripts\restart-admin.ps1   # build + pm2 restart
```

Always run this after any `admin-ui/` change. No hot-reload in prod.

## UI Standards

- Apple-style: no colored card borders, no tinted columns, system colors only
- Icon badges not stripes
- Admin chat/lists: always bullet/list format, never prose paragraphs
