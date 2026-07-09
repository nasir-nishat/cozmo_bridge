# patch-wechatferry.ps1
# Downloads WeChatFerry v39.5.2 DLLs and patches @wechatferry/core to support WeChat 3.9.12.51
# Run once after npm install: npm run patch:wechat
# WeChat MUST be 3.9.12.51 - if it auto-updated, run: .\scripts\downgrade-wechat.ps1 first

$WCF_VERSION = "39.5.2"
$SDK_DIR     = "$PSScriptRoot\..\node_modules\@wechatferry\core\sdk\v$WCF_VERSION"
$PKG_CJS     = "$PSScriptRoot\..\node_modules\@wechatferry\core\dist\package.json.cjs"

$DLLS     = @("sdk.dll", "spy.dll", "spy_debug.dll", "DISCLAIMER.md")
$BASE_URL = "https://github.com/lich0821/WeChatFerry/releases/download/v$WCF_VERSION"

Write-Host "[INFO] WeChatFerry DLL patcher - targeting v$WCF_VERSION (WeChat 3.9.12.51)"

# 1. Create SDK folder
if (-not (Test-Path $SDK_DIR)) {
    New-Item -ItemType Directory -Path $SDK_DIR -Force | Out-Null
    Write-Host "[OK] Created $SDK_DIR"
}

# 2. Download DLLs
foreach ($file in $DLLS) {
    $dest = "$SDK_DIR\$file"
    if (Test-Path $dest) {
        Write-Host "[SKIP] Already exists: $file"
        continue
    }
    Write-Host "[INFO] Downloading $file ..."
    try {
        Invoke-WebRequest -Uri "$BASE_URL/$file" -OutFile $dest -UseBasicParsing
        Write-Host "[OK] Downloaded: $file"
    } catch {
        Write-Host "[ERROR] Failed to download $file : $_"
        exit 1
    }
}

# 3. Create license flag
$flag = "$SDK_DIR\.license_accepted.flag"
if (-not (Test-Path $flag)) {
    New-Item -ItemType File -Path $flag -Force | Out-Null
    Write-Host "[OK] Created license flag"
}

# 4. Patch dist/package.json.cjs (this is what the compiled code actually reads)
$cjs = Get-Content $PKG_CJS -Raw
if ($cjs -match [regex]::Escape("`"$WCF_VERSION`"")) {
    Write-Host "[SKIP] dist/package.json.cjs already patched to v$WCF_VERSION"
} else {
    $patched = $cjs -replace 'version:\s*"[\d\.]+"', "version: `"$WCF_VERSION`""
    Set-Content -Path $PKG_CJS -Value $patched -Encoding UTF8 -NoNewline
    Write-Host "[OK] Patched dist/package.json.cjs to version $WCF_VERSION"
}

Write-Host ""
Write-Host "[DONE] @wechatferry/core now targets WeChat 3.9.12.51"
Write-Host "       Make sure WeChat PC is version 3.9.12.51 (not .57 or newer)"
Write-Host "       Restart: pm2 restart cozmo-bridge"
