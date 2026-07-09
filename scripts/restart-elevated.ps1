# restart-elevated.ps1
# Self-elevating wrapper around restart.ps1.
# WeChat has been running under an elevated token since downgrade-wechat.ps1
# was run as Administrator, so a non-elevated restart.ps1 can't Stop-Process it
# (Access Denied). This wrapper relaunches itself as Administrator, then calls
# the real restart.ps1 unmodified.

$WORKSPACE = "C:\COZE_CORP\cozmo_bridge"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Not elevated — relaunching as Administrator..."
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit", "-Command", "Set-Location '$WORKSPACE'; & '$WORKSPACE\scripts\restart.ps1'"
    exit
}

Set-Location $WORKSPACE
& "$WORKSPACE\scripts\restart.ps1"
