/**
 * PM2-free process launcher.
 * Reads ecosystem.config.js, starts the named app with its env vars,
 * saves PID to .pids/<name>.pid so restart scripts can kill it later.
 *
 * Usage: node scripts/launch.js <app-name>
 */
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

const appName = process.argv[2];
if (!appName) { console.error('Usage: node launch.js <app-name>'); process.exit(1); }

const eco = require(path.join(__dirname, '..', 'ecosystem.config.js'));
const app = eco.apps.find(a => a.name === appName);
if (!app) { console.error('App not found in ecosystem.config.js:', appName); process.exit(1); }

const env  = Object.assign({}, process.env, app.env || {});
const args = (app.args || '').split(' ').filter(Boolean);
const cwd  = app.cwd || process.cwd();

const proc = spawn(app.script, args, { cwd, env, detached: true, stdio: 'inherit', windowsHide: true });
proc.unref();

const pidsDir = path.join(__dirname, '..', '.pids');
if (!fs.existsSync(pidsDir)) fs.mkdirSync(pidsDir);
fs.writeFileSync(path.join(pidsDir, `${appName}.pid`), String(proc.pid));

console.log('Started ' + appName + ' PID=' + proc.pid + ' cwd=' + cwd);
