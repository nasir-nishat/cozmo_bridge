# patch-evo-api.ps1
# Re-applies COZMO's custom patches to the Evolution API container.
# Run this if the container is ever recreated from the base image.
# After running, commit: docker commit evolution-api-v2 evoapicloud/evolution-api:v2.3.6-cozmo
#
# NOTE: Evolution API ships as a single bundled dist/main.js (esbuild output).
# The separate dist/validate/group.schema.js and whatsapp.baileys.service.js
# files exist on disk but are NOT required by main.js at runtime — patching
# them silently does nothing. Both patches below target dist/main.js directly.

$CONTAINER = "evolution-api-v2"
$TMP = "$env:TEMP\evo-patch"
New-Item -ItemType Directory -Force -Path $TMP | Out-Null

$mainPath = "/evolution/dist/main.js"
docker cp "${CONTAINER}:${mainPath}" "$TMP\main.js"

$main = Get-Content "$TMP\main.js" -Raw

# ── Patch 1: updateSetting enum ────────────────────────────────────────────────
# Adds join_approval_on/off and member_add_all/admin to the allowed action list
$oldEnum = 'enum:["announcement","not_announcement","locked","unlocked"]'
$newEnum = 'enum:["announcement","not_announcement","locked","unlocked","join_approval_on","join_approval_off","member_add_all","member_add_admin"]'

if ($main.Contains($oldEnum)) {
    $main = $main.Replace($oldEnum, $newEnum)
    Write-Output "Patch 1 staged: updateSetting enum"
} elseif ($main.Contains($newEnum)) {
    Write-Output "Patch 1 already applied: updateSetting enum"
} else {
    Write-Output "Patch 1 FAILED: enum string not found in dist/main.js -- Evolution API version may have changed"
}

# ── Patch 2: updateGSetting() routing ──────────────────────────────────────────
# Routes the new actions to Baileys groupJoinApprovalMode / groupMemberAddMode
# (both exist in Baileys but were never wired up by Evolution API)
$oldSvc = 'async updateGSetting(e){try{return{updateSetting:await this.client.groupSettingUpdate(e.groupJid,e.action)}}catch(t){throw new y("Error updating setting",t.toString())}}'
$newSvc = 'async updateGSetting(e){try{if(e.action==="join_approval_on"){return{updateSetting:await this.client.groupJoinApprovalMode(e.groupJid,"on")}}if(e.action==="join_approval_off"){return{updateSetting:await this.client.groupJoinApprovalMode(e.groupJid,"off")}}if(e.action==="member_add_all"){return{updateSetting:await this.client.groupMemberAddMode(e.groupJid,"all_member_add")}}if(e.action==="member_add_admin"){return{updateSetting:await this.client.groupMemberAddMode(e.groupJid,"admin_add")}}return{updateSetting:await this.client.groupSettingUpdate(e.groupJid,e.action)}}catch(t){throw new y("Error updating setting",t.toString())}}'

if ($main.Contains($oldSvc)) {
    $main = $main.Replace($oldSvc, $newSvc)
    Write-Output "Patch 2 staged: updateGSetting() routing"
} elseif ($main.Contains($newSvc)) {
    Write-Output "Patch 2 already applied: updateGSetting() routing"
} else {
    Write-Output "Patch 2 FAILED: updateGSetting string not found in dist/main.js -- Evolution API version may have changed"
}

Set-Content "$TMP\main.js" -Value $main -Encoding utf8 -NoNewline
docker cp "$TMP\main.js" "${CONTAINER}:${mainPath}"
Write-Output "Copied patched dist/main.js into container"

# ── Restart + commit ────────────────────────────────────────────────────────────
Write-Output "`nRestarting container..."
docker restart $CONTAINER
Start-Sleep -Seconds 8
docker ps --filter "name=$CONTAINER" --format "{{.Names}} {{.Status}}"

Write-Output "`nCommitting patched image..."
docker commit $CONTAINER evoapicloud/evolution-api:v2.3.6-cozmo
Write-Output "Done -- image saved as evoapicloud/evolution-api:v2.3.6-cozmo"
