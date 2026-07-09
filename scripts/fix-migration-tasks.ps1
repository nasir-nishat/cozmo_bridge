$ErrorActionPreference = "Stop"

$workspace = "C:\COZE_CORP\cozmo_bridge"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole] "Administrator"
)) {
    Write-Host "Run this script from an Administrator PowerShell."
    Write-Host "Path: $PSCommandPath"
    exit 1
}

Set-Location $workspace

Write-Host "Registering COZMO bridge startup/watchdog tasks..."
& "$workspace\scripts\register-tasks.ps1"

Write-Host "Registering MessengerBot restart task..."
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -WindowStyle Hidden -File `"$workspace\scripts\restart-messengerbot.ps1`""

$trigger = New-ScheduledTaskTrigger -Daily -At "11:30"
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 72)

Register-ScheduledTask `
    -TaskName "RestartMessengerBotR" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "Done. Scheduled tasks now point to $workspace."
