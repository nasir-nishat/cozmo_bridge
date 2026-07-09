import http from 'http';
import https from 'https';
import { execFile } from 'child_process';
import { writeFileSync, createWriteStream, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 3005;

function runAppleScript(script, callback) {
    const scriptPath = join(tmpdir(), 'cozmo_kakao.applescript');
    writeFileSync(scriptPath, script, 'utf8');
    execFile('osascript', [scriptPath], (err, stdout, stderr) => {
        try { unlinkSync(scriptPath); } catch (_) {}
        callback(err, stdout, stderr);
    });
}

function navigateToChat(chatName) {
    return [
        `set the clipboard to "${chatName.replace(/"/g, '\\"')}"`,
        `tell application "KakaoTalk" to activate`,
        `delay 0.5`,
        `tell application "System Events"`,
        `    tell process "KakaoTalk"`,
        `        keystroke "f" using command down`,
        `        delay 0.5`,
        `        keystroke "v" using command down`,
        `        delay 0.6`,
        `        key code 125`,
        `        delay 0.4`,
        `        key code 36`,
        `        delay 1.5`,
    ].join('\n');
}

function sendText(chatName, message, callback) {
    const msgPath = join(tmpdir(), 'kakao_msg.txt');
    writeFileSync(msgPath, message, 'utf8');

    const script = [
        navigateToChat(chatName),
        `        set the clipboard to (do shell script "cat '${msgPath}'")`,
        `        keystroke "v" using command down`,
        `        delay 0.5`,
        `        key code 36`,
        `    end tell`,
        `end tell`,
    ].join('\n');

    runAppleScript(script, (err, stdout, stderr) => {
        try { unlinkSync(msgPath); } catch (_) {}
        if (err) { console.error('❌ text send error:', stderr || err.message); callback(err); return; }
        console.log('✅ text sent to:', chatName);
        callback(null);
    });
}

function downloadImage(imageUrl, destPath, callback) {
    const proto = imageUrl.startsWith('https') ? https : http;
    const file = createWriteStream(destPath);
    proto.get(imageUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
            file.close();
            return downloadImage(res.headers.location, destPath, callback);
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); callback(null); });
    }).on('error', (err) => {
        file.close();
        callback(err);
    });
}

function sendImage(chatName, imageUrl, callback) {
    const imgPath = join(tmpdir(), 'cozmo_card.jpg');

    downloadImage(imageUrl, imgPath, (err) => {
        if (err) { console.error('❌ image download error:', err.message); callback(err); return; }

        const script = [
            navigateToChat(chatName),
            `        set the clipboard to (read (POSIX file "${imgPath}") as JPEG picture)`,
            `        delay 0.3`,
            `        keystroke "v" using command down`,
            `        delay 0.5`,
            `        key code 36`,
            `    end tell`,
            `end tell`,
        ].join('\n');

        runAppleScript(script, (err2, stdout, stderr) => {
            if (err2) { console.error('❌ image send error:', stderr || err2.message); callback(err2); return; }
            console.log('✅ image sent to:', chatName);
            callback(null);
        });
    });
}

http.createServer((req, res) => {
    if (req.method !== 'POST' || (req.url !== '/send' && req.url !== '/send-image')) {
        res.writeHead(404); res.end(); return;
    }

    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
        try {
            const payload = JSON.parse(body);
            const { chat_name } = payload;
            if (!chat_name) { res.writeHead(400); res.end('missing chat_name'); return; }

            if (req.url === '/send') {
                const { message } = payload;
                if (!message) { res.writeHead(400); res.end('missing message'); return; }
                sendText(chat_name, message, (err) => {
                    if (err) { res.writeHead(500); res.end(err.message); return; }
                    res.writeHead(200); res.end('ok');
                });
            } else {
                const { image_url } = payload;
                if (!image_url) { res.writeHead(400); res.end('missing image_url'); return; }
                sendImage(chat_name, image_url, (err) => {
                    if (err) { res.writeHead(500); res.end(err.message); return; }
                    res.writeHead(200); res.end('ok');
                });
            }
        } catch (e) {
            res.writeHead(400); res.end('bad json');
        }
    });
}).listen(PORT, () => console.log(`🟢 Kakao relay listening on :${PORT}`));
