/**
 * ClawGate Scheduler - Job Executor
 */

import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { Job, ExecutionLog } from "./types.js";
import type { Logger } from "./logger.js";
import { resolvePayload } from "./templates.js";
import { LockManager } from "./lock.js";

function shellEscape(str: string): string {
  // Escape special shell characters
  if (/[^A-Za-z0-9_\-\.:,\/]/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

export interface ExecuteOptions {
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
}

export interface ExecuteResult {
  success: boolean;
  exitCode: number;
  output: string;
  error?: string;
  durationMs: number;
}

export class Executor {
  private lockManager: LockManager;
  private templatesDir: string;
  private defaultTimeout: number;

  constructor(
    lockManager: LockManager,
    templatesDir: string,
    defaultTimeout: number
  ) {
    this.lockManager = lockManager;
    this.templatesDir = templatesDir;
    this.defaultTimeout = defaultTimeout;
  }

  async execute(
    job: Job,
    logger: Logger,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    const startTime = Date.now();
    const logId = randomUUID();

    logger.log(`Starting execution of job ${job.id} (${job.name})`);

    // Check if enabled
    if (!job.execution.enabled && !options.force) {
      logger.log(`Job ${job.id} is disabled, skipping`);
      return {
        success: false,
        exitCode: 3,
        output: "",
        error: "Job is disabled",
        durationMs: 0,
      };
    }

    // Acquire lock
    if (!this.lockManager.lock(job.id)) {
      const lockInfo = this.lockManager.getLockInfo(job.id);
      logger.error(`Job ${job.id} is already running (PID: ${lockInfo?.pid})`);
      return {
        success: false,
        exitCode: 4,
        output: "",
        error: `Job already running (PID: ${lockInfo?.pid})`,
        durationMs: 0,
      };
    }

    try {
      // Resolve payload
      let payload: string;
      try {
        payload = resolvePayload(job.payload, this.templatesDir);
      } catch (err) {
        logger.error(`Failed to resolve payload: ${err}`);
        return {
          success: false,
          exitCode: 5,
          output: "",
          error: `Payload resolution failed: ${err}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Build command
      const command = this.buildCommand(job, payload);
      logger.log(`Command: ${command}`);

      if (options.dryRun) {
        logger.log("Dry run - not executing");
        return {
          success: true,
          exitCode: 0,
          output: `Would execute: ${command}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Execute
      const result = await this.runCommand(
        command,
        job.execution.timeoutMs || this.defaultTimeout,
        logger
      );

      // Log execution
      const executionLog: ExecutionLog = {
        id: logId,
        jobId: job.id,
        scheduledAt: new Date(startTime).toISOString(),
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        status: result.success ? "success" : "failure",
        error: result.error,
        output: result.output,
        command,
      };
      logger.execution(executionLog);

      logger.log(
        `Execution ${result.success ? "succeeded" : "failed"} in ${result.durationMs}ms`
      );

      return result;
    } finally {
      this.lockManager.unlock(job.id);
    }
  }

  private buildCommand(job: Job, payload: string): string {
    const { target } = job;

    // Use openclaw agent to send instructions that agents understand
    // --agent specifies which agent to target
    // --deliver ensures it's sent as an actionable instruction
    const parts = ["openclaw", "agent"];

    if (target.agentId) {
      parts.push("--agent", target.agentId);
    }

    parts.push("--message", payload);

    if (target.channel) {
      parts.push("--channel", target.channel);
    }

    if (target.to) {
      parts.push("--to", target.to);
    }

    parts.push("--deliver");

    return parts.map((p) => shellEscape(p)).join(" ");
  }

  private runCommand(
    command: string,
    timeoutMs: number,
    logger: Logger
  ): Promise<ExecuteResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      logger.log(`Spawning: ${command}`);

      // Use shell: true to execute the full command string
      const child = spawn(command, [], {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.log(`stdout: ${chunk.trim()}`);
      });

      child.stderr?.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        logger.error(`stderr: ${chunk.trim()}`);
      });

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeout);
        const durationMs = Date.now() - startTime;

        resolve({
          success: code === 0,
          exitCode: code ?? 1,
          output: stdout,
          error: stderr || undefined,
          durationMs,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          exitCode: 8,
          output: stdout,
          error: err.message,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
}
