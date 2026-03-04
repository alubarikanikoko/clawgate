#!/usr/bin/env node
/**
 * ClawGate - Cross-agent messaging toolkit
 * Main entry point - dispatches to modules
 */

import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { exec } from "child_process";
import { loadConfig } from "./scheduler/config.js";

// Default agents if no config
const DEFAULT_AGENTS = ["main", "code", "music", "social", "orezi"];

function getAgents(): string[] {
  try {
    const config = loadConfig();
    return config.agents ? Object.keys(config.agents) : DEFAULT_AGENTS;
  } catch {
    return DEFAULT_AGENTS;
  }
}

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
  watchdog    Monitor agent health and cleanup stuck/orphaned sessions
  checkpoint  Project phase tracking and agent checkpoint management
  queue       Task dependency graph and state management
  bridge      (planned) Webhook adapter for external services
  audit       (planned) Log and audit cross-agent messages

Quick Examples:
  # Schedule - Natural language scheduling
  clawgate schedule create --name "daily" --schedule "9am every Monday" --agent music --message "Hello"
  clawgate schedule create --examples                    # Show schedule examples
  clawgate schedule list
  clawgate schedule execute <uuid>

  # Message - Agent communication
  clawgate message send --agent code --message "Review this" --background
  clawgate message send --agent music --message "Playlist?" --request-reply
  clawgate message handoff --agent music --message "Generate playlist" --return-after

  # Checkpoint - Project tracking
  clawgate checkpoint create my-task --project clawgate --phase p0 --agent code
  clawgate checkpoint complete my-task --evidence "Done"
  clawgate checkpoint list --project clawgate

  # Queue - Task dependencies
  clawgate queue define build --project myapp --agent code --command "npm run build"
  clawgate queue define test --project myapp --agent code --command "npm run test" --depends-on build
  clawgate queue submit build --project myapp

  # Watchdog - Agent monitoring
  clawgate watchdog check --dry-run
  clawgate watchdog self --agent eve --timeout 15 --action notify-user
  clawgate watchdog pong --agent eve

Use 'clawgate <module> --help' for detailed module documentation.
`
  );

// ============================================================
// SHELL COMPLETION
// ============================================================
program
  .command("completion")
  .description("Generate shell completion scripts")
  .option("-s, --shell <shell>", "Shell type: bash, zsh, fish", "bash")
  .option("-i, --install", "Install completion to shell config")
  .action((options) => {
    const shell = options.shell;
    const agents = getAgents();
    
    if (options.install) {
      installCompletion(shell, agents);
    } else {
      console.log(generateCompletion(shell, agents));
    }
  });

function generateCompletion(shell: string, agents: string[]): string {
  const agentsStr = agents.join(" ");
  
  if (shell === "zsh") {
    return `# clawgate zsh completion
# Source: eval "$(clawgate completion --shell zsh)"
# Or install: clawgate completion --shell zsh --install

_clawgate() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  _arguments -C \\
    '1: :->module' \\
    '2: :->command' \\
    '*:: :->args' && return 0

  case $state in
    module)
      _alternative \\
        'modules:module:(schedule message watchdog completion)'
      ;;
    command)
      case $line[1] in
        schedule)
          _alternative \\
            'commands:command:(create list show execute edit delete cron logs)'
          ;;
        message)
          _alternative \\
            'commands:command:(send handoff status list ack)'
          ;;
        watchdog)
          _alternative \\
            'commands:command:(check start stop status list kill logs cron)'
          ;;
      esac
      ;;
    args)
      # Common options for all commands
      _arguments \\
        '(-h --help)'{-h,--help}'[Show help]' \\
        '(-v --verbose)'{-v,--verbose}'[Verbose output]' \\
        '--dry-run[Preview without executing]' \\
        '--json[Output as JSON]'
      
      # Command-specific options
      case $line[1] in
        schedule)
          case $line[2] in
            create|edit)
              _arguments \\
                '--name[Job name]:name:' \\
                '--schedule[Schedule expression]:schedule:' \\
                '--agent[Target agent]:agent:(${agentsStr})' \\
                '--message[Message content]:message:' \\
                '--auto-delete[Auto-delete after run]' \\
                '--examples[Show schedule examples]'
              ;;
            execute|show|delete)
              _arguments '*:uuid:('
              ;;
          esac
          ;;
        message)
          case $line[2] in
            send)
              _arguments \\
                '(-a --agent)'{-a,--agent}'[Target agent]:agent:(${agentsStr})' \\
                '(-m --message)'{-m,--message}'[Message content]:message:' \\
                '(-c --channel)'{-c,--channel}'[Channel]:channel:' \\
                '--request-reply[Wait for reply]' \\
                '--background[Fire-and-forget mode]' \\
                '--private[Internal agent-only communication]' \\
                '--timeout[Timeout in ms]:timeout:'
              ;;
            handoff)
              _arguments \\
                '(-a --agent)'{-a,--agent}'[Target agent]:agent:(${agentsStr})' \\
                '(-m --message)'{-m,--message}'[Message content]:message:' \\
                '--context[JSON context]:context:' \\
                '--return-after[Expect return handoff]' \\
                '--return-timeout[Return timeout ms]:timeout:'
              ;;
            status|ack)
              _arguments '*:message-id:'
              ;;
            list)
              _arguments \\
                '--agent[Filter by agent]:agent:(${agentsStr})' \\
                '--handoffs[Show handoffs only]' \\
                '--limit[Limit results]:limit:'
              ;;
          esac
          ;;
      esac
      ;;
  esac
}

