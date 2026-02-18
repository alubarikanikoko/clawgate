# ClawGate Schedule Skill

**Superior replacement for OpenClaw's built-in cron.**

Solves the instruction-injection problem: OpenClaw's cron truncates messages to 1-2 sentences. ClawGate stores payloads in JSON files, triggered by system cron—no instruction contamination.

---

## Installation

```bash
git clone git@github.com:alubarikanikoko/clawgate.git
cd clawgate && npm install && npm run build
npm link  # Global `clawgate` command
```

Verify: `clawgate --version`

---

## Quick Start

```bash
# Create a job with natural language schedule
clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every Monday" \
  --agent music \
  --message "Generate daily digest with links and priorities"

# System cron gets: 0 9 * * 1 clawgate schedule execute <uuid>
# Payload stored in: ~/.clawgate/jobs/<uuid>.json
```

---

## Natural Language Schedules

| Expression | Cron | Use Case |
|------------|------|----------|
| `9am every Monday` | `0 9 * * 1` | Weekly reports |
| `every 15 minutes` | `*/15 * * * *` | Frequent checks |
| `daily at 9am` | `0 9 * * *` | Daily digest |
| `weekdays at 8:30am` | `30 8 * * 1-5` | Work week only |
| `next Thursday at 3pm` | Calculated | One-time (auto-deletes) |
| `in 30 minutes` | Calculated | One-time (auto-deletes) |
| `every Tuesday 4x` | + `maxRuns: 4` | Limited runs |
| `0 9 * * *` | Passthrough | Raw cron fallback |

**Show examples:**
```bash
clawgate schedule create --examples
```

---

## Core Commands

```bash
clawgate schedule create --name "X" --schedule "Y" --agent Z --message "M"
clawgate schedule list [--json] [--agent music]
clawgate schedule show <uuid> [--json]
clawgate schedule execute <uuid> [--dry-run] [--force]
clawgate schedule edit <uuid> [--message "..."] [--schedule "..."]
clawgate schedule delete <uuid> --force
clawgate schedule cron --show | --install | --uninstall
clawgate schedule logs <uuid> [--last]
```

---

## Agent Targeting

**Reply routing:** Messages go through correct agent's Telegram bot.

| `--agent` | Route Via |
|-----------|-----------|
| `main` | Default (orchestrator) |
| `code` | Code agent |
| `music` | Music agent |
| `social` | Social agent |

**Target specific user:**
```bash
--to "xxxxx"
```

---

## Auto-Delete & Run Limits

**One-time job:**
```bash
--schedule "next Thursday" --auto-delete
# Or: --schedule "in 30 minutes" (implies --auto-delete)
```

**Limited runs (N times then delete):**
```bash
--schedule "every Tuesday 4x"
# Sets maxRuns: 4, runs 4 times, auto-deletes
```

**Show run count:**
```bash
clawgate schedule show <uuid>  # Shows: 2/4 runs remaining
```

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
    "timezone": "Europe/Vilnius"
  }
}
```

**Auto-detection:** Searches `~/.npm-global/bin/`, `/usr/local/bin/`, etc.

**Override via env:**
```bash
export OPENCLAW_BIN=/custom/path/openclaw
```

---

## State Directory

```
~/.clawgate/
├── config.json          # User config
├── jobs/<uuid>.json     # Job definitions
├── logs/<uuid>/         # Execution logs
└── locks/               # Execution locks
```

**Job file contains:**
- Embedded schedule (`cronExpression`, `timezone`)
- Payload (`type`, `content`)
- Execution config (`enabled`, `timeoutMs`, `autoDelete`, `maxRuns`)
- State (`lastRun`, `runCount`, `failCount`)

---

## Why Use This vs OpenClaw Cron?

| Feature | OpenClaw Cron | ClawGate |
|---------|-----------------|----------|
| Message length | Truncated to ~100 chars | Full content (no limit) |
| Links | Stripped | Preserved |
| Multi-agent | All replies via orchestrator | Direct agent routing |
| Scheduling | OpenClaw syntax | Natural language + cron |
| Persistence | OpenClaw state | Filesystem JSON |
| One-time | Not supported | `--schedule "next Thursday"` |
| Run limits | Not supported | `4x` suffix |

**OpenClaw cron injects system instructions into your messages.** ClawGate isolates payload in separate JSON—cron line only contains UUID.

---

## Patterns

**Daily digest:**
```bash
clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every day" \
  --agent music \
  --message "Generate comprehensive daily digest including priorities, upcoming deadlines, and action items" \
  --to "xxxxx"
```

**Weekly report (4 weeks only):**
```bash
clawgate schedule create \
  --name "monthly-reports" \
  --schedule "every Monday 9am 4x" \
  --agent code \
  --message "Generate weekly development summary"
```

**Immediate one-time:**
```bash
clawgate schedule create \
  --name "reminder-now" \
  --schedule "in 5 minutes" \
  --agent music \
  --message "Check on project status"
# Auto-deletes after execution
```

---

## Troubleshooting

**Job not found on execute:**
- Check `clawgate schedule list`
- Verify job UUID

**"openclaw: not found":**
- Set `openclaw.bin` in config or `OPENCLAW_BIN` env var

**Cron not triggering:**
- Run `clawgate schedule cron --show` to verify entries
- Run `clawgate schedule cron --install` to reinstall

**Message truncated:**
- You're using OpenClaw cron, not ClawGate. Use `clawgate schedule create`.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (may trigger auto-delete) |
| 2 | Job not found |
| 3 | Job disabled |
| 4 | Already running (lock exists) |
| 5 | Validation error |
| 6 | Config error |
| 7 | OpenClaw connection failed |
| 8 | Execution failed |
| 9 | Timeout |
| 10 | Lock conflict |

---

## See Also

- **Repo:** https://github.com/alubarikanikoko/clawgate
- **Docs:** `docs/API_REFERENCE.md` (if exists)
- **Examples:** `clawgate schedule create --examples`
