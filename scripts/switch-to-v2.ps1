#!/usr/bin/env pwsh
# Switch cozmo-bridge to Evolution API v2 (port 8081)
# Run from the workspace root: .\scripts\switch-to-v2.ps1

$configPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\ecosystem.config.js"))
$config = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)

if ($config -notmatch "localhost:8080") {
    Write-Host "Already on v2 (or URL not found). No change made." -ForegroundColor Yellow
    exit 0
}

$updated = $config -replace "localhost:8080", "localhost:8081"
[System.IO.File]::WriteAllText($configPath, $updated, (New-Object System.Text.UTF8Encoding $false))

Write-Host "ecosystem.config.js updated: 8080 -> 8081" -ForegroundColor Green
Write-Host "Restarting cozmo-bridge..." -ForegroundColor Cyan
pm2 restart cozmo-bridge --update-env

Start-Sleep -Seconds 5

Write-Host "Verify v2 connection:" -ForegroundColor Cyan
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:8081/instance/fetchInstances" -Headers @{"apikey"="cozmo_evo_k9x2mP4nQr8vL3wJ"} -Method Get
    Write-Host "v2 status: $($resp.connectionStatus)" -ForegroundColor $(if ($resp.connectionStatus -eq "open") { "Green" } else { "Yellow" })
} catch {
    Write-Host "Could not reach v2 API: $_" -ForegroundColor Red
}
