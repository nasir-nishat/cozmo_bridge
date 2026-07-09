$PORT = 3001
$WORKSPACE = "C:\COZE_CORP\cozmo_bridge"
$ECOSYSTEM = "$WORKSPACE\ecosystem.config.js"

function Get-CozmoBridgePm2Pids {
    $pidDir = "$env:USERPROFILE\.pm2\pids"
    if (-not (Test-Path $pidDir)) { return @() }

    Get-ChildItem -Path $pidDir -Filter "cozmo-bridge-*.pid" -ErrorAction SilentlyContinue |
        ForEach-Object { Get-Content $_.FullName -ErrorAction SilentlyContinue } |
        ForEach-Object { "$_".Trim() } |
        Where-Object { $_ -match '^\d+$' } |
        Select-Object -Unique
}

function Get-ListeningPidsForPort($port) {
    netstat -ano |
        Select-String ":$port " |
        Where-Object { $_ -match "LISTENING" } |
        ForEach-Object { ($_ -split '\s+')[-1] } |
        Where-Object { $_ -match '^\d+$' } |
        Select-Object -Unique
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Restart needs Administrator rights for PM2/WeChat. Relaunching elevated..."
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`""
    exit
}

# Trim workspace logs to last 500 lines each
Write-Host "Trimming logs..."
$logDir = "$WORKSPACE\logs"
if (Test-Path $logDir) {
    Get-ChildItem "$logDir\*.log", "$logDir\*.txt" -ErrorAction SilentlyContinue | ForEach-Object {
        $lines = Get-Content $_.FullName -ErrorAction SilentlyContinue
        if ($lines.Count -gt 500) {
            $lines | Select-Object -Last 500 | Set-Content $_.FullName -Encoding UTF8
            Write-Host "  Trimmed $($_.Name) ($($lines.Count) → 500 lines)"
        }
    }
}
# Trim pm2 logs to last 500 lines each
$pm2LogDir = "$env:USERPROFILE\.pm2\logs"
if (Test-Path $pm2LogDir) {
    Get-ChildItem "$pm2LogDir\*.log" -ErrorAction SilentlyContinue | ForEach-Object {
        $lines = Get-Content $_.FullName -ErrorAction SilentlyContinue
        if ($lines.Count -gt 500) {
            $lines | Select-Object -Last 500 | Set-Content $_.FullName -Encoding UTF8
            Write-Host "  Trimmed $($_.Name) ($($lines.Count) → 500 lines)"
        }
    }
}

Write-Host "Stopping cozmo-bridge via pm2..."
$pm2DeleteOutput = pm2 delete cozmo-bridge 2>&1
$pm2DeleteText = $pm2DeleteOutput -join "`n"
if ($LASTEXITCODE -ne 0 -and ($pm2DeleteText -notmatch "not found|doesn't exist|not exist|not running")) {
    Write-Host "PM2 delete failed - aborting"
    Write-Host $pm2DeleteText
    exit 1
}
Start-Sleep -Seconds 2

Write-Host "Closing WeChat..."
Get-Process -Name "WeChat" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Waiting for Docker..."
$dockerReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        docker ps 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
    } catch {}
    Start-Sleep -Seconds 3
}
if ($dockerReady) { Write-Host "Docker ready" } else { Write-Host "Docker timeout - continuing anyway" }

Write-Host "Checking LM Studio..."
$lmProc = Get-Process -Name "LM Studio" -ErrorAction SilentlyContinue
if (-not $lmProc) {
    Write-Host "LM Studio not running — launching..."
    Start-Process "C:\Program Files\LM Studio\LM Studio.exe"
} else {
    Write-Host "LM Studio already running"
}
$lmReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:1234/v1/models" -TimeoutSec 3
        if ($r) { $lmReady = $true; break }
    } catch {}
    Start-Sleep -Seconds 3
}
if ($lmReady) { Write-Host "LM Studio ready" } else { Write-Host "LM Studio timeout - continuing anyway" }

