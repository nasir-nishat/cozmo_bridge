$PORT = 3001
$WORKSPACE = "C:\COZE_CORP\cozmo_bridge"
$LOG = "$WORKSPACE\logs\watchdog.log"
$TELEGRAM_TOKEN = "8519469737:AAERhZrnwSYGsuFWbxdHxB294C1Og_eoSmU"
$TELEGRAM_CHAT = "8769782643"
$EVO_URL = "http://localhost:8081/instance/fetchInstances"
$EVO_KEY = "cozmo_evo_k9x2mP4nQr8vL3wJ"

New-Item -ItemType Directory -Force -Path "$WORKSPACE\logs" | Out-Null
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Send-Telegram($msg) {
    try {
        Invoke-RestMethod -Uri "https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage" -Method POST -Body @{
            chat_id = $TELEGRAM_CHAT
            text = $msg
        } | Out-Null
    } catch {}
}

# Check WeChat
$wechatProc = Get-Process -Name "WeChat" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
if (-not $wechatProc) {
    Add-Content $LOG "$timestamp — WeChat DOWN — relaunching..."
    Send-Telegram "⚠️ COZMO: WeChat not running — auto-relaunching"
    $wechatExe = "C:\Program Files\Tencent\WeChat\WeChat.exe"
    if (Test-Path $wechatExe) {
        Start-Process $wechatExe
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPIWatchdog {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
"@
        $launched = $false
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Seconds 1
            $p = Get-Process -Name "WeChat" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
            if ($p) {
                [WinAPIWatchdog]::ShowWindow($p.MainWindowHandle, 9)
                [WinAPIWatchdog]::SetForegroundWindow($p.MainWindowHandle)
                Start-Sleep -Milliseconds 800
                [WinAPIWatchdog]::keybd_event(0x0D, 0, 0, 0)
                [WinAPIWatchdog]::keybd_event(0x0D, 0, 2, 0)
                Add-Content $LOG "$timestamp — WeChat relaunched and Enter sent"
                $launched = $true
                break
            }
        }
        if (-not $launched) {
            Add-Content $LOG "$timestamp — WeChat relaunch failed — window did not appear"
            Send-Telegram "❌ COZMO: WeChat relaunch failed — manual login needed"
        }
    } else {
        Add-Content $LOG "$timestamp — WeChat.exe not found"
        Send-Telegram "❌ COZMO: WeChat.exe not found — cannot relaunch"
    }
}

# Check LM Studio
try {
    Invoke-RestMethod -Uri "http://localhost:1234/v1/models" -TimeoutSec 5 | Out-Null
} catch {
    $lmProc = Get-Process -Name "LM Studio" -ErrorAction SilentlyContinue
    if (-not $lmProc) {
        Add-Content $LOG "$timestamp — LM Studio DOWN — relaunching..."
        Send-Telegram "⚠️ COZMO: LM Studio not running — auto-relaunching"
        Start-Process "C:\Program Files\LM Studio\LM Studio.exe"
    } else {
        Add-Content $LOG "$timestamp — LM Studio running but API not ready (model may not be loaded)"
        Send-Telegram "⚠️ COZMO: LM Studio API offline — process is running but no model loaded?"
    }
}

# Check Evolution API
try {
    Invoke-RestMethod -Uri $EVO_URL -Headers @{apikey=$EVO_KEY} -TimeoutSec 5 | Out-Null
} catch {
    Add-Content $LOG "$timestamp — Evolution API DOWN: $_ — starting Docker..."
    Send-Telegram "⚠️ COZMO: Evolution API DOWN — restarting Docker"
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Start-Sleep -Seconds 45
}

# Check bridge
try {
    $health = Invoke-RestMethod -Uri "http://localhost:$PORT/wa/webhook" -Method GET -TimeoutSec 5
    if ($health.ok -eq $true) { exit 0 }
    throw "waReady=$($health.waReady)"
} catch {
    $reason = $_.Exception.Message
    Add-Content $LOG "$timestamp — Bridge DOWN: $reason — restarting..."
    Send-Telegram "⚠️ COZMO: Bridge DOWN — auto-restarting"
    try {
        & "$WORKSPACE\scripts\restart.ps1"
        Add-Content $LOG "$timestamp — Restart completed"
    } catch {
        Add-Content $LOG "$timestamp — Restart FAILED: $($_.Exception.Message)"
        Send-Telegram "❌ COZMO: Restart FAILED — manual intervention needed"
    }
}
