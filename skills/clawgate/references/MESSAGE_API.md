# Message Module - API Reference

## Commands

### `clawgate message send`

Send immediate message to an agent.

```bash
# Fire-and-forget (returns immediately)
clawgate message send \
  --agent code \
  --message "Review this code" \
  --background

# Wait for reply (5 minute default timeout)
clawgate message send \
  --agent music \
  --message "Generate playlist" \
  --request-reply

# Custom timeout for long tasks
clawgate message send \
  --agent code \
  --message "Deep research needed" \
  --request-reply \
  --timeout 600000

# Force private (internal agent-only)
clawgate message send \
  --agent music \
  --message "Sensitive task" \
  --background \
  --private
```

**Options:**

| Flag | Description |
|------|-------------|
| `--agent, -a` | Target agent ID (required) |
| `--message, -m` | Message content (required) |
| `--channel, -c` | Channel for public messages (default: telegram) |
| `--to, -t` | Target recipient |
| `--request-reply` | Wait for reply from target agent (private by default) |
| `--background` | Fire-and-forget mode (public by default) |
| `--private` | Force internal agent-only communication |
| `--timeout` | Timeout in ms (default: 300000 = 5 min) |
| `--priority` | low, normal, high (default: normal) |
| `--dry-run` | Preview without sending |
| `--verbose` | Verbose output |

**Privacy Defaults:**
- `--request-reply`: Private (internal only) by default
- `--background`: Public (via channel) by default
- Use `--private` or `--private false` to override

---

### `clawgate message handoff`

Handoff conversation with context preservation.

```bash
# Basic handoff
clawgate message handoff --agent code --message "Review this"

# With return expectation
clawgate message handoff \
  --agent music \
  --message "Generate playlist" \
  --return-after \
  --return-timeout 300000

# With context
clawgate message handoff \
  --agent code \
  --message "Review architecture" \
  --context '{"originalRequest": "Build feature X", "artifacts": ["design.md"]}' \
  --return-after
```

**Options:**

| Flag | Description |
|------|-------------|
| `--agent, -a` | Target agent (required) |
| `--message, -m` | Handoff message |
| `--context` | JSON context string |
| `--context-file` | File with context JSON |
| `--deliver-to` | Override recipient |
| `--return-after` | Expect return handoff |
| `--return-timeout` | Return timeout ms (default: 300000) |
| `--dry-run` | Preview without executing |

**Context Object:**

```json
{
  "conversationId": "uuid",
  "sessionId": "uuid",
  "userId": "xxxxx",
  "originalRequest": "...",
  "previousAgents": ["scheduler"],
  "artifacts": ["file1.md", "file2.json"],
  "data": { "key": "value" }
}
```

---

### `clawgate message status`

Check message status.

```bash
clawgate message status <message-id>
clawgate message status <message-id> --json
```

**Status values:**
- `pending` - Queued for sending
- `sent` - Message sent
- `delivered` - Confirmed delivery
- `responded` - Reply received
- `failed` - Send failed

---

### `clawgate message list`

List recent messages.

```bash
clawgate message list
clawgate message list --agent code
clawgate message list --handoffs
clawgate message list --limit 50 --json
```

---

### `clawgate message ack`

Acknowledge message (for receiving agents).

```bash
clawgate message ack <message-id>
clawgate message ack <message-id> --reply "Done"
clawgate message ack <message-id> --status completed
```

---

## State Directory

```
~/.clawgate/
├── messages/
│   └── <message-id>.json
└── handoffs/
    └── <handoff-id>.json
```

---

## Patterns

### Agent Handoff Chain

```bash
# Music agent hands off to code agent
clawgate message handoff \
  --agent code \
  --message "Need feature built" \
  --return-after

# Code agent completes and returns
clawgate message ack <handoff-id> \
  --status completed \
  --reply "Feature implemented"
```

### Priority Escalation

```bash
clawgate message send \
  --agent code \
  --message "URGENT: Fix needed" \
  --priority high
```

### Async with Status Check

```bash
# Send
result=$(clawgate message send --agent music --message "Task" --json)
id=$(echo $result | jq -r '.messageId')

# Check later
clawgate message status $id
```