Write-Host "Clearing orphan processes on port $PORT..."
$pids = netstat -ano | Select-String ":$PORT " | Where-Object { $_ -match "LISTENING" } | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -Unique
foreach ($p in $pids) {
    if ($p -and $p -ne "0") {
        Write-Host "  Killing PID $p"
        taskkill /F /PID $p 2>$null
    }
}
Start-Sleep -Seconds 2

Write-Host "Building..."
Set-Location $WORKSPACE
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD FAILED - aborting"
    Write-Host $buildResult
    exit 1
}
Write-Host "Build succeeded"

Write-Host "Starting pm2..."
$pm2FlushOutput = pm2 flush 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "PM2 flush failed - aborting"
    Write-Host ($pm2FlushOutput -join "`n")
    exit 1
}
$pm2StartOutput = pm2 start $ECOSYSTEM --only cozmo-bridge 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "PM2 start failed - aborting"
    Write-Host ($pm2StartOutput -join "`n")
    exit 1
}

Write-Host "Verifying..."
$verified = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 3
    $pmPids = @(Get-CozmoBridgePm2Pids)
    $listenPids = @(Get-ListeningPidsForPort $PORT)
    $matchingPids = @($pmPids | Where-Object { $listenPids -contains $_ })
    if ($matchingPids.Count -gt 0) {
        Write-Host "PID match: $($matchingPids -join ', ') owns port $PORT - OK"
        $verified = $true
        break
    }
    Write-Host "  Waiting for port $PORT... (attempt $($i+1)/10, pm2=$($pmPids -join ','), port=$($listenPids -join ','))"
}
if (-not $verified) {
    Write-Host "PID MISMATCH after 30s - pm2=$($pmPids -join ',') port=$($listenPids -join ',')"
    exit 1
}

try {
    $health = Invoke-RestMethod -Uri "http://localhost:$PORT/wa/webhook" -Method GET -TimeoutSec 5
    if ($health.ok) {
        Write-Host "Health check passed (waReady=$($health.waReady))"
    }
} catch {
    Write-Host "Health check pending - server still starting"
}

Write-Host "COZMO Bridge is LIVE on port $PORT"
# Telegram notification is sent by index.ts on startup — no duplicate needed here

# Auto-launch WeChat and press Enter on the login screen (Open WeChat button is default focus)
Write-Host "Launching WeChat..."
$wechatExe = "C:\Program Files\Tencent\WeChat\WeChat.exe"
if (-not (Test-Path $wechatExe)) { $wechatExe = "$env:LOCALAPPDATA\WeChat\WeChat.exe" }
if (-not (Test-Path $wechatExe)) {
    Write-Host "WeChat.exe not found — skipping auto-login"
    return
}
Start-Process $wechatExe

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
"@

# Wait up to 20s for WeChat window to appear, then bring to foreground and press Enter
$pressed = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $proc = Get-Process -Name "WeChat" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
    if ($proc) {
        $hwnd = $proc.MainWindowHandle
        [WinAPI]::ShowWindow($hwnd, 9) | Out-Null     # SW_RESTORE
        [WinAPI]::SetForegroundWindow($hwnd) | Out-Null
        Start-Sleep -Milliseconds 800
        [WinAPI]::keybd_event(0x0D, 0, 0, 0)     # VK_RETURN down
        [WinAPI]::keybd_event(0x0D, 0, 2, 0)     # VK_RETURN up
        Write-Host "WeChat window focused and Enter sent — login button activated"
        $pressed = $true
        break
    }
}
if (-not $pressed) { Write-Host "WeChat window did not appear — may need manual login" }

# Auto-launch LDPlayer (runs MessengerBot R for KakaoTalk)
Write-Host "Launching LDPlayer..."
$ldProc = Get-Process -Name "dnplayer" -ErrorAction SilentlyContinue
if ($ldProc) {
    Write-Host "LDPlayer already running"
} else {
    & "C:\LDPlayer\LDPlayer9\ldconsole.exe" launch --index 0
    Write-Host "LDPlayer launched"
}
