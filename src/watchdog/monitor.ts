/**
 * ClawGate Watchdog - Session Monitor
 * 
 * Detects and cleans up orphaned locks and stuck agent sessions.
 * Safety-first approach: only kills when parent is dead or process is truly idle.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import type {
  WatchdogConfig,
  WatchdogState,
  CheckResult,
  OrphanedLock,
  StuckSession,
  OpenClawSession,
  WatchdogLogEntry,
} from "./types.js";
import type { LockManager } from "../scheduler/lock.js";
import type { Registry } from "../scheduler/registry.js";

const DEFAULT_CONFIG: WatchdogConfig = {
  checkIntervalSec: 60,
  stuckThresholdSec: 600, // 10 min fallback if no job timeout configured
  autoKill: true,
  notifyOnKill: true,
};

export class WatchdogMonitor {
  private lockManager: LockManager;
  private registry: Registry;
  private stateDir: string;
  private config: WatchdogConfig;

  constructor(
    lockManager: LockManager,
    registry: Registry,
    stateDir: string,
    config?: Partial<WatchdogConfig>
  ) {
    this.lockManager = lockManager;
    this.registry = registry;
    this.stateDir = stateDir;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Ensure state directory exists
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Run a single check cycle
   */
  async check(options?: { dryRun?: boolean }): Promise<CheckResult> {
    const checkStart = new Date().toISOString();
    const dryRun = options?.dryRun ?? false;

    // Get current state
    const locks = this.listClawGateLocks();
    const sessions = await this.listOpenClawSessions();
    const result: CheckResult = {
      timestamp: checkStart,
      totalLocks: locks.length,
      activeSessions: sessions.length,
      orphaned: [],
      stuck: [],
      cleaned: [],
    };

    for (const lock of locks) {
      const job = this.registry.get(lock.jobId);
      
      // Skip if job explicitly disabled watchdog
      if (job?.execution?.watchdog === false) {
        this.log("info", `Skipping watchdog check for ${lock.jobId} (disabled)`, lock.jobId);
        continue;
      }

      const session = sessions.find(s => this.sessionMatchesLock(s, lock.jobId, job?.target?.agentId));

      // Check 1: Orphaned lock (no session)
      if (!session) {
        const orphaned: OrphanedLock = {
          jobId: lock.jobId,
          lockPid: lock.pid,
          lockAcquiredAt: lock.acquiredAt,
          reason: "no-session",
        };
        result.orphaned.push(orphaned);

        if (!dryRun && this.config.autoKill) {
          this.unlockOrphan(orphaned);
          result.cleaned.push({
            jobId: lock.jobId,
            sessionId: "orphan",
            action: "unlocked",
            timestamp: new Date().toISOString(),
          });
        }
        continue;
      }

      // Check 2: Parent process dead (orphaned lock with dead parent)
      if (!this.isProcessRunning(lock.pid)) {
        const orphaned: OrphanedLock = {
          jobId: lock.jobId,
          lockPid: lock.pid,
          lockAcquiredAt: lock.acquiredAt,
          reason: "parent-dead",
        };
        result.orphaned.push(orphaned);

        if (!dryRun && this.config.autoKill) {
          this.killOrphanedSession(session.id, orphaned);
          result.cleaned.push({
            jobId: lock.jobId,
            sessionId: session.id,
            action: "killed",
            timestamp: new Date().toISOString(),
          });
        }
        continue;
      }

      // Check 3: Stuck session (silent but parent alive)
      const silenceThreshold = this.getSilenceThreshold(job);
      const lastActivity = new Date(session.lastMessageAt).getTime();
      const silenceDuration = (Date.now() - lastActivity) / 1000;

      if (silenceDuration > silenceThreshold) {
        // Verify process is truly idle before marking stuck
        if (await this.isProcessIdle(lock.pid)) {
          const stuck: StuckSession = {
            jobId: lock.jobId,
            sessionId: session.id,
            agentId: job?.target?.agentId,
            lastActivityAt: session.lastMessageAt,
            silenceDurationSec: Math.round(silenceDuration),
            configuredTimeoutSec: job?.execution?.timeoutInSeconds || this.config.stuckThresholdSec,
          };
          result.stuck.push(stuck);

          if (!dryRun && this.config.autoKill) {
            await this.killStuckSession(session.id, stuck);
            result.cleaned.push({
              jobId: lock.jobId,
              sessionId: session.id,
              action: "killed",
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Save state
    if (!dryRun) {
      this.saveState({
        lastCheckAt: checkStart,
        lastCheckResult: result,
        config: this.config,
      });
    }

    return result;
  }

  /**
   * Start daemon mode (runs checks in a loop)
   */
  async startDaemon(): Promise<void> {
    const pidFile = join(this.stateDir, "watchdog.pid");
    
    // Check if already running
    if (existsSync(pidFile)) {
      const prevPid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      if (this.isProcessRunning(prevPid)) {
        throw new Error(`Watchdog already running (PID: ${prevPid})`);
      }
    }

    // Write PID file
    writeFileSync(pidFile, process.pid.toString(), "utf-8");

    this.log("info", `Watchdog daemon started (PID: ${process.pid})`);

    // Run checks in a loop
    const runCheck = async () => {
      try {
        await this.check();
      } catch (err) {
        this.log("error", `Check failed: ${err}`);
      }
      
      // Schedule next check
      setTimeout(runCheck, this.config.checkIntervalSec * 1000);
    };

    // Handle graceful shutdown
    process.on("SIGTERM", () => {
      this.log("info", "Watchdog daemon shutting down");
      this.cleanup();
      process.exit(0);
    });

    process.on("SIGINT", () => {
      this.log("info", "Watchdog daemon shutting down");
      this.cleanup();
      process.exit(0);
    });

    // Start first check
    await runCheck();
  }

  /**
   * Stop the daemon
   */
  stopDaemon(): boolean {
    const pidFile = join(this.stateDir, "watchdog.pid");
    
    if (!existsSync(pidFile)) {
      return false;
    }

    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get daemon status
   */
  getStatus(): { running: boolean; pid?: number; lastCheck?: string } {
    const pidFile = join(this.stateDir, "watchdog.pid");
    const stateFile = join(this.stateDir, "watchdog-state.json");
    
    let pid: number | undefined;
    let running = false;
    
    if (existsSync(pidFile)) {
      pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      running = this.isProcessRunning(pid);
    }

    let lastCheck: string | undefined;
    if (existsSync(stateFile)) {
      const state = JSON.parse(readFileSync(stateFile, "utf-8")) as WatchdogState;
      lastCheck = state.lastCheckAt;
    }

    return { running, pid, lastCheck };
  }

  // Private helpers

  private listClawGateLocks(): Array<{
    jobId: string;
    pid: number;
    acquiredAt: string;
  }> {
    // Get from lock manager's internal state
    // This is a simplified version - actual implementation would
    // expose LockManager's internal locks
    return this.lockManager.listLocks?.() || [];
  }

  private async listOpenClawSessions(): Promise<OpenClawSession[]> {
    return new Promise((resolve) => {
      const child = spawn("openclaw", ["sessions", "list", "--json"], {
        timeout: 10000,
      });

      let stdout = "";
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0 && stdout) {
          try {
            const parsed = JSON.parse(stdout);
            resolve(Array.isArray(parsed) ? parsed : []);
          } catch {
            resolve([]);
          }
        } else {
          resolve([]);
        }
      });

      child.on("error", () => {
        resolve([]);
      });

      // Timeout fallback
      setTimeout(() => {
        child.kill();
        resolve([]);
      }, 15000);
    });
  }

  private sessionMatchesLock(
    session: OpenClawSession,
    jobId: string,
    agentId?: string
  ): boolean {
    // Match based on agent ID and label containing job ID
    // This is heuristic - actual matching depends on how ClawGate tags sessions
    return (
      session.agentId === agentId ||
      session.label?.includes(jobId) ||
      session.id.includes(jobId.slice(0, 8))
    );
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async isProcessIdle(pid: number): Promise<boolean> {
    return new Promise((resolve) => {
      // Check CPU usage via /proc or ps
      const child = spawn("ps", ["-p", pid.toString(), "-o", "%cpu"], {
        timeout: 5000,
      });

      let stdout = "";
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.on("close", () => {
        const lines = stdout.trim().split("\n");
        if (lines.length >= 2) {
          const cpu = parseFloat(lines[1]);
          resolve(cpu < 1.0); // Idle if < 1% CPU
        } else {
          resolve(false); // Can't determine, assume not idle
        }
      });

      child.on("error", () => {
        resolve(false);
      });
    });
  }

  private getSilenceThreshold(job: any): number {
    // 3x configured timeout, or fallback to default
    if (job?.execution?.timeoutInSeconds) {
      return job.execution.timeoutInSeconds * 3;
    }
    return this.config.stuckThresholdSec * 3;
  }

  private unlockOrphan(orphaned: OrphanedLock): void {
    this.log("warn", `Unlocking orphan: ${orphaned.jobId} (lock PID ${orphaned.lockPid})`, orphaned.jobId);
    this.lockManager.unlock(orphaned.jobId);
  }

  private async killOrphanedSession(sessionId: string, orphaned: OrphanedLock): Promise<void> {
    this.log("warn", `Killing orphaned session: ${sessionId} for job ${orphaned.jobId}`, orphaned.jobId, sessionId);
    await this.killSession(sessionId);
    this.lockManager.unlock(orphaned.jobId);
  }

  private async killStuckSession(sessionId: string, stuck: StuckSession): Promise<void> {
    this.log("warn", `Killing stuck session: ${sessionId} silent for ${stuck.silenceDurationSec}s`, stuck.jobId, sessionId);
    await this.killSession(sessionId);
    this.lockManager.unlock(stuck.jobId);
  }

  private async killSession(sessionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn("openclaw", ["gateway", "call", "sessions.kill", JSON.stringify({ sessionId })], {
        timeout: 10000,
      });

      child.on("close", (code) => {
        resolve(code === 0);
      });

      child.on("error", () => {
        resolve(false);
      });
    });
  }

  private saveState(state: Partial<WatchdogState>): void {
    const stateFile = join(this.stateDir, "watchdog-state.json");
    writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n", "utf-8");
  }

  private log(level: WatchdogLogEntry["level"], message: string, jobId?: string, sessionId?: string): void {
    const entry: WatchdogLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      jobId,
      sessionId,
      message,
    };

    // Write to log file
    const logFile = join(this.stateDir, "watchdog.log");
    const line = `${entry.timestamp} [${level.toUpperCase()}] ${jobId || "-"} ${sessionId || "-"} ${message}\n`;
    
    try {
      writeFileSync(logFile, line, { flag: "a", encoding: "utf-8" });
    } catch {
      // Silent fail - logging shouldn't break core functionality
    }

    // Also console for daemon mode
    if (process.env.CLAWGATE_WATCHDOG_DAEMON) {
      console.log(line.trim());
    }
  }

  private cleanup(): void {
    const pidFile = join(this.stateDir, "watchdog.pid");
    try {
      if (existsSync(pidFile)) {
        unlinkSync(pidFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Make LockManager.listLocks available
// Need to add this method to LockManager class
declare module "../scheduler/lock.js" {
  interface LockManager {
    listLocks(): Array<{ jobId: string; pid: number; acquiredAt: string }>;
  }
}
