import type { Response } from 'express';

export interface AlertEntry {
    id: string;
    text: string;
    plainText: string;
    platform?: string;
    ts: number;
}

const MAX_ALERTS = 100;
const alerts: AlertEntry[] = [];
const subscribers = new Set<Response>();

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
