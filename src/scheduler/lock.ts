/**
 * ClawGate Scheduler - Lock Management
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

export interface LockInfo {
  pid: number;
  startedAt: string;
}

export class LockManager {
  private locksDir: string;

  constructor(locksDir: string) {
    this.locksDir = locksDir;
  }

  isLocked(jobId: string): boolean {
    const lockPath = join(this.locksDir, `${jobId}.lock`);
    
    if (!existsSync(lockPath)) {
      return false;
    }

    // Check if process is still running
    try {
      const content = readFileSync(lockPath, "utf-8");
      const lock: LockInfo = JSON.parse(content);
      
      if (this.isProcessRunning(lock.pid)) {
        return true;
      }

      // Stale lock - remove it
      this.unlock(jobId);
      return false;
    } catch (err) {
      // Corrupt lock file - remove it
      this.unlock(jobId);
      return false;
    }
  }

  lock(jobId: string): boolean {
    if (this.isLocked(jobId)) {
      return false;
    }

    const lockPath = join(this.locksDir, `${jobId}.lock`);
    const lock: LockInfo = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };

    try {
      writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf-8");
      return true;
    } catch (err) {
      console.error(`Failed to create lock for ${jobId}:`, err);
      return false;
    }
  }

  unlock(jobId: string): void {
    const lockPath = join(this.locksDir, `${jobId}.lock`);
    
    if (existsSync(lockPath)) {
      try {
        unlinkSync(lockPath);
      } catch (err) {
        console.error(`Failed to remove lock for ${jobId}:`, err);
      }
    }
  }

  getLockInfo(jobId: string): LockInfo | null {
    const lockPath = join(this.locksDir, `${jobId}.lock`);
    
    if (!existsSync(lockPath)) {
      return null;
    }

    try {
      const content = readFileSync(lockPath, "utf-8");
      return JSON.parse(content) as LockInfo;
    } catch (err) {
      return null;
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      // Signal 0 is error check - doesn't actually send signal
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return false;
    }
  }
}
