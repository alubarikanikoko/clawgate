#!/usr/bin/env node
/**
 * ClawGate Self-Watchdog - CLI
 * Detect when primary agent goes idle/stalls
 */

import { Command } from "commander";
import { 
  register, 
  pong, 
  status, 
  list, 
  remove, 
  checkExpired,
  executeAction,
  recover,
  isSubagentActuallyStuck,
  getSubagentOutputTimestamp,
  getTokenDelta,
  getMemoryFileMtime
} from "./index.js";
import { SelfWatchdogAction } from "./types.js";

const program = new Command();

program
  .name("self-watchdog")
  .description("Self-watchdog - Monitor primary agent activity with timeout detection")
  .addHelpText(
    "after",
    `
Commands:
  self         Register a self-watchdog for an agent
  pong         Reset idle timer (pong/activity)
  self-status  Check watchdog status
  self-list    List all active self-watchdogs
  self-remove  Remove a self-watchdog
  check        Check if watchdog has expired and execute action

Examples:
  clawgate watchdog self --agent eve --timeout 15 --action notify-user
  clawgate watchdog pong --agent eve
  clawgate watchdog self-status --agent eve
  clawgate watchdog self-list
  clawgate watchdog self-remove --agent eve
`
  );

// ============================================================
// SELF-WATCHDOG COMMANDS (subcommands of main watchdog)
// ============================================================

// These commands will be registered in the parent CLI via addCommand
// But we also export a standalone version for testing

export function createSelfWatchdogCommands(): Command {
  const selfCmd = new Command("self");
  
  // SELF - Register watchdog
  selfCmd
    .command("register")
    .description("Register a self-watchdog for an agent")
    .requiredOption("--agent <id>", "Agent ID to monitor")
    .requiredOption("--timeout <minutes>", "Timeout in minutes", parseInt)
    .requiredOption("--action <action>", "Action on timeout (notify-user, message-agent, create-reminder, checkpoint-status-report, escalate-to-human)")
    .action((options) => {
      try {
        const validActions: SelfWatchdogAction[] = [
          "notify-user",
          "message-agent",
          "create-reminder",
          "checkpoint-status-report",
          "escalate-to-human",
        ];
        
        if (!validActions.includes(options.action)) {
          console.error(`Invalid action: ${options.action}`);
          console.error(`Valid actions: ${validActions.join(", ")}`);
          process.exit(1);
        }
        
        const state = register(options.agent, options.timeout, options.action);
        console.log(`✅ Self-watchdog registered for agent: ${state.agentId}`);
        console.log(`   Timeout: ${state.timeoutMinutes} minutes`);
        console.log(`   Action: ${state.action}`);
        console.log(`   Last activity: ${state.lastActivity}`);
        process.exit(0);
      } catch (err) {
        console.error("Failed to register watchdog:", err);
        process.exit(1);
      }
    });

  // Alternative: inline command (used by parent cli)
  selfCmd
    .description("Register a self-watchdog for an agent")
    .option("--agent <id>", "Agent ID to monitor")
    .option("--timeout <minutes>", "Timeout in minutes", parseInt, 15)
    .option("--action <action>", "Action on timeout", "notify-user")
    .action((options) => {
      try {
        if (!options.agent) {
          console.error("--agent is required");
          process.exit(1);
        }
        
        const validActions: SelfWatchdogAction[] = [
          "notify-user",
          "message-agent",
          "create-reminder",
          "checkpoint-status-report",
          "escalate-to-human",
        ];
        
        if (!validActions.includes(options.action)) {
          console.error(`Invalid action: ${options.action}`);
          console.error(`Valid actions: ${validActions.join(", ")}`);
          process.exit(1);
        }
        
        const state = register(options.agent, options.timeout, options.action);
        console.log(`✅ Self-watchdog registered for agent: ${state.agentId}`);
        console.log(`   Timeout: ${state.timeoutMinutes} minutes`);
        console.log(`   Action: ${state.action}`);
        console.log(`   Created: ${state.createdAt}`);
        process.exit(0);
      } catch (err) {
        console.error("Failed to register watchdog:", err);
        process.exit(1);
      }
    });
  
  return selfCmd;
}

