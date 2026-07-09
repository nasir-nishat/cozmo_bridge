$PORT      = 3002
$WORKSPACE = "C:\COZE_CORP\cozmo_bridge"
$ADMIN     = "$WORKSPACE\admin-ui"
$ECOSYSTEM = "$WORKSPACE\ecosystem.config.js"
$NODE      = "C:\Program Files\nodejs\node.exe"
$DEPLOY    = "$WORKSPACE\.deploy\admin-ui"
$RELEASES  = "$DEPLOY\releases"
$CURRENT   = "$DEPLOY\current"

function Reset-Pm2Daemon {
    Write-Host "Resetting stale PM2 daemon processes..."
    $pm2Daemons = Get-CimInstance Win32_Process |
        Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "\\pm2\\lib\\Daemon\.js" }

    foreach ($daemon in $pm2Daemons) {
        Write-Host "  Stopping PM2 daemon PID $($daemon.ProcessId)"
        Stop-Process -Id $daemon.ProcessId -Force
    }

    Start-Sleep -Seconds 3
}

Write-Host "Building admin-ui..."
Set-Location $ADMIN
$build = npm.cmd run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD FAILED - aborting"
    Write-Host $build
    exit 1
}
Write-Host "Build succeeded"

Write-Host "Preparing standalone release..."
New-Item -ItemType Directory -Force -Path $RELEASES | Out-Null
$releaseName = Get-Date -Format "yyyyMMdd-HHmmss"
$release = "$RELEASES\$releaseName"
New-Item -ItemType Directory -Force -Path $release | Out-Null

Copy-Item -Path "$ADMIN\.next\standalone\*" -Destination $release -Recurse -Force
New-Item -ItemType Directory -Force -Path "$release\.next" | Out-Null
Copy-Item -Path "$ADMIN\.next\static" -Destination "$release\.next\static" -Recurse -Force
if (Test-Path "$ADMIN\public") {
    Copy-Item -Path "$ADMIN\public" -Destination "$release\public" -Recurse -Force
}

if (Test-Path $CURRENT) {
    $currentItem = Get-Item -LiteralPath $CURRENT -Force
    if ($currentItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        [System.IO.Directory]::Delete($currentItem.FullName, $false)
    } else {
        Remove-Item -LiteralPath $currentItem.FullName -Recurse -Force
    }
}
New-Item -ItemType Junction -Path $CURRENT -Target $release | Out-Null
Write-Host "Release ready: $release"

Write-Host "Reloading cozmo-admin-ui via pm2..."
pm2.cmd flush cozmo-admin-ui 2>$null
$reload = pm2.cmd startOrReload $ECOSYSTEM --only cozmo-admin-ui 2>&1
if ($LASTEXITCODE -ne 0 -or ($reload -match "connect EPERM|rpc\.sock")) {
    Write-Host "PM2 pipe failed during reload; retrying..."
    Write-Host $reload
    Reset-Pm2Daemon
    $reload = pm2.cmd startOrReload $ECOSYSTEM --only cozmo-admin-ui 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PM2 START FAILED - starting admin-ui directly"
        Write-Host $reload
        $env:PORT = "$PORT"
        $env:HOSTNAME = "0.0.0.0"
        $env:NODE_ENV = "production"
        Start-Process -FilePath $NODE `
            -ArgumentList "server.js" `
            -WorkingDirectory $CURRENT `
            -WindowStyle Hidden
    }
}

Write-Host "Verifying..."
$verified = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    $listening = netstat -ano | Select-String ":$PORT " | Where-Object { $_ -match "LISTENING" }
    if ($listening) {
        $listenPid = ($listening -split '\s+')[-1]
        Write-Host "Port $PORT is LISTENING (PID $listenPid) - OK"
        $verified = $true
        break
    }
    Write-Host "  Waiting for port $PORT... (attempt $($i+1)/20)"
}

if ($verified) {
    Write-Host "Admin UI is LIVE at https://admin.coze.care"
} else {
    Write-Host "WARNING: admin-ui did not come up on port $PORT after 40s"
    exit 1
}
