#!/usr/bin/env node
/**
 * ClawGate Scheduler - CLI
 * Module: Schedule - System cron wrapper for OpenClaw
 */

import { Command } from "commander";
import { loadConfig } from "./config.js";
import { Registry } from "./registry.js";
import { LockManager } from "./lock.js";
import { Executor } from "./executor.js";
import { createLogger } from "./logger.js";
import {
  addToCrontab,
  removeFromCrontab,
  listCrontabEntries,
  validateCronExpression,
} from "./cron.js";
import { validateCreateInput, formatValidationErrors } from "./validator.js";
import { parseSchedule, getScheduleExamples } from "./schedule-parser.js";
import type { CreateJobInput, JobTarget, JobPayload } from "./types.js";

const program = new Command();

program
  .name("clawgate")
  .description("ClawGate - Cross-agent messaging toolkit")
  .version("0.1.0")
  .addHelpText(
    "after",
    `
Modules:
  schedule    System cron wrapper for scheduled agent messaging
  watchdog    (planned) Monitor agent health and restart stuck sessions
  bridge      (planned) Webhook adapter for external services
  queue       (planned) Persistent job queue with retry logic
  audit       (planned) Log and audit cross-agent messages

Use 'clawgate <module> --help' for module-specific help.
`
  );

// Initialize config and registry
const config = loadConfig();
const registry = new Registry(config.paths.jobsDir);
const lockManager = new LockManager(config.paths.locksDir);
const executor = new Executor(
  lockManager,
  config.paths.templatesDir,
  config.defaults.timeoutMs,
  config.openclaw.bin
);

// ============================================================
// SCHEDULE MODULE
// ============================================================
// When used as an executable subcommand from main CLI, we receive
// args directly (e.g., "list" not "schedule list"). So we attach
// commands directly to program instead of creating a subcommand.
const scheduleCmd = program;

scheduleCmd
  .command("create")
  .description("Create a new scheduled job")
  .option("-n, --name <name>", "Job name")
  .option("-d, --description <desc>", "Job description")
  .option("-s, --schedule <cron>", "Schedule expression (e.g., '0 9 * * *', '9am every Monday', 'every 15 minutes')")
  .option("--examples", "Show schedule expression examples")
  .option("-z, --timezone <tz>", "Timezone (default: Europe/Vilnius)")
  .option("-a, --agent <agent>", "Target agent ID")
  .option("-m, --message <message>", "Message/payload content")
  .option("-c, --channel <channel>", "Channel (telegram, slack, etc)", "telegram")
  .option("--account <account>", "Account ID (for message target)")
  .option("-t, --to <to>", "Target recipient (optional, defaults to session user)")
  .option("--type <type>", "Target type: agent or message", "agent")
  .option("--disabled", "Create as disabled")
  .option("--auto-delete", "Delete job after successful execution (one-time job)")
  .option("--dry-run", "Preview without creating")
  .action((options) => {
    try {
      // Show examples if requested
      if (options.examples) {
        console.log("Schedule expression examples:");
        console.log();
        const examples = getScheduleExamples();
        for (const ex of examples) {
          console.log(`  ${ex}`);
        }
        console.log();
        console.log("You can also use standard cron expressions like '0 9 * * 1'");
        return;
      }

      // Parse the schedule expression
      let parsedSchedule;
      try {
        parsedSchedule = parseSchedule(options.schedule);
      } catch (err) {
        console.error(`Schedule parsing error: ${err}`);
        console.log();
        console.log("Examples:");
        const examples = getScheduleExamples();
        for (const ex of examples) {
          console.log(`  ${ex}`);
        }
        process.exit(5);
      }

      // Build input
      const target: JobTarget = {
        type: options.type,
        agentId: options.agent,
        channel: options.channel,
        account: options.account,
        to: options.to,
      };

      const payload: JobPayload = {
        type: "text",
        content: options.message,
      };

      const input: CreateJobInput = {
        name: options.name,
        description: parsedSchedule.description,
        schedule: parsedSchedule.cronExpression,
        timezone: options.timezone || config.defaults.timezone,
        target,
        payload,
        enabled: !options.disabled,
        autoDelete: options.autoDelete || parsedSchedule.isOneTime || false,
        maxRuns: parsedSchedule.maxRuns,
      };

      // Validate
      const validation = validateCreateInput(input);
      if (!validation.valid) {
        console.error("Validation errors:");
        console.error(formatValidationErrors(validation.errors));
        process.exit(5);
      }

      // Validate cron
      if (!validateCronExpression(input.schedule)) {
        console.error(
          "Invalid cron expression generated. This is a bug - please report."
        );
        process.exit(5);
      }

      if (options.dryRun) {
        console.log("Dry run - would create job:");
        console.log(JSON.stringify(input, null, 2));
        console.log();
        if (parsedSchedule.maxRuns) {
          console.log(`Note: This job will auto-delete after ${parsedSchedule.maxRuns} runs`);
        }
        return;
      }

      // Create job
      const job = registry.create(input);

      // Add to crontab
      addToCrontab(job.id, input.schedule);

      console.log(`✅ Created job ${job.id} (${job.name})`);
      console.log(`   Schedule: ${parsedSchedule.description} (${parsedSchedule.cronExpression})`);
      if (parsedSchedule.maxRuns) {
        console.log(`   Will run ${parsedSchedule.maxRuns} time(s), then auto-delete`);
      }
      if (parsedSchedule.isOneTime) {
        console.log(`   One-time job`);
      }
      console.log(`   Target: ${target.type} ${target.agentId || ""}`);
      if (target.to) {
        console.log(`   To: ${target.to}`);
      }
    } catch (err) {
      console.error("Failed to create job:", err);
      process.exit(1);
    }
  });

