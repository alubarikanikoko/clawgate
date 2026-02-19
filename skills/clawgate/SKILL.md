---
name: clawgate
description: Scheduling toolkit for OpenClaw with natural language cron expressions. Use for (1) scheduled recurring or one-time agent messages with natural language schedules like "9am every Monday" or "every Tuesday 4x", (2) when OpenClaw's native cron truncates messages or strips links.
---

# ClawGate

Scheduling toolkit for OpenClaw with natural language cron expressions and reliable message delivery.

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

## Commands

| Command | Purpose |
|---------|---------|
| `create` | Create scheduled job |
| `list` | List all jobs |
| `show` | Show job details |
| `execute` | Run job immediately |
| `edit` | Modify job |
| `delete` | Remove job |
| `cron` | Install system cron |
| `logs` | View execution logs |

## Usage

**Use when:** Deferred or recurring agent messages needed.

```bash
# Natural language schedules
clawgate schedule create --name "daily" --schedule "9am every Monday" --agent music --message "Hello"

# Count-limited (4 runs then delete)
clawgate schedule create --name "limited" --schedule "9am every Monday 4x" --agent code --message "Weekly report"

# One-time with auto-delete
clawgate schedule create --name "reminder" --schedule "next Thursday" --agent music --message "Meeting"

# List jobs
clawgate schedule list

# Execute now
clawgate schedule execute <job-id>
```

### Natural Language Schedules

| Expression | Meaning |
|------------|---------|
| `9am every Monday` | Weekly recurring |
| `every 15 minutes` | Frequent checks |
| `next Thursday at 3pm` | One-time auto-delete |
| `in 30 minutes` | One-time auto-delete |
| `every Tuesday 4x` | 4 runs then delete |
| `daily at 9am` | Daily recurring |
| `weekdays` | Mon-Fri recurring |

## Why vs OpenClaw Native

| Feature | OpenClaw | ClawGate |
|---------|----------|----------|
| Message length | Truncated ~100 chars | Full content |
| Links | Stripped | Preserved |
| Scheduling syntax | Limited | Natural language |
| One-time jobs | Not supported | Supported |
| Run limits | Not supported | `4x` syntax |
| Auto-delete | Not supported | Built-in |

## References

- **API docs:** [references/SCHEDULE_API.md](references/SCHEDULE_API.md)
- **Repo:** https://github.com/alubarikanikoko/clawgate
