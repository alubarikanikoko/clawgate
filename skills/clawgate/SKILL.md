---
name: clawgate
description: Cross-agent messaging and scheduling toolkit for OpenClaw. Use for (1) immediate agent-to-agent messaging with `clawgate message send --agent code --message "..."`, (2) agent handoffs with context preservation using `clawgate message handoff --agent music --return-after`, (3) scheduled recurring or one-time agent messages with natural language schedules like "9am every Monday" or "every Tuesday 4x", (4) when OpenClaw's native cron truncates messages or strips links.
---

# ClawGate

Cross-agent messaging toolkit for OpenClaw with scheduling and direct messaging capabilities.

## Quick Start

```bash
git clone git@github.com:alubarikanikoko/clawgate.git
cd clawgate && npm install && npm run build && npm link
```

## Configuration

Create `~/.clawgate/config.json`:

```json
{
  "agents": {
    "main": "default",
    "code": "codebot",
    "music": "musicbot",
    "social": "socialbot"
  }
}
```

Agents defined here will be available for routing.

## Modules

| Module | Purpose | Key Commands |
|--------|---------|--------------|
| `schedule` | Deferred/cron-based messaging | `create`, `list`, `execute` |
| `message` | Immediate agent communication | `send`, `handoff`, `list` |

---

## Schedule Module

**Use when:** Deferred or recurring messages needed.

```bash
# Natural language schedules
clawgate schedule create --name "daily" --schedule "9am every Monday" --agent music --message "Hello"

# Count-limited (4 runs then delete)
clawgate schedule create --name "limited" --schedule "9am every Monday 4x" --agent code --message "Weekly report"

# One-time with auto-delete
clawgate schedule create --name "reminder" --schedule "next Thursday" --agent music --message "Meeting"
```

### Natural Language Schedules

| Expression | Meaning |
|------------|---------|
| `9am every Monday` | Weekly recurring |
| `every 15 minutes` | Frequent checks |
| `next Thursday at 3pm` | One-time auto-delete |
| `in 30 minutes` | One-time auto-delete |
| `every Tuesday 4x` | 4 runs then delete |

---

## Message Module

**Use when:** Immediate agent communication or handoffs needed.

### Basic Send

```bash
# Quick fire-and-forget (returns immediately)
clawgate message send --agent music --message "Generate playlist" --background

# Wait for reply with 5-minute default timeout
clawgate message send --agent code --message "Review this" --request-reply

# Wait for reply with custom timeout (10 minutes)
clawgate message send --agent music --message "Research needed" --request-reply --timeout 600000
```

### Handoff with Context

```bash
# Basic handoff
clawgate message handoff --agent code --message "Review this PR"

# Handoff expecting return
clawgate message handoff --agent music --message "Generate tracks" --return-after

# Handoff with data context
clawgate message handoff \
  --agent code \
  --message "Review architecture" \
  --context '{"projectId": "123", "deadline": "Friday"}' \
  --return-after
```

### Check Status

```bash
# List recent messages
clawgate message list --limit 10

# Check specific message
clawgate message status <message-id>

# Filter by agent
clawgate message list --agent music
```

### Agent Routing

| `--agent` | Target |
|-----------|--------|
| `main` | Orchestrator |
| `code` | Code agent |
| `music` | Music agent |
| `social` | Social agent |

---

## Why vs OpenClaw Native

| Feature | OpenClaw | ClawGate |
|---------|----------|----------|
| Message length | Truncated ~100 chars | Full content |
| Links | Stripped | Preserved |
| Multi-agent | Via orchestrator | Direct routing |
| Scheduling | Limited syntax | Natural language |
| Handoffs | Not supported | Full context |
| Reply tracking | Not supported | Built-in |
| Timeout control | Not supported | Configurable (5+ min) |

---

## References

- **API docs:** [references/SCHEDULE_API.md](references/SCHEDULE_API.md), [references/MESSAGE_API.md](references/MESSAGE_API.md)
- **Repo:** https://github.com/alubarikanikoko/clawgate