scheduleCmd
  .command("list")
  .description("List all scheduled jobs")
  .option("--json", "Output as JSON")
  .option("--agent <agent>", "Filter by agent")
  .option("--enabled", "Only enabled jobs")
  .action((options) => {
    try {
      let jobs = registry.getAll();

      // Apply filters
      if (options.agent) {
        jobs = jobs.filter((j) => j.target.agentId === options.agent);
      }
      if (options.enabled) {
        jobs = jobs.filter((j) => j.execution.enabled);
      }

      if (options.json) {
        console.log(JSON.stringify(jobs, null, 2));
        return;
      }

      // Table output
      console.log(
        `${"ID".padEnd(36)} ${"Name".padEnd(20)} ${"Schedule".padEnd(15)} ${"Enabled"}`
      );
      console.log("-".repeat(80));

      for (const job of jobs) {
        const schedStr = job.schedule?.cronExpression || "N/A";
        console.log(
          `${job.id.padEnd(36)} ${job.name.slice(0, 20).padEnd(20)} ${schedStr.padEnd(15)} ${job.execution.enabled ? "✓" : "✗"}`
        );
      }

      console.log(`\nTotal: ${jobs.length} jobs`);
    } catch (err) {
      console.error("Failed to list jobs:", err);
      process.exit(1);
    }
  });

scheduleCmd
  .command("show <id>")
  .description("Show job details")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    try {
      const job = registry.get(id);
      if (!job) {
        console.error(`Job not found: ${id}`);
        process.exit(2);
      }

      if (options.json) {
        console.log(JSON.stringify(job, null, 2));
        return;
      }

      console.log(`Job: ${job.name} (${job.id})`);
      console.log(`Description: ${job.description || "N/A"}`);
      console.log(`Enabled: ${job.execution.enabled ? "Yes" : "No"}`);
      console.log(`Auto-delete: ${job.execution.autoDelete ? "Yes" : "No"}`);
      if (job.execution.maxRuns) {
        console.log(`Max runs: ${job.state.runCount}/${job.execution.maxRuns} (${job.execution.maxRuns - job.state.runCount} remaining)`);
      }
      console.log(`Schedule: ${job.schedule?.cronExpression || "N/A"}`);
      console.log(`Timezone: ${job.schedule?.timezone || "N/A"}`);
      console.log(`Target: ${job.target.type} ${job.target.agentId || ""}`);
      console.log(`Channel: ${job.target.channel || "N/A"}`);
      console.log(`To: ${job.target.to || "(default)"}`);
      console.log(`Payload: ${job.payload.type}`);
      console.log(`Last run: ${job.state.lastRun || "Never"}`);
      console.log(`Run count: ${job.state.runCount}`);
      console.log(`Fail count: ${job.state.failCount}`);
    } catch (err) {
      console.error("Failed to show job:", err);
      process.exit(1);
    }
  });

