$root = $PSScriptRoot
$startupScript = Join-Path $root "scripts\start-services.ps1"

if (-not (Test-Path $startupScript)) {
    Write-Host "Missing scripts\start-services.ps1" -ForegroundColor Yellow
    exit 1
}

powershell -NoProfile -ExecutionPolicy Bypass -File $startupScript
pm2 logs cozmo-bridge
