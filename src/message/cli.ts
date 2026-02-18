#!/usr/bin/env node
/**
 * ClawGate Message Module - Agent-to-Agent Communication
 * Immediate messaging between agents with handoff capabilities
 */

import { Command } from "commander";
import { loadConfig } from "../scheduler/config.js";
import { MessageRouter } from "./router.js";
import { HandoffManager } from "./handoff.js";
import type { MessageTarget, MessagePayload, HandoffContext } from "./types.js";

const program = new Command();

program
  .name("clawgate message")
  .description("Agent-to-agent communication and handoff")
  .version("0.2.0");

const config = loadConfig();
const router = new MessageRouter(config.openclaw.bin);
const handoffManager = new HandoffManager();

// ============================================================
// COMMANDS
// ============================================================

/**
 * Send immediate message to another agent
 */
program
  .command("send")
  .description("Send immediate message to an agent")
  .option("-a, --agent <agent>", "Target agent ID (required)")
  .option("-m, --message <message>", "Message content (required)")
  .option("-c, --channel <channel>", "Channel", "telegram")
  .option("-t, --to <to>", "Target recipient")
  .option("--request-reply", "Wait for reply from target agent (long timeout)")
  .option("--background", "Fire-and-forget mode (don't wait for reply)")
  .option("--timeout <ms>", "Timeout in milliseconds (default: 300000 = 5 min for agent tasks)")
  .option("--priority <priority>", "Message priority: low, normal, high", "normal")
  .option("--dry-run", "Preview without sending")
  .option("--verbose", "Verbose output")
  .action(async (options) => {
    try {
      if (!options.agent || !options.message) {
        console.error("Error: --agent and --message are required");
        console.log("\nExamples:");
        console.log('  clawgate message send --agent music --message "Generate playlist"');
        console.log('  clawgate message send --agent code --message "Review this" --background');
        console.log('  clawgate message send --agent music --message "Urgent task" --request-reply --timeout 600000');
        process.exit(1);
      }

      const target: MessageTarget = {
        agentId: options.agent,
        channel: options.channel,
        to: options.to,
      };

      const payload: MessagePayload = {
        type: "text",
        content: options.message,
        priority: options.priority as "low" | "normal" | "high",
      };

      // Default timeout: 5 minutes (agent tasks often take time)
      // Background mode: no waiting at all
      const timeoutMs = options.timeout ? parseInt(options.timeout) : 300000;

      const sendOptions = {
        requestReply: options.requestReply,
        background: options.background,
        timeoutMs: timeoutMs,
        dryRun: options.dryRun,
        verbose: options.verbose,
      };

      if (options.dryRun) {
        console.log("📤 Dry run - would send:");
        console.log(`   To: ${target.agentId}`);
        console.log(`   Channel: ${target.channel}`);
        console.log(`   Message: ${payload.content.slice(0, 100)}${payload.content.length > 100 ? "..." : ""}`);
        if (sendOptions.background) {
          console.log("   Mode: Background (fire-and-forget)");
        } else if (sendOptions.requestReply) {
          console.log(`   Mode: Request reply (timeout: ${timeoutMs}ms)`);
        } else {
          console.log(`   Mode: Send only (timeout: ${timeoutMs}ms)`);
        }
        return;
      }

      if (options.background) {
        console.log(`📤 Sending message to ${target.agentId} (background mode)...`);
      } else {
        console.log(`📤 Sending message to ${target.agentId}...`);
        if (options.requestReply) {
          console.log(`   ⏳ Waiting for reply (timeout: ${Math.round(timeoutMs/1000)}s)...`);
        }
      }

      const result = await router.send(target, payload, sendOptions);

      if (result.success) {
        console.log(`✅ Message sent successfully (${result.durationMs}ms)`);
        if (options.background) {
          console.log("   📝 Agent will process in background. Check status with:");
          console.log(`      clawgate message status ${result.messageId}`);
        }
        if (result.response) {
          console.log("\n📨 Response received:");
          console.log(result.response);
        }
        if (result.messageId) {
          console.log(`\nMessage ID: ${result.messageId}`);
        }
        process.exit(0);
      } else {
        console.error("❌ Failed to send message");
        if (result.error) {
          console.error(`Error: ${result.error}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      process.exit(1);
    }
  });

/**
 * Handoff conversation to another agent
 */
program
  .command("handoff")
  .description("Handoff conversation to another agent with context")
  .option("-a, --agent <agent>", "Target agent ID to handoff to (required)")
  .option("-m, --message <message>", "Handoff message/prompt")
  .option("--context <json>", "JSON context to pass to target agent")
  .option("--context-file <file>", "File containing context JSON")
  .option("--deliver-to <recipient>", "Override recipient for this handoff")
  .option("--return-after", "Expect to return to original agent after completion")
  .option("--return-timeout <ms>", "Timeout for return handoff", "300000")
  .option("--dry-run", "Preview without executing")
  .action(async (options) => {
    try {
      if (!options.agent) {
        console.error("Error: --agent is required");
        console.log("\nExample:");
        console.log('  clawgate message handoff --agent code --message "Review this code"');
        process.exit(1);
      }

      // Parse context
      let context: HandoffContext = {};
      if (options.context) {
        try {
          context = JSON.parse(options.context);
        } catch (err) {
          console.error("Error: Invalid JSON in --context");
          process.exit(1);
        }
      } else if (options.contextFile) {
        const fs = await import("fs");
        try {
          const content = fs.readFileSync(options.contextFile, "utf-8");
          context = JSON.parse(content);
        } catch (err) {
          console.error(`Error: Cannot read context file: ${err}`);
          process.exit(1);
        }
      }

      // Build handoff request
      const handoff = {
        fromAgent: process.env.OPENCLAW_AGENT_ID || "unknown",
        toAgent: options.agent,
        message: options.message,
        context,
        deliverTo: options.deliverTo,
        returnAfter: options.returnAfter,
        returnTimeoutMs: parseInt(options.returnTimeout),
      };

      if (options.dryRun) {
        console.log("🔄 Dry run - would handoff:");
        console.log(`   From: ${handoff.fromAgent}`);
        console.log(`   To: ${handoff.toAgent}`);
        console.log(`   Message: ${handoff.message?.slice(0, 100) || "(none)"}`);
        console.log(`   Context keys: ${Object.keys(context).join(", ") || "(none)"}`);
        if (handoff.returnAfter) {
          console.log(`   Return: Yes (timeout ${handoff.returnTimeoutMs}ms)`);
        }
        return;
      }

      console.log(`🔄 Handoff to ${handoff.toAgent}...`);

      const result = await handoffManager.execute(handoff, router);

      if (result.success) {
        console.log(`✅ Handoff completed (${result.durationMs}ms)`);
        if (result.response) {
          console.log("\n📨 Response:");
          console.log(result.response);
        }
        if (result.handoffLogId) {
          console.log(`\nHandoff Log: ${result.handoffLogId}`);
        }
        process.exit(0);
      } else {
        console.error("❌ Handoff failed");
        if (result.error) {
          console.error(`Error: ${result.error}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error("Failed to execute handoff:", err);
      process.exit(1);
    }
  });

/**
 * Query message status/log
 */
program
  .command("status <messageId>")
  .description("Check status of a sent message")
  .option("--json", "Output as JSON")
  .action((messageId, options) => {
    const status = router.getMessageStatus(messageId);

    if (!status) {
      console.error(`Message not found: ${messageId}`);
      process.exit(2);
    }

    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    console.log(`Message: ${messageId}`);
    console.log(`Status: ${status.status}`);
    console.log(`Sent: ${status.sentAt}`);
    if (status.deliveredAt) {
      console.log(`Delivered: ${status.deliveredAt}`);
    }
    if (status.responseAt) {
      console.log(`Response: ${status.responseAt}`);
    }
    if (status.error) {
      console.log(`Error: ${status.error}`);
    }
  });

/**
 * List recent messages/handoffs
 */
program
  .command("list")
  .description("List recent messages and handoffs")
  .option("--agent <agent>", "Filter by agent")
  .option("--handoffs", "Show only handoffs")
  .option("--limit <n>", "Number of entries", "20")
  .option("--json", "Output as JSON")
  .action((options) => {
    const limit = parseInt(options.limit);
    const entries = router.getRecentMessages(limit, {
      agent: options.agent,
      handoffsOnly: options.handoffs,
    });

    if (options.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    console.log(`${"ID".padEnd(36)} ${"Type".padEnd(8)} ${"To".padEnd(10)} ${"Status".padEnd(10)} ${"Time"}`);
    console.log("-".repeat(80));

    for (const entry of entries) {
      const time = new Date(entry.sentAt).toLocaleTimeString();
      console.log(
        `${entry.id.slice(0, 36).padEnd(36)} ${(entry.type || "msg").padEnd(8)} ${(entry.toAgent || entry.agentId || "?").slice(0, 10).padEnd(10)} ${entry.status.padEnd(10)} ${time}`
      );
    }
  });

/**
 * Acknowledge/reply to a message (for receiving agents)
 */
program
  .command("ack <messageId>")
  .description("Acknowledge and optionally reply to a message")
  .option("-r, --reply <message>", "Reply message")
  .option("--status <status>", "Status: received, processing, completed, failed", "received")
  .action(async (messageId, options) => {
    try {
      const result = await router.acknowledge(messageId, {
        status: options.status,
        reply: options.reply,
      });

      if (result.success) {
        console.log(`✅ Acknowledged ${messageId}`);
        if (options.reply) {
          console.log("Reply sent");
        }
      } else {
        console.error("❌ Failed to acknowledge");
        process.exit(1);
      }
    } catch (err) {
      console.error("Failed to acknowledge:", err);
      process.exit(1);
    }
  });

// Parse and run
program.parse();
