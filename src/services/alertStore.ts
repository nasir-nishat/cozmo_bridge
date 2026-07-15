import fs from 'fs';
import path from 'path';
import type { Response } from 'express';

export interface AlertEntry {
    id: string;
    text: string;
    plainText: string;
    platform?: string;
    ts: number;
}

// Durable activity record: every alert COZMO raises (same stream that goes to Telegram) is kept
// here, persisted to disk so the admin-ui "Alerts" feed survives restarts and holds real history.
const MAX_ALERTS = 500;
const FILE = path.join(process.cwd(), 'src/data/alerts-log.json');

function loadFromDisk(): AlertEntry[] {
    try {
        const arr = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        return Array.isArray(arr) ? arr.slice(-MAX_ALERTS) : [];
    } catch {
        return [];
    }
}

const alerts: AlertEntry[] = loadFromDisk();
const subscribers = new Set<Response>();

// Debounced write — alerts are bursty, so coalesce disk writes to at most once/sec
let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try { fs.writeFileSync(FILE, JSON.stringify(alerts)); }
        catch (e: any) { console.error('❌ alertStore save:', e?.message); }
    }, 1000);
}

export function pushAlert(text: string, platform?: string): void {
    const entry: AlertEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        text,
        plainText: text.replace(/<[^>]+>/g, ''),
        platform,
        ts: Date.now(),
    };
    alerts.push(entry);
    if (alerts.length > MAX_ALERTS) alerts.shift();
    scheduleSave();

    for (const res of subscribers) {
        try {
            res.write(`data: ${JSON.stringify(entry)}\n\n`);
        } catch {
            subscribers.delete(res);
        }
    }
}

export function getRecentAlerts(limit = 50): AlertEntry[] {
    return alerts.slice(-limit).reverse();
}

export function subscribeSSE(res: Response): void {
    subscribers.add(res);
    res.on('close', () => subscribers.delete(res));
}
