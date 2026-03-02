# ClawGate

Cross-agent messaging toolkit for OpenClaw.

## What is ClawGate?

ClawGate is a CLI tool and scheduling layer that solves critical gaps in OpenClaw's native messaging and cron systems.

**The Problem:** OpenClaw's built-in cron injects system instructions that truncate messages to ~100 characters, strip hyperlinks, and offer no way to schedule one-time reminders or limit run counts. Agent-to-agent communication requires going through the orchestrator with no direct routing, reply tracking, or timeout control.

**The Solution:** ClawGate stores message payloads in JSON files triggered by system cron—no instruction injection means full content preservation. It adds natural language scheduling ("9am every Monday", "in 30 minutes"), direct agent-to-agent messaging with reply tracking, and handoff capabilities with context preservation.

**Five Modules:**
- **Schedule** — Deferred/cron-based agent messaging with natural language expressions
- **Message** — Immediate agent communication with fire-and-forget, request-reply, and handoff patterns
- **Checkpoint** — Project phase tracking and milestone management
- **Queue** — Task dependency graph with dependency-aware execution
- **Watchdog** — Agent health monitoring and stuck session cleanup

## Modules

- **Schedule** — Deferred/cron-based agent messaging with natural language scheduling
- **Message** — Immediate agent communication with fire-and-forget, request-reply, and handoffs
- **Checkpoint** — Project phase tracking and milestone management
- **Queue** — Task dependency graph with dependency-aware execution
- **Watchdog** — Agent health monitoring, stuck session cleanup, and self-watchdog

## Quick Examples

### Schedule Module - Natural Language Scheduling
```bash
# Schedule a recurring job
clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every Monday" \
  --agent music \
  --message "Generate daily digest"
```

### Message Module - Agent Communication
```bash
# Fire-and-forget (returns immediately)
clawgate message send \
  --agent code \
  --message "Review this code" \
  --background

# Send and wait for reply (5 min timeout default)
clawgate message send \
  --agent music \
  --message "Generate playlist" \
  --request-reply

# Custom timeout (10 minutes)
clawgate message send \
  --agent code \
  --message "Research needed" \
  --request-reply \
  --timeout 600000

# Handoff with context
clawgate message handoff \
  --agent music \
  --message "Generate playlist" \
  --return-after
```

### Checkpoint Module - Project Tracking
```bash
# Create a checkpoint
clawgate checkpoint create phase1 \
  --project myapp \
  --phase "phase-1" \
  --agent code

# Complete a checkpoint with evidence
clawgate checkpoint complete phase1 \
  --evidence "All tests passing"

# List checkpoints for a project
clawgate checkpoint list --project myapp

# Get last checkpoint
clawgate checkpoint last --project myapp
```

### Queue Module - Task Dependencies
```bash
# Define tasks with dependencies
clawgate queue define build \
  --project myapp \
  --agent code \
  --command "npm run build"

clawgate queue define test \
  --project myapp \
  --agent code \
  --command "npm run test" \
  --depends-on build

clawgate queue define deploy \
  --project myapp \
  --agent code \
  --command "npm run deploy" \
  --depends-on test

# Submit tasks
clawgate queue submit build --project myapp
clawgate queue submit test --project myapp

# Check queue status
clawgate queue status --project myapp

# Get next ready task for an agent
clawgate queue next --project myapp --agent code
```

### Watchdog Module - Agent Monitoring
```bash
# Register self-watchdog (auto-pong on agent activity)
clawgate watchdog self \
  --agent eve \
  --timeout 15 \
  --action notify-user

# Manual pong (reset idle timer)
clawgate watchdog pong --agent eve

# Check watchdog status
clawgate watchdog self-status --agent eve

# Run system health check
clawgate watchdog check --dry-run
clawgate watchdog check --auto-kill
```

---

## Installation

### Install CLI Tool