// ============================================================
// PONG - Reset idle timer
// ============================================================
export function createPongCommand(): Command {
  return new Command("pong")
    .description("Reset idle timer for an agent")
    .requiredOption("--agent <id>", "Agent ID")
    .action((options) => {
      try {
        const state = pong(options.agent);
        
        if (!state) {
          console.error(`No watchdog found for agent: ${options.agent}`);
          process.exit(1);
        }
        
        console.log(`✅ Pong recorded for agent: ${state.agentId}`);
        console.log(`   Last activity: ${state.lastActivity}`);
        process.exit(0);
      } catch (err) {
        console.error("Failed to pong:", err);
        process.exit(1);
      }
    });
}

// ============================================================
// SELF-STATUS - Check status
// ============================================================
export function createSelfStatusCommand(): Command {
  return new Command("self-status")
    .description("Check self-watchdog status")
    .requiredOption("--agent <id>", "Agent ID")
    .action((options) => {
      try {
        const s = status(options.agent);
        
        if (!s.active) {
          console.log(`No self-watchdog found for agent: ${options.agent}`);
          process.exit(0);
        }
        
        const idleMinutes = Math.floor(s.timeSinceLastPongMs / 60000);
        const idleSeconds = Math.floor((s.timeSinceLastPongMs % 60000) / 1000);
        
        console.log(`Self-watchdog status for: ${s.agentId}`);
        console.log(`  Active: ${s.active ? "yes" : "no"}`);
        console.log(`  Timeout: ${s.timeoutMinutes} minutes`);
        console.log(`  Action: ${s.action}`);
        console.log(`  Last activity: ${s.lastActivity}`);
        console.log(`  Time since last pong: ${idleMinutes}m ${idleSeconds}s`);
        console.log(`  Expired: ${s.isExpired ? "YES ⚠️" : "No"}`);
        
        process.exit(s.isExpired ? 1 : 0);
      } catch (err) {
        console.error("Failed to get status:", err);
        process.exit(1);
      }
    });
}

// ============================================================
// SELF-LIST - List active watchdogs
// ============================================================
export function createSelfListCommand(): Command {
  return new Command("self-list")
    .description("List all active self-watchdogs")
    .action(() => {
      try {
        const states = list();
        
        if (states.length === 0) {
          console.log("No active self-watchdogs");
          process.exit(0);
        }
        
        console.log(`Active self-watchdogs: ${states.length}`);
        console.log();
        
        for (const state of states) {
          const idleMs = Date.now() - new Date(state.lastActivity).getTime();
          const idleMinutes = Math.floor(idleMs / 60000);
          const isExpired = idleMs > state.timeoutMinutes * 60 * 1000;
          
          console.log(`Agent: ${state.agentId}`);
          console.log(`  Timeout: ${state.timeoutMinutes} minutes`);
          console.log(`  Action: ${state.action}`);
          console.log(`  Idle for: ${idleMinutes} minutes`);
          console.log(`  Status: ${isExpired ? "⏰ EXPIRED" : "✅ Active"}`);
          console.log();
        }
        
        process.exit(0);
      } catch (err) {
        console.error("Failed to list:", err);
        process.exit(1);
      }
    });
}

// ============================================================
// SELF-REMOVE - Remove watchdog
// ============================================================
export function createSelfRemoveCommand(): Command {
  return new Command("self-remove")
    .description("Remove a self-watchdog")
    .requiredOption("--agent <id>", "Agent ID")
    .action((options) => {
      try {
        const success = remove(options.agent);
        
        if (success) {
          console.log(`✅ Self-watchdog removed for agent: ${options.agent}`);
        } else {
          console.log(`No watchdog found for agent: ${options.agent}`);
        }
        
        process.exit(0);
      } catch (err) {
        console.error("Failed to remove:", err);
        process.exit(1);
      }
    });
}

// ============================================================
// CHECK - Check expired and execute action
// ============================================================
export function createSelfCheckCommand(): Command {
  return new Command("self-check")
    .description("Check if watchdog expired and execute action")
    .requiredOption("--agent <id>", "Agent ID")
    .option("--execute", "Execute the configured action if expired")
    .action(async (options) => {
      try {
        const result = checkExpired(options.agent);
        
        if (!result.expired) {
          console.log(`Agent ${options.agent} is active (${result.idleMinutes}m idle)`);
          process.exit(0);
        }
        
        console.log(`⚠️ Watchdog expired for ${options.agent}`);
        console.log(`   Idle for: ${result.idleMinutes} minutes`);
        console.log(`   Action: ${result.action}`);
        
        if (options.execute && result.action) {
          const actionResult = await executeAction(options.agent, result.action, result.idleMinutes);
          console.log();
          console.log("Action result:");
          console.log(actionResult.message);
          process.exit(actionResult.success ? 0 : 1);
        }
        
        process.exit(1);
      } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
      }
    });
}

