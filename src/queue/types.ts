/**
 * Queue Module Types
 * Task dependency graph and state management
 */

export type TaskState = 'defined' | 'queued' | 'waiting' | 'ready' | 'running' | 'complete' | 'failed';

export interface TaskDefinition {
  id: string;
  project: string;
  agent: string;
  command: string;
  dependsOn?: string[];
  timeout?: number;
  retry?: number;
  state: TaskState;
  createdAt: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  evidence?: string;
  failureReason?: string;
  retryCount: number;
}

export interface DependencyGraph {
  tasks: Record<string, TaskDefinition>;
  project: string;
  updatedAt: string;
}

export interface QueueStatus {
  project: string;
  tasks: TaskDefinition[];
  summary: {
    total: number;
    defined: number;
    queued: number;
    waiting: number;
    ready: number;
    running: number;
    complete: number;
    failed: number;
  };
}

export interface BlockedTask {
  task: TaskDefinition;
  blockedBy: string[];
}
