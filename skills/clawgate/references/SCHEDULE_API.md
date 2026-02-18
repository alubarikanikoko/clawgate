# ClawGate Schedule - API Reference

Complete reference for the ClawGate schedule module.

---

## CLI Commands

All commands are under the `schedule` subcommand.

### `clawgate schedule create`

Create a new scheduled job.

**Quick Create:**
```bash
clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every Monday" \
  --agent music \
  --message "Generate daily digest"
```

**Natural Language Examples:**
```bash
# Simple recurring
clawgate schedule create --name "weekly-report" --schedule "every Tuesday at 3pm" ...

# Count-limited (auto-delete after 4 runs)
clawgate schedule create --name "limited" --schedule "every tuesday 4x" ...

# One-time (auto-delete implied)
clawgate schedule create --name "reminder" --schedule "next Thursday at 9am" ...
clawgate schedule create --name "soon" --schedule "in 30 minutes" ...

# Every N minutes/hours
clawgate schedule create --name "frequent" --schedule "every 15 minutes" ...
```

**Show Examples:**
```bash
clawgate schedule create --examples
```

**Options:**

| Flag | Description |
|------|-------------|
| `--name, -n` | Job name (required) |
| `--schedule, -s` | Schedule expression: cron OR natural language (required) |
| `--agent, -a` | Target agent ID |
| `--message, -m` | Message payload |
| `--channel, -c` | Channel (telegram, slack, etc) - default: telegram |
| `--to` | Target recipient (optional, defaults to session user) |
| `--timezone, -z` | IANA timezone - default: Europe/Vilnius |
| `--auto-delete` | Delete job after successful execution |
| `--disabled` | Create as disabled |
| `--dry-run` | Preview without creating |
| `--examples` | Show schedule expression examples |

**Supported Schedule Expressions:**

| Expression | Cron | Type |
|------------|------|------|
| `"0 9 * * *"` | `0 9 * * *` | Cron (passthrough) |
| `"9am every Monday"` | `0 9 * * 1` | Recurring |
| `"every Tuesday at 3pm"` | `0 15 * * 2` | Recurring |
| `"every 15 minutes"` | `*/15 * * * *` | Recurring |
| `"every hour"` | `0 */1 * * *` | Recurring |
| `"daily at 9am"` | `0 9 * * *` | Recurring |
| `"weekdays at 8:30am"` | `30 8 * * 1-5` | Recurring |
| `"next Thursday"` | Calculated | One-time |
| `"in 30 minutes"` | Calculated | One-time |
| `"at 2pm today"` | Calculated | One-time |
| `"1st of January at midnight"` | `0 0 1 1 *` | Recurring |
| `"every tuesday 4x"` | `0 9 * * 2` | Count-limited (4 runs) |

---

### `clawgate schedule list`

List all jobs.

```bash
clawgate schedule list                    # Table view
clawgate schedule list --json             # JSON output
clawgate schedule list --agent music      # Filter by agent
clawgate schedule list --enabled          # Only enabled jobs
```

**Output Fields:**
- `id` - UUID
- `name` - Job name
- `schedule` - Cron expression
- `enabled` - Status

---

### `clawgate schedule show`

Display detailed job information.

```bash
clawgate schedule show <uuid>
clawgate schedule show <uuid> --json      # Raw JSON
```

---

### `clawgate schedule execute`

Manually trigger a job.

```bash
clawgate schedule execute <uuid>          # Normal execution
clawgate schedule execute <uuid> --dry-run # Preview only
clawgate schedule execute <uuid> --force   # Skip enabled check
clawgate schedule execute <uuid> --verbose # Full output
```

**Exit Codes:**
- `0` - Success (auto-delete triggers if enabled)
- `1` - Failure
- `2` - Job not found
- `3` - Job disabled
- `4` - Already running (lock exists)
- `5` - Validation error
- `6` - Configuration error
- `7` - OpenClaw connection failed
- `8` - Execution failed
- `9` - Timeout
- `10` - Lock conflict

---

### `clawgate schedule edit`

Modify an existing job.

```bash
clawgate schedule edit <uuid> --message "New message"
clawgate schedule edit <uuid> --schedule "10am every day"
clawgate schedule edit <uuid> --enabled false
clawgate schedule edit <uuid> --agent other
```

---

### `clawgate schedule delete`

Remove a job.

```bash
clawgate schedule delete <uuid> --force   # Skip confirmation
```

---

### `clawgate schedule cron`

Manage system cron integration.

```bash
clawgate schedule cron --show       # Show current crontab entries
clawgate schedule cron --install    # Reinstall all jobs to crontab
clawgate schedule cron --uninstall  # Remove all ClawGate entries
```

