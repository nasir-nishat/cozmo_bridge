import http from 'http';
import { execFile } from 'child_process';
import { writeFileSync } from 'fs';

const PORT = 3005;

function sendKakao(chatName, message, callback) {
    writeFileSync('/tmp/kakao_chat.txt', chatName, 'utf8');
    writeFileSync('/tmp/kakao_msg.txt', message, 'utf8');

    const script = [
        'set chatName to (do shell script "cat /tmp/kakao_chat.txt")',
        'set msg to (do shell script "cat /tmp/kakao_msg.txt")',
        'tell application "KakaoTalk" to activate',
        'delay 0.5',
        'tell application "System Events"',
        '    tell process "KakaoTalk"',
        '        keystroke "f" using command down',
        '        delay 0.5',
        '        set the clipboard to chatName',
        '        keystroke "v" using command down',
        '        delay 0.6',
        '        key code 125',
        '        delay 0.4',
        '        key code 36',
        '        delay 1.5',
        '        set the clipboard to msg',
        '        keystroke "v" using command down',
        '        delay 0.5',
        '        key code 36',
        '    end tell',
        'end tell'
    ].join('\n');

    writeFileSync('/tmp/send_script.applescript', script, 'utf8');
    execFile('osascript', ['/tmp/send_script.applescript'], callback);
}

http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/send') {
        res.writeHead(404); res.end(); return;
    }
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
        try {
            const { chat_name, message } = JSON.parse(body);
            if (!chat_name || !message) {
                res.writeHead(400); res.end('missing fields'); return;
            }
            sendKakao(chat_name, message, (err, stdout, stderr) => {
                if (err) {
                    console.error('❌ send error:', stderr || err.message);
                    res.writeHead(500); res.end(stderr || err.message); return;
                }
                console.log('✅ sent to:', chat_name);
                res.writeHead(200); res.end('ok');
            });
        } catch (e) {
            res.writeHead(400); res.end('bad json');
        }
    });
}).listen(PORT, () => console.log(`🟢 Kakao relay listening on :${PORT}`));