compdef _clawgate clawgate
`;
  }

  if (shell === "fish") {
    return `# clawgate fish completion
# Source: clawgate completion --shell fish | source
# Or install: clawgate completion --shell fish --install

complete -c clawgate -f

# Main commands
complete -c clawgate -n "__fish_use_subcommand" -a "schedule" -d "Scheduled agent messaging"
complete -c clawgate -n "__fish_use_subcommand" -a "message" -d "Agent communication"
complete -c clawgate -n "__fish_use_subcommand" -a "watchdog" -d "Monitor stuck sessions"
complete -c clawgate -n "__fish_use_subcommand" -a "completion" -d "Shell completion"

# Schedule subcommands
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "create" -d "Create scheduled job"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "list" -d "List jobs"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "show" -d "Show job details"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "execute" -d "Execute job now"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "edit" -d "Edit job"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "delete" -d "Delete job"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "cron" -d "Manage system cron"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "logs" -d "View job logs"

# Message subcommands
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "send" -d "Send message"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "handoff" -d "Handoff with context"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "status" -d "Check message status"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "list" -d "List messages"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "ack" -d "Acknowledge message"

# Watchdog subcommands
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "check" -d "Run one-time check"
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "start" -d "Start daemon"
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "stop" -d "Stop daemon"
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "status" -d "Show status"
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "list" -d "List suspicious sessions"
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "kill" -d "Kill session"
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "logs" -d "View logs"
complete -c clawgate -n "__fish_seen_subcommand_from watchdog" -a "cron" -d "Install cron job"

# Common options
complete -c clawgate -s h -l help -d "Show help"
complete -c clawgate -s v -l verbose -d "Verbose output"
complete -c clawgate -l dry-run -d "Preview without executing"
complete -c clawgate -l json -d "Output as JSON"

# Schedule options
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -l name -d "Job name"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -l schedule -d "Schedule expression"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -s a -l agent -d "Target agent" -a "${agentsStr}"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -s m -l message -d "Message content"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -l auto-delete -d "Auto-delete after run"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create" -l examples -d "Show schedule examples"

# Message options
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -s a -l agent -d "Target agent" -a "${agentsStr}"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -s m -l message -d "Message content"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -s c -l channel -d "Channel"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l request-reply -d "Wait for reply"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l background -d "Fire-and-forget mode"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l private -d "Internal agent-only"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l timeout -d "Timeout in ms"

complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -s a -l agent -d "Target agent" -a "${agentsStr}"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -s m -l message -d "Message content"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -l context -d "JSON context"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -l return-after -d "Expect return handoff"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -l return-timeout -d "Return timeout ms"

complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from list" -l agent -d "Filter by agent" -a "${agentsStr}"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from list" -l handoffs -d "Show handoffs only"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from list" -l limit -d "Limit results"
`;
  }

  // Default bash
  return `# clawgate bash completion
# Source: eval "$(clawgate completion --shell bash)"
# Or install: clawgate completion --shell bash --install

