const bot = BotManager.getCurrentBot();
const COZMO_URL = "https://webhook.coze.care/kakao/webhook";
const DEQUEUE_URL = "https://webhook.coze.care/kakao/dequeue?peek=1";
const DEQUEUE_ACK_URL = "https://webhook.coze.care/kakao/dequeue/ack";
const HEARTBEAT_URL = "https://webhook.coze.care/kakao/heartbeat";

const channelCache = {};
const messageQueue = [];
const dequeueNoCacheRetries = {};
const MAX_NO_CACHE_RETRIES = 3;

function httpRequest(method, url, body) {
    var conn = null;
    try {
        var u = new java.net.URL(url);
        conn = u.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(10000);
        conn.setUseCaches(false);
        if (body) {
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setDoOutput(true);
            var os = conn.getOutputStream();
            os.write(new java.lang.String(body).getBytes("UTF-8"));
            os.flush();
            os.close();
        }
        var br = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
        var result = "", line;
        while ((line = br.readLine()) != null) result += String(line);
        br.close();
        return result;
    } catch (e) {
        try { console.error("http error [" + method + " " + url + "]: " + e.message); } catch (ignore) {}
        return null;
    } finally {
        try { if (conn) conn.disconnect(); } catch (ignore) {}
    }
}

function deliverText(target, text) {
    var s = String(text);
    if (s.indexOf("__IMAGE__") === 0) {
        var imageUrl = s.substring(9);
        try {
            var conn = new java.net.URL(imageUrl).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(15000);
            var bitmap = android.graphics.BitmapFactory.decodeStream(conn.getInputStream());
            if (bitmap) {
                Utils.sendBitmap(target.room, bitmap);
            } else {
                target.reply(imageUrl);
            }
            try { conn.disconnect(); } catch (ignore) {}
        } catch (imgErr) {
            try { console.error("image send error: " + imgErr.message); } catch (ignore) {}
            try { target.reply(imageUrl); } catch (ignore) {}
        }
    } else {
        try { target.reply(s); } catch (replyErr) {
            try { console.error("reply error: " + replyErr.message); } catch (ignore) {}
        }
    }
}

function sendReplies(msg, response) {
    if (!response) return;
    if (String(response).trim().charAt(0) !== "{") return;
    try {
        var parsed = JSON.parse(response);
        if (parsed && parsed.reply) deliverText(msg, parsed.reply);
        if (parsed && parsed.replies) {
            for (var i = 0; i < parsed.replies.length; i++) {
                deliverText(msg, parsed.replies[i]);
            }
        }
    } catch (e) {
        try { console.error("parse error: " + e.message); } catch (ignore) {}
    }
}

const recentMessages = {};

function createWorkerThread() {
    var t = new java.lang.Thread({
        run: function () {
            var lastDequeue = 0;
            var lastHeartbeat = 0;
            console.log("🔄 KAKAO worker thread started");

            while (true) {
                try {
                    // Process all queued incoming messages
                    while (messageQueue.length > 0) {
                        var item = null;
                        try { item = messageQueue.shift(); } catch (ignore) {}
                        if (!item) break;
                        var msg = item.msg;
                        var cid = item.cid;
                        try {
                            var payload = JSON.stringify({
                                chat_id: cid,
                                chat_name: msg.room,
                                sender: msg.author.name,
                                sender_id: msg.author.hash || "",
                                is_from_me: false,
                                message_type: 1,
                                text: msg.content,
                                timestamp: new Date().toISOString(),
                                type: "message"
                            });
                            sendReplies(msg, httpRequest("POST", COZMO_URL, payload));
                        } catch (msgErr) {
                            try { console.error("msg process error: " + msgErr.message); } catch (ignore) {}
                        }
                    }

                    var now = Date.now();

                    // Peek-then-ack dequeue every 1.5s
                    if (now - lastDequeue >= 1500) {
                        lastDequeue = now;
                        try {
                            var res = httpRequest("GET", DEQUEUE_URL, null);
                            if (res) {
                                var items = JSON.parse(res);
                                if (items && items.length > 0) {
                                    var chatId = String(items[0].chat_id);
                                    var cached = channelCache[chatId];
                                    if (cached) {
                                        deliverText(cached, items[0].text);
                                        delete dequeueNoCacheRetries[chatId];
                                        httpRequest("POST", DEQUEUE_ACK_URL, "{}");
                                    } else {
                                        var retries = (dequeueNoCacheRetries[chatId] || 0) + 1;
                                        dequeueNoCacheRetries[chatId] = retries;
                                        if (retries >= MAX_NO_CACHE_RETRIES) {
                                            console.warn("dequeue: no cache for chat_id=" + chatId + " after " + retries + " polls — acking undeliverable item");
                                            httpRequest("POST", DEQUEUE_ACK_URL, "{}");
                                            delete dequeueNoCacheRetries[chatId];
                                        } else {
                                            console.warn("dequeue: no cache for chat_id=" + chatId + " — retrying next poll (" + retries + "/" + MAX_NO_CACHE_RETRIES + ")");
                                        }
                                    }
                                }
                            }
                        } catch (deqErr) {
                            try { console.error("dequeue error: " + deqErr.message); } catch (ignore) {}
                        }
                    }

                    // Heartbeat every 2 min (shorter interval so watchdog doesn't false-fire)
                    if (now - lastHeartbeat >= 120000) {
                        lastHeartbeat = now;
                        try { httpRequest("POST", HEARTBEAT_URL, "{}"); } catch (ignore) {}
                    }

                    java.lang.Thread.sleep(500);
                } catch (e) {
                    try { console.error("worker loop error: " + e.message); } catch (ignore) {}
                    try { java.lang.Thread.sleep(1000); } catch (ignore) {}
                }
            }
        }
    });
    t.setDaemon(true);
    t.setName("cozmo-kakao-worker");
    return t;
}

var workerThread = createWorkerThread();
workerThread.start();

function onMessage(msg) {
    if (msg.isDebugRoom) return;
    var cid = msg.channelId ? msg.channelId.toString() : msg.room;
    var text = (msg.content || '').trim();
    var key = cid + ':' + text.slice(0, 60);
    var now = Date.now();
    if (recentMessages[key] && now < recentMessages[key]) return;
    recentMessages[key] = now + 3600000;
    channelCache[cid] = msg;
    messageQueue.push({ msg: msg, cid: cid });

    // Self-heal: restart worker thread if it died
    if (!workerThread.isAlive()) {
        console.warn("⚠️ KAKAO worker thread was dead — restarting");
        workerThread = createWorkerThread();
        workerThread.start();
    }
}

bot.addListener(Event.MESSAGE, onMessage);
