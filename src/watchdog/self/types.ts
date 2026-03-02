/**
 * ClawGate Self-Watchdog - Types
 * Detect when primary agent goes idle/stalls
 */

export interface SelfWatchdogState {
  agentId: string;
  lastActivity: string; // ISO timestamp
  timeoutMinutes: number;
  action: SelfWatchdogAction;
  checkpointSummary?: string;
  createdAt: string;
}

export type SelfWatchdogAction = 
  | "notify-user" 
  | "message-agent" 
  | "create-reminder" 
  | "checkpoint-status-report" 
  | "escalate-to-human";

export interface SelfWatchdogStatus {
  agentId: string;
  active: boolean;
  lastActivity: string | null;
  timeoutMinutes: number;
  timeSinceLastPongMs: number;
  action: SelfWatchdogAction | null;
  isExpired: boolean;
}

export interface SelfWatchdogAlert {
  agentId: string;
  idleSinceMinutes: number;
  lastCheckpoint?: {
    project: string;
    phase: string;
    status: string;
  };
  actions: string[];
}

// Recovery types
export type RecoveryAction = 'verified' | 'restarted' | 'escalate' | 'extended_watch';

export interface RecoveryResult {
  action: RecoveryAction;
  details: string;
  checkpoint?: string;
  project?: string;
  phase?: string;
  subagentId?: string;
  runtimeMinutes?: number;
  reason?: string;
}

// Activity detection types
export interface SubagentActivityMetrics {
  tokenCount: number;
  tokenDelta: number;
  lastTokenTimestamp: string | null;
  lastOutputTimestamp: string | null;
  memoryFileMtime: string | null;
  minutesSinceTokenActivity: number;
  minutesSinceOutput: number;
  minutesSinceMemoryUpdate: number;
}

export interface SubagentActivityCheck {
  stuck: boolean;
  reason: string;
  metrics: SubagentActivityMetrics;
}

// Extended checkpoint with token tracking
export interface CheckpointWithTokens {
  lastTokenCount?: number;
  lastTokenTimestamp?: string;
}
