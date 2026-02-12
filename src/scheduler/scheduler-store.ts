/**
 * Persistent store for scheduled tasks.
 *
 * Reads/writes data/scheduled_tasks.json with atomic writes
 * (temp file → rename) to prevent corruption.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ScheduledTask, SchedulerStoreFile } from "./types.js";

/** Default store directory relative to cwd. */
const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
const DEFAULT_STORE_PATH = path.join(DEFAULT_DATA_DIR, "scheduled_tasks.json");

/**
 * Resolve the store file path, falling back to default.
 */
export function resolveStorePath(customPath?: string): string {
    if (customPath?.trim()) {
        return path.resolve(customPath.trim());
    }
    return DEFAULT_STORE_PATH;
}

/**
 * Load scheduled tasks from the JSON store file.
 * Returns an empty store if the file doesn't exist yet.
 */
export async function loadTasks(storePath?: string): Promise<SchedulerStoreFile> {
    const filePath = resolveStorePath(storePath);

    try {
        const raw = await fs.promises.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) {
            return {
                version: 1,
                tasks: parsed.tasks.filter(Boolean) as ScheduledTask[],
            };
        }
        return { version: 1, tasks: [] };
    } catch (err: unknown) {
        if ((err as { code?: string })?.code === "ENOENT") {
            return { version: 1, tasks: [] };
        }
        throw err;
    }
}

/**
 * Save scheduled tasks to the JSON store file (atomic write).
 */
export async function saveTasks(
    store: SchedulerStoreFile,
    storePath?: string,
): Promise<void> {
    const filePath = resolveStorePath(storePath);

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    // Atomic write: write to temp file, then rename
    const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    const json = JSON.stringify(store, null, 2);

    await fs.promises.writeFile(tmp, json, "utf-8");
    await fs.promises.rename(tmp, filePath);

    // Best-effort backup
    try {
        await fs.promises.copyFile(filePath, `${filePath}.bak`);
    } catch {
        // ignore
    }
}

/**
 * Generate a new UUID for a task.
 */
function generateId(): string {
    return crypto.randomUUID();
}

/**
 * Add a new task to the store.
 */
export async function addTask(
    cron: string,
    description: string,
    storePath?: string,
    metadata?: Record<string, unknown>,
): Promise<ScheduledTask> {
    const store = await loadTasks(storePath);

    const task: ScheduledTask = {
        id: generateId(),
        cron,
        description,
        enabled: true,
        createdAt: new Date().toISOString(),
        metadata,
    };

    store.tasks.push(task);
    await saveTasks(store, storePath);

    return task;
}

/**
 * Remove a task by ID.
 */
export async function removeTask(
    taskId: string,
    storePath?: string,
): Promise<boolean> {
    const store = await loadTasks(storePath);
    const before = store.tasks.length;
    store.tasks = store.tasks.filter((t) => t.id !== taskId);

    if (store.tasks.length === before) {
        return false; // Not found
    }

    await saveTasks(store, storePath);
    return true;
}

/**
 * Update a task's fields (partial update).
 */
export async function updateTask(
    taskId: string,
    patch: Partial<Omit<ScheduledTask, "id" | "createdAt">>,
    storePath?: string,
): Promise<ScheduledTask | null> {
    const store = await loadTasks(storePath);
    const task = store.tasks.find((t) => t.id === taskId);

    if (!task) {
        return null;
    }

    Object.assign(task, patch);
    await saveTasks(store, storePath);

    return task;
}

/**
 * Get all tasks (optionally filtered by enabled state).
 */
export async function listTasks(
    storePath?: string,
    opts?: { enabledOnly?: boolean },
): Promise<ScheduledTask[]> {
    const store = await loadTasks(storePath);

    if (opts?.enabledOnly) {
        return store.tasks.filter((t) => t.enabled);
    }

    return store.tasks;
}

/**
 * Get a single task by ID.
 */
export async function getTask(
    taskId: string,
    storePath?: string,
): Promise<ScheduledTask | null> {
    const store = await loadTasks(storePath);
    return store.tasks.find((t) => t.id === taskId) ?? null;
}
