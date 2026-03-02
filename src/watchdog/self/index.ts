/**
 * ClawGate Self-Watchdog - Core Module
 * Detect when primary agent goes idle/stalls
 */

import { execSync } from "child_process";
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { 
  SelfWatchdogState, 
  SelfWatchdogStatus, 
  SelfWatchdogAction, 
  RecoveryResult, 

  SubagentActivityCheck,
  SubagentActivityMetrics 
} from "./types.js";
import { 
  saveHeartbeat, 
  loadHeartbeat, 
  deleteHeartbeat, 
  listHeartbeats,
  saveTokenCheckpoint,
  loadTokenCheckpoint 
} from "./storage.js";
import * as Checkpoint from "../../checkpoint/index.js";
import * as Queue from "../../queue/index.js";

// Configuration for activity detection
const ACTIVITY_CONFIG = {
  // Thresholds for determining if stuck
  TOKEN_STALL_MINUTES: 10,        // No token increase in 10 min = concerning
  OUTPUT_STALL_MINUTES: 15,       // No output in 15 min = concerning
  MEMORY_STALL_MINUTES: 5,        // No memory update in 5 min = concerning
  // Recovery actions
  EXTEND_WATCH_THRESHOLD: 30,     // Minutes before we consider extended watch
  KILL_THRESHOLD: 45,             // Minutes before forced kill even if active
  TOKEN_DELTA_THRESHOLD: 50,      // Minimum token increase to consider "active"
};

/**
 * Register a self-watchdog for an agent
 */
export function register(
  agentId: string,
  timeoutMinutes: number,
  action: SelfWatchdogAction
): SelfWatchdogState {
  const now = new Date().toISOString();
  const state: SelfWatchdogState = {
    agentId,
    lastActivity: now,
    timeoutMinutes,
    action,
    createdAt: now,
  };
  
  saveHeartbeat(state);
  return state;
}

/**
 * Pong to reset the idle timer for an agent
 */
export function pong(agentId: string): SelfWatchdogState | null {
  const state = loadHeartbeat(agentId);
  
  if (!state) {
    return null;
  }
  
  state.lastActivity = new Date().toISOString();
  saveHeartbeat(state);
  return state;
}

/**
 * Get the status of a self-watchdog
 */
export function status(agentId: string): SelfWatchdogStatus {
  const state = loadHeartbeat(agentId);
  
  if (!state) {
    return {
      agentId,
      active: false,
      lastActivity: null,
      timeoutMinutes: 0,
      timeSinceLastPongMs: 0,
      action: null,
      isExpired: false,
    };
  }
  
  const now = Date.now();
  const lastActivity = new Date(state.lastActivity).getTime();
  const timeSinceLastPongMs = now - lastActivity;
  const timeoutMs = state.timeoutMinutes * 60 * 1000;
  
  return {
    agentId,
    active: true,
    lastActivity: state.lastActivity,
    timeoutMinutes: state.timeoutMinutes,
    timeSinceLastPongMs,
    action: state.action,
    isExpired: timeSinceLastPongMs > timeoutMs,
  };
}

/**
 * List all active self-watchdogs
 */
export function list(): SelfWatchdogState[] {
  return listHeartbeats();
}

/**
 * Remove a self-watchdog
 */
export function remove(agentId: string): boolean {
  return deleteHeartbeat(agentId);
}

/**
 * Check if a watchdog has expired and should trigger action
 */
export function checkExpired(agentId: string): { expired: boolean; idleMinutes: number; action?: SelfWatchdogAction } {
  const s = status(agentId);
  
  if (!s.active) {
    return { expired: false, idleMinutes: 0 };
  }
  
  const idleMinutes = Math.floor(s.timeSinceLastPongMs / 60000);
  
  if (s.isExpired) {
    return { expired: true, idleMinutes, action: s.action || undefined };
  }
  
  return { expired: false, idleMinutes };
}

/**
 * Execute the configured action for an expired watchdog
 */