_clawgate_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[\${COMP_CWORD}]}"
  prev="\${COMP_WORDS[\${COMP_CWORD}-1]}"
  local agents="${agentsStr}"
  
  # Main commands
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "schedule message watchdog completion" -- \${cur}) )
    return 0
  fi
  
  # Subcommands based on module
  case "\${COMP_WORDS[1]}" in
    schedule)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "create list show execute edit delete cron logs" -- \${cur}) )
        return 0
      fi
      ;;
    message)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "send handoff status list ack" -- \${cur}) )
        return 0
      fi
      ;;
    watchdog)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "check start stop status list kill logs cron" -- \${cur}) )
        return 0
      fi
      ;;
  esac
  
  # Options
  local common_opts="-h --help -v --verbose --dry-run --json"
  local schedule_opts="--name --schedule --agent --message --auto-delete --examples"
  local message_send_opts="-a --agent -m --message -c --channel --request-reply --background --private --timeout --priority"
  local message_handoff_opts="-a --agent -m --message --context --context-file --return-after --return-timeout"
  local message_list_opts="--agent --handoffs --limit"
  
  if [[ "\${cur}" == -* ]]; then
    case "\${COMP_WORDS[1]}" in
      schedule)
        COMPREPLY=( $(compgen -W "\${common_opts} \${schedule_opts}" -- \${cur}) )
        ;;
      message)
        case "\${COMP_WORDS[2]}" in
          send)
            COMPREPLY=( $(compgen -W "\${common_opts} \${message_send_opts}" -- \${cur}) )
            ;;
          handoff)
            COMPREPLY=( $(compgen -W "\${common_opts} \${message_handoff_opts}" -- \${cur}) )
            ;;
          list)
            COMPREPLY=( $(compgen -W "\${common_opts} \${message_list_opts}" -- \${cur}) )
            ;;
          *)
            COMPREPLY=( $(compgen -W "\${common_opts}" -- \${cur}) )
            ;;
        esac
        ;;
      *)
        COMPREPLY=( $(compgen -W "\${common_opts}" -- \${cur}) )
        ;;
    esac
    return 0
  fi
  
  # Agent completion for --agent or -a
  if [[ "\${prev}" == "--agent" || "\${prev}" == "-a" ]]; then
    COMPREPLY=( $(compgen -W "\${agents}" -- \${cur}) )
    return 0
  fi
  
  return 0
}

complete -F _clawgate_completions clawgate
`;
}

function installCompletion(shell: string, agents: string[]) {
  const home = homedir();
  let targetFile: string;
  let content: string;
  
  switch (shell) {
    case "bash":
      targetFile = join(home, ".bash_completion");
      content = generateCompletion("bash", agents);
      break;
    case "zsh":
      // Check for oh-my-zsh
      const zshCustom = join(home, ".oh-my-zsh", "custom", "completions");
      if (existsSync(zshCustom)) {
        targetFile = join(zshCustom, "_clawgate");
      } else {
        targetFile = join(home, ".zshrc");
        content = '# ClawGate completion\\neval "$(clawgate completion --shell zsh)"\\n';
        console.log(`Appending to ${targetFile}...`);
        console.log("Please restart your shell or run: source " + targetFile);
        return;
      }
      content = generateCompletion("zsh", agents);
      break;
    case "fish":
      const fishDir = join(home, ".config", "fish", "completions");
      if (!existsSync(fishDir)) {
        mkdirSync(fishDir, { recursive: true });
      }
      targetFile = join(fishDir, "clawgate.fish");
      content = generateCompletion("fish", agents);
      break;
    default:
      console.error(`Unknown shell: ${shell}`);
      console.log("Supported: bash, zsh, fish");
      process.exit(1);
  }
  
  try {
    writeFileSync(targetFile, content);
    console.log(`✅ Completion installed to: ${targetFile}`);
    console.log("Please restart your shell or source the file.");
  } catch (err) {
    console.error(`Failed to write to ${targetFile}:`, err);
    process.exit(1);
  }
}

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

// ============================================================
// WATCHDOG MODULE
// ============================================================
program
  .command("watchdog", "Watchdog module - Monitor agent health and cleanup stuck sessions", {
    executableFile: "./watchdog/cli.js",
  });

// ============================================================
// CHECKPOINT MODULE
// ============================================================
program
  .command("checkpoint", "Checkpoint module - Project phase tracking for agent tasks", {
    executableFile: "./checkpoint/cli.js",
  });

// ============================================================
// QUEUE MODULE
// ============================================================
program
  .command("queue", "Queue module - Task dependency graph with state machine", {
    executableFile: "./queue/cli.js",
  });

// ============================================================
// DOCS COMMAND
// ============================================================
program
  .command("docs")
  .description("Show detailed documentation")
  .option("-m, --module <name>", "Show docs for specific module: schedule, message, watchdog, checkpoint, queue")
  .option("-o, --open", "Open README.md in browser")
  .action((options) => {
    if (options.open) {
      const readmePath = join(process.cwd(), "README.md");
      if (existsSync(readmePath)) {
        exec(`open "${readmePath}"`, (err) => {
          if (err) console.log(`README.md: ${readmePath}`);
        });
      }
      return;
    }

    if (options.module) {
      const mod = options.module.toLowerCase();
      if (mod === "schedule") {
        console.log(SCHEDULE_DOCS);
      } else if (mod === "message") {
        console.log(MESSAGE_DOCS);
      } else if (mod === "watchdog") {
        console.log(WATCHDOG_DOCS);
      } else if (mod === "checkpoint") {
        console.log(CHECKPOINT_DOCS);
      } else if (mod === "queue") {
        console.log(QUEUE_DOCS);
      } else {
        console.error(`Unknown module: ${mod}`);
        console.log("Available: schedule, message, watchdog, checkpoint, queue");
        process.exit(1);
      }
      return;
    }

    // Show all docs
    console.log(MAIN_DOCS);
  });

const MAIN_DOCS = `
# ClawGate - Cross-Agent Messaging Toolkit

