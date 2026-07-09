param(
    [string]$ServiceName = "CloudflaredTunnel",
    [string]$Pm2AppName = "cozmo-bridge",
    [string]$WebhookUrl = "https://webhook.coze.care/webhook",
    [switch]$SkipWebhookTest
)

$ErrorActionPreference = "Stop"

function Write-Ok($message) {
    Write-Host "[OK] $message" -ForegroundColor Green
}

function Write-WarnMsg($message) {
    Write-Host "[WARN] $message" -ForegroundColor Yellow
}

function Write-Fail($message) {
    Write-Host "[FAIL] $message" -ForegroundColor Red
}

Write-Host "=== COZMO Bridge Health Check ===" -ForegroundColor Cyan
Write-Host "Timestamp : $(Get-Date -Format s)"
Write-Host "Service   : $ServiceName"
Write-Host "PM2 App   : $Pm2AppName"
Write-Host "Webhook   : $WebhookUrl"
Write-Host ""

$failed = $false

try {
    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    if ($service.Status -eq "Running") {
        Write-Ok "Windows service '$ServiceName' is running."
    } else {
        Write-Fail "Windows service '$ServiceName' is $($service.Status)."
        $failed = $true
    }
} catch {
    Write-Fail "Windows service '$ServiceName' was not found."
    $failed = $true
}

try {
    $pm2StatusOutput = $null
    # On Windows, pm2 is installed as pm2.cmd — try that first
    $pm2Commands = @('pm2.cmd', 'pm2', 'npx pm2')
    foreach ($cmd in $pm2Commands) {
        try {
            $pm2StatusOutput = & $cmd status $Pm2AppName --no-color 2>$null
            if ($pm2StatusOutput) { break }
        } catch {
            $pm2StatusOutput = $null
        }
    }

    if (-not $pm2StatusOutput) {
        throw "pm2 returned no data"
    }

    $statusText = ($pm2StatusOutput | Out-String)
    if ($statusText -match [regex]::Escape($Pm2AppName) -and $statusText -match "\bonline\b") {
        Write-Ok "PM2 app '$Pm2AppName' is online."
    } elseif ($statusText -match [regex]::Escape($Pm2AppName)) {
        Write-Fail "PM2 app '$Pm2AppName' is not online."
        $failed = $true
    } else {
        Write-Fail "PM2 app '$Pm2AppName' was not found."
        $failed = $true
    }
} catch {
    # PM2 may be running under a different user (Task Scheduler) and unreachable via IPC.
    # Fall back to checking if the bridge is responding on localhost.
    try {
        $localResp = Invoke-RestMethod -Method Get -Uri "http://localhost:3001/admin/whatsapp-status" -TimeoutSec 5
        Write-WarnMsg "PM2 IPC unavailable (likely running as SYSTEM). Bridge is responding on :3001."
    } catch {
        Write-Fail "Could not query PM2 and bridge is not responding on :3001."
        $failed = $true
    }
}

if ($SkipWebhookTest) {
    Write-WarnMsg "Skipping webhook POST test by request."
} else {
    try {
        $payload = @{
            event_type = "TEST_EVENT"
            lead_uid   = "health-check"
        } | ConvertTo-Json -Compress

        $response = Invoke-RestMethod -Method Post -Uri $WebhookUrl -ContentType "application/json" -Body $payload

        if ($null -ne $response.success -and $response.success -eq $true) {
            Write-Ok "Webhook test succeeded (`"success=true`")."
        } else {
            Write-WarnMsg "Webhook responded but success flag was not true. Raw response: $($response | ConvertTo-Json -Compress)"
        }
    } catch {
        Write-Fail "Webhook POST test failed: $($_.Exception.Message)"
        $failed = $true
    }
}

Write-Host ""
if ($failed) {
    Write-Fail "Health check completed with failures."
    exit 1
}

Write-Ok "Health check passed."
exit 0
