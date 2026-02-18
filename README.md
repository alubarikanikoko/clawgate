# ClawGate

Cross-agent messaging toolkit for OpenClaw.

## Problem

OpenClaw's cron system injects system instructions that override cron message instructions, causing digests to be truncated to 1-2 sentences instead of full content with links.

## Solution

Use the Gateway API (`callGateway`) to directly send messages or trigger agent runs, bypassing cron's instruction injection.

## Test Results

### ✅ What Works

**1. Direct Agent Command (Simplest)**
```bash
openclaw agent --agent music --message "Your message here" --deliver
```
This triggers the music agent (Salideku) and delivers the response.

**2. System Event Wake**
```bash
openclaw system event --mode now --text "System event test"
```
Triggers a wake event but doesn't target a specific agent.

**3. Sessions Discovery**
```bash
openclaw sessions --store /home/office/.openclaw/agents/music/sessions/sessions.json --json
```
Shows `agent:music:main` is active with sessionId `08136da5-602f-4d9b-bacf-db9113c4a36f`.

### ❌ What Doesn't Work

**Direct callGateway script**: Requires proper module resolution and possibly the OpenClaw package built/linked. The CLI is the reliable interface.

## Recommended Approach

For your digest fix, use a bash script that calls:
```bash
openclaw agent --agent music --message "Generate daily digest" --deliver
```

Or if you need to send the digest TO Salideku from Emma, you'd use:
```bash
openclaw agent --agent music --message "Incoming digest from Emma: ..." --deliver
```

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