```bash
# Clone and install
git clone git@github.com:alubarikanikoko/clawgate.git
cd clawgate && npm install && npm run build && npm link

# Enable tab completion (bash)
eval "$(clawgate completion --shell bash)"

# Or install permanently
clawgate completion --shell bash --install
```

### Upgrade from v0.1.0

```bash
cd clawgate
git pull
npm install
npm run build

# Verify new modules are available
clawgate --help
# Should show: schedule, message, watchdog, checkpoint, queue
```

### Configure Agents

Add custom agents to `~/.clawgate/config.json`:

```json
{
  "agents": {
    "main": "default",
    "code": "codebot",
    "music": "musicbot",
    "custom": "custombot"
  }
}
```

Agents defined here are available for tab completion and routing.

### Install OpenClaw Skill (Global)

Install the skill to `~/.openclaw/skills/` so any agent can use it:

```bash
# Quick install from GitHub
curl -fsSL https://raw.githubusercontent.com/alubarikanikoko/clawgate/master/install-skill.sh | bash

# Or manually
git clone --depth 1 https://github.com/alubarikanikoko/clawgate.git /tmp/clawgate
mkdir -p ~/.openclaw/skills/clawgate
cp -r /tmp/clawgate/skills/clawgate/* ~/.openclaw/skills/clawgate/
rm -rf /tmp/clawgate
```

**Requirements:** Node.js 20+, OpenClaw gateway running, system cron (Linux/Mac)

---

## Module: Schedule

### Problem Solved

OpenClaw's built-in cron injects system instructions that truncate digests to 1-2 sentences, stripping links and formatting. Schedule module stores payloads in JSON files triggered by system cron—no instruction injection.

```
System Cron ──▶ ClawGate ──▶ UUID Lookup ──▶ JSON Payload ──▶ OpenClaw API
```

### Natural Language Schedules

| Expression | Result |
|------------|--------|
| `9am every Monday` | Weekly recurring |
| `every 15 minutes` | Every 15 minutes |
| `next Thursday` | One-time (auto-deletes) |
| `in 30 minutes` | One-time (auto-deletes) |
| `every tuesday 4x` | 4 runs then auto-delete |
| `0 9 * * *` | Standard cron |

### Schedule Commands

```bash
clawgate schedule create --name "X" --schedule "Y" --agent Z --message "M"
clawgate schedule create --examples                    # Show examples
clawgate schedule list [--json] [--agent music]
clawgate schedule show <uuid>
clawgate schedule execute <uuid> [--dry-run]
clawgate schedule edit <uuid> [--message "..."] [--schedule "..."]
clawgate schedule delete <uuid> --force
clawgate schedule cron --install
```

---

## Module: Message

### Purpose

Immediate agent-to-agent communication with context preservation and handoff capabilities. Enables reliable delegation between agents with reply tracking.

### Message Commands

```bash
# Fire-and-forget (returns immediately)
clawgate message send --agent code --message "Update available" --background

# Wait for reply (5 min default)
clawgate message send --agent music --message "Generate playlist" --request-reply

# Custom timeout for long tasks
clawgate message send --agent code --message "Deep research" --request-reply --timeout 600000

# Handoff with context
clawgate message handoff --agent code --message "Review" --return-after

# Handoff with data
clawgate message handoff \
  --agent music \
  --message "Analyze tracks" \
  --context '{"playlistId": "123"}' \
  --return-after

# Check status
clawgate message status <message-id>
clawgate message list [--agent code] [--handoffs]

# Acknowledge (for receiving agents)
clawgate message ack <message-id> --reply "Done"
```

### Key Features

- **Background mode** — Fire-and-forget, returns immediately
- **Request reply** — Waits for agent response (5 min default, configurable)
- **Context preservation** — Pass data, artifacts, history
- **Reply tracking** — Messages persist status + responses

---

## Module: Checkpoint

Track project milestones and checkpoints across agent sessions.

### Checkpoint Commands

