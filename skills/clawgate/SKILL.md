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

```bash
# Send immediate message
clawgate message send --agent code --message "Review this code"

# Request reply
clawgate message send --agent music --message "Generate playlist" --request-reply

# Handoff with context
clawgate message handoff --agent code --message "Review implementation" --return-after

# Check message status
clawgate message status <message-id>
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

---

## References

- **API docs:** [references/SCHEDULE_API.md](references/SCHEDULE_API.md), [references/MESSAGE_API.md](references/MESSAGE_API.md)
- **Repo:** https://github.com/alubarikanikoko/clawgate
