#!/usr/bin/env pwsh
# Roll back cozmo-bridge to Evolution API v1 (port 8080)
# Run from the workspace root: .\scripts\switch-to-v1.ps1

$configPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\ecosystem.config.js"))
$config = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)

if ($config -notmatch "localhost:8081") {
    Write-Host "Already on v1 (or URL not found). No change made." -ForegroundColor Yellow
    exit 0
}

$updated = $config -replace "localhost:8081", "localhost:8080"
[System.IO.File]::WriteAllText($configPath, $updated, (New-Object System.Text.UTF8Encoding $false))

Write-Host "ecosystem.config.js updated: 8081 -> 8080" -ForegroundColor Green
Write-Host "Restarting cozmo-bridge..." -ForegroundColor Cyan
pm2 restart cozmo-bridge --update-env

Start-Sleep -Seconds 5

Write-Host "Verify v1 connection:" -ForegroundColor Cyan
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:8080/instance/connectionState/cozmo" -Headers @{"apikey"="cozmo_evo_k9x2mP4nQr8vL3wJ"} -Method Get
    Write-Host "v1 status: $($resp.instance.state)" -ForegroundColor $(if ($resp.instance.state -eq "open") { "Green" } else { "Yellow" })
} catch {
    Write-Host "Could not reach v1 API: $_" -ForegroundColor Red
}
