param(
    [switch]$FromStartup
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
$logPath = Join-Path $logDir "startup.log"

if (-not (Test-Path $logDir)) {
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
}

Set-Location $root

if ($FromStartup) {
    # Give network + user env a moment to settle at Windows login.
    Start-Sleep -Seconds 12
}

Start-Transcript -Path $logPath -Append | Out-Null

Write-Host "=== COZMO startup ==="
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Root: $root"

try {
    $pm2List = pm2 jlist 2>$null
    if (-not $pm2List -or $pm2List -eq "[]") {
        Write-Host "[pm2] starting cozmo-bridge"
        pm2 start ecosystem.config.js --only cozmo-bridge --update-env | Out-Host
    }
    else {
        Write-Host "[pm2] restarting cozmo-bridge with updated env"
        pm2 restart ecosystem.config.js --only cozmo-bridge --update-env | Out-Host
    }
}
catch {
    Write-Warning "[pm2] failed: $($_.Exception.Message)"
}

try {
    $cloudflaredProc = Get-Process cloudflared -ErrorAction SilentlyContinue
    if ($null -eq $cloudflaredProc) {
        $configPath = Join-Path $root "cloudflared\config.yml"
        if (-not (Test-Path $configPath)) {
            Write-Warning "[tunnel] skipped: missing $configPath"
        }
        else {
            Write-Host "[tunnel] starting cloudflared tunnel in background"
            Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c cd /d `"$root`" && npm run tunnel" `
            -WindowStyle Hidden | Out-Null
        }
    }
    else {
        Write-Host "[tunnel] already running (pid $($cloudflaredProc.Id))"
    }
}
catch {
    Write-Warning "[tunnel] failed: $($_.Exception.Message)"
}

try {
    $gatewayStatus = openclaw gateway status 2>$null
    if ($gatewayStatus -match "Runtime:\s+running") {
        Write-Host "[gateway] already running"
    }
    else {
        $taskExists = schtasks /Query /TN "OpenClaw Gateway" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[gateway] starting OpenClaw Gateway scheduled task"
            schtasks /Run /TN "OpenClaw Gateway" | Out-Null
        }
        else {
            Write-Host "[gateway] scheduled task not found, starting background process"
            Start-Process -FilePath "cmd.exe" `
                -ArgumentList "/c cd /d `"$root`" && openclaw gateway run" `
                -WindowStyle Hidden | Out-Null
        }
    }
}
catch {
    Write-Warning "[gateway] failed: $($_.Exception.Message)"
}

Write-Host "=== COZMO startup complete ==="
Stop-Transcript | Out-Null
