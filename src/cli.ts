#!/usr/bin/env node
/**
 * ClawGate - Cross-agent messaging toolkit
 * Main entry point - dispatches to modules
 */

import { Command } from "commander";

const program = new Command();

program
  .name("clawgate")
  .description("ClawGate - Cross-agent messaging toolkit")
  .version("0.2.0")
  .addHelpText(
    "after",
    `
Modules:
  schedule    System cron wrapper for scheduled agent messaging
  message     Agent-to-agent communication and handoff
  watchdog    (planned) Monitor agent health and restart stuck sessions
  bridge      (planned) Webhook adapter for external services
  queue       (planned) Persistent job queue with retry logic
  audit       (planned) Log and audit cross-agent messages

Use 'clawgate <module> --help' for module-specific help.

Quick Examples:
  clawgate schedule create --name "daily" --schedule "9am" --agent music --message "Hello"
  clawgate message send --agent code --message "Review this code"
  clawgate message handoff --agent music --message "Generate playlist" --return-after
`
  );

// ============================================================
// SCHEDULE MODULE
// ============================================================
program
  .command("schedule", "Schedule module - System cron wrapper for OpenClaw", {
    executableFile: "./scheduler/cli.js",
  });

// ============================================================
// MESSAGE MODULE
// ============================================================
program
  .command("message", "Message module - Agent-to-agent communication and handoff", {
    executableFile: "./message/cli.js",
  });

// Parse and run
program.parse();
