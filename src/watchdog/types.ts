/**
 * ClawGate Watchdog - Type Definitions
 */

export interface WatchdogState {
  lastCheckAt: string;
  lastCheckResult: CheckResult;
  daemonPid?: number;
  config: WatchdogConfig;
}

export interface WatchdogConfig {
  checkIntervalSec: number;
  stuckThresholdSec: number;
  autoKill: boolean;
  notifyOnKill: boolean;
  checkpointDir?: string;
  projectName?: string;
  phaseTimeoutMin?: number;
}

export interface CheckResult {
  timestamp: string;
  totalLocks: number;
  activeSessions: number;
  orphaned: OrphanedLock[];
  stuck: StuckSession[];
  cleaned: CleanedSession[];
  checkpoints?: CheckpointStatus[];
}

export interface CheckpointStatus {
  checkpointId: string;
  project: string;
  phase: string;
  status: "QUEUED" | "RUNNING" | "NEEDS-VERIFICATION" | "COMPLETE" | "BLOCKED" | "RESTARTED";
  updatedAt: string;
  agent?: string;
  task?: string;
  actionTaken?: string;
}

export interface CheckResult {
  timestamp: string;
  totalLocks: number;
  activeSessions: number;
  orphaned: OrphanedLock[];
  stuck: StuckSession[];
  cleaned: CleanedSession[];
}

export interface OrphanedLock {
  jobId: string;
  lockPid: number;
  lockAcquiredAt: string;
  reason: "no-session" | "parent-dead";
}

export interface StuckSession {
  jobId: string;
  sessionId: string;
  agentId?: string;
  lastActivityAt: string;
  silenceDurationSec: number;
  configuredTimeoutSec: number;
}

export interface CleanedSession {
  jobId: string;
  sessionId: string;
  action: "unlocked" | "killed";
  timestamp: string;
}

export interface OpenClawSession {
  id: string;
  agentId?: string;
  label?: string;
  startedAt: string;
  lastMessageAt: string;
  status: "active" | "idle" | "error";
}

export interface WatchdogLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  jobId?: string;
  sessionId?: string;
  message: string;
}
