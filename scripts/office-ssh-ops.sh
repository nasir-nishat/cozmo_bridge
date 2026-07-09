#!/usr/bin/env bash
set -uo pipefail

# Helper commands for managing the office Windows server over SSH.
# Notes:
# - This script does NOT store any password. SSH will prompt when needed.
# - Tested with: sshcozmo@192.168.0.6

HOST_IP="${COZMO_OFFICE_IP:-192.168.0.6}"
SSH_USER="${COZMO_SSH_USER:-sshcozmo}"

# These paths are on the *office Windows* machine.
WS_PATH="C:\COZE_CORP\cozmo_bridge"
LOG_PATH="C:\Users\cozmo\.pm2\logs\cozmo-bridge-out.log"
ERR_PATH="C:\Users\cozmo\.pm2\logs\cozmo-bridge-error.log"

usage() {
  cat <<EOF
Usage: $0 {help|deploy|health|restart|logs|logs-error|logs-follow}

Examples:
  $0 health
  $0 logs
  $0 deploy
EOF
}

cmd="${1:-help}"

ssh_base() {
  ssh -T "${SSH_USER}@${HOST_IP}" "$@"
}

case "$cmd" in
  help|--help|-h)
    usage
    ;;

  health)
    ssh_base "powershell -ExecutionPolicy Bypass -Command \"cd '${WS_PATH}'; .\\scripts\\health-check.ps1\""
    ;;

  restart)
    ssh_base "powershell -ExecutionPolicy Bypass -Command \"\$env:PATH = 'C:\Users\cozmo\AppData\Roaming\npm;' + \$env:PATH; cd '${WS_PATH}'; .\\scripts\\restart.ps1\""
    ;;

  deploy)
    # git pull then launch restart.ps1 detached via Start-Process so the SSH
    # session can close immediately. restart.ps1 runs the full clean restart
    # (pm2 kill, build, start from scratch). Telegram confirms when done.
    ssh_base "powershell -ExecutionPolicy Bypass -Command \"\$env:PATH = 'C:\Users\cozmo\AppData\Roaming\npm;' + \$env:PATH; cd '${WS_PATH}'; git config --global --add safe.directory 'C:/COZE_CORP/cozmo_bridge'; git pull; Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File ${WS_PATH}\scripts\restart.ps1' -NoNewWindow\""
    ;;

  logs)
    ssh_base "powershell -NoProfile -Command \"Get-Content -Path '${LOG_PATH}' -Tail 80\""
    ;;

  logs-follow)
    ssh_base "powershell -NoProfile -Command \"Get-Content -Path '${LOG_PATH}' -Wait\""
    ;;

  logs-error)
    ssh_base "powershell -NoProfile -Command \"Get-Content -Path '${ERR_PATH}' -Tail 80\""
    ;;

  *)
    usage
    exit 1
    ;;
esac
