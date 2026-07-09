# Cloudflare Tunnel Runbook (COZMO Bridge)

## What This Is About

This setup exposes your local bridge (`localhost:3001`) to Hostfully using a free Cloudflare Tunnel:

- Public webhook URL: `https://webhook.coze.care/webhook`
- Local app endpoint: `http://localhost:3001/webhook`
- Bridge process: `pm2` app `cozmo-bridge`
- Tunnel process: Windows service `CloudflaredTunnel`

If this is healthy, Hostfully events reach your local app even after reboot.

## How To Run

### One-time setup

1. Ensure these files exist:
   - `cloudflared/config.yml`
   - `cloudflared/f77775d6-626c-454f-a0b2-b1010384a129.json` (tunnel credentials)
2. In `cloudflared/config.yml`, verify:
   - `tunnel: f77775d6-626c-454f-a0b2-b1010384a129`
   - `credentials-file: C:\COZE_CORP\cozmo_bridge\cloudflared\f77775d6-626c-454f-a0b2-b1010384a129.json`
   - ingress includes:
     - `webhook.coze.care -> http://127.0.0.1:3001`
     - fallback `http_status:404`
3. Install tunnel service (Admin PowerShell):

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" --config "C:\COZE_CORP\cozmo_bridge\cloudflared\config.yml" service install
```

4. If Cloudflare service install does not create a usable service, create one manually (Admin CMD):

```bat
sc.exe create CloudflaredTunnel binPath= "\"C:\Program Files (x86)\cloudflared\cloudflared.exe\" tunnel --config C:\COZE_CORP\cozmo_bridge\cloudflared\config.yml run" start= auto
```

### Daily start/check

1. Start bridge:

```powershell
pm2 restart cozmo-bridge
pm2 logs cozmo-bridge
```

2. Ensure tunnel service is running (Admin CMD):

```bat
sc.exe start CloudflaredTunnel
sc.exe query CloudflaredTunnel
```

3. Test public webhook path:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://webhook.coze.care/webhook" `
  -ContentType "application/json" `
  -Body '{"event_type":"TEST_EVENT","lead_uid":"test"}'
```

Expected:
- terminal response contains `success: True`
- PM2 logs contain `📥 Webhook: TEST_EVENT | Lead: test`

### One-command health check

```powershell
npm run health
```

Checks all of:
- Windows service `CloudflaredTunnel` is `Running`
- PM2 app `cozmo-bridge` is `online`
- Public webhook `https://webhook.coze.care/webhook` accepts a test POST

If you need a local-only check (no external request):

```powershell
npm run health:local
```

## What To Avoid

- **Do not use placeholder values** in `cloudflared/config.yml` like `YOUR_TUNNEL_UUID`.
- **Do not run YAML lines in terminal** (for example `credentials-file: ...`); edit the file instead.
- **Do not combine multiple commands on one line** unintentionally (common source of fake errors).
- **Do not trust PowerShell aliases** for Linux-style commands:
  - `curl` in PowerShell is `Invoke-WebRequest` alias (different flags)
  - use `Invoke-RestMethod` for tests
  - use `sc.exe`, not `sc`
- **Do not expect routes in dashboard** for locally managed tunnels; routes come from local `config.yml`.
- **Do not assume editing old Hostfully notes triggers webhook events**; use explicit webhook tests.

## Fast Troubleshooting

### Public URL returns `503`

Meaning: Cloudflare is reachable but cannot proxy to origin.

Check in order:
1. Local endpoint works:
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/webhook" -ContentType "application/json" -Body '{"event_type":"TEST_EVENT","lead_uid":"test"}'
```
2. `cloudflared/config.yml` has correct `tunnel` and `credentials-file`.
3. Tunnel DNS route exists:
```powershell
cloudflared tunnel route dns f77775d6-626c-454f-a0b2-b1010384a129 webhook.coze.care
```
4. Service command uses `--config ...\cloudflared\config.yml`:
```bat
sc.exe qc CloudflaredTunnel
```

### Service not found (`1060`)

It means wrong service name or service never created.

Use:
```powershell
Get-Service | Where-Object { $_.Name -match "cloud" -or $_.DisplayName -match "cloud" } | Format-Table Name,DisplayName,Status
```

If missing, recreate with `sc.exe create CloudflaredTunnel ...`.

### Credentials file error (`doesn't exist`)

Use absolute path in `credentials-file` and confirm file physically exists in `cloudflared/`.

## Known Good State Checklist

- `sc.exe query CloudflaredTunnel` shows `STATE: RUNNING`
- `sc.exe qc CloudflaredTunnel` shows `START_TYPE: AUTO_START`
- `BINARY_PATH_NAME` uses `--config C:\COZE_CORP\cozmo_bridge\cloudflared\config.yml`
- `pm2` shows `cozmo-bridge` online
- Public webhook test returns success and appears in PM2 logs
