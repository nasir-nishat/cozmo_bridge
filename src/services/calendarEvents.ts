import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'src/data/calendar-events.json');

function load(): Record<string, string> {
    try {
        if (!fs.existsSync(FILE)) return {};
        return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function save(data: Record<string, string>) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function getCalendarEventId(leadUid: string): string | null {
    return load()[leadUid] || null;
}

export function setCalendarEventId(leadUid: string, eventId: string): void {
    const data = load();
    data[leadUid] = eventId;
    save(data);
}

export function removeCalendarEventId(leadUid: string): void {
    const data = load();
    delete data[leadUid];
    save(data);
}
