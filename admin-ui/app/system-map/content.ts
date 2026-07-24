// System Map content — edit this string to keep the /system-map page updated.
// Plain markdown. Rendered by app/system-map/page.tsx.
// ⚠️ Never paste real secret values here — key NAMES only.

export const LAST_UPDATED = '2026-07-24'

export const SYSTEM_MAP_MD = `
## The big picture

COZE Hospitality (Seoul short-term rentals, 300+ properties) is being transformed with **COZMO**, an AI ops layer. Four codebases: **cozmo_bridge** (AI messaging/ops engine), **pagescms** (content CMS), **coze_client** (public site), **coze_owner** (owner site). Bookings flow from Hostfully → cozmo_bridge routes guest chats (WhatsApp/LINE/KakaoTalk/WeChat) and staff alerts (Jandi/Telegram). Content is edited in pagescms → stored in Supabase → published to coze_client ([www.coze.care](https://www.coze.care)).

## Repositories

| Repo | Purpose | Stack | Hosted | Domain |
|---|---|---|---|---|
| cozmo_bridge | AI messaging + ops engine | Node/Express, Baileys, PM2 | Self-hosted Windows box | :3001 ([webhook.coze.care](https://webhook.coze.care)) |
| cozmo_bridge/admin-ui | This admin dashboard | Next.js | Vercel / :3002 | [admin.coze.care](https://admin.coze.care) |
| pagescms | Content CMS | Next.js 16, better-auth, Drizzle | Vercel | [cms.coze.care](https://cms.coze.care) |
| coze_client | Public site | Astro | Vercel | [www.coze.care](https://www.coze.care) |
| coze_owner | Owner site | — | Vercel | (set) |

*coze_cms (Strapi) is deprecated — replaced by pagescms.*

## Data flow

\`\`\`
Hostfully ──webhook──> cozmo_bridge ──> Telegram + Jandi (staff alerts)
                            ├─> WhatsApp / LINE / KakaoTalk / WeChat (guests)
                            ├─> Google Calendar (bookings)
                            └─> OpenAI + Supabase + Google Sheets

pagescms ──write──> Supabase (Postgres + Storage)
                            └─deploy hook──> coze_client ──> www.coze.care
\`\`\`

CMS → site is eventually-consistent: save → up-to-5-min debounce → rebuild → live.

## Secrets & keys (names only — real values live in each host's env)

**cozmo_bridge** (local .env on Windows box): Evolution API (\`EVOLUTION_API_*\`), 360dialog (\`DIALOG360_*\`), LINE (\`LINE_CHANNEL_*\`), Kakao (\`KAKAO_SEND_URL\`), Telegram (\`TELEGRAM_*\`), Jandi (\`JANDI_*\`), Hostfully (\`HOSTFULLY_API_KEY\`, \`HOSTFULLY_AGENCY_UID\`), Google (\`GOOGLE_CALENDAR_ID\`, \`CALENDAR_ID_*\`, \`SHEET_ID\`), \`OPENAI_API_KEY\`, \`SERPER_API_KEY\`, Supabase (\`SUPABASE_URL\`, \`SUPABASE_ANON_KEY\`).

**pagescms** (Vercel env): \`SUPABASE_URL\`, \`SUPABASE_SERVICE_ROLE_KEY\`, \`SG_DATABASE_URL_UNPOOLED\`, \`BETTER_AUTH_SECRET\`, \`CRON_SECRET\`, \`COZE_CLIENT_DEPLOY_HOOK_URL\`, \`EMAIL_FROM\`, \`VERCEL_API_TOKEN\`.

**coze_client** (Vercel env): \`SUPABASE_URL\`, \`SUPABASE_SERVICE_ROLE_KEY\`, \`SUPABASE_ANON_KEY\`.

## Shared infra

- **Supabase** — one project = auth DB + CMS content (Postgres) + media (\`itineraries-media\` bucket). pagescms writes, coze_client reads.
- **Vercel** — hosts pagescms, coze_client, coze_owner.
- **GitHub** — all repos; coze_cms archived.
- **Auth (pagescms)** — better-auth, email+password. Roles: admin / editor / viewer (RBAC shipped 2026-07-24).

## Status (see roadmap.md)

- ✅ Done: multi-channel guest comms, Hostfully/alerts routing, Vercel/Supabase/CMS infra, CMS roles.
- 🔵 Updating: admin analytics (FND-05), WhatsApp ban-proof recovery (CHAN-01), group unlink/relink (CHAN-04).
- ⚠️ At risk: official WhatsApp Business API (CHAN-02).
- ⚪ Planned: event DB normalization (DATA-01), security audit (SEC-01).

## Recovery quick facts

- **DB**: Supabase auto-backups + \`pg_dump\`. Restore → verify \`user\`, \`cms_itinerary\`, \`cms_homepage_content\`, \`cms_guest_page\`.
- **Media**: re-upload to \`itineraries-media\` or re-run migration script.
- **Site broken**: Vercel → roll back to last good deploy.
- **cozmo_bridge**: PM2 on Windows box → \`pm2 restart cozmo-bridge\`. Back up the Baileys WA session or it needs re-linking.

## Gotchas

- Don't restart cozmo_bridge carelessly — live WhatsApp sessions; bad restart risks WA bans / QR re-scan.
- pagescms + coze_client share one Supabase — a schema change can break the site build.
- CMS → site is not instant (debounced deploy hook).
- Two WhatsApp paths: Evolution API (unofficial, current) + 360dialog (official, in progress).
`
