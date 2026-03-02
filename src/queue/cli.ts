#!/usr/bin/env node
/**
 * ClawGate Queue Module CLI
 * Task queue with dependency graph management
 */

import { Command } from "commander";
import * as queue from "./index.js";

const program = new Command();

program
  .name("queue")
  .description("Queue module - Task dependency graph and state management")
  .version("0.1.0");

// Define task
program
  .command("define <task-id>")
  .description("Define a new task")
  .requiredOption("-p, --project <name>", "Project name")
  .requiredOption("-a, --agent <name>", "Agent name")
  .requiredOption("-c, --command <cmd>", "Command to execute")
  .option("-d, --depends-on <ids>", "Comma-separated list of task IDs this task depends on")
  .option("-t, --timeout <ms>", "Timeout in milliseconds", parseInt)
  .option("-r, --retry <count>", "Number of retries on failure", parseInt)
  .action((taskId, options) => {
    try {
      const dependsOn = options.dependsOn ? options.dependsOn.split(",").map((s: string) => s.trim()) : undefined;
      
      const task = queue.define(taskId, options.project, options.agent, options.command, {
        dependsOn,
        timeout: options.timeout,
        retry: options.retry
      });
      
      console.log("✓ Task defined:");
      console.log(JSON.stringify(task, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Submit task
program
  .command("submit <task-id>")
  .description("Submit a task to the queue")
  .requiredOption("-p, --project <name>", "Project name")
  .action((taskId, options) => {
    try {
      const task = queue.submit(taskId, options.project);
      console.log("✓ Task submitted:");
      console.log(JSON.stringify(task, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Status
program
  .command("status")
  .description("Show queue status")
  .option("-p, --project <name>", "Filter by project")
  .option("--json", "Output as JSON")
  .action((options) => {
    try {
      const status = queue.status(options.project);
      
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      
      const statuses = Array.isArray(status) ? status : [status];
      
      for (const proj of statuses) {
        console.log(`\n📁 Project: ${proj.project}`);
        console.log(`   Total: ${proj.summary.total} | Defined: ${proj.summary.defined} | Queued: ${proj.summary.queued} | Waiting: ${proj.summary.waiting}`);
        console.log(`   Ready: ${proj.summary.ready} | Running: ${proj.summary.running} | Complete: ${proj.summary.complete} | Failed: ${proj.summary.failed}`);
        
        if (proj.tasks.length > 0) {
          console.log("\n   Tasks:");
          for (const task of proj.tasks) {
            const deps = task.dependsOn?.length ? ` [depends: ${task.dependsOn.join(", ")}]` : "";
            console.log(`   • ${task.id} (${task.agent}): ${task.state}${deps}`);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Next task
program
  .command("next")
  .description("Get the next ready task for an agent")
  .requiredOption("-p, --project <name>", "Project name")
  .requiredOption("-a, --agent <name>", "Agent name")
  .action((options) => {
    try {
      const task = queue.next(options.project, options.agent);
      if (task) {
        console.log(JSON.stringify(task, null, 2));
      } else {
        console.log("No ready tasks found");
        process.exit(1);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Start task (internal - transition ready -> running)
program
  .command("start <task-id>")
  .description("Start a task (ready -> running)")
  .requiredOption("-p, --project <name>", "Project name")
  .action((taskId, options) => {
    try {
      const task = queue.start(taskId, options.project);
      console.log("✓ Task started:");
      console.log(JSON.stringify(task, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Complete task
program
  .command("complete <task-id>")
  .description("Mark a task as complete")
  .requiredOption("-p, --project <name>", "Project name")
  .option("-e, --evidence <text>", "Evidence/notes")
  .action((taskId, options) => {
    try {
      const task = queue.complete(taskId, options.project, options.evidence);
      console.log("✓ Task completed:");
      console.log(JSON.stringify(task, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Fail task
program
  .command("fail <task-id>")
  .description("Mark a task as failed")
  .requiredOption("-p, --project <name>", "Project name")
  .option("-r, --reason <text>", "Failure reason")
  .action((taskId, options) => {
    try {
      const task = queue.fail(taskId, options.project, options.reason);
      console.log("✓ Task failed:");
      console.log(JSON.stringify(task, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// List blocked tasks
program
  .command("blocked")
  .description("List tasks blocked by dependencies")
  .requiredOption("-p, --project <name>", "Project name")
  .action((options) => {
    try {
      const blocked = queue.blocked(options.project);
      if (blocked.length === 0) {
        console.log("No blocked tasks found");
      } else {
        console.log("Blocked tasks:");
        for (const item of blocked) {
          console.log(`\n  ${item.task.id} (${item.task.agent}):`);
          console.log(`    Blocked by: ${item.blockedBy.join(", ")}`);
          if (item.task.failureReason) {
            console.log(`    Reason: ${item.task.failureReason}`);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Get task
program
  .command("get <task-id>")
  .description("Get task details")
  .requiredOption("-p, --project <name>", "Project name")
  .action((taskId, options) => {
    try {
      const task = queue.getTask(taskId, options.project);
      if (task) {
        console.log(JSON.stringify(task, null, 2));
      } else {
        console.error(`Task '${taskId}' not found`);
        process.exit(1);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Reset task
program
  .command("reset <task-id>")
  .description("Reset task to defined state")
  .requiredOption("-p, --project <name>", "Project name")
  .action((taskId, options) => {
    try {
      const task = queue.resetTask(taskId, options.project);
      console.log("✓ Task reset:");
      console.log(JSON.stringify(task, null, 2));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// Delete task
program
  .command("delete <task-id>")
  .description("Delete a task")
  .requiredOption("-p, --project <name>", "Project name")
  .action((taskId, options) => {
    try {
      queue.deleteTask(taskId, options.project);
      console.log(`✓ Task deleted: ${taskId}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
