/**
 * ClawGate Watchdog - CLI
 * Monitor and cleanup stuck/orphaned agent sessions
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawn, execSync } from "child_process";
import { loadConfig } from "../scheduler/config.js";
import { LockManager } from "../scheduler/lock.js";
import { Registry } from "../scheduler/registry.js";
import { WatchdogMonitor } from "./monitor.js";

const program = new Command();

program
  .name("watchdog")
  .description("Monitor and cleanup stuck agent sessions")
  .addHelpText(
    "after",
    `
Commands:
  check       Run a one-time check
  start       Start daemon mode
  stop        Stop daemon
  status      Show watchdog status
  list        List suspicious sessions
  kill        Kill a specific session
  logs        View watchdog logs
  cron        Install cron job for periodic checks

Examples:
  clawgate watchdog check                    # One-time dry-run check
  clawgate watchdog check --auto-kill        # One-time and kill orphans
  clawgate watchdog start                    # Start background daemon
  clawgate watchdog stop                     # Stop background daemon
  clawgate watchdog list --stuck           # Show stuck sessions only
  clawgate watchdog kill <session-id>        # Manually kill session
`
  );

// Load config
const config = loadConfig();
const lockManager = new LockManager(config.paths.locksDir);
const registry = new Registry(config.paths.jobsDir, config.defaults.timeoutInSeconds);
const stateDir = join(config.paths.stateDir, "watchdog");

// ============================================================
// WATCHDOG CHECK
// ============================================================
program
  .command("check")
  .description("Run a one-time check")
  .option("--dry-run", "Preview what would be done without taking action")
  .option("--auto-kill", "Kill stuck sessions (default: just report)")
  .option("--threshold <sec>", "Silence threshold in seconds", parseInt)
  .action(async (options) => {
    try {
      const monitor = new WatchdogMonitor(lockManager, registry, stateDir, {
        autoKill: options.autoKill || false,
        stuckThresholdSec: options.threshold || 600,
      });

      console.log("Running watchdog check...\n");
      
      const result = await monitor.check({ dryRun: options.dryRun });

      // Display results
      console.log(`Check completed at ${result.timestamp}`);
      console.log(`- Total locks: ${result.totalLocks}`);
      console.log(`- Active sessions: ${result.activeSessions}`);
      console.log();

      if (result.orphaned.length > 0) {
        console.log(`⚠️  Found ${result.orphaned.length} orphaned lock(s):`);
        for (const orphan of result.orphaned) {
          console.log(`   ${orphan.jobId} (PID ${orphan.lockPid}, ${orphan.reason})`);
        }
        console.log();
      }

      if (result.stuck.length > 0) {
        console.log(`⚠️  Found ${result.stuck.length} stuck session(s):`);
        for (const stuck of result.stuck) {
          console.log(`   ${stuck.jobId}: ${stuck.silenceDurationSec}s silence (threshold: ${stuck.configuredTimeoutSec * 3}s)`);
        }
        console.log();
      }

      if (result.cleaned.length > 0) {
        console.log(`🧹 Cleaned ${result.cleaned.length} session(s):`);
        for (const cleaned of result.cleaned) {
          console.log(`   ${cleaned.jobId}: ${cleaned.action}`);
        }
        console.log();
      }

      if (result.orphaned.length === 0 && result.stuck.length === 0) {
        console.log("✅ No issues found");
      }

      // Exit with non-zero if issues found (for cron alerting)
      process.exit(result.orphaned.length + result.stuck.length > 0 ? 1 : 0);
    } catch (err) {
      console.error("Check failed:", err);
      process.exit(1);
    }
  });

// ============================================================
// WATCHDOG START/STOP
// ============================================================
program
  .command("start")
  .description("Start background daemon")
  .option("--interval <sec>", "Check interval in seconds", parseInt, 60)
  .option("--threshold <sec>", "Stuck threshold in seconds", parseInt, 600)
  .action(async (options) => {
    try {
      const monitor = new WatchdogMonitor(lockManager, registry, stateDir, {
        checkIntervalSec: options.interval,
        stuckThresholdSec: options.threshold,
        autoKill: true,
      });

      // Fork into background
      const scriptPath = new URL(import.meta.url).pathname;
      const child = spawn(
        process.execPath,
        [scriptPath, "daemon", "--interval", options.interval.toString()],
        {
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            CLAWGATE_WATCHDOG_DAEMON: "1",
          },
        }
      );

      child.unref();
      
      // Wait for PID file to appear
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await sleep(100);
        const status = monitor.getStatus();
        if (status.running) {
          console.log(`✅ Watchdog daemon started (PID: ${status.pid})`);
          process.exit(0);
        }
        attempts++;
      }

      console.log("⚠️  Daemon may have failed to start. Check logs.");
      process.exit(1);
    } catch (err) {
      console.error("Failed to start daemon:", err);
      process.exit(1);
    }
  });

program
  .command("daemon")
  .description("Internal: run in daemon mode (don't call directly)")
  .option("--interval <sec>", "Check interval", parseInt, 60)
  .action(async (options) => {
    try {
      const monitor = new WatchdogMonitor(lockManager, registry, stateDir, {
        checkIntervalSec: options.interval,
        autoKill: true,
      });

      await monitor.startDaemon();
    } catch (err) {
      console.error("Daemon error:", err);
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop background daemon")
  .action(() => {
    try {
      const monitor = new WatchdogMonitor(lockManager, registry, stateDir);
      const stopped = monitor.stopDaemon();
      
      if (stopped) {
        console.log("✅ Watchdog daemon stopped");
      } else {
        console.log("ℹ️  Daemon not running");
      }
    } catch (err) {
      console.error("Failed to stop daemon:", err);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show watchdog status")
  .action(() => {
    try {
      const monitor = new WatchdogMonitor(lockManager, registry, stateDir);
      const status = monitor.getStatus();

      if (status.running) {
        console.log(`✅ Running (PID: ${status.pid})`);
        if (status.lastCheck) {
          console.log(`   Last check: ${status.lastCheck}`);
        }
      } else {
        console.log("ℹ️  Not running");
        if (status.lastCheck) {
          console.log(`   Last check: ${status.lastCheck}`);
        }
      }
    } catch (err) {
      console.error("Failed to get status:", err);
      process.exit(1);
    }
  });

// ============================================================
// SESSION MANAGEMENT
// ============================================================
program
  .command("list")
  .description("List suspicious sessions")
  .option("--stuck", "Show only stuck sessions")
  .option("--orphaned", "Show only orphaned locks")
  .action(async (options) => {
    try {
      const monitor = new WatchdogMonitor(lockManager, registry, stateDir);
      const result = await monitor.check({ dryRun: true });

      if (options.stuck) {
        if (result.stuck.length === 0) {
          console.log("No stuck sessions");
          return;
        }
        console.log("Stuck sessions:");
        for (const s of result.stuck) {
          console.log(`  ${s.sessionId} (agent: ${s.agentId || "unknown"})`);
          console.log(`    Job: ${s.jobId}`);
          console.log(`    Silent for: ${s.silenceDurationSec}s`);
        }
        return;
      }

      if (options.orphaned) {
        if (result.orphaned.length === 0) {
          console.log("No orphaned locks");
          return;
        }
        console.log("Orphaned locks:");
        for (const o of result.orphaned) {
          console.log(`  ${o.jobId} (reason: ${o.reason})`);
        }
        return;
      }

      // Default: show both
      console.log(`Total issues: ${result.orphaned.length + result.stuck.length}`);
      if (result.orphaned.length > 0) {
        console.log(`\nOrphaned: ${result.orphaned.length}`);
        for (const o of result.orphaned) {
          console.log(`  - ${o.jobId}`);
        }
      }
      if (result.stuck.length > 0) {
        console.log(`\nStuck: ${result.stuck.length}`);
        for (const s of result.stuck) {
          console.log(`  - ${s.jobId} (${s.silenceDurationSec}s silent)`);
        }
      }
    } catch (err) {
      console.error("Failed to list:", err);
      process.exit(1);
    }
  });

program
  .command("kill <session-id>")
  .description("Kill a specific session")
  .option("-y, --yes", "Skip confirmation")
  .action(async (sessionId, options) => {
    if (!options.yes) {
      console.log(`This will kill session: ${sessionId}`);
      console.log("Use --yes to confirm");
      process.exit(1);
    }

    try {
      // Find the session first
      const result = execSync(`openclaw sessions list --json`, { encoding: "utf-8" });
      const sessions = JSON.parse(result || "[]");
      const session = sessions.find((s: any) => s.id === sessionId);

      if (!session) {
        console.error(`Session not found: ${sessionId}`);
        process.exit(2);
      }

      // Kill it
      execSync(`openclaw gateway call sessions.kill '{"sessionId": "${sessionId}"}'`);
      console.log(`✅ Killed session: ${sessionId}`);
    } catch (err) {
      console.error("Failed to kill session:", err);
      process.exit(1);
    }
  });

// ============================================================
// LOGS
// ============================================================
program
  .command("logs")
  .description("View watchdog logs")
  .option("-f, --follow", "Follow log output")
  .option("-n, --lines <n>", "Number of lines to show", parseInt, 50)
  .option("--since <duration>", "Show logs since (e.g., 1h, 30m)")
  .action((options) => {
    const logPath = join(stateDir, "watchdog.log");

    if (!existsSync(logPath)) {
      console.log("No logs yet");
      return;
    }

    try {
      if (options.follow) {
        // Use tail -f
        spawn("tail", ["-f", logPath], { stdio: "inherit" });
      } else if (options.since) {
        // Parse duration and filter
        const ms = parseDuration(options.since);
        const cutoff = Date.now() - ms;
        
        const lines = readFileSync(logPath, "utf-8").split("\n");
        const recent = lines.filter((line) => {
          const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
          if (!match) return false;
          return new Date(match[1]).getTime() > cutoff;
        });
        console.log(recent.join("\n"));
      } else {
        // Show last n lines
        const output = execSync(`tail -n ${options.lines} "${logPath}"`, { encoding: "utf-8" });
        console.log(output);
      }
    } catch (err) {
      console.error("Failed to read logs:", err);
      process.exit(1);
    }
  });

// ============================================================
// CRON INSTALL
// ============================================================
program
  .command("cron")
  .description("Install watchdog into system cron")
  .option("--interval <min>", "Check interval in minutes", parseInt, 5)
  .option("--remove", "Remove from cron instead of adding")
  .action((options) => {
    try {
      const cronLine = `*/${options.interval} * * * * clawgate watchdog check --auto-kill >> ~/.clawgate/watchdog/cron.log 2>&1`;
      
      if (options.remove) {
        // Remove existing entry
        execSync(`crontab -l | grep -v "clawgate watchdog" | crontab -`);
        console.log("✅ Watchdog removed from cron");
      } else {
        // Add entry (avoiding duplicates)
        execSync(`(crontab -l 2>/dev/null | grep -v "clawgate watchdog"; echo "${cronLine}") | crontab -`);
        console.log(`✅ Watchdog installed in cron (every ${options.interval} min)`);
      }
    } catch (err) {
      console.error("Cron operation failed:", err);
      process.exit(1);
    }
  });

// ============================================================
// HELPERS
// ============================================================
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 3600000; // Default 1 hour
  
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  
  switch (unit) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default: return 3600000;
  }
}

// Parse and run
program.parse();
