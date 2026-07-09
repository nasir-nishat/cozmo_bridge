# backlog.md — COZMO Bridge

> Long-term ideas and vision. Nothing here is scheduled.
> When an item becomes a real plan → move it to `todo.md` with a defined task.

---

## Platform Expansion

- ~~WeChat~~ ✅ Done — @wechatferry/agent on Windows
- ~~KakaoTalk~~ ✅ Done — MessengerBot R (LDPlayer) + kakaocli enrichment
- ~~LINE~~ ✅ Done — full feature parity with WA

> All 4 platforms live. Future: new regional platforms (e.g. Kakao Pay, Line Pay integrations)

## AI & Intelligence

- Claude API as fallback for multilingual accuracy (EN/KR/JP/ZH)
- Guest KB auto-reply — LLM answers guest questions from property_info table
- Smart note management — AI reads existing HF notes, decides what to add/remove
- Multi-language amenity keywords (JP/ZH detection)
- Sentiment detection — flag unhappy guests before they write a bad review

## Operations

- Google Calendar staff attendance + payroll integration
- Emergency alert skill — guest SOS → immediate escalation to Nasir
- Checkout summary auto-generated per booking (expense totals, requests handled)
- `/ops` task system in JANDI — create, assign, track tasks by role

## Infrastructure

- VPS migration — 4GB Linux VPS + Claude API (~$11-27/mo vs $60-80/mo for 16GB)
- Migrate all config from `constants.ts` → Supabase (per-property settings)
- Multi-tenant architecture — separate instances per client workspace
- CI/CD pipeline — GitHub Actions → auto deploy to VPS on push to main

## Product / SaaS

- SaaS packaging for Korean/Asian property managers
- White-label: COZMO as a product, not just COZE internal tool
- Dashboard — web UI to view/manage group links, requests, team
- Analytics — request volume by property, response times, resolution rates
- Onboarding flow — new property setup in < 30 min

## Integrations

- Airbnb/Booking.com direct message integration
- Naver Maps property location auto-send
- Property photo gallery auto-send on check-in
- Smart lock API integration (door code automation)