export async function executeAction(
  agentId: string,
  action: SelfWatchdogAction,
  idleMinutes: number
): Promise<{ success: boolean; message: string }> {
  const timestamp = new Date().toISOString();
  
  switch (action) {
    case "notify-user":
      return {
        success: true,
        message: `⚠️ AGENT IDLE ALERT\n\nAgent: ${agentId}\nIdle for: ${idleMinutes} minutes\nTriggered at: ${timestamp}\n\nResume work?\n/yes → Continue monitoring\n/status → Show checkpoint list\n/stop → Cancel current task`,
      };
      
    case "message-agent":
      return {
        success: true,
        message: `Agent ${agentId} has been idle for ${idleMinutes} minutes. Sending message...`,
      };
      
    case "create-reminder":
      return {
        success: true,
        message: `Created reminder for ${agentId}: idle for ${idleMinutes} minutes`,
      };
      
    case "checkpoint-status-report":
      return {
        success: true,
        message: `Checkpoint status report: Agent ${agentId} idle for ${idleMinutes} minutes`,
      };
      
    case "escalate-to-human":
      return {
        success: true,
        message: `🚨 ESCALATION: Agent ${agentId} has been idle for ${idleMinutes} minutes and requires manual intervention.`,
      };
      
    default:
      return {
        success: false,
        message: `Unknown action: ${action}`,
      };
  }
}

// ============== ACTIVITY DETECTION HELPERS ==============

/**
 * Get the path to a subagent's memory file (.jsonl)
 */
function getMemoryFilePath(subagentId: string): string | null {
  // Subagent memory files are stored in ~/.openclaw/agents/{agent}/sessions/{subagentId}.jsonl
  // We need to find which agent directory contains this subagent
  const openclawDir = path.join(homedir(), '.openclaw', 'agents');
  
  if (!fs.existsSync(openclawDir)) {
    // Try alternative location
    const altOpenclawDir = path.join(homedir(), '.openclaw', 'sessions');
    if (fs.existsSync(altOpenclawDir)) {
      const altPath = path.join(altOpenclawDir, `${subagentId}.jsonl`);
      if (fs.existsSync(altPath)) return altPath;
    }
    return null;
  }
  
  try {
    const agentDirs = fs.readdirSync(openclawDir);
    
    for (const agentDir of agentDirs) {
      const sessionsDir = path.join(openclawDir, agentDir, 'sessions');
      if (fs.existsSync(sessionsDir)) {
        const memoryPath = path.join(sessionsDir, `${subagentId}.jsonl`);
        if (fs.existsSync(memoryPath)) {
          return memoryPath;
        }
      }
    }
  } catch (_err) {
    // Fall through to return null
  }
  
  return null;
}

/**
 * Get the last modification time of a subagent's memory file
 */
export function getMemoryFileMtime(subagentId: string): string | null {
  const memoryPath = getMemoryFilePath(subagentId);
  
  if (!memoryPath) {
    return null;
  }
  
  try {
    const stats = fs.statSync(memoryPath);
    return stats.mtime.toISOString();
  } catch (_err) {
    return null;
  }
}

/**
 * Get the timestamp of the last output line from a subagent's memory file
 * Also extracts token usage if available
 */
export function getSubagentOutputTimestamp(subagentId: string): { 
  timestamp: string | null; 
  tokenCount: number;
  lastLine: string | null 
} {
  const memoryPath = getMemoryFilePath(subagentId);
  
  if (!memoryPath) {
    return { timestamp: null, tokenCount: 0, lastLine: null };
  }
  
  try {
    const content = fs.readFileSync(memoryPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return { timestamp: null, tokenCount: 0, lastLine: null };
    }
    
    // Get last line
    const lastLine = lines[lines.length - 1];
    let timestamp: string | null = null;
    let tokenCount = 0;
    
    try {
      const entry = JSON.parse(lastLine);
      
      // Extract timestamp from various possible fields
      if (entry.timestamp) {
        timestamp = entry.timestamp;
      } else if (entry.message?.timestamp) {
        timestamp = entry.message.timestamp;
      }
      
      // Extract token count if available
      if (entry.message?.usage?.totalTokens) {
        tokenCount = entry.message.usage.totalTokens;
      } else if (entry.usage?.totalTokens) {
        tokenCount = entry.usage.totalTokens;
      }
    } catch (_err) {
      // If we can't parse, just use file mtime
    }
    
    return { timestamp, tokenCount, lastLine };
  } catch (_err) {
    return { timestamp: null, tokenCount: 0, lastLine: null };
  }
}

/**
 * Get the token delta between current and last checkpointed token count
 */