// ============================================================
// STANDALONE CLI (for testing)
// ============================================================
program
  .command("register", "Register self-watchdog")
  .addCommand(createSelfWatchdogCommands());

program
  .command("pong")
  .description("Reset idle timer")
  .requiredOption("--agent <id>", "Agent ID")
  .action((options) => {
    const state = pong(options.agent);
    if (!state) {
      console.error("No watchdog found");
      process.exit(1);
    }
    console.log(`Pong recorded for ${state.agentId}`);
  });

// ============================================================
// ACTIVITY CHECK COMMANDS
// ============================================================

program
  .command("activity-check")
  .description("Check if a subagent is actually stuck vs busy")
  .requiredOption("--subagent <id>", "Subagent ID to check")
  .option("--runtime <minutes>", "Current runtime in minutes", parseInt, 30)
  .action(async (options) => {
    try {
      const check = await isSubagentActuallyStuck(options.subagent, options.runtime);
      
      console.log(`Activity check for ${options.subagent}:\n`);
      console.log(`  Status: ${check.stuck ? "🔴 STUCK" : "🟢 BUSY/ACTIVE"}`);
      console.log(`  Reason: ${check.reason}`);
      console.log(`\nMetrics:`);
      console.log(`  Token count: ${check.metrics.tokenCount}`);
      console.log(`  Token delta: ${check.metrics.tokenDelta}`);
      console.log(`  Last token activity: ${check.metrics.minutesSinceTokenActivity}min ago`);
      console.log(`  Last output: ${check.metrics.minutesSinceOutput}min ago`);
      console.log(`  Last memory update: ${check.metrics.minutesSinceMemoryUpdate}min ago`);
      
      process.exit(check.stuck ? 1 : 0);
    } catch (err) {
      console.error("Activity check failed:", err);
      process.exit(1);
    }
  });

program
  .command("token-info")
  .description("Get token and activity info for a subagent")
  .requiredOption("--subagent <id>", "Subagent ID")
  .action((options) => {
    try {
      const output = getSubagentOutputTimestamp(options.subagent);
      const delta = getTokenDelta(options.subagent);
      const mtime = getMemoryFileMtime(options.subagent);
      
      console.log(`Token info for ${options.subagent}:\n`);
      console.log(`  Current tokens: ${output.tokenCount}`);
      console.log(`  Token delta: ${delta.tokenDelta}`);
      console.log(`  Last output timestamp: ${output.timestamp || "N/A"}`);
      console.log(`  Last token checkpoint: ${delta.lastTokenTimestamp || "N/A"}`);
      console.log(`  Memory file mtime: ${mtime || "N/A"}`);
      
      process.exit(0);
    } catch (err) {
      console.error("Token info failed:", err);
      process.exit(1);
    }
  });

program
  .command("recover")
  .description("Run autonomous recovery with activity detection")
  .requiredOption("--agent <id>", "Agent ID to recover")
  .action(async (options) => {
    try {
      console.log(`Running recovery for ${options.agent}...\n`);
      const result = await recover(options.agent);
      
      console.log(`Recovery result:`);
      console.log(`  Action: ${result.action}`);
      console.log(`  Details: ${result.details}`);
      console.log(`  Checkpoint: ${result.checkpoint || "N/A"}`);
      console.log(`  Project: ${result.project || "N/A"}`);
      console.log(`  Phase: ${result.phase || "N/A"}`);
      console.log(`  Subagent: ${result.subagentId || "N/A"}`);
      console.log(`  Runtime: ${result.runtimeMinutes || "N/A"} minutes`);
      if (result.reason) {
        console.log(`  Reason: ${result.reason}`);
      }
      
      process.exit(result.action === 'escalate' ? 1 : 0);
    } catch (err) {
      console.error("Recovery failed:", err);
      process.exit(1);
    }
  });

program.parse();