---

### `clawgate schedule logs`

View job execution logs.

```bash
clawgate schedule logs <id>
clawgate schedule logs <id> --last  # Last execution only
```

---

## Configuration File

Location: `~/.clawgate/config.json`

```json
{
  "openclaw": {
    "gatewayUrl": "ws://127.0.0.1:18789",
    "token": null,
    "password": null,
    "bin": "/home/user/.npm-global/bin/openclaw"
  },
  "defaults": {
    "timezone": "Europe/Vilnius",
    "timeoutMs": 60000,
    "maxRetries": 3,
    "retryDelayMs": 5000,
    "expectFinal": false
  },
  "execution": {
    "dryRun": false,
    "logDirectory": "~/.clawgate/logs",
    "logRetentionDays": 30
  },
  "paths": {
    "stateDir": "~/.clawgate",
    "jobsDir": "~/.clawgate/jobs",
    "logsDir": "~/.clawgate/logs",
    "locksDir": "~/.clawgate/locks",
    "templatesDir": "~/.clawgate/templates"
  }
}
```

### Auto-Detection of openclaw Binary

If `openclaw.bin` is not set, ClawGate searches (in order):
1. `OPENCLAW_BIN` environment variable
2. `~/.npm-global/bin/openclaw`
3. `/usr/local/bin/openclaw`
4. `/usr/bin/openclaw`
5. `~/.local/bin/openclaw`
6. Falls back to `openclaw` in PATH

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCLAW_BIN` | Path to openclaw binary |
| `OPENCLAW_GATEWAY_URL` | OpenClaw gateway URL |
| `OPENCLAW_GATEWAY_TOKEN` | Auth token |
| `OPENCLAW_GATEWAY_PASSWORD` | Gateway password |
| `CLAWGATE_STATE_DIR` | State directory override |
| `CLAWGATE_DRY_RUN` | Global dry-run mode |

---

## Job File Format

Location: `~/.clawgate/jobs/<uuid>.json`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "daily-digest",
  "description": "9:00 every monday",
  "schedule": {
    "cronExpression": "0 9 * * 1",
    "timezone": "Europe/Vilnius",
    "nextRun": null
  },
  "target": {
    "type": "agent",
    "agentId": "music",
    "channel": "telegram",
    "replyAccount": "musicbot",
    "to": "xxxxx"
  },
  "payload": {
    "type": "text",
    "content": "Generate daily digest"
  },
  "execution": {
    "enabled": true,
    "timeoutMs": 60000,
    "maxRetries": 3,
    "retryDelayMs": 5000,
    "expectFinal": false,
    "autoDelete": false,
    "maxRuns": null
  },
  "state": {
    "lastRun": "2026-02-18T10:00:00Z",
    "lastResult": "success",
    "runCount": 1,
    "failCount": 0
  },
  "createdAt": "2026-02-18T09:00:00Z",
  "updatedAt": "2026-02-18T10:00:00Z"
}
```

**Fields:**
- `schedule` - Embedded schedule config (cron, timezone, nextRun)
- `target.replyAccount` - Maps to Telegram account (musicbot, codebot, etc)
- `execution.autoDelete` - Delete after successful run
- `execution.maxRuns` - Maximum executions before auto-delete
- `state.runCount` - Current execution count

---

## State Directory Structure

```
~/.clawgate/
├── config.json       # User configuration
├── jobs/             # Job definitions
│   └── <uuid>.json
├── locks/            # Execution locks
│   └── <uuid>.lock
├── logs/             # Execution logs
│   └── <uuid>/
│       └── YYYY-MM-DD.log
└── templates/        # Message templates (future)
```

---

## Examples

### Daily Digest
```bash
clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every monday" \
  --agent music \
  --message "Generate daily digest" \
  --channel telegram \
  --to "xxxxx"
```

### Weekly Report (Limited to 4 runs)
```bash
clawgate schedule create \
  --name "weekly-report" \
  --schedule "9am every monday 4x" \
  --agent code \
  --message "Generate weekly report"
```

### One-Time Reminder
```bash
clawgate schedule create \
  --name "reminder" \
  --schedule "next Friday at 5pm" \
  --agent music \
  --message "Weekly review time"
```

### Disable/Re-enable Jobs
```bash
clawgate schedule edit <uuid> --enabled false
clawgate schedule edit <uuid> --enabled true
```

### Manual Retry
```bash
clawgate schedule list --json | jq '.[] | select(.state.lastResult == "failure")'
clawgate schedule execute <uuid> --verbose
```

### Check Auto-Delete Status
```bash
clawgate schedule show <uuid>
# Shows: Auto-delete: Yes / Max runs: 2/4
```
