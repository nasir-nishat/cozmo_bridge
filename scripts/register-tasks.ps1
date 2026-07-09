$WORKSPACE = "C:\COZE_CORP\cozmo_bridge"
$USER = $env:USERNAME

Write-Host "Registering COZMO scheduled tasks..."

$action1 = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WORKSPACE\scripts\restart.ps1`"" `
    -WorkingDirectory $WORKSPACE

$trigger1 = New-ScheduledTaskTrigger -AtLogOn -User $USER

$settings1 = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "COZMO Bridge Auto-Start" `
    -Action $action1 `
    -Trigger $trigger1 `
    -Settings $settings1 `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "Task 1 done: Auto-start on login"

$action2 = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WORKSPACE\scripts\health-check-watchdog.ps1`"" `
    -WorkingDirectory $WORKSPACE

$trigger2 = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -Once -At (Get-Date)

$settings2 = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "COZMO Bridge Watchdog" `
    -Action $action2 `
    -Trigger $trigger2 `
    -Settings $settings2 `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "Task 2 done: Watchdog every 5 min"
Write-Host "All done. Check taskschd.msc"
