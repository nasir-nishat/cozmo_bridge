# Remote Ops Quick Start

> Run all commands from **Mac terminal** only. Never from inside the Windows remote shell.

---

## One-time setup (Mac)

**Step 1 — Go to the project folder:**
```bash
cd /Users/nishat_coze/Documents/GitHub/coze-workspace
```

**Step 2 — Make the script executable:**
```bash
chmod +x scripts/office-ssh-ops.sh
```

**Step 3 — Add a shortcut so you can run `cozmo` from anywhere:**
```bash
echo 'alias cozmo="/Users/nishat_coze/Documents/GitHub/coze-workspace/scripts/office-ssh-ops.sh"' >> ~/.zshrc
source ~/.zshrc
```

---

## Daily usage (from anywhere in terminal)

```bash
cozmo health        # check server status
cozmo deploy        # git pull + build + restart (use after git push)
cozmo restart       # build + restart only (no git pull)
cozmo logs          # last 80 lines of server logs
cozmo logs-follow   # live log stream (Ctrl+C to stop)
```

---

## What each command does on the server

| Command | What runs on Windows |
|---|---|
| `health` | `health-check.ps1` — checks pm2, port, WA status |
| `deploy` | `git pull` → build → pm2 restart |
| `restart` | build → pm2 restart (no git pull) |
| `logs` | Last 80 lines of pm2 output log |
| `logs-follow` | Live log stream |

---

## Daily deploy flow

```bash
# 1. Push your code changes
git push

# 2. Deploy to server
cozmo deploy

# 3. Check logs
cozmo logs
```

---

## Troubleshooting

**"no such file or directory"**
→ You haven't set up the alias yet. Run the one-time setup steps above.

**Prompt shows `sshcozmo@COZE_AI ...`**
→ You are inside the remote Windows shell. Type `exit` to return to Mac, then run commands.

**Server IP changed**
→ Override with: `COZMO_OFFICE_IP=x.x.x.x cozmo deploy`
