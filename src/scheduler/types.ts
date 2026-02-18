/**
 * ClawGate Scheduler - Type Definitions
 */

export interface Job {
  id: string;
  name: string;
  description?: string;
  schedule: JobSchedule;
  target: JobTarget;
  payload: JobPayload;
  execution: ExecutionConfig;
  state: JobState;
  createdAt: string;
  updatedAt: string;
}

export interface JobSchedule {
  cronExpression: string;
  timezone: string;
  nextRun: string | null;
}

export interface JobTarget {
  type: "agent" | "message";
  agentId?: string;
  sessionKey?: string;
  channel?: string;
  account?: string;
  replyAccount?: string;  // Which Telegram account to use for replies (e.g., "musicbot")
  to?: string;
}

export interface JobPayload {
  type: "text" | "template" | "file";
  content?: string;
  template?: string;
  variables?: Record<string, string>;
  filePath?: string;
}

export interface ExecutionConfig {
  enabled: boolean;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  expectFinal: boolean;
  autoDelete: boolean;  // Delete job after successful execution
}

export interface JobState {
  lastRun: string | null;
  lastResult: "success" | "failure" | null;
  lastError?: string;
  runCount: number;
  failCount: number;
}

export interface ExecutionLog {
  id: string;
  jobId: string;
  scheduledAt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "success" | "failure" | "timeout" | "cancelled";
  error?: string;
  output?: string;
  command?: string;
}

export interface ClawGateConfig {
  openclaw: {
    gatewayUrl: string;
    token?: string;
    password?: string;
  };
  defaults: {
    timezone: string;
    timeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
    expectFinal: boolean;
  };
  execution: {
    dryRun: boolean;
    logDirectory: string;
    logRetentionDays: number;
  };
  paths: {
    stateDir: string;
    jobsDir: string;
    logsDir: string;
    locksDir: string;
    templatesDir: string;
  };
}

export interface CreateJobInput {
  name: string;
  description?: string;
  schedule: string;
  timezone?: string;
  target: Omit<JobTarget, "type"> & { type: JobTarget["type"] };
  payload: Omit<JobPayload, "type"> & { type: JobPayload["type"] };
  enabled?: boolean;
  autoDelete?: boolean;
}

export type ExitCode =
  | 0   // Success
  | 1   // General error
  | 2   // Job not found
  | 3   // Job disabled
  | 4   // Already running
  | 5   // Validation error
  | 6   // Configuration error
  | 7   // OpenClaw connection failed
  | 8   // Execution failed
  | 9   // Timeout
  | 10; // Lock conflict
