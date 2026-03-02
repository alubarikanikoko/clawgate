/**
 * ClawGate Self-Watchdog - Storage
 * Heartbeat file management for agent idle detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { SelfWatchdogState } from './types.js';
import type { CheckpointWithTokens } from './types.js';

export const WATCHDOG_DIR = path.join(homedir(), '.clawgate', 'watchdog');
export const CHECKPOINT_TOKENS_DIR = path.join(homedir(), '.clawgate', 'watchdog', 'tokens');

function ensureWatchdogDir(): void {
  if (!fs.existsSync(WATCHDOG_DIR)) {
    fs.mkdirSync(WATCHDOG_DIR, { recursive: true });
  }
}

function ensureTokensDir(): void {
  ensureWatchdogDir();
  if (!fs.existsSync(CHECKPOINT_TOKENS_DIR)) {
    fs.mkdirSync(CHECKPOINT_TOKENS_DIR, { recursive: true });
  }
}

function getHeartbeatPath(agentId: string): string {
  return path.join(WATCHDOG_DIR, `${agentId}.heartbeat`);
}

function getTokenCheckpointPath(subagentId: string): string {
  return path.join(CHECKPOINT_TOKENS_DIR, `${subagentId}.tokens.json`);
}

export function saveHeartbeat(state: SelfWatchdogState): void {
  ensureWatchdogDir();
  fs.writeFileSync(getHeartbeatPath(state.agentId), JSON.stringify(state, null, 2));
}

export function loadHeartbeat(agentId: string): SelfWatchdogState | null {
  const filePath = getHeartbeatPath(agentId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as SelfWatchdogState;
}

export function deleteHeartbeat(agentId: string): boolean {
  const filePath = getHeartbeatPath(agentId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export function listHeartbeats(): SelfWatchdogState[] {
  ensureWatchdogDir();
  const states: SelfWatchdogState[] = [];
  
  if (!fs.existsSync(WATCHDOG_DIR)) {
    return states;
  }
  
  const files = fs.readdirSync(WATCHDOG_DIR);
  
  for (const file of files) {
    if (file.endsWith('.heartbeat')) {
      const agentId = file.replace('.heartbeat', '');
      const state = loadHeartbeat(agentId);
      if (state) {
        states.push(state);
      }
    }
  }
  
  return states.sort((a, b) => 
    new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );
}

export function heartbeatExists(agentId: string): boolean {
  return fs.existsSync(getHeartbeatPath(agentId));
}

// Token tracking functions
export function saveTokenCheckpoint(subagentId: string, tokenCount: number, timestamp: string): void {
  ensureTokensDir();
  const checkpoint: CheckpointWithTokens = {
    lastTokenCount: tokenCount,
    lastTokenTimestamp: timestamp,
  };
  fs.writeFileSync(getTokenCheckpointPath(subagentId), JSON.stringify(checkpoint, null, 2));
}

export function loadTokenCheckpoint(subagentId: string): CheckpointWithTokens | null {
  const filePath = getTokenCheckpointPath(subagentId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as CheckpointWithTokens;
}

export function deleteTokenCheckpoint(subagentId: string): boolean {
  const filePath = getTokenCheckpointPath(subagentId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
