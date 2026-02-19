/**
 * ClawGate Scheduler - Job Executor
 */

import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { Job, ExecutionLog } from "./types.js";
import type { Logger } from "./logger.js";
import { resolvePayload } from "./templates.js";
import { LockManager } from "./lock.js";

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
  private openclawBin: string;
  private handoffGraceMs: number;  // Grace period for handoff/response

  constructor(
    lockManager: LockManager,
    templatesDir: string,
    defaultTimeout: number,
    openclawBin?: string,
    handoffGraceMs?: number
  ) {
    this.lockManager = lockManager;
    this.templatesDir = templatesDir;
    this.defaultTimeout = defaultTimeout;
    this.openclawBin = openclawBin || process.env.OPENCLAW_BIN || "openclaw";
    this.handoffGraceMs = handoffGraceMs || 30000; // Default 30s grace period
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
      logger.log(`Command: ${command.join(' ')}`);

      if (options.dryRun) {
        logger.log("Dry run - not executing");
        return {
          success: true,
          exitCode: 0,
          output: `Would execute: ${command.join(' ')}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Execute with handoff grace period
      // The timeout includes both execution time AND a grace period for handoff/response
      const executionTimeout = job.execution.timeoutMs || this.defaultTimeout;
      const totalTimeout = executionTimeout + this.handoffGraceMs;
      
      const result = await this.runCommand(
        command,
        executionTimeout,
        totalTimeout,
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
        command: command.join(' '),
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

  private buildCommand(job: Job, payload: string): string[] {
    const { target } = job;

    // Prefix scheduled job messages so agents know the source
    const prefixedPayload = `🤖 CLAWGATE SCHEDULED JOB ———————————————\n\n${payload}`;

    // Use openclaw agent to send instructions that agents understand
    // Return as array for spawn - no shell escaping needed
    const parts = [this.openclawBin, "agent"];

    if (target.agentId) {
      parts.push("--agent", target.agentId);
    }

    parts.push("--message", prefixedPayload);

    if (target.channel) {
      parts.push("--channel", target.channel);
    }

    if (target.to) {
      parts.push("--to", target.to);
    }

    // Map agent to reply-account so responses go through the correct bot
    // not the default (Eve). Each agent has its own Telegram account binding.
    const replyAccount = target.replyAccount || this.getReplyAccount(target.agentId);
    if (replyAccount) {
      parts.push("--reply-account", replyAccount);
    }

    parts.push("--deliver");

    return parts;
  }

  private getReplyAccount(agentId?: string): string | undefined {
    // Map agent IDs to their Telegram account names per openclaw.json bindings
    const accountMap: Record<string, string> = {
      main: "default",      // Eve
      code: "codebot",      // Emma
      music: "musicbot",    // Paragon
      social: "socialbot",  // Salideku
      orezi: "orezi",       // Orezi
    };
    return agentId ? accountMap[agentId] : undefined;
  }

  private runCommand(
    args: string[],
    executionTimeoutMs: number,
    totalTimeoutMs: number,
    logger: Logger
  ): Promise<ExecuteResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let executionExceeded = false;

      logger.log(`Spawning: ${args.join(' ')}`);
      logger.log(`Execution timeout: ${executionTimeoutMs}ms, Total timeout (with grace): ${totalTimeoutMs}ms`);

      // Spawn with args array - no shell escaping needed
      const child = spawn(args[0], args.slice(1), {
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

      // First timeout: warn that execution time exceeded but give grace period
      const executionTimer = setTimeout(() => {
        executionExceeded = true;
        logger.log(`Execution time exceeded ${executionTimeoutMs}ms, entering grace period for handoff...`);
      }, executionTimeoutMs);

      // Second timeout: hard kill after grace period
      const killTimer = setTimeout(() => {
        logger.error(`Total timeout exceeded (${totalTimeoutMs}ms), killing process`);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }, totalTimeoutMs);

      child.on("close", (code) => {
        clearTimeout(executionTimer);
        clearTimeout(killTimer);
        const durationMs = Date.now() - startTime;

        // If execution exceeded but we got a successful result in grace period, consider it success
        const success = code === 0;
        if (executionExceeded && success) {
          logger.log(`Execution succeeded during grace period (total: ${durationMs}ms)`);
        }

        resolve({
          success: success,
          exitCode: code ?? 1,
          output: stdout,
          error: stderr || undefined,
          durationMs,
        });
      });

      child.on("error", (err) => {
        clearTimeout(executionTimer);
        clearTimeout(killTimer);
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
