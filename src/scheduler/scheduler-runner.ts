/**
 * Background cron runner for scheduled tasks.
 *
 * Uses `node-cron` to register cron jobs based on tasks from the
 * persistent store. When a cron fires, it emits an event that the
 * gateway can catch and forward to the agent session.
 */

import { EventEmitter } from "node:events";
import cron from "node-cron";
import { loadTasks, updateTask, resolveStorePath } from "./scheduler-store.js";
import type { ScheduledTask } from "./types.js";

export type SchedulerEvent = {
    type: "task-triggered";
    task: ScheduledTask;
    triggeredAt: string;
};

export class SchedulerRunner extends EventEmitter {
    private jobs = new Map<string, cron.ScheduledTask>();
    private storePath: string;
    private started = false;

    constructor(storePath?: string) {
        super();
        this.storePath = resolveStorePath(storePath);
    }

    /**
     * Start the scheduler: load all tasks and register cron jobs.
     */
    async start(): Promise<void> {
        if (this.started) {
            return;
        }

        this.started = true;
        await this.refreshFromStore();

        // eslint-disable-next-line no-console
        console.log(`[scheduler] Started with ${this.jobs.size} active tasks`);
    }

    /**
     * Stop all cron jobs.
     */
    stop(): void {
        for (const [id, job] of this.jobs) {
            job.stop();
        }
        this.jobs.clear();
        this.started = false;

        // eslint-disable-next-line no-console
        console.log("[scheduler] Stopped");
    }

    /**
     * Reload all tasks from the store and re-register cron jobs.
     * Call this after adding/removing tasks.
     */
    async refreshFromStore(): Promise<void> {
        // Stop existing jobs
        for (const [, job] of this.jobs) {
            job.stop();
        }
        this.jobs.clear();

        // Load tasks
        const tasks = await loadTasks(this.storePath);

        for (const task of tasks.tasks) {
            if (!task.enabled) {
                continue;
            }

            if (!cron.validate(task.cron)) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[scheduler] Invalid cron expression for task ${task.id}: "${task.cron}" — skipping`,
                );
                continue;
            }

            const job = cron.schedule(task.cron, async () => {
                await this.executeTask(task);
            });

            this.jobs.set(task.id, job);
        }
    }

    /**
     * Execute a task (called when its cron fires).
     */
    private async executeTask(task: ScheduledTask): Promise<void> {
        const now = new Date().toISOString();

        // eslint-disable-next-line no-console
        console.log(`[scheduler] Task triggered: ${task.id} — "${task.description}"`);

        try {
            // Emit event for the gateway/agent to handle
            const event: SchedulerEvent = {
                type: "task-triggered",
                task,
                triggeredAt: now,
            };
            this.emit("task-triggered", event);

            // Update last run time
            await updateTask(
                task.id,
                {
                    lastRunAt: now,
                    lastStatus: "ok",
                    lastError: undefined,
                },
                this.storePath,
            );
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);

            // eslint-disable-next-line no-console
            console.error(`[scheduler] Task ${task.id} error:`, errorMsg);

            await updateTask(
                task.id,
                {
                    lastRunAt: now,
                    lastStatus: "error",
                    lastError: errorMsg,
                },
                this.storePath,
            ).catch(() => {
                // Best-effort
            });
        }
    }

    /**
     * Get the number of active cron jobs.
     */
    activeJobCount(): number {
        return this.jobs.size;
    }

    /**
     * Check if the scheduler is running.
     */
    isRunning(): boolean {
        return this.started;
    }
}
