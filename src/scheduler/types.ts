/**
 * Types for the Dynamic Scheduler system.
 */

/** A scheduled task persisted in data/scheduled_tasks.json. */
export type ScheduledTask = {
    /** Unique identifier (UUID). */
    id: string;
    /** Cron expression (e.g., "0 9 * * *" = every day at 9 AM). */
    cron: string;
    /** Human-readable description of what the task does. */
    description: string;
    /** Whether the task is active. */
    enabled: boolean;
    /** ISO timestamp of when the task was created. */
    createdAt: string;
    /** ISO timestamp of the last execution, if any. */
    lastRunAt?: string;
    /** ISO timestamp of the next scheduled run. */
    nextRunAt?: string;
    /** Last execution status. */
    lastStatus?: "ok" | "error" | "skipped";
    /** Error message from last run, if any. */
    lastError?: string;
    /** Extra user-defined metadata. */
    metadata?: Record<string, unknown>;
};

/** Shape of the scheduled_tasks.json file. */
export type SchedulerStoreFile = {
    version: 1;
    tasks: ScheduledTask[];
};

/** Input for creating a new scheduled task. */
export type ScheduleTaskInput = {
    cron: string;
    description: string;
    metadata?: Record<string, unknown>;
};

/** Result of a scheduler operation. */
export type SchedulerResult = {
    success: boolean;
    message: string;
    task?: ScheduledTask;
    tasks?: ScheduledTask[];
};
