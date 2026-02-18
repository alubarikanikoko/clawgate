# ClawGate

Cross-agent messaging toolkit for OpenClaw.

## Architecture

ClawGate is organized as a modular system. Each module lives in `src/<module>/`.

### Current Modules

| Module | Path | Description |
|--------|------|-------------|
| **Schedule** | [`src/scheduler/`](./src/scheduler/) | System cron wrapper with natural language scheduling. Decouples scheduling from execution. |

## Module: Schedule

### Problem

OpenClaw's built-in cron system injects system instructions that override cron message instructions, causing digests to be truncated to 1-2 sentences instead of full content with links.

### Solution

The Schedule module uses **system cron** to trigger jobs by UUID, while storing actual payloads in JSON files. This prevents instruction injection because the message content is never in the cron line.

```
System Cron ──▶ ClawGate ──▶ UUID Lookup ──▶ JSON Payload ──▶ OpenClaw API
```

### Quick Example

```bash
# Create a job with natural language schedule
clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every Monday" \
  --agent music \
  --message "Generate daily digest"

# Or use standard cron: --schedule "0 9 * * *"
# Or count-limited: --schedule "every tuesday 4x" (runs 4 times then deletes)
# Or one-time: --schedule "next Thursday at 3pm" (--auto-delete implied)

# System cron gets (no payload):
# 0 9 * * * /path/to/clawgate schedule execute <uuid>

# Actual payload stored in:
# ~/.clawgate/jobs/<uuid>.json
```

### Supported Schedule Expressions

| Expression | Result |
|------------|--------|
| `"9am every Monday"` | Every Monday at 9am |
| `"every Tuesday at 3pm"` | Every Tuesday at 3pm |
| `"every 15 minutes"` | Every 15 minutes |
| `"daily at 9am"` | Daily at 9am |
| `"weekdays at 8:30am"` | Mon-Fri at 8:30am |
| `"next Thursday"` | Next Thursday (one-time) |
| `"in 30 minutes"` | 30 minutes from now (one-time) |
| `"at 2pm today"` | Today at 2pm (one-time) |
| `"every tuesday 4x"` | 4 Tuesdays, then auto-delete |
| `"0 9 * * *"` | Standard cron (passthrough) |

### CLI Commands

```bash
# Create job
clawgate schedule create --name "..." --schedule "..." --agent <id> --message "..."

# Show examples
clawgate schedule create --examples

# List jobs
clawgate schedule list [--json] [--agent <id>] [--enabled]

# Show details
clawgate schedule show <uuid> [--json]

# Execute manually
clawgate schedule execute <uuid> [--dry-run] [--force]

# Edit job
clawgate schedule edit <uuid> [--message "..."] [--schedule "..."] [--enabled true|false]

# Delete job
clawgate schedule delete <uuid> --force

# Manage cron
clawgate schedule cron --show | --install | --uninstall

# View logs
clawgate schedule logs <uuid> [--last]
```

### Options

- `--name, -n` — Job name (required)
- `--schedule, -s` — Schedule expression: cron OR natural language (required)
- `--agent, -a` — Target agent ID
- `--message, -m` — Message payload
- `--channel, -c` — Channel (default: telegram)
- `--to` — Target recipient (defaults to session user)
- `--timezone, -z` — IANA timezone (default: Europe/Vilnius)
- `--auto-delete` — Delete job after successful execution
- `--disabled` — Create as disabled
- `--dry-run` — Preview without creating
- `--examples` — Show schedule expression examples

### Configuration

Create `~/.clawgate/config.json`:

```json
{
  "openclaw": {
    "gatewayUrl": "ws://127.0.0.1:18789",
    "bin": "/path/to/openclaw"
  },
  "defaults": {
    "timezone": "Europe/Vilnius",
    "timeoutMs": 60000
  }
}
```

Or set env var: `OPENCLAW_BIN=/path/to/openclaw`

## State Directory

```
~/.clawgate/
├── jobs/       # Job definitions (JSON)
├── locks/      # Execution locks
├── logs/       # Execution logs
└── templates/  # Message templates
```

## Future Modules

Planned additions to ClawGate:

| Module | Purpose |
|--------|---------|
| `watchdog` | Monitor agent health, restart stuck sessions |
| `bridge` | Webhook → OpenClaw adapter |
| `queue` | Persistent job queue with retry |
| `audit` | Log and audit cross-agent messages |
| `notify` | Multi-channel notification dispatcher |

## Requirements

- Node.js 20+
- OpenClaw gateway running
- System cron (Linux/Mac)

## Repository

```
clawgate/
├── src/scheduler/     # Schedule module implementation
│   ├── cli.ts
│   ├── executor.ts
│   ├── registry.ts
│   ├── schedule-parser.ts
│   └── ...
├── memory/            # Session notes
├── package.json
└── README.md
```

## License

MIT
