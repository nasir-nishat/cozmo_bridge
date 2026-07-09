# downgrade-wechat.ps1
# Downgrades WeChat to 3.9.12.51 and locks it there using 3 layers:
#   1. Hosts file blocks update servers
#   2. Windows Firewall blocks WeChatUpdate.exe outbound
#   3. Disables WeChat scheduled update tasks
# MUST run as Administrator.

$WECHAT_VERSION = "3.9.12.51"
$INSTALLER_URL  = "https://github.com/lich0821/WeChatFerry/releases/download/v39.5.2/WeChatSetup-3.9.12.51.exe"
$INSTALLER_PATH = "$env:TEMP\WeChatSetup-$WECHAT_VERSION.exe"
$HOSTS_FILE     = "C:\Windows\System32\drivers\etc\hosts"

Write-Host "[INFO] WeChat downgrade to $WECHAT_VERSION with 3-layer update lock"
Write-Host ""

# --- 1. Kill all WeChat processes ---
$wcProcesses = @("WeChat", "WeChatUpdate", "WeChatAppEx", "WeChatBrowser")
foreach ($proc in $wcProcesses) {
    $p = Get-Process -Name $proc -ErrorAction SilentlyContinue
    if ($p) {
        $p | Stop-Process -Force
        Write-Host "[OK] Killed $proc"
    }
}
Start-Sleep -Seconds 2

# --- 2. Download installer ---
if (-not (Test-Path $INSTALLER_PATH)) {
    Write-Host "[INFO] Downloading WeChat $WECHAT_VERSION (285 MB)..."
    try {
        Invoke-WebRequest -Uri $INSTALLER_URL -OutFile $INSTALLER_PATH -UseBasicParsing
        Write-Host "[OK] Downloaded: $INSTALLER_PATH"
    } catch {
        Write-Host "[ERROR] Download failed: $_"
        Write-Host "[INFO] Download manually from:"
        Write-Host "       $INSTALLER_URL"
        exit 1
    }
} else {
    Write-Host "[OK] Installer already cached: $INSTALLER_PATH"
}

# --- 3. Install WeChat 3.9.12.51 ---
Write-Host "[INFO] Running installer..."
Start-Process -FilePath $INSTALLER_PATH -ArgumentList "/S" -Wait
Write-Host "[OK] Install complete"
Start-Sleep -Seconds 3

# --- 4. LAYER 1: Hosts file ---
$hostsContent = Get-Content $HOSTS_FILE -Raw -ErrorAction SilentlyContinue
if ($hostsContent -match "dldir1\.qq\.com") {
    Write-Host "[OK] Hosts file block already present"
} else {
    $block = "`n# WeChat update lock`n127.0.0.1 dldir1.qq.com`n127.0.0.1 updinfo.qq.com`n127.0.0.1 weixin.qq.com`n127.0.0.1 update.weixin.qq.com"
    try {
        Add-Content -Path $HOSTS_FILE -Value $block -Encoding UTF8
        Write-Host "[OK] Hosts file: update servers blocked"
    } catch {
        Write-Host "[WARN] Could not write hosts file - are you running as Administrator?"
    }
}

# --- 5. LAYER 2: Windows Firewall block on WeChatUpdate.exe ---
$searchPaths = @(
    "C:\Program Files\Tencent\WeChat\WeChatUpdate.exe",
    "C:\Program Files (x86)\Tencent\WeChat\WeChatUpdate.exe",
    "$env:LOCALAPPDATA\Tencent\WeChat\WeChatUpdate.exe"
)
$updaterPath = $searchPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

$fwRuleName = "Block WeChatUpdate outbound"
$existingRule = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Host "[OK] Firewall rule already exists"
} elseif ($updaterPath) {
    try {
        New-NetFirewallRule -DisplayName $fwRuleName `
            -Direction Outbound `
            -Program $updaterPath `
            -Action Block `
            -Profile Any | Out-Null
        Write-Host "[OK] Firewall: blocked $updaterPath"
    } catch {
        Write-Host "[WARN] Could not create firewall rule: $_"
    }
} else {
    Write-Host "[INFO] WeChatUpdate.exe not found in standard paths - adding by name pattern"
    try {
        New-NetFirewallRule -DisplayName $fwRuleName `
            -Direction Outbound `
            -Program "%ProgramFiles%\Tencent\WeChat\WeChatUpdate.exe" `
            -Action Block `
            -Profile Any | Out-Null
        Write-Host "[OK] Firewall rule added (path pre-set)"
    } catch {
        Write-Host "[WARN] Firewall rule failed - run as Administrator"
    }
}

# --- 6. LAYER 3: Disable WeChat scheduled tasks ---
$taskPaths = @("\", "\Tencent\", "\Tencent\WeChat\")
$disabled = 0
foreach ($path in $taskPaths) {
    try {
        $tasks = Get-ScheduledTask -TaskPath $path -ErrorAction SilentlyContinue |
                 Where-Object { $_.TaskName -match "WeChat|Weixin" }
        foreach ($task in $tasks) {
            Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue | Out-Null
            Write-Host "[OK] Disabled scheduled task: $($task.TaskName)"
            $disabled++
        }
    } catch { }
}
if ($disabled -eq 0) {
    Write-Host "[INFO] No WeChat scheduled tasks found"
}

# --- 7. Set WeChat install folder to read-only to block in-place update ---
$wechatDirs = @(
    "C:\Program Files\Tencent\WeChat",
    "C:\Program Files (x86)\Tencent\WeChat"
)
foreach ($dir in $wechatDirs) {
    if (Test-Path $dir) {
        try {
            $acl = Get-Acl $dir
            $deny = New-Object System.Security.AccessControl.FileSystemAccessRule(
                "SYSTEM", "Write,Modify", "ContainerInherit,ObjectInherit", "None", "Deny"
            )
            $acl.AddAccessRule($deny)
            Set-Acl -Path $dir -AclObject $acl
            Write-Host "[OK] Write-blocked: $dir"
        } catch {
            Write-Host "[WARN] Could not write-block $dir : $_"
        }
    }
}

Write-Host ""
Write-Host "[DONE] WeChat $WECHAT_VERSION installed. 3-layer update lock applied."
Write-Host "       1. Open WeChat and confirm version is $WECHAT_VERSION"
Write-Host "       2. Log in to WeChat"
Write-Host "       3. Run: npm run patch:wechat"
Write-Host "       4. Run: pm2 restart cozmo-bridge"
