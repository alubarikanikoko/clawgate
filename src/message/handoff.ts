/**
 * ClawGate Message Module - Handoff Manager
 * Manages agent-to-agent handoffs with context preservation
 */

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type {
  HandoffRequest,
  HandoffResult,
  HandoffLog,
  MessageTarget,
  MessagePayload,
} from "./types.js";
import type { MessageRouter } from "./router.js";

export class HandoffManager {
  private handoffLog: Map<string, HandoffLog>;
  private logDir: string;

  constructor() {
    this.handoffLog = new Map();
    this.logDir = path.join(process.env.HOME || "/tmp", ".clawgate", "handoffs");
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async execute(handoff: HandoffRequest, router: MessageRouter): Promise<HandoffResult> {
    const startTime = Date.now();
    const handoffId = randomUUID();

    // Create handoff log
    const log: HandoffLog = {
      id: handoffId,
      fromAgent: handoff.fromAgent,
      toAgent: handoff.toAgent,
      message: handoff.message,
      context: handoff.context,
      startedAt: new Date().toISOString(),
      status: "pending",
    };
    this.handoffLog.set(handoffId, log);
    this.persistLog(log);

    try {
      // Build handoff message with context
      const handoffMessage = this.buildHandoffMessage(handoff);

      // Send to target agent
      const target: MessageTarget = {
        agentId: handoff.toAgent,
        to: handoff.deliverTo,
      };

      const payload: MessagePayload = {
        type: "text",
        content: handoffMessage,
        priority: "high", // Handoffs are high priority
      };

      const sendResult = await router.send(target, payload, {
        requestReply: true,
        timeoutMs: handoff.returnTimeoutMs || 300000,
      });

      if (sendResult.success) {
        log.status = handoff.returnAfter ? "active" : "completed";
        log.completedAt = new Date().toISOString();
        log.response = sendResult.response;

        // If expecting return, we don't mark as completed yet
        if (handoff.returnAfter) {
          log.status = "active";
        }
      } else {
        log.status = "failed";
        log.error = sendResult.error;
      }

      this.persistLog(log);

      return {
        success: sendResult.success,
        handoffLogId: handoffId,
        response: sendResult.response,
        error: sendResult.error,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      log.status = "failed";
      log.error = String(err);
      this.persistLog(log);

      return {
        success: false,
        handoffLogId: handoffId,
        error: String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private buildHandoffMessage(handoff: HandoffRequest): string {
    const parts: string[] = [];

    // Context header
    parts.push("🔄 HANDOFF REQUEST");
    parts.push("");
    parts.push(`From: ${handoff.fromAgent}`);
    parts.push(`To: ${handoff.toAgent}`);
    if (handoff.context.conversationId) {
      parts.push(`Conversation: ${handoff.context.conversationId}`);
    }
    parts.push("");

    // Previous agents chain
    if (handoff.context.previousAgents && handoff.context.previousAgents.length > 0) {
      parts.push(`Previous agents: ${handoff.context.previousAgents.join(" → ")}`);
      parts.push("");
    }

    // Original request
    if (handoff.context.originalRequest) {
      parts.push("📋 ORIGINAL REQUEST:");
      parts.push(handoff.context.originalRequest);
      parts.push("");
    }

    // Handoff message
    if (handoff.message) {
      parts.push("📝 HANDOFF MESSAGE:");
      parts.push(handoff.message);
      parts.push("");
    }

    // Artifacts
    if (handoff.context.artifacts && handoff.context.artifacts.length > 0) {
      parts.push("📎 ARTIFACTS:");
      for (const artifact of handoff.context.artifacts) {
        parts.push(`  - ${artifact}`);
      }
      parts.push("");
    }

    // Data payload
    if (handoff.context.data && Object.keys(handoff.context.data).length > 0) {
      parts.push("📊 DATA:");
      for (const [key, value] of Object.entries(handoff.context.data)) {
        parts.push(`  ${key}: ${JSON.stringify(value)}`);
      }
      parts.push("");
    }

    // Return instruction
    if (handoff.returnAfter) {
      parts.push("⏰ RETURN EXPECTED");
      parts.push(`Timeout: ${handoff.returnTimeoutMs || 300000}ms`);
      parts.push("");
    }

    // Action request
    parts.push("🔔 Please acknowledge receipt and provide your response.");

    return parts.join("\n");
  }

  private persistLog(log: HandoffLog): void {
    const filePath = path.join(this.logDir, `${log.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(log, null, 2));
  }

  getHandoffLog(handoffId: string): HandoffLog | undefined {
    // Check in-memory first
    if (this.handoffLog.has(handoffId)) {
      return this.handoffLog.get(handoffId);
    }

    // Check disk
    const filePath = path.join(this.logDir, `${handoffId}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }

    return undefined;
  }

  getActiveHandoffs(agentId?: string): HandoffLog[] {
    const logs: HandoffLog[] = [];

    try {
      const files = fs.readdirSync(this.logDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.logDir, file), "utf-8");
          const log: HandoffLog = JSON.parse(content);

          if (log.status === "active" || log.status === "pending") {
            if (!agentId || log.toAgent === agentId || log.fromAgent === agentId) {
              logs.push(log);
            }
          }
        } catch {
          // Skip corrupt files
        }
      }
    } catch {
      // Directory might not exist
    }

    return logs.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  async completeHandoff(
    handoffId: string,
    response: string,
    returnRouter?: MessageRouter
  ): Promise<{ success: boolean }> {
    const log = this.getHandoffLog(handoffId);
    if (!log) {
      return { success: false };
    }

    log.status = "completed";
    log.completedAt = new Date().toISOString();
    log.response = response;

    this.persistLog(log);
    this.handoffLog.set(handoffId, log);

    // If expecting return and router provided, send back
    if (returnRouter) {
      const target: MessageTarget = {
        agentId: log.fromAgent,
      };

      const payload: MessagePayload = {
        type: "text",
        content: `🔄 HANDOFF COMPLETED\n\nOriginal: ${log.message?.slice(0, 100) || "N/A"}\n\nResponse:\n${response}`,
        priority: "normal",
      };

      await returnRouter.send(target, payload, { requestReply: false });
    }

    return { success: true };
  }
}
