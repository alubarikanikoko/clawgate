---
name: clawgate-schedule
description: Superior replacement for OpenClaw's built-in cron. Use when scheduling recurring or one-time agent messages with full content preservation, natural language schedules (e.g., "9am every Monday", "in 30 minutes", "every Tuesday 4x"), multi-agent reply routing, auto-delete on completion, or when OpenClaw's native cron truncates messages or strips links.
---

# ClawGate Schedule

Stores agent message payloads in JSON files, triggered by system cron. Solves instruction-injection problems where OpenClaw's native cron truncates messages.

## Quick Start

```bash
git clone git@github.com:alubarikanikoko/clawgate.git
cd clawgate && npm install && npm run build && npm link

clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every Monday" \
  --agent music \
  --message "Generate daily digest"
```

## Natural Language Schedules

| Expression | Result |
|------------|--------|
| `9am every Monday` | Weekly recurring |
| `every 15 minutes` | Frequent checks |
| `next Thursday at 3pm` | One-time (auto-deletes) |
| `in 30 minutes` | One-time (auto-deletes) |
| `every Tuesday 4x` | 4 runs then auto-delete |
| `0 9 * * *` | Raw cron passthrough |

**Show all examples:** `clawgate schedule create --examples`

## Core Commands

```bash
clawgate schedule create --name X --schedule Y --agent Z --message "M"
clawgate schedule list [--json]
clawgate schedule show <uuid>
clawgate schedule execute <uuid> [--dry-run]
clawgate schedule edit <uuid> [--message "..."] [--schedule "..."]
clawgate schedule delete <uuid> --force
clawgate schedule cron --install
```

## Agent Routing

| `--agent` | Routes To |
|-----------|-----------|
| `main` | Default/orchestrator |
| `code` | Code agent |
| `music` | Music agent |
| `social` | Social agent |

## Auto-Delete Patterns

**One-time:** `--schedule "next Thursday"` (implies --auto-delete)
**Limited runs:** `--schedule "every Monday 4x"`

## Why vs OpenClaw Cron

| Feature | OpenClaw | ClawGate |
|---------|----------|----------|
| Message length | Truncated ~100 chars | Full content |
| Links | Stripped | Preserved |
| Multi-agent | Via orchestrator | Direct routing |
| One-time | Not supported | Supported |
| Run limits | Not supported | `4x` suffix |

## References

- **Full API docs:** [references/API_REFERENCE.md](references/API_REFERENCE.md)
- **Repo:** https://github.com/alubarikanikoko/clawgate
