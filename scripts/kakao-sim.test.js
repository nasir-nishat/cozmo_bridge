// Algorithm-fidelity simulation of the Kakao outbound queue + dedup logic in src/routes/kakao.ts.
// Mirrors the real functions so we can assert the no-duplicate / reliability properties without
// booting the full bridge. Run: node scripts/kakao-sim.test.js
let fail = 0;
const assert = (cond, msg) => { if (!cond) { console.error('❌ ' + msg); fail++; } else console.log('✅ ' + msg); };

// ── mirror of sentMessages ──────────────────────────────────────────────
const sent = {};
const markSent = (g, t) => { const k = g + ':' + t; if (sent[k]) return; sent[k] = true; };
const isSent = (g, t) => !!sent[g + ':' + t];

// ── mirror of kakao.ts outbound queue ───────────────────────────────────
let queue = [];
const saveQueue = () => { /* persisted as JSON.stringify(queue) */ };
function enqueueKakaoMessage(chatId, text, opts) {
    if (!(opts && opts.sentType) && queue.some(i => i.chat_id === chatId && i.text === text && !i.sentType)) return;
    queue.push({ chat_id: chatId, text, groupKey: opts && opts.groupKey, sentType: opts && opts.sentType });
    saveQueue();
}
const isKakaoQueued = (g, t) => queue.some(i => i.groupKey === g && i.sentType === t);
function dropKakaoQueued(g, t) {
    let removed = 0;
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].groupKey === g && queue[i].sentType === t) { queue.splice(i, 1); removed++; }
    return removed;
}
// MessengerBot R GET /dequeue — one item per poll, markSent only on actual dequeue
function dequeueOnce() {
    const item = queue.shift();
    if (item) { saveQueue(); if (item.groupKey && item.sentType) markSent(item.groupKey, item.sentType); }
    return item ? [{ chat_id: item.chat_id, text: item.text }] : [];
}
// Simulate MB-R draining the whole queue (it has the channel cached) → returns delivered texts
function drainAll() {
    const delivered = [];
    let batch;
    while ((batch = dequeueOnce()).length) delivered.push(batch[0].text);
    return delivered;
}

// ── mirror of command dedup ─────────────────────────────────────────────
const recentlyProcessed = new Set();
const cmdKey = (sourceId, text) => `cmd:${sourceId}:${text.slice(0, 60)}`;
// returns true if it actually processed (was not a duplicate)
function processCommand(sourceId, text) {
    const k = cmdKey(sourceId, text);
    if (recentlyProcessed.has(k)) return false;
    recentlyProcessed.add(k);
    return true;
}

// ════════════════════════════ TESTS ════════════════════════════════════
console.log('\n--- 1. Multi-reply command: distinct messages, each delivered once ---');
queue = [];
['tip1', 'tip2', 'tip3', 'rules'].forEach(m => enqueueKakaoMessage('G1', m)); // /ckin via queue
const d1 = drainAll();
assert(JSON.stringify(d1) === JSON.stringify(['tip1', 'tip2', 'tip3', 'rules']), 'all 4 tips delivered in order, no dupes (' + d1.join(',') + ')');

console.log('\n--- 2. dequeue is one-per-poll (never batches) ---');
queue = [];
['a', 'b', 'c'].forEach(m => enqueueKakaoMessage('G1', m));
const poll = dequeueOnce();
assert(poll.length === 1 && poll[0].text === 'a', 'first poll returns exactly 1 item');
assert(queue.length === 2, 'remaining items stay queued');

console.log('\n--- 3. Retry while bot is DOWN (queue not draining): idempotent, no accumulation ---');
queue = [];
const ckin = ['tip1', 'tip2', 'tip3', 'rules'];
ckin.forEach(m => enqueueKakaoMessage('G1', m)); // staff types /ckin
ckin.forEach(m => enqueueKakaoMessage('G1', m)); // staff retypes /ckin (bot still down)
ckin.forEach(m => enqueueKakaoMessage('G1', m)); // and again
assert(queue.length === 4, 'queue still holds 4 (retries deduped), not 12 — got ' + queue.length);
const d3 = drainAll();
assert(JSON.stringify(d3) === JSON.stringify(ckin), 'guest receives each tip exactly once on recovery');

console.log('\n--- 4. Same command from BOTH transports (MB-R + kakaocli): processed once ---');
recentlyProcessed.clear();
const first = processCommand('G1', '/ckin');   // MB-R arrives first
const second = processCommand('G1', '/ckin');  // kakaocli arrives 2s later
assert(first === true, 'first delivery processes the command');
assert(second === false, 'second (other transport) is deduped — not processed again');

console.log('\n--- 5. Scheduled message: marked sent only on dequeue, exactly once ---');
queue = []; for (const k in sent) delete sent[k];
// checkout burst: reminder + payment, sentType on LAST part
enqueueKakaoMessage('kakao:G2', 'checkout_reminder', { groupKey: 'kakao:G2' });
enqueueKakaoMessage('kakao:G2', 'payment_reminder', { groupKey: 'kakao:G2', sentType: 'checkout_reminder' });
assert(isSent('kakao:G2', 'checkout_reminder') === false, 'NOT marked sent at enqueue time (no false success)');
assert(isKakaoQueued('kakao:G2', 'checkout_reminder') === true, 'isKakaoQueued true while pending → re-run is blocked');
drainAll();
assert(isSent('kakao:G2', 'checkout_reminder') === true, 'marked sent after MB-R actually dequeued it');

console.log('\n--- 6. Cron re-run while pending does NOT double-enqueue ---');
queue = []; for (const k in sent) delete sent[k];
function cronCheckout(g) { // mirrors checkoutReminder.ts guard
    if (isSent(g, 'checkout_reminder') || isKakaoQueued(g, 'checkout_reminder')) return false;
    enqueueKakaoMessage(g.replace('kakao:', ''), 'checkout_reminder', { groupKey: g, sentType: 'checkout_reminder' });
    return true;
}
const r1 = cronCheckout('kakao:G3');
const r2 = cronCheckout('kakao:G3'); // startup catch-up runs again before drain
assert(r1 === true && r2 === false, 'second run skipped (already queued) — no duplicate enqueue');
assert(queue.filter(i => i.groupKey === 'kakao:G3').length === 1, 'exactly one G3 item queued');

console.log('\n--- 7. Missed-alert drops pending item so it will NOT auto-deliver later ---');
const dropped = dropKakaoQueued('kakao:G3', 'checkout_reminder');
assert(dropped === 1, 'pending item dropped when declared missed');
assert(drainAll().length === 0, 'nothing auto-delivers after a manual send was requested');

console.log('\n--- 8. Persistence round-trip survives a restart ---');
queue = [];
enqueueKakaoMessage('G4', 'welcome', { groupKey: 'kakao:G4' });
const onDisk = JSON.stringify(queue);
queue = JSON.parse(onDisk); // simulate loadQueue() after pm2 restart
assert(queue.length === 1 && queue[0].text === 'welcome', 'queued message survived restart');

console.log('\n════════════════════════════');
console.log(fail === 0 ? '🎉 ALL CHECKS PASSED' : `💥 ${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
