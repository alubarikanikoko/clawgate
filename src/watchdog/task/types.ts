/**
 * Task Watchdog Types
 * Active polling watchdog for long-running tasks
 */

export interface TaskWatchdogState {
  taskId: string;
  title: string;
  agentId: string;
  createdAt: string;
  intervalMinutes: number;
  maxPings: number;
  pingCount: number;
  lastPingAt: string | null;
  status: "active" | "paused" | "completed" | "expired";
}

export interface TaskWatchdogCreateInput {
  title: string;
  agentId: string;
  intervalMinutes?: number;
  maxPings?: number;
  to?: string;
  fireAndForget?: boolean;
}

export interface PingResult {
  success: boolean;
  taskId: string;
  pingNumber: number;
  sentAt: string;
}

export const DEFAULT_TASK_WATCHDOG = {
  INTERVAL_MINUTES: 5,
  MAX_PINGS: 12, // 5 min * 12 = 60 minutes max
};

export const WATCHDOG_PROMPT_TEMPLATE = `🔴 SYSTEM INTERVENTION: TASK WATCHDOG

Task: {TITLE}
Check: {PING_NUMBER}/{MAX_PINGS}
Instruction: This is a system intervention intended to keep you on track with the task so you can see it through to completion. Stay on track!

⚠️ REQUIRED ACTION - DO NOT IGNORE

You MUST do ONE of the following immediately:

ADJUST FREQUENCY (if too frequent):
Run: clawgate watchdog task adjust --task-id {TASK_ID} --interval <5-15>

STOP THE WATCHDOG (if task is complete):
Run: clawgate watchdog task stop --task-id {TASK_ID}

ACKNOWLEDGE (if still working, OR blocked):
Simply report your progress to Boss via telegram and continue working on the task.

This is a SYSTEM MESSAGE, not a regular conversation. You cannot continue any other work until you take one of the actions above.`;
