/**
 * ClawGate Message Module - Router
 * Handles message routing and delivery to agents
 */

import { spawn } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type {
  MessageTarget,
  MessagePayload,
  SendOptions,
  SendResult,
  MessageStatus,
  MessageEntry,
} from "./types.js";

export class MessageRouter {
  private openclawBin: string;
  private messageLog: Map<string, MessageStatus>;
  private logDir: string;

  constructor(openclawBin?: string) {
    this.openclawBin = openclawBin || process.env.OPENCLAW_BIN || "openclaw";
    this.messageLog = new Map();
    this.logDir = path.join(process.env.HOME || "/tmp", ".clawgate", "messages");
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getReplyAccount(agentId?: string): string | undefined {
    const accountMap: Record<string, string> = {
      main: "default",
      code: "codebot",
      music: "musicbot",
      social: "socialbot",
      orezi: "orezi",
    };
    return agentId ? accountMap[agentId] : undefined;
  }

  async send(
    target: MessageTarget,
    payload: MessagePayload,
    options: SendOptions = {}
  ): Promise<SendResult> {
    const startTime = Date.now();
    const messageId = randomUUID();

    // Create status entry
    const status: MessageStatus = {
      id: messageId,
      status: "pending",
      agentId: target.agentId,
      sentAt: new Date().toISOString(),
    };
    this.messageLog.set(messageId, status);

    try {
      // Build command
      const args = this.buildCommand(target, payload);

      if (options.dryRun) {
        return {
          success: true,
          messageId,
          durationMs: Date.now() - startTime,
        };
      }

      // Execute
      const result = await this.runCommand(
        args,
        options.timeoutMs || 60000,
        options.verbose
      );

      // Update status
      if (result.success) {
        status.status = options.requestReply ? "delivered" : "sent";
        status.deliveredAt = new Date().toISOString();

        // Handle response if requested
        if (options.requestReply && result.output) {
          status.status = "responded";
          status.responseAt = new Date().toISOString();
          status.response = result.output;
        }
      } else {
        status.status = "failed";
        status.error = result.error;
      }

      // Persist to disk
      this.persistStatus(status);

      return {
        success: result.success,
        messageId,
        response: status.response,
        error: result.error,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      status.status = "failed";
      status.error = String(err);
      this.persistStatus(status);

      return {
        success: false,
        messageId,
        error: String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private buildCommand(target: MessageTarget, payload: MessagePayload): string[] {
    const args = [this.openclawBin, "agent"];

    if (target.agentId) {
      args.push("--agent", target.agentId);
    }

    args.push("--message", payload.content);

    if (target.channel) {
      args.push("--channel", target.channel);
    }

    if (target.to) {
      args.push("--to", target.to);
    }

    const replyAccount = this.getReplyAccount(target.agentId);
    if (replyAccount) {
      args.push("--reply-account", replyAccount);
    }

    args.push("--deliver");

    return args;
  }

  private runCommand(
    args: string[],
    timeoutMs: number,
    verbose?: boolean
  ): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      if (verbose) {
        console.log(`Spawning: ${args.join(" ")}`);
      }

      const child = spawn(args[0], args.slice(1), {
        stdio: verbose ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      if (!verbose) {
        child.stdout?.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr?.on("data", (data) => {
          stderr += data.toString();
        });
      }

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr || undefined,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: stdout,
          error: err.message,
        });
      });
    });
  }

  private persistStatus(status: MessageStatus): void {
    const filePath = path.join(this.logDir, `${status.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(status, null, 2));
  }

  getMessageStatus(messageId: string): MessageStatus | undefined {
    // Check in-memory first
    if (this.messageLog.has(messageId)) {
      return this.messageLog.get(messageId);
    }

    // Check disk
    const filePath = path.join(this.logDir, `${messageId}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }

    return undefined;
  }

  getRecentMessages(
    limit: number = 20,
    filters?: { agent?: string; handoffsOnly?: boolean }
  ): MessageEntry[] {
    const entries: MessageEntry[] = [];

    // Read from disk
    try {
      const files = fs.readdirSync(this.logDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.logDir, file), "utf-8");
          const status: MessageStatus = JSON.parse(content);

          // Apply filters
          if (filters?.agent && status.agentId !== filters.agent) {
            continue;
          }

          entries.push({
            id: status.id,
            type: filters?.handoffsOnly ? "handoff" : "message",
            agentId: status.agentId,
            toAgent: status.toAgent,
            status: status.status,
            sentAt: status.sentAt,
          });
        } catch {
          // Skip corrupt files
        }
      }
    } catch {
      // Directory might not exist yet
    }

    // Sort by time descending
    entries.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    return entries.slice(0, limit);
  }

  async acknowledge(
    messageId: string,
    options: { status?: string; reply?: string }
  ): Promise<{ success: boolean }> {
    const status = this.getMessageStatus(messageId);
    if (!status) {
      return { success: false };
    }

    if (options.status) {
      status.status = options.status as MessageStatus["status"];
    }

    if (options.reply) {
      status.response = options.reply;
      status.status = "responded";
      status.responseAt = new Date().toISOString();
    }

    this.persistStatus(status);
    this.messageLog.set(messageId, status);

    return { success: true };
  }
}