```bash
# Create a checkpoint
clawgate checkpoint create <id> \
  --project <name> \
  --phase <phase-name> \
  --agent <agent-name>

# Complete a checkpoint
clawgate checkpoint complete <id> \
  --evidence "All tests passing" \
  --status completed

# Update checkpoint status
clawgate checkpoint update <id> --status failed

# List checkpoints
clawgate checkpoint list [--project <name>] [--status <status>]

# Get last checkpoint for a project
clawgate checkpoint last --project <name>

# Delete a checkpoint
clawgate checkpoint delete <id>
```

### Checkpoint States

- **active** — Checkpoint created, not yet completed
- **completed** — Successfully finished
- **success** — Completed with success status
- **failed** — Completed but failed
- **aborted** — Aborted before completion

---

## Module: Queue

Task dependency graph with state management and dependency-aware execution.

### Queue Commands

```bash
# Define a task
clawgate queue define <task-id> \
  --project <name> \
  --agent <agent-name> \
  --command "npm run build" \
  [--depends-on <task-id1>,<task-id2>] \
  [--timeout <ms>] \
  [--retry <count>]

# Submit a task (make it available for execution)
clawgate queue submit <task-id> --project <name>

# Get next ready task for an agent
clawgate queue next --project <name> --agent <agent-name>

# Start a task (ready → running)
clawgate queue start <task-id> --project <name>

# Complete a task
clawgate queue complete <task-id> --project <name> --evidence "Done"

# Fail a task
clawgate queue fail <task-id> --project <name> --reason "Build failed"

# Check queue status
clawgate queue status [--project <name>] [--json]

# List blocked tasks
clawgate queue blocked --project <name>

# Get task details
clawgate queue get <task-id> --project <name>

# Reset task to defined state
clawgate queue reset <task-id> --project <name>

# Delete a task
clawgate queue delete <task-id> --project <name>
```

### Task States

- **defined** — Task created but not yet submitted
- **queued** — Submitted but dependencies not met
- **waiting** — Waiting for dependencies to complete
- **ready** — Dependencies met, ready to run
- **running** — Currently being executed
- **complete** — Successfully finished
- **failed** — Failed (may trigger retry)

### Dependency Example

```bash
# Define build pipeline
clawgate queue define lint --project myapp --agent code --command "npm run lint"
clawgate queue define test --project myapp --agent code --command "npm run test" --depends-on lint
clawgate queue define build --project myapp --agent code --command "npm run build" --depends-on test
clawgate queue define deploy --project myapp --agent code --command "npm run deploy" --depends-on build

# Submit all tasks
clawgate queue submit lint --project myapp
clawgate queue submit test --project myapp
clawgate queue submit build --project myapp
clawgate queue submit deploy --project myapp

# Workers poll for ready tasks
clawgate queue next --project myapp --agent code
```

---

## Module: Watchdog

Monitor agent health, cleanup stuck/orphaned sessions, and self-watchdog for primary agent idle detection.

### Watchdog Commands

```bash
# Run one-time check
clawgate watchdog check [--dry-run] [--auto-kill] [--threshold <sec>]

# Start/stop background daemon
clawgate watchdog start [--interval <sec>] [--threshold <sec>]
clawgate watchdog stop
clawgate watchdog status

# List suspicious sessions
clawgate watchdog list [--stuck] [--orphaned]

# Kill a specific session
clawgate watchdog kill <session-id> --yes

# View logs
clawgate watchdog logs [-f] [-n <lines>] [--since <duration>]

# Install cron job
clawgate watchdog cron [--interval <min>] [--remove]
```

### Self-Watchdog Commands (Auto-Pong Integration)

The self-watchdog monitors primary agent activity and auto-pongs on agent actions.