export function getTokenDelta(subagentId: string): {
  currentTokens: number;
  tokenDelta: number;
  lastTokenCount: number | null;
  lastTokenTimestamp: string | null;
} {
  const { tokenCount: currentTokens } = getSubagentOutputTimestamp(subagentId);
  const checkpoint = loadTokenCheckpoint(subagentId);
  
  const lastTokenCount = checkpoint?.lastTokenCount ?? null;
  const lastTokenTimestamp = checkpoint?.lastTokenTimestamp ?? null;
  const tokenDelta = lastTokenCount !== null ? currentTokens - lastTokenCount : 0;
  
  return {
    currentTokens,
    tokenDelta,
    lastTokenCount,
    lastTokenTimestamp,
  };
}

/**
 * Check if a subagent is actually stuck by examining multiple activity signals
 * Returns detailed check including metrics and reason
 */
export async function isSubagentActuallyStuck(
  subagentId: string, 
  runtimeMinutes: number
): Promise<SubagentActivityCheck> {
  const now = Date.now();
  
  // Get current activity metrics
  const { timestamp: outputTimestamp, tokenCount: currentTokens } = getSubagentOutputTimestamp(subagentId);
  const memoryMtime = getMemoryFileMtime(subagentId);
  const tokenCheckpoint = getTokenDelta(subagentId);
  
  // Calculate minutes since various activity signals
  const minutesSinceOutput = outputTimestamp 
    ? Math.floor((now - new Date(outputTimestamp).getTime()) / 60000)
    : runtimeMinutes; // If no timestamp, assume it's been idle entire runtime
    
  const minutesSinceMemory = memoryMtime
    ? Math.floor((now - new Date(memoryMtime).getTime()) / 60000)
    : runtimeMinutes;
    
  const minutesSinceTokens = tokenCheckpoint.lastTokenTimestamp
    ? Math.floor((now - new Date(tokenCheckpoint.lastTokenTimestamp).getTime()) / 60000)
    : runtimeMinutes;
  
  // Build metrics object
  const metrics: SubagentActivityMetrics = {
    tokenCount: currentTokens,
    tokenDelta: tokenCheckpoint.tokenDelta,
    lastTokenTimestamp: tokenCheckpoint.lastTokenTimestamp,
    lastOutputTimestamp: outputTimestamp,
    memoryFileMtime: memoryMtime,
    minutesSinceTokenActivity: minutesSinceTokens,
    minutesSinceOutput: minutesSinceOutput,
    minutesSinceMemoryUpdate: minutesSinceMemory,
  };
  
  // Determine if stuck based on multiple signals
  const signals: string[] = [];
  let stuckScore = 0;
  
  // Signal 1: No token increase
  if (tokenCheckpoint.tokenDelta === 0 && currentTokens > 0) {
    // Stagnant tokens with existing tokens = concerning
    stuckScore += 1;
    if (minutesSinceTokens > ACTIVITY_CONFIG.TOKEN_STALL_MINUTES) {
      stuckScore += 2;
      signals.push(`no token increase for ${minutesSinceTokens}min`);
    }
  } else if (tokenCheckpoint.tokenDelta > ACTIVITY_CONFIG.TOKEN_DELTA_THRESHOLD) {
    // Active token generation = definitely not stuck
    stuckScore -= 3;
    signals.push(`token delta +${tokenCheckpoint.tokenDelta}`);
  }
  
  // Signal 2: No output for extended period
  if (minutesSinceOutput > ACTIVITY_CONFIG.OUTPUT_STALL_MINUTES) {
    stuckScore += 2;
    signals.push(`no output for ${minutesSinceOutput}min`);
  } else {
    stuckScore -= 1;
  }
  
  // Signal 3: Memory file not updated
  if (minutesSinceMemory > ACTIVITY_CONFIG.MEMORY_STALL_MINUTES) {
    stuckScore += 1;
    signals.push(`no memory update for ${minutesSinceMemory}min`);
  }
  
  // Signal 4: Very long runtime with no recent activity
  if (runtimeMinutes > ACTIVITY_CONFIG.KILL_THRESHOLD) {
    stuckScore += 2;
  }
  
  // Determine stuck status based on cumulative score
  // Score >= 3 = stuck, Score < 0 = actively working, 0-2 = unclear
  const isStuck = stuckScore >= 3;
  const isActive = stuckScore < 0;
  
  let reason: string;
  if (isStuck) {
    reason = `Stuck: ${signals.join(', ')}`;
  } else if (isActive) {
    reason = `Active: ${signals.join(', ')}`;
  } else {
    reason = `Unclear activity: ${signals.join(', ') || 'insufficient signals'}`;
  }
  
  return {
    stuck: isStuck,
    reason,
    metrics,
  };
}

