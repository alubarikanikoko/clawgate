# ClawGate

Cross-agent messaging toolkit for OpenClaw.

## Problem

OpenClaw's cron system injects system instructions that override cron message instructions, causing digests to be truncated to 1-2 sentences instead of full content with links.

## Solution

Use the Gateway API (`callGateway`) to directly send messages or trigger agent runs, bypassing cron's instruction injection.

## Test Scripts

### `tests/simple_send.ts`
Basic test sending a message directly to Salideku's main session.

```bash
cd ~/Emma\ Projects/clawgate
bun tests/simple_send.ts
```

### `tests/send_to_salideku.ts`
Comprehensive test exploring multiple send methods:
- `agent` - Direct agent invocation
- `sessions.list` - Discover active sessions
- `wake` - Trigger wake event
- `agents.list` - Verify target agent exists

## Requirements

- Bun runtime
- OpenClaw gateway running (`openclaw gateway run`)
- Gateway token configured if auth enabled

## Gateway Methods Available

See full list of `callGateway` methods in `src/gateway/server-methods-list.ts` of the OpenClaw source:

- `agent` - Run/trigger an agent
- `send` - Send message to any channel
- `sessions.list` - List active sessions
- `sessions.reset` - Reset a session
- `cron.list` - List cron jobs
- And 60+ more...

## Next Steps

1. Run `simple_send.ts` to verify basic connectivity
2. If it works, build a digest sender that uses `send` method directly
3. Consider creating a replacement cron workflow that doesn't rely on injected instructions