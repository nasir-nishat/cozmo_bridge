"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushAlert = pushAlert;
exports.getRecentAlerts = getRecentAlerts;
exports.subscribeSSE = subscribeSSE;
const MAX_ALERTS = 100;
const alerts = [];
const subscribers = new Set();
function pushAlert(text, platform) {
    const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        text,
        plainText: text.replace(/<[^>]+>/g, ''),
        platform,
        ts: Date.now(),
    };
    alerts.push(entry);
    if (alerts.length > MAX_ALERTS)
        alerts.shift();
    for (const res of subscribers) {
        try {
            res.write(`data: ${JSON.stringify(entry)}\n\n`);
        }
        catch {
            subscribers.delete(res);
        }
    }
}
function getRecentAlerts(limit = 50) {
    return alerts.slice(-limit).reverse();
}
function subscribeSSE(res) {
    subscribers.add(res);
    res.on('close', () => subscribers.delete(res));
}