// ============== RECOVERY WITH ACTIVITY DETECTION ==============

/**
 * Autonomous recovery for stalled agents
 * 
 * Recovery logic:
 * 1. Read checkpoint file for agent's current project
 * 2. Check subagent status via exec or API
 * 3. IF subagent done → verify output → mark checkpoint COMPLETE → trigger queue next
 * 4. IF subagent stuck/running >30m → use activity detection → kill only if stuck → mark RESTARTED
 * 5. IF subagent busy >30m → extend watch, don't kill
 * 6. IF state unclear → return ESCALATE
 */
export async function recover(agentId: string): Promise<RecoveryResult> {
  const timestamp = new Date().toISOString();

  // Step 1: Read checkpoint file for agent's current project
  let checkpoint: Checkpoint.CheckpointData | null = null;
  let project: string | undefined;
  let phase: string | undefined;

  try {
    // Get the most recent checkpoint for this agent
    const allCheckpoints = Checkpoint.list();
    checkpoint = allCheckpoints.find(cp => cp.agent === agentId && (cp.status === 'active' || cp.status === 'failed')) ?? null;
    
    if (!checkpoint) {
      // Look for any checkpoint associated with this agent
      checkpoint = allCheckpoints.find(cp => cp.agent === agentId) ?? null;
    }

    if (checkpoint) {
      project = checkpoint.project;
      phase = checkpoint.phase;
    }
  } catch (err) {
    return {
      action: 'escalate',
      details: `Failed to read checkpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 2: Check subagent status via exec
  let subagentStatus: 'running' | 'done' | 'not-found' | 'error' = 'error';
  let subagentId: string | undefined;
  let runtimeMinutes = 0;

  try {
    // Find subagent by pattern: clawgate-{phase}-watchdog or similar
    const result = execSync('openclaw sessions list --json', { encoding: 'utf-8', timeout: 10000 });
    const sessions = JSON.parse(result || '[]');
    
    // Look for subagent related to this agent/watchdog
    subagentId = `clawgate-${agentId}-phase`;  // Pattern match
    const matchingSession = sessions.find((s: any) => 
      s.id?.includes(agentId) || 
      s.label?.includes(agentId) ||
      (phase && s.label?.includes(phase))
    );

    if (matchingSession) {
      subagentId = matchingSession.id;
      
      // Check status
      if (matchingSession.status === 'completed' || matchingSession.status === 'done') {
        subagentStatus = 'done';
      } else if (matchingSession.status === 'running' || matchingSession.status === 'active') {
        subagentStatus = 'running';
        
        // Calculate runtime
        if (matchingSession.startTime) {
          const startTime = new Date(matchingSession.startTime).getTime();
          runtimeMinutes = Math.floor((Date.now() - startTime) / 60000);
        } else if (matchingSession.createdAt) {
          const createdAt = new Date(matchingSession.createdAt).getTime();
          runtimeMinutes = Math.floor((Date.now() - createdAt) / 60000);
        }
      } else {
        subagentStatus = 'not-found';
      }
    } else {
      subagentStatus = 'not-found';
    }
  } catch (err) {
    subagentStatus = 'error';
    return {
      action: 'escalate',
      details: `Failed to check subagent status: ${err instanceof Error ? err.message : String(err)}`,
      checkpoint: checkpoint?.id,
      project,
      phase,
    };
  }

  // Step 3: Recovery logic based on subagent status

  // Case 1: Subagent done → verify output → mark checkpoint COMPLETE → trigger queue next
  if (subagentStatus === 'done' && checkpoint && project && phase) {
    try {
      // Mark checkpoint as complete
      Checkpoint.complete(checkpoint.id, `Auto-recovered: subagent completed successfully at ${timestamp}`, 'completed');
      
      // Trigger queue next - find and start next task
      const nextTask = Queue.next(project, agentId);
      if (nextTask) {
        Queue.start(nextTask.id, project);
        return {
          action: 'verified',
          details: `Phase ${phase} completed successfully. Next phase ${nextTask.id} started.`,
          checkpoint: checkpoint.id,
          project,
          phase,
          subagentId,
        };
      } else {
        return {
          action: 'verified',
          details: `Phase ${phase} completed successfully. No next phase available - project may be complete.`,
          checkpoint: checkpoint.id,
          project,
          phase,
          subagentId,
        };
      }
      
    } catch (err) {
      return {
        action: 'escalate',
        details: `Subagent completed but failed to update checkpoint/queue: ${err instanceof Error ? err.message : String(err)}`,
        checkpoint: checkpoint?.id,
        project,
        phase,
        subagentId,
      };
    }
  }

  // Case 2: Subagent running >30m → use activity detection to determine if stuck
  if (subagentStatus === 'running' && runtimeMinutes > ACTIVITY_CONFIG.EXTEND_WATCH_THRESHOLD && subagentId) {
    const check = await isSubagentActuallyStuck(subagentId, runtimeMinutes);
    
    // Save current token checkpoint for next comparison
    if (check.metrics.tokenCount > 0) {
      saveTokenCheckpoint(subagentId, check.metrics.tokenCount, timestamp);
    }
    
    if (check.stuck) {
      // Actually stuck → kill and restart
      try {
        // Kill the stuck subagent
        execSync(`openclaw gateway call sessions.kill '{"sessionId": "${subagentId}"}'`, { 
          encoding: 'utf-8',
          timeout: 15000 
        });
        
        // Reset token checkpoint
        if (subagentId) {
          const checkpointPath = path.join(homedir(), '.clawgate', 'watchdog', 'tokens', `${subagentId}.tokens.json`);
          if (fs.existsSync(checkpointPath)) {
            fs.unlinkSync(checkpointPath);
          }
        }
        
        // Update checkpoint status
        if (checkpoint) {
          Checkpoint.update(checkpoint.id, 'active');
        }

        return {
          action: 'restarted',
          details: `Killed stuck subagent after ${runtimeMinutes} minutes. ${check.reason}`,
          checkpoint: checkpoint?.id,
          project,
          phase,
          subagentId,
          runtimeMinutes,
          reason: check.reason,
        };
      } catch (err) {
        return {
          action: 'escalate',
          details: `Detected stuck subagent but failed to kill/restart: ${err instanceof Error ? err.message : String(err)}`,
          checkpoint: checkpoint?.id,
          project,
          phase,
          subagentId,
          runtimeMinutes,
        };
      }
    } else {
      // Busy working → extend watch, don't kill
      return {
        action: 'extended_watch',
        details: `Subagent busy working. ${check.reason}`,
        checkpoint: checkpoint?.id,
        project,
        phase,
        subagentId,
        runtimeMinutes,
        reason: `Busy: ${check.reason} (runtime ${runtimeMinutes}m)`,
      };
    }
  }

  // Case 3: Subagent running but not yet at threshold
  if (subagentStatus === 'running' && runtimeMinutes <= ACTIVITY_CONFIG.EXTEND_WATCH_THRESHOLD) {
    // Still within normal operating time, just monitoring
    return {
      action: 'extended_watch',
      details: `Subagent running normally (${runtimeMinutes}m < ${ACTIVITY_CONFIG.EXTEND_WATCH_THRESHOLD}m threshold). Monitoring continues.`,
      checkpoint: checkpoint?.id,
      project,
      phase,
      subagentId,
      runtimeMinutes,
    };
  }

  // Case 4: State unclear → ESCALATE
  if (subagentStatus === 'not-found') {
    return {
      action: 'escalate',
      details: `Unable to determine subagent status (${subagentStatus}). Manual intervention required.`,
      checkpoint: checkpoint?.id,
      project,
      phase,
      subagentId,
    };
  }

  // Default: unexpected state
  return {
    action: 'escalate',
    details: `Unexpected state: subagentStatus=${subagentStatus}, runtime=${runtimeMinutes}m`,
    checkpoint: checkpoint?.id,
    project,
    phase,
    subagentId,
    runtimeMinutes,
  };
}

// Re-export types
export * from "./types.js";
export * from "./storage.js";
