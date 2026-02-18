/**
 * ClawGate Scheduler - Logger
 */

import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { ExecutionLog } from "./types.js";

export interface Logger {
  log(message: string): void;
  error(message: string): void;
  execution(log: ExecutionLog): void;
}

export function createLogger(logsDir: string, jobId: string): Logger {
  const date = new Date().toISOString().split("T")[0];
  const logFile = join(logsDir, jobId, `${date}.log`);

  // Ensure job log directory exists
  const jobLogDir = join(logsDir, jobId);
  if (!existsSync(jobLogDir)) {
    mkdirSync(jobLogDir, { recursive: true });
  }

  function timestamp(): string {
    return new Date().toISOString();
  }

  function write(level: string, message: string): void {
    const line = `[${timestamp()}] [${level}] ${message}\n`;
    try {
      appendFileSync(logFile, line);
    } catch (err) {
      // Fallback to console if file write fails
      console.error(`Failed to write to log file: ${err}`);
    }
  }

  return {
    log(message: string): void {
      const line = `[${timestamp()}] [INFO] ${message}`;
      console.log(line);
      write("INFO", message);
    },

    error(message: string): void {
      const line = `[${timestamp()}] [ERROR] ${message}`;
      console.error(line);
      write("ERROR", message);
    },

    execution(log: ExecutionLog): void {
      const entry = JSON.stringify(log) + "\n";
      try {
        appendFileSync(logFile, entry);
      } catch (err) {
        console.error(`Failed to write execution log: ${err}`);
      }
    },
  };
}

export function createConsoleLogger(): Logger {
  return {
    log(message: string): void {
      console.log(`[${new Date().toISOString()}] [INFO] ${message}`);
    },
    error(message: string): void {
      console.error(`[${new Date().toISOString()}] [ERROR] ${message}`);
    },
    execution(log: ExecutionLog): void {
      console.log(`[EXECUTION] ${JSON.stringify(log)}`);
    },
  };
}
