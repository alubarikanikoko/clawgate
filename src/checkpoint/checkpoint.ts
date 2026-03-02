/**
 * ClawGate Checkpoint - Core Module
 * Checkpoint management functions
 */

import { CheckpointData, CheckpointStatus } from './types.js';
import {
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpointFile,
  listAllCheckpoints,
} from './storage.js';

export { CheckpointData, CheckpointStatus };

export function create(
  checkpointId: string,
  project: string,
  phase: string,
  agent: string
): CheckpointData {
  const existing = loadCheckpoint(checkpointId);
  if (existing) {
    throw new Error(`Checkpoint '${checkpointId}' already exists`);
  }

  const checkpoint: CheckpointData = {
    id: checkpointId,
    project,
    phase,
    agent,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  saveCheckpoint(checkpoint);
  return checkpoint;
}

export function complete(
  checkpointId: string,
  evidence?: string,
  status: CheckpointStatus = 'completed'
): CheckpointData {
  const checkpoint = loadCheckpoint(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint '${checkpointId}' not found`);
  }

  checkpoint.status = status;
  checkpoint.completedAt = new Date().toISOString();
  if (evidence) {
    checkpoint.evidence = evidence;
  }

  saveCheckpoint(checkpoint);
  return checkpoint;
}

export function update(
  checkpointId: string,
  status: CheckpointStatus
): CheckpointData {
  const checkpoint = loadCheckpoint(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint '${checkpointId}' not found`);
  }

  checkpoint.status = status;
  saveCheckpoint(checkpoint);
  return checkpoint;
}

export function list(
  project?: string,
  status?: CheckpointStatus
): CheckpointData[] {
  let checkpoints = listAllCheckpoints();

  if (project) {
    checkpoints = checkpoints.filter(cp => cp.project === project);
  }

  if (status) {
    checkpoints = checkpoints.filter(cp => cp.status === status);
  }

  return checkpoints;
}

export function last(project: string): CheckpointData | null {
  const checkpoints = listAllCheckpoints().filter(cp => cp.project === project);
  return checkpoints.length > 0 ? checkpoints[0] : null;
}

export function deleteCheckpoint(checkpointId: string): boolean {
  const checkpoint = loadCheckpoint(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint '${checkpointId}' not found`);
  }
  return deleteCheckpointFile(checkpointId);
}
