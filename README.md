# ClawGate

Cross-agent messaging toolkit for OpenClaw.

## What is ClawGate?

ClawGate is a CLI tool and scheduling layer that solves critical gaps in OpenClaw's native messaging and cron systems.

**The Problem:** OpenClaw's built-in cron injects system instructions that truncate messages to ~100 characters, strip hyperlinks, and offer no way to schedule one-time reminders or limit run counts. Agent-to-agent communication requires going through the orchestrator with no direct routing, reply tracking, or timeout control.

**The Solution:** ClawGate stores message payloads in JSON files triggered by system cron—no instruction injection means full content preservation. It adds natural language scheduling ("9am every Monday", "in 30 minutes"), direct agent-to-agent messaging with reply tracking, and handoff capabilities with context preservation.

**Two Modules:**
- **Schedule** — Deferred/cron-based agent messaging with natural language expressions
- **Message** — Immediate agent communication with fire-and-forget, request-reply, and handoff patterns

## Modules

| Module | Purpose | Key Commands |
|--------|---------|--------------|
| **Schedule** | Deferred/cron-based agent messaging | `create`, `list`, `execute` |
| **Message** | Immediate agent communication and handoffs | `send`, `handoff`, `list` |

## Quick Examples

```bash
# Schedule module: Natural language scheduling
clawgate schedule create \
  --name "daily-digest" \
  --schedule "9am every Monday" \
  --agent music \
  --message "Generate daily digest"

# Message module: Send to agent (fire-and-forget)
clawgate message send \
  --agent code \
  --message "Review this code" \
  --background

# Message module: Send and wait for reply (5 min timeout)
clawgate message send \
  --agent music \
  --message "Generate playlist" \
  --request-reply

# Message module: Send with custom timeout (10 min)
clawgate message send \
  --agent code \
  --message "Research needed" \
  --request-reply \
  --timeout 600000

# Message module: Handoff with context
clawgate message handoff \
  --agent music \
  --message "Generate playlist" \
  --return-after
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
│   └── message/            # Message module
│       ├── cli.ts
│       ├── router.ts
│       ├── handoff.ts
│       └── ...
├── skills/clawgate/        # OpenClaw skill
│   ├── SKILL.md
│   └── references/
├── package.json
└── README.md
```

## License

MIT