```bash
# Register self-watchdog for an agent
clawgate watchdog self \
  --agent eve \
  --timeout 15 \
  --action notify-user

# Actions available:
# - notify-user: Send notification to user
# - message-agent: Send message to another agent
# - create-reminder: Create a reminder
# - checkpoint-status-report: Report checkpoint status
# - escalate-to-human: Escalate to human

# Reset idle timer (auto-called by agent activity)
clawgate watchdog pong --agent eve

# Check self-watchdog status
clawgate watchdog self-status --agent eve

# List all active self-watchdogs
clawgate watchdog self-list

# Remove a self-watchdog
clawgate watchdog self-remove --agent eve

# Check if expired and optionally execute action
clawgate watchdog self-check --agent eve [--execute]
```

### Auto-Pong Integration

When configured, ClawGate automatically sends pong signals on agent activity:

- Job execution starts
- Message sent/received
- Checkpoint created/completed
- Task state transitions

This keeps the watchdog timer reset without manual intervention.

---

## Why vs OpenClaw Native

| Feature | OpenClaw | ClawGate |
|---------|----------|----------|
| Message length | Truncated ~100 chars | Full content |
| Links | Stripped | Preserved |
| Multi-agent routing | Via orchestrator only | Direct to any agent |
| Scheduling | Limited syntax | Natural language |
| One-time jobs | Not supported | Supported |
| Run limits | Not supported | `4x` syntax |
| Agent handoffs | Not supported | Full context |
| Reply tracking | Not supported | Built-in |
| Timeout control | Not supported | Configurable (5+ min) |
| Background/async | Not supported | Fire-and-forget |
| **Project checkpoints** | Not supported | Full tracking |
| **Task dependencies** | Not supported | Dependency graph |
| **Queue management** | Not supported | State machine |
| **Agent health monitoring** | Not supported | Watchdog + self-watchdog |
| **Stuck session cleanup** | Not supported | Automatic |
| **Idle detection** | Not supported | Auto-pong integration |

---

## Configuration

Create `~/.clawgate/config.json`:

```json
{
  "openclaw": {
    "gatewayUrl": "ws://127.0.0.1:18789",
    "bin": "/home/user/.npm-global/bin/openclaw"
  },
  "defaults": {
    "timezone": "Europe/Vilnius",
    "timeoutMs": 60000
  }
}
```

Or set env var: `OPENCLAW_BIN=/path/to/openclaw`

---

## State Directory

```
~/.clawgate/
├── config.json          # User configuration
├── jobs/                # Scheduled job definitions
├── locks/               # Execution locks
├── logs/                # Execution logs
├── messages/            # Message delivery logs
├── handoffs/            # Handoff logs
├── checkpoints/         # Checkpoint data
├── queues/              # Queue task definitions
├── watchdog/            # Watchdog state and logs
│   ├── self-watchdogs/  # Self-watchdog states
│   └── watchdog.log     # Watchdog logs
└── templates/           # Message templates
```

---

## Repository Structure

```
clawgate/
├── src/
│   ├── cli.ts              # Main entry (dispatches to modules)
│   ├── scheduler/          # Schedule module
│   │   ├── cli.ts
│   │   ├── executor.ts
│   │   ├── registry.ts
│   │   └── ...
│   ├── message/            # Message module
│   │   ├── cli.ts
│   │   ├── router.ts
│   │   ├── handoff.ts
│   │   └── ...
│   ├── checkpoint/         # Checkpoint module
│   │   ├── cli.ts
│   │   ├── storage.ts
│   │   └── types.ts
│   ├── queue/              # Queue module
│   │   ├── cli.ts
│   │   ├── storage.ts
│   │   └── types.ts
│   └── watchdog/           # Watchdog module
│       ├── cli.ts
│       ├── monitor.ts
│       └── self/           # Self-watchdog submodule
│           ├── cli.ts
│           ├── storage.ts
│           └── types.ts
├── skills/clawgate/        # OpenClaw skill
│   ├── SKILL.md
│   └── references/
├── package.json
└── README.md
```

## License

MIT
