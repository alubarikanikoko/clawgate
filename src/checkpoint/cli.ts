#!/usr/bin/env node
/**
 * ClawGate Checkpoint Module
 * Track project checkpoints and milestones
 */

import { Command } from "commander";
import * as checkpoint from "./index.js";

const program = new Command();

program
  .name("checkpoint")
  .description("Checkpoint module - Track project milestones and checkpoints")
  .version("0.2.0")
  .addHelpText(
    "after",
    `
Examples:
  # Create a checkpoint
  clawgate checkpoint create phase1 --project myapp --phase "phase-1" --agent code

  # Complete a checkpoint
  clawgate checkpoint complete phase1 --evidence "All tests passing"

  # Update checkpoint status
  clawgate checkpoint update phase1 --status failed

  # List checkpoints
  clawgate checkpoint list --project myapp

  # Get last checkpoint
  clawgate checkpoint last --project myapp

  # Delete a checkpoint
  clawgate checkpoint delete phase1

Key Concepts:
  - create:    Create a new checkpoint (active state)
  - complete:  Mark checkpoint as done with optional evidence
  - update:    Update checkpoint status manually
  - list:      List all checkpoints, optionally filtered by project
  - last:      Get most recent checkpoint for a project
  - delete:    Remove a checkpoint

Checkpoint States:
  active     - Created, not yet completed
  completed  - Successfully finished
  success    - Completed with success status
  failed     - Completed but failed
  aborted    - Aborted before completion
`
  );

// Create checkpoint
program
  .command("create <id>")
  .description("Create a new checkpoint")
  .requiredOption("-p, --project <name>", "Project name")
  .requiredOption("--phase <name>", "Phase name")
  .requiredOption("-a, --agent <name>", "Agent name")
  .action((id, options) => {
    try {
      const result = checkpoint.create(id, options.project, options.phase, options.agent);
      console.log("✓ Checkpoint created:");
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Complete checkpoint
program
  .command("complete <id>")
  .description("Mark a checkpoint as complete")
  .option("-e, --evidence <text>", "Evidence/notes")
  .option("-s, --status <status>", "Status (completed, success, failed, aborted)", "completed")
  .action((id, options) => {
    try {
      const result = checkpoint.complete(id, options.evidence, options.status as checkpoint.CheckpointStatus);
      console.log("✓ Checkpoint completed:");
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Update checkpoint
program
  .command("update <id>")
  .description("Update checkpoint status")
  .requiredOption("-s, --status <status>", "New status (active, completed, failed, aborted)")
  .action((id, options) => {
    try {
      const result = checkpoint.update(id, options.status as checkpoint.CheckpointStatus);
      console.log("✓ Checkpoint updated:");
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// List checkpoints
program
  .command("list")
  .description("List all checkpoints")
  .option("-p, --project <name>", "Filter by project")
  .option("-s, --status <status>", "Filter by status")
  .action((options) => {
    try {
      const results = checkpoint.list(options.project, options.status as checkpoint.CheckpointStatus);
      if (results.length === 0) {
        console.log("No checkpoints found");
      } else {
        console.log(JSON.stringify(results, null, 2));
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Get last checkpoint
program
  .command("last")
  .description("Get the most recent checkpoint for a project")
  .requiredOption("-p, --project <name>", "Project name")
  .action((options) => {
    try {
      const result = checkpoint.last(options.project);
      if (!result) {
        console.log("No checkpoints found for project");
        process.exit(1);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Delete checkpoint
program
  .command("delete <id>")
  .description("Delete a checkpoint")
  .action((id) => {
    try {
      checkpoint.deleteCheckpoint(id);
      console.log(`✓ Checkpoint deleted: ${id}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
