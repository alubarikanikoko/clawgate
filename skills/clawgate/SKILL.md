---
name: clawgate
description: Powerful toolkit for openclaw agents. Use for (1) scheduled recurring or one-time agent messages with natural language schedules like "9am every Monday" or "every Tuesday 4x", (2) when OpenClaw's native cron truncates messages or strips links, (3) agent-to-agent messaging with context handoffs, (4) project checkpoint tracking, (5) task dependency queues, and (6) agent health monitoring.
---

# ClawGate

Cross-agent messaging toolkit for OpenClaw — extends native capabilities with scheduling, messaging, checkpoints, queues, and monitoring.

**Quick summary:** ClawGate solves 6 critical gaps in OpenClaw's native messaging:
1. Message truncation (~100 chars) → Full content preserved
2. Links stripped → Links work
3. Limited scheduling → Natural language ("9am every Monday")
4. No agent handoffs → Full context transfer with return capability
5. No project tracking → Checkpoints + task queues
6. No agent monitoring → Watchdog for stuck sessions

**⚡ Always use `clawgate <module> --help` to dig deeper into any module.**

---

## Modules Overview

### schedule — Deferred/Cron Messaging
- **What it enables:** Schedule messages to agents using natural language or cron
- **When to use:** Recurring reports, periodic reminders, one-time deferred tasks
- **Key feature:** Messages stay intact (no truncation), supports "9am every Monday", "in 30 minutes", "4x" run limits
- **Commands:** `create`, `list`, `show`, `execute`, `edit`, `delete`, `cron`, `logs`

### message — Agent-to-Agent Communication
- **What it enables:** Direct messaging between agents with reply tracking and full context handoffs
- **When to use:** Delegating tasks, requesting help from another agent, passing data/artifacts
- **Key feature:** Fire-and-forget, request-reply with timeout, context preservation, return handoffs
- **Commands:** `send`, `handoff`, `status`, `list`, `ack`

### checkpoint — Project Phase Tracking
- **What it enables:** Track milestones and phases across agent sessions
- **When to use:** Multi-session projects, tracking progress through phases, evidence recording
- **Key feature:** States: active → completed/success/failed/aborted
- **Commands:** `create`, `complete`, `update`, `list`, `last`, `delete`

### queue — Task Dependency Graph
- **What it enables:** Define tasks with dependencies, state machine execution
- **When to use:** Build pipelines, sequential workflows, blocking on upstream tasks
- **Key feature:** Dependencies automatically block execution, state transitions tracked
- **Commands:** `define`, `submit`, `next`, `start`, `complete`, `fail`, `status`, `blocked`, `get`, `reset`, `delete`

### watchdog — Agent Health Monitoring
- **What it enables:** Monitor stuck/orphaned sessions, self-watchdog for idle detection
- **When to use:** Long-running agents need health checks, cleanup stuck sessions
- **Key feature:** Auto-pong integration, configurable thresholds, actions on expiry
- **Commands:** `check`, `start`, `stop`, `status`, `list`, `kill`, `logs`, `cron`, `self`, `pong`

---

## Quick Examples

```bash
# Schedule (natural language)
clawgate schedule create --name daily --schedule "9am every Monday" --agent music --message "Digest"
clawgate schedule create --examples  # Show all natural language formats

# Message (agent communication)
clawgate message send --agent code --message "Review PR" --background
clawgate message send --agent music --message "Playlist?" --request-reply
clawgate message handoff --agent music --message "Generate" --context '{"tracks": [1,2,3]}'

# Checkpoint (project tracking)
clawgate checkpoint create p1 --project myapp --phase "phase-1" --agent code
clawgate checkpoint complete p1 --evidence "All tests passing"

# Queue (task dependencies)
clawgate queue define build --project myapp --agent code --command "npm run build"
clawgate queue define test --project myapp --agent code --command "npm test" --depends-on build
clawgate queue submit build --project myapp

# Watchdog (monitoring)
clawgate watchdog check --dry-run
clawgate watchdog self --agent eve --timeout 15 --action notify-user
```

---

## Dig Deeper

```bash
# Full help for any module
clawgate schedule --help
clawgate message --help
clawgate checkpoint --help
clawgate queue --help
clawgate watchdog --help

# Command-specific help
clawgate schedule create --help
clawgate message send --help

# Built-in detailed docs
clawgate docs                    # Overview of all modules
clawgate docs --module message   # Deep dive into specific module
clawgate docs --open            # Open README in browser
```

---

## Why ClawGate vs OpenClaw Native

| Feature | OpenClaw | ClawGate |
|---------|----------|----------|
| Message length | ~100 chars truncated | Full content |
| Links | Stripped | Preserved |
| Scheduling | Limited syntax | Natural language |
| One-time jobs | Not supported | Auto-delete after run |
| Run limits | Not supported | `4x` syntax |
| Agent handoffs | Not supported | Full context + return |
| Reply tracking | Not supported | Built-in |
| Timeout control | Not supported | Configurable |
| Background/async | Not supported | Fire-and-forget |
| Project checkpoints | Not supported | Full tracking |
| Task dependencies | Not supported | Dependency graph |
| Agent health | Not supported | Watchdog |

---

## References

- **CLI help:** `clawgate --help` or `clawgate <module> --help`
- **Detailed docs:** `clawgate docs --module <name>`
- **Repo:** https://github.com/alubarikanikoko/clawgate
