/**
 * ClawGate Checkpoint - Types
 * Project phase tracking and agent checkpoint management
 */

export type CheckpointStatus = 'active' | 'completed' | 'failed' | 'aborted' | 'success';

export interface CheckpointData {
  id: string;
  project: string;
  phase: string;
  agent: string;
  status: CheckpointStatus;
  createdAt: string;
  completedAt?: string;
  evidence?: string;
}
