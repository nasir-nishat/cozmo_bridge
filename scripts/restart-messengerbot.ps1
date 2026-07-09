# Restart MessengerBot R in LDPlayer via ADB
# Run manually, or schedule via Windows Task Scheduler (see bottom of file)
#
# To schedule nightly at 04:00 KST, run once as Administrator:
#   $action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NonInteractive -File C:\COZE_CORP\cozmo_bridge\scripts\restart-messengerbot.ps1"
#   $trigger = New-ScheduledTaskTrigger -Daily -At "04:00"
#   Register-ScheduledTask -TaskName "RestartMessengerBotR" -Action $action -Trigger $trigger -RunLevel Highest

param(
    [string]$AdbPath  = "C:\LDPlayer\LDPlayer9\adb.exe",
    [string]$LdPort   = "5555",
    [string]$Package  = "com.xfl.msgbot"
)

$device = "127.0.0.1:$LdPort"

Write-Host "$(Get-Date -Format 'HH:mm:ss') Connecting to LDPlayer ($device)..."
& $AdbPath connect $device
if ($LASTEXITCODE -ne 0) {
    Write-Host "ADB connect failed — is LDPlayer running?"
    exit 1
}
Start-Sleep -Seconds 2

Write-Host "$(Get-Date -Format 'HH:mm:ss') Force-stopping $Package..."
& $AdbPath -s $device shell am force-stop $Package
Start-Sleep -Seconds 3

Write-Host "$(Get-Date -Format 'HH:mm:ss') Launching $Package..."
& $AdbPath -s $device shell monkey -p $Package -c android.intent.category.LAUNCHER 1

Write-Host "$(Get-Date -Format 'HH:mm:ss') Done. MessengerBot R restarted."
