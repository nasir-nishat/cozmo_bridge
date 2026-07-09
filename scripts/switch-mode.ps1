param(
    [ValidateSet("dev", "prod")]
    [string]$Mode
)

$ErrorActionPreference = "Stop"

if (-not $Mode) {
    Write-Host "Usage: ./scripts/switch-mode.ps1 -Mode dev|prod" -ForegroundColor Yellow
    exit 1
}

if ($Mode -eq "dev") {
    $env:APP_MODE = "dev"
    $env:SEND_JANDI_IN_DEV = "true"
    $env:USE_TEST_JANDI_WEBHOOK = "true"
    Write-Host "Switching to DEV mode (TG + TEST JANDI)." -ForegroundColor Cyan
} else {
    $env:APP_MODE = "prod"
    $env:SEND_JANDI_IN_DEV = "false"
    $env:USE_TEST_JANDI_WEBHOOK = "false"
    Write-Host "Switching to PROD mode (TG + PROD JANDI)." -ForegroundColor Cyan
}

pm2 restart cozmo-bridge --update-env | Out-Host
Write-Host "Mode switch complete." -ForegroundColor Green