ClawGate extends OpenClaw with scheduling, messaging, and monitoring capabilities.

## Modules

### schedule - Scheduled Messaging
Natural language scheduling: "9am every Monday", "every 15 minutes", "in 30 minutes"
clawgate schedule --help

### message - Agent Communication  
Send messages, handoffs with context, reply tracking
clawgate message --help

### watchdog - Agent Monitoring
Health checks, stuck session cleanup, self-watchdog
clawgate watchdog --help

### checkpoint - Project Tracking
Milestone and phase tracking across sessions
clawgate checkpoint --help

### queue - Task Dependencies
Dependency graph execution with state machine
clawgate queue --help

## Quick Start

# Schedule a weekly reminder
clawgate schedule create --name daily --schedule "9am every Monday" --agent music --message "Digest"

# Send message to agent
clawgate message send --agent code --message "Review this"

# Handoff with context
clawgate message handoff --agent music --message "Generate" --context '{"track": "123"}'

# Create checkpoint
clawgate checkpoint create p1 --project myapp --phase "phase-1" --agent code

# Define task pipeline
clawgate queue define build --project myapp --agent code --command "npm run build"
`;

const SCHEDULE_DOCS = `
# Schedule Module

Schedule messages to agents using natural language or cron expressions.

## Natural Language Formats

| Expression | Description |
|------------|-------------|
| 9am every Monday | Weekly on Monday at 9am |
| every 15 minutes | Continuous interval |
| next Thursday | One-time, auto-deletes |
| in 30 minutes | One-time, runs once then deletes |
| every tuesday 4x | Runs 4 times then auto-deletes |
| 0 9 * * * | Standard cron expression |

## Commands

clawgate schedule create     Create a new scheduled job
clawgate schedule list       List all scheduled jobs
clawgate schedule show       Show job details
clawgate schedule execute    Execute job manually
clawgate schedule edit       Edit a job
clawgate schedule delete     Delete a job
clawgate schedule cron       Manage system crontab
clawgate schedule logs       View execution logs

## Examples

# Create weekly job
clawgate schedule create --name daily --schedule "9am every Monday" --agent music --message "Hello"

# Create one-time job (auto-deletes after run)
clawgate schedule create --name reminder --schedule "in 30 minutes" --agent code --message "Review"

# Show schedule examples
clawgate schedule create --examples

# Execute job now
clawgate schedule execute <uuid>

# Install cron
clawgate schedule cron --install
`;

const MESSAGE_DOCS = `
# Message Module

Agent-to-agent communication with handoff and reply tracking.

## Commands

clawgate message send      Send immediate message
clawgate message handoff   Transfer context to another agent
clawgate message status    Check message delivery status
clawgate message list      List recent messages
clawgate message ack       Acknowledge receipt (for receiving agents)

