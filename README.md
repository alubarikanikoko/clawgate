# ClawGate

Cross-agent messaging toolkit for OpenClaw.

## Architecture

ClawGate is organized as a modular system. Each module lives in its own subdirectory under `architecture/`.

### Current Modules

| Module | Path | Description |
|--------|------|-------------|
| **Scheduler** | [`architecture/scheduler/`](./architecture/scheduler/) | System cron wrapper that decouples scheduling from execution. Solves OpenClaw's instruction-injection problem. |

## Module: Scheduler

### Problem

OpenClaw's built-in cron system injects system instructions that override cron message instructions, causing digests to be truncated to 1-2 sentences instead of full content with links.

### Solution

The Scheduler module uses **system cron** to trigger jobs by UUID, while storing actual payloads in JSON files. This prevents instruction injection because the message content is never in the cron line.

```
System Cron ──▶ ClawGate ──▶ UUID Lookup ──▶ JSON Payload ──▶ OpenClaw API
```

### Scheduler Documentation

| Doc | Description |
|-----|-------------|
| [SYSTEM_DESIGN.md](./architecture/scheduler/SYSTEM_DESIGN.md) | High-level architecture and data flow |
| [DATA_MODELS.md](./architecture/scheduler/DATA_MODELS.md) | Job, Schedule, ExecutionLog schemas |
| [EXECUTION_FLOW.md](./architecture/scheduler/EXECUTION_FLOW.md) | Step-by-step execution diagram |
| [API_REFERENCE.md](./architecture/scheduler/API_REFERENCE.md) | Full CLI specification |

### Quick Example

```bash
# Create a job
clawgate create \
  --name "daily-digest" \
  --schedule "0 9 * * *" \
  --agent music \
  --message "Generate daily digest" \
  --to "xxxxx"

# System cron gets (no payload in here!):
# 0 9 * * * clawgate execute 550e8400-e29b-41d4-a716-446655440000

# Actual payload stored in:
# ~/.clawgate/jobs/550e8400-e29b-41d4-a716-446655440000.json
```

## Test Scripts

`tests/` contains experimental scripts for verifying OpenClaw API access:

- `simple_send.ts` — CLI-based approach (working)
- `send_to_salideku.ts` — Multiple method exploration

## Repository

```
clawgate/
├── architecture/           # Module documentation
│   └── scheduler/          # Current module
│       ├── SYSTEM_DESIGN.md
│       ├── DATA_MODELS.md
│       ├── EXECUTION_FLOW.md
│       └── API_REFERENCE.md
├── tests/                  # Experimental scripts
├── src/                    # Implementation (future)
├── registry/               # Job storage (runtime)
└── cron.d/                 # Crontab snippets (runtime)
```

## Future Modules

Planned additions to ClawGate:

| Module | Purpose |
|--------|---------|
| `watchdog` | Monitor agent health, restart stuck sessions |
| `bridge` | Webhook → OpenClaw adapter for external services |
| `queue` | Persistent job queue with retry logic |
| `audit` | Log and audit all cross-agent messages |
| `notify` | Multi-channel notification dispatcher |

## Requirements

- Node.js 20+ or Bun
- OpenClaw gateway running locally or remotely
- System cron (for scheduler module)

## License

MIT
