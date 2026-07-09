"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTasks = getAllTasks;
exports.createTask = createTask;
exports.updateTask = updateTask;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FILE = path_1.default.join(process.cwd(), 'src/data/tasks.json');
function read() {
    try {
        if (!fs_1.default.existsSync(FILE))
            return [];
        return JSON.parse(fs_1.default.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function write(tasks) {
    fs_1.default.writeFileSync(FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}
function getAllTasks() {
    return read();
}
function createTask(data) {
    const tasks = read();
    const now = new Date().toISOString();
    const task = {
        ...data,
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        updatedAt: now,
    };
    tasks.unshift(task);
    write(tasks);
    return task;
}
function updateTask(id, patch) {
    const tasks = read();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1)
        return null;
    tasks[idx] = { ...tasks[idx], ...patch, updatedAt: new Date().toISOString() };
    write(tasks);
    return tasks[idx];
}