scheduleCmd
  .command("execute <id>")
  .description("Execute a job manually")
  .option("--dry-run", "Preview without executing")
  .option("--force", "Execute even if disabled")
  .option("--verbose", "Verbose output")
  .action(async (id, options) => {
    try {
      const job = registry.get(id);
      if (!job) {
        console.error(`Job not found: ${id}`);
        process.exit(2);
      }

      const logger = createLogger(config.paths.logsDir, id);
      const result = await executor.execute(job, logger, {
        dryRun: options.dryRun,
        verbose: options.verbose,
        force: options.force,
      });

      // Update job state
      registry.updateState(id, {
        lastRun: new Date().toISOString(),
        lastResult: result.success ? "success" : "failure",
        lastError: result.error,
        runCount: job.state.runCount + 1,
        failCount: result.success
          ? job.state.failCount
          : job.state.failCount + 1,
      });

      if (result.success) {
        console.log("✅ Execution succeeded");
        if (result.output) {
          console.log("Output:", result.output.slice(0, 500));
        }

        // Check if max runs reached
        const newRunCount = job.state.runCount + 1;
        if (job.execution.maxRuns && newRunCount >= job.execution.maxRuns) {
          removeFromCrontab(id);
          registry.delete(id);
          console.log(`🗑️  Job ${id} deleted after ${newRunCount}/${job.execution.maxRuns} runs`);
        }
        // Auto-delete after successful execution if enabled
        else if (job.execution.autoDelete) {
          removeFromCrontab(id);
          registry.delete(id);
          console.log(`🗑️  Job ${id} auto-deleted after successful execution`);
        }

        process.exit(0);
      } else {
        console.error("❌ Execution failed");
        if (result.error) {
          console.error("Error:", result.error);
        }
        process.exit(result.exitCode || 8);
      }
    } catch (err) {
      console.error("Failed to execute job:", err);
      process.exit(1);
    }
  });

scheduleCmd
  .command("edit <id>")
  .description("Edit a job")
  .option("--message <message>", "New message content")
  .option("--schedule <cron>", "New cron expression")
  .option("--enabled <bool>", "Enable/disable")
  .option("--agent <agent>", "Change target agent")
  .action((id, options) => {
    try {
      const job = registry.get(id);
      if (!job) {
        console.error(`Job not found: ${id}`);
        process.exit(2);
      }

      const updates: Partial<typeof job> = {};

      if (options.message) {
        updates.payload = { ...job.payload, content: options.message };
      }

      if (options.enabled !== undefined) {
        const enabled = options.enabled === "true" || options.enabled === true;
        updates.execution = { ...job.execution, enabled };
      }

      if (options.agent) {
        updates.target = { ...job.target, agentId: options.agent };
      }

      // Update schedule
      if (options.schedule) {
        if (!validateCronExpression(options.schedule)) {
          console.error("Invalid cron expression");
          process.exit(5);
        }
        updates.schedule = {
          ...job.schedule,
          cronExpression: options.schedule,
        };
        removeFromCrontab(id);
        addToCrontab(id, options.schedule);
      }

      const updated = registry.update(id, updates);
      if (updated) {
        console.log(`✅ Updated job ${id}`);
      } else {
        console.error("Update failed");
        process.exit(1);
      }
    } catch (err) {
      console.error("Failed to edit job:", err);
      process.exit(1);
    }
  });

scheduleCmd
  .command("delete <id>")
  .description("Delete a job")
  .option("--force", "Skip confirmation")
  .action((id, options) => {
    try {
      const job = registry.get(id);
      if (!job) {
        console.error(`Job not found: ${id}`);
        process.exit(2);
      }

      if (!options.force) {
        console.log(`Are you sure you want to delete "${job.name}" (${id})?`);
        console.log("Use --force to confirm");
        process.exit(1);
      }

      // Remove from crontab first
      removeFromCrontab(id);

      // Delete job
      registry.delete(id);

      console.log(`✅ Deleted job ${id}`);
    } catch (err) {
      console.error("Failed to delete job:", err);
      process.exit(1);
    }
  });

scheduleCmd
  .command("cron")
  .description("Manage system crontab")
  .option("--show", "Show current crontab entries")
  .option("--install", "Install/update crontab")
  .option("--uninstall", "Remove all ClawGate entries")
  .action((options) => {
    try {
      if (options.show) {
        const entries = listCrontabEntries();
        console.log("ClawGate crontab entries:");
        for (const entry of entries) {
          console.log(`  ${entry.cronExpression} - ${entry.jobId}`);
        }
        if (entries.length === 0) {
          console.log("  (none)");
        }
        return;
      }

      if (options.uninstall) {
        // Remove all by passing empty list
        const { generateCrontab, readCrontab, writeCrontab } =
          require("./cron.js");
        const existing = readCrontab();
        const newContent = generateCrontab(existing, []);
        writeCrontab(newContent);
        console.log("✅ Removed all ClawGate entries from crontab");
        return;
      }

      if (options.install) {
        // Reinstall all jobs
        const jobs = registry.getAll();
        for (const job of jobs) {
          removeFromCrontab(job.id);
          addToCrontab(job.id, job.schedule.cronExpression);
        }
        console.log(`✅ Installed ${jobs.length} jobs to crontab`);
        return;
      }

      program.help();
    } catch (err) {
      console.error("Cron command failed:", err);
      process.exit(1);
    }
  });

scheduleCmd
  .command("logs <id>")
  .description("View job execution logs")
  .option("--tail", "Follow log output")
  .option("--last", "Show last execution only")
  .action(() => {
    console.log("Logs viewing not yet implemented");
  });

// Parse and run
program.parse();
