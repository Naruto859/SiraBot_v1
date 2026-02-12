/**
 * Agent-facing scheduler tool.
 *
 * Provides three functions the AI agent can call:
 * - schedule_task(cron, description) → Create a recurring task
 * - list_schedules()                → List all active tasks
 * - delete_schedule(id)             → Remove a task by ID
 *
 * Backed by persistent JSON storage and node-cron runner.
 */

import cron from "node-cron";
import {
    addTask,
    listTasks,
    removeTask,
    resolveStorePath,
} from "./scheduler-store.js";
import { SchedulerRunner } from "./scheduler-runner.js";
import type { SchedulerResult } from "./types.js";

/**
 * The shared SchedulerRunner instance. Must be initialized via `initSchedulerTool()`.
 */
let _runner: SchedulerRunner | null = null;
let _storePath: string | undefined;

/**
 * Initialize the scheduler tool with an optional custom store path.
 * Also starts the background runner.
 */
export async function initSchedulerTool(opts?: {
    storePath?: string;
    runner?: SchedulerRunner;
}): Promise<SchedulerRunner> {
    _storePath = opts?.storePath;

    if (opts?.runner) {
        _runner = opts.runner;
    } else {
        _runner = new SchedulerRunner(_storePath);
    }

    if (!_runner.isRunning()) {
        await _runner.start();
    }

    return _runner;
}

/**
 * Get the current runner instance.
 */
export function getSchedulerRunner(): SchedulerRunner | null {
    return _runner;
}

/**
 * schedule_task — Register a new recurring task.
 *
 * @param cronExpression  Cron expression (e.g., "0 9 * * *" for every day at 9 AM)
 * @param taskDescription Human-readable description of the task
 * @returns SchedulerResult with the created task
 */
export async function schedule_task(
    cronExpression: string,
    taskDescription: string,
    metadata?: Record<string, unknown>,
): Promise<SchedulerResult> {
    // Validate cron expression
    if (!cronExpression?.trim()) {
        return {
            success: false,
            message: "Cron expression is required. Example: \"0 9 * * *\" (every day at 9 AM)",
        };
    }

    if (!cron.validate(cronExpression.trim())) {
        return {
            success: false,
            message: `Invalid cron expression: "${cronExpression}". ` +
                `Use standard cron format: "minute hour day month weekday". ` +
                `Examples: "0 9 * * *" (daily 9 AM), "*/30 * * * *" (every 30 min), "0 0 * * 1" (Mondays midnight).`,
        };
    }

    if (!taskDescription?.trim()) {
        return {
            success: false,
            message: "Task description is required.",
        };
    }

    try {
        const task = await addTask(
            cronExpression.trim(),
            taskDescription.trim(),
            _storePath,
            metadata,
        );

        // Refresh the runner to pick up the new task
        if (_runner) {
            await _runner.refreshFromStore();
        }

        return {
            success: true,
            message: `Task scheduled successfully! ID: ${task.id}. Cron: "${task.cron}" — "${task.description}"`,
            task,
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
            success: false,
            message: `Failed to schedule task: ${errorMsg}`,
        };
    }
}

/**
 * list_schedules — Show all active scheduled tasks.
 *
 * @returns SchedulerResult with array of active tasks
 */
export async function list_schedules(): Promise<SchedulerResult> {
    try {
        const tasks = await listTasks(_storePath);

        if (tasks.length === 0) {
            return {
                success: true,
                message: "No scheduled tasks found.",
                tasks: [],
            };
        }

        const summary = tasks
            .map(
                (t, i) =>
                    `${i + 1}. [${t.enabled ? "✓" : "✗"}] ${t.id}\n` +
                    `   Cron: ${t.cron}\n` +
                    `   Description: ${t.description}\n` +
                    `   Created: ${t.createdAt}` +
                    (t.lastRunAt ? `\n   Last run: ${t.lastRunAt} (${t.lastStatus ?? "unknown"})` : ""),
            )
            .join("\n\n");

        return {
            success: true,
            message: `Found ${tasks.length} scheduled task(s):\n\n${summary}`,
            tasks,
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
            success: false,
            message: `Failed to list tasks: ${errorMsg}`,
        };
    }
}

/**
 * delete_schedule — Remove a scheduled task by ID.
 *
 * @param taskId UUID of the task to delete
 * @returns SchedulerResult confirming deletion
 */
export async function delete_schedule(taskId: string): Promise<SchedulerResult> {
    if (!taskId?.trim()) {
        return {
            success: false,
            message: "Task ID is required. Use list_schedules() to see all tasks and their IDs.",
        };
    }

    try {
        const removed = await removeTask(taskId.trim(), _storePath);

        if (!removed) {
            return {
                success: false,
                message: `Task not found: "${taskId}". Use list_schedules() to see all task IDs.`,
            };
        }

        // Refresh the runner
        if (_runner) {
            await _runner.refreshFromStore();
        }

        return {
            success: true,
            message: `Task "${taskId}" deleted successfully.`,
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
            success: false,
            message: `Failed to delete task: ${errorMsg}`,
        };
    }
}

/**
 * Get a human-readable description of cron expression for the system prompt.
 */
export function describeCronSyntax(): string {
    return [
        "Cron expression format: minute hour day month weekday",
        "",
        "Common examples:",
        '  "0 9 * * *"      → Every day at 9:00 AM',
        '  "0 9 * * 1-5"    → Weekdays at 9:00 AM',
        '  "*/30 * * * *"   → Every 30 minutes',
        '  "0 */2 * * *"    → Every 2 hours',
        '  "0 0 * * 0"      → Every Sunday at midnight',
        '  "0 8 1 * *"      → 1st of every month at 8:00 AM',
        '  "0 0 1 1 *"      → Every January 1st at midnight',
    ].join("\n");
}
