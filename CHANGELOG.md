# Changelog

All notable changes to ClawGate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-02

### Added

#### Checkpoint Module
- Create, complete, update, and delete checkpoints for project tracking
- Support for multiple checkpoint states: active, completed, success, failed, aborted
- Project filtering and status-based queries
- Last checkpoint retrieval for project status
- Evidence/notes attachment to checkpoints

#### Queue Module
- Task dependency graph management
- Task states: defined, queued, waiting, ready, running, complete, failed
- Dependency-aware execution (tasks wait for dependencies to complete)
- Agent-specific task polling with `next` command
- Timeout and retry configuration per task
- Blocked task identification (circular dependencies, failed prerequisites)
- Task reset and deletion capabilities

#### Self-Watchdog Module (under Watchdog)
- Agent idle detection with configurable timeout
- Auto-pong integration on agent activity
- Multiple actions on timeout:
  - `notify-user` - Send notification to user
  - `message-agent` - Send message to another agent
  - `create-reminder` - Create a reminder
  - `checkpoint-status-report` - Report checkpoint status
  - `escalate-to-human` - Escalate to human
- Self-watchdog status checking and listing
- Manual pong reset capability

### Changed

#### CLI Structure
- New subcommands added:
  - `clawgate checkpoint <command>` - Checkpoint operations
  - `clawgate queue <command>` - Queue operations
  - `clawgate watchdog self <options>` - Self-watchdog registration
  - `clawgate watchdog pong` - Reset idle timer
  - `clawgate watchdog self-status` - Check watchdog status
  - `clawgate watchdog self-list` - List active watchdogs
  - `clawgate watchdog self-remove` - Remove watchdog
  - `clawgate watchdog self-check` - Check expiration and execute

#### Watchdog Enhancements
- Integrated self-watchdog subsystem for primary agent monitoring
- Auto-pong on scheduled job execution
- Auto-pong on message operations
- Auto-pong on checkpoint operations
- Auto-pong on queue task transitions

### State Directory Changes
New directories added under `~/.clawgate/`:
- `checkpoints/` - Checkpoint data storage
- `queues/` - Queue task definitions and state
- `watchdog/` - Watchdog logs and self-watchdog states

## [0.1.0] - 2026-02-18

### Added

#### Schedule Module
- Natural language scheduling ("9am every Monday", "in 30 minutes")
- Support for run limits (`4x` syntax)
- One-time job support with auto-deletion
- Job creation, listing, execution, editing, and deletion
- Cron integration for system-level scheduling

#### Message Module
- Fire-and-forget messaging (`--background`)
- Request-reply pattern with configurable timeout
- Agent handoff with context preservation (`--return-after`)
- Message status tracking and acknowledgment
- Reply tracking with persistent storage

#### Watchdog Module
- Orphaned lock detection and cleanup
- Stuck session identification
- Background daemon mode
- Automated cleanup with `--auto-kill`
- Cron integration for periodic checks
- Logs view with filtering and follow mode

### Initial Release
- Core CLI framework with Commander.js
- Shell completion support (bash, zsh, fish)
- Configuration system via `~/.clawgate/config.json`
- State management in `~/.clawgate/` directory