## Reply Modes

--background        Fire-and-forget, returns immediately
--request-reply     Wait for agent response (default 5 min)
--timeout <ms>      Custom timeout in milliseconds

## Examples

# Simple send (fire-and-forget)
clawgate message send --agent code --message "Review this" --background

# Send and wait for reply
clawgate message send --agent music --message "Generate playlist" --request-reply

# Custom timeout (10 minutes)
clawgate message send --agent code --message "Research" --request-reply --timeout 600000

# Handoff with context
clawgate message handoff --agent music --message "Analyze" --context '{"playlistId": "123"}'

# Expect return
clawgate message handoff --agent code --message "Review PR" --return-after

# Check status
clawgate message status <message-id>
`;

const WATCHDOG_DOCS = `
# Watchdog Module

Monitor agent health and cleanup stuck/orphaned sessions.

## Commands

clawgate watchdog check         Run one-time health check
clawgate watchdog start         Start background daemon
clawgate watchdog stop         Stop daemon
clawgate watchdog status       Show status
clawgate watchdog list         List suspicious sessions
clawgate watchdog kill         Kill session
clawgate watchdog logs         View logs
clawgate watchdog cron         Install cron job

## Self-Watchdog Commands

clawgate watchdog self         Register self-watchdog for agent
clawgate watchdog pong         Reset idle timer
clawgate watchdog self-status  Check self-watchdog status
clawgate watchdog self-list    List all self-watchdogs
clawgate watchdog self-remove  Remove self-watchdog
clawgate watchdog self-check   Check expired

## Examples

# One-time check
clawgate watchdog check --dry-run
clawgate watchdog check --auto-kill

# Register self-watchdog
clawgate watchdog self --agent eve --timeout 15 --action notify-user

# Actions: notify-user, message-agent, create-reminder, checkpoint-status-report, escalate-to-human

# Reset idle timer
clawgate watchdog pong --agent eve
`;

const CHECKPOINT_DOCS = `
# Checkpoint Module

Track project milestones and phases across agent sessions.

## Commands

clawgate checkpoint create    Create new checkpoint (active)
clawgate checkpoint complete Mark checkpoint as done
clawgate checkpoint update  Update status manually
clawgate checkpoint list    List checkpoints
clawgate checkpoint last    Get most recent for project
clawgate checkpoint delete  Remove checkpoint

## States

active     - Created, not yet completed
completed  - Successfully finished
success    - Completed with success status
failed     - Completed but failed
aborted    - Aborted before completion

## Examples

# Create checkpoint
clawgate checkpoint create phase1 --project myapp --phase "phase-1" --agent code

# Complete with evidence
clawgate checkpoint complete phase1 --evidence "All tests passing"

# List project checkpoints
clawgate checkpoint list --project myapp

# Get last checkpoint
clawgate checkpoint last --project myapp
`;

const QUEUE_DOCS = `
# Queue Module

Task dependency graph with state machine.

## Commands

clawgate queue define    Create task (defined state)
clawgate queue submit   Add to queue (make available)
clawgate queue next     Get next ready task
clawgate queue start   Mark as running
clawgate queue complete Mark as complete
clawgate queue fail    Mark as failed
clawgate queue status  Show queue overview
clawgate queue blocked List blocked tasks
clawgate queue get     Get task details
clawgate queue reset   Reset to defined
clawgate queue delete  Remove task

## States

defined   - Task created, not submitted
queued    - Submitted, dependencies not met
waiting   - Waiting for dependencies
ready     - Dependencies met, ready to run
running   - Currently executing
complete  - Successfully finished
failed    - Failed (may retry)

## Examples

# Define build pipeline
clawgate queue define lint --project myapp --agent code --command "npm run lint"
clawgate queue define test --project myapp --agent code --command "npm run test" --depends-on lint
clawgate queue define build --project myapp --agent code --command "npm run build" --depends-on test
clawgate queue define deploy --project myapp --agent code --command "npm run deploy" --depends-on build

# Submit all
clawgate queue submit lint --project myapp
clawgate queue submit test --project myapp
clawgate queue submit build --project myapp
clawgate queue submit deploy --project myapp

# Worker polls for work
clawgate queue next --project myapp --agent code
`;

// Parse and run
program.parse();
