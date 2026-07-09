import fs from 'fs';
import path from 'path';

export type TaskStatus = 'new' | 'doing' | 'done';
export type TaskType = 'guest_request' | 'pest_control' | 'plant_watering' | 'cleaning' | 'iot';
export type TaskSource = 'whatsapp' | 'line' | 'kakao' | 'wechat' | 'jandi' | 'schedule' | 'booking' | 'ai';

export interface Task {
    id: string;
    property: string;
    title: string;
    type: TaskType;
    status: TaskStatus;
    assignee: string | null;
    source: TaskSource;
    leadUid?: string;
    guestName?: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
}

const FILE = path.join(process.cwd(), 'src/data/tasks.json');

function read(): Task[] {
    try {
        if (!fs.existsSync(FILE)) return [];
        return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch { return []; }
}

function write(tasks: Task[]): void {
    fs.writeFileSync(FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

export function getAllTasks(): Task[] {
    return read();
}

export function createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const tasks = read();
    const now = new Date().toISOString();
    const task: Task = {
        ...data,
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        updatedAt: now,
    };
    tasks.unshift(task);
    write(tasks);
    return task;
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | null {
    const tasks = read();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...patch, updatedAt: new Date().toISOString() };
    write(tasks);
    return tasks[idx];
}
