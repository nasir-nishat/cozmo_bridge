# Jandi — Channel Structure

COZE team workspace. COZMO posts alerts to the `COZMO Alerts from HF` topic.

## Key Channels for COZMO

| Channel | Purpose |
|---|---|
| `🔒 COZMO Alerts from HF` (under Cozmo AI) | Main alert channel — booking events, guest requests |
| `🔒 DEV tests` (under Cozmo AI) | Test alerts when `USE_TEST_JANDI_WEBHOOK=true` |

## Full Channel Map

```
📂 Co-Work
  🔒 오퍼레이션 업무토픽    Operations
  🔒 하우스케어 업무토픽    Housekeeping

📂 Cozmo AI
  🔒 COZMO Alerts from HF  ← COZMO posts here (prod)
  🔒 DEV tests             ← COZMO posts here (dev)

📂 Accomodation (per-property channels)
  📄 [BS] Breeze & Sunrise
  🔒 [HT] Huam Teva
  🔒 [JT] Joy of TEVA
  🔒 [JTS] Joy of TEVA STUDIO
  🔒 [SA] Seongbuk Achae
  📄 [SG] Secret Garden
  📄 [SJ] Soulful Journey
  🔒 [YT] Yeonnam TEVA

📂 Expense_detail (per-property expense logs)
📂 expense_monthly (per-property monthly summaries)
📂 revenue (per-property revenue reports)
```

## Jandi Webhooks (in ecosystem.config.js)

- `JANDI_WEBHOOK_PROD` — production alerts channel
- `JANDI_WEBHOOK_TEST` — DEV tests channel
- `USE_TEST_JANDI_WEBHOOK=false` in prod, `true` in dev

## Jandi Receipt Scan

See `docs/jandi-receipt-scan.md` for the Playwright bot that reads receipt images from Jandi and runs OCR.
