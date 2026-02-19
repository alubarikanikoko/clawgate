#!/usr/bin/env node
/**
 * ClawGate - Cross-agent messaging toolkit
 * Main entry point - dispatches to modules
 */

import { Command } from "commander";
// Completion script generator - no exec needed
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const program = new Command();

program
  .name("clawgate")
  .description("ClawGate - Cross-agent messaging toolkit")
  .version("0.2.0")
  .addHelpText(
    "after",
    `
Modules:
  schedule    System cron wrapper for scheduled agent messaging
  message     Agent-to-agent communication and handoff
  watchdog    (planned) Monitor agent health and restart stuck sessions
  bridge      (planned) Webhook adapter for external services
  queue       (planned) Persistent job queue with retry logic
  audit       (planned) Log and audit cross-agent messages

Use 'clawgate <module> --help' for module-specific help.

Quick Examples:
  clawgate schedule create --name "daily" --schedule "9am" --agent music --message "Hello"
  clawgate message send --agent code --message "Review this code"
  clawgate message handoff --agent music --message "Generate playlist" --return-after
`
  );

// ============================================================
// SHELL COMPLETION
// ============================================================
program
  .command("completion")
  .description("Generate shell completion scripts")
  .option("-s, --shell <shell>", "Shell type: bash, zsh, fish", "bash")
  .option("-i, --install", "Install completion to shell config")
  .action((options) => {
    const shell = options.shell;
    
    if (options.install) {
      installCompletion(shell);
    } else {
      console.log(generateCompletion(shell));
    }
  });

function generateCompletion(shell: string): string {
  if (shell === "zsh") {
    return `# clawgate zsh completion
# Source: eval "$(clawgate completion --shell zsh)"
# Or install: clawgate completion --shell zsh --install

_clawgate() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  _arguments -C \\
    '1: :->module' \\
    '2: :->command' \\
    '*:: :->args' && return 0

  case $state in
    module)
      _alternative \\
        'modules:module:(schedule message completion)'
      ;;
    command)
      case $line[1] in
        schedule)
          _alternative \\
            'commands:command:(create list show execute edit delete cron logs)'
          ;;
        message)
          _alternative \\
            'commands:command:(send handoff status list ack)'
          ;;
      esac
      ;;
    args)
      # Common options for all commands
      _arguments \\
        '(-h --help)'{-h,--help}'[Show help]' \\
        '(-v --verbose)'{-v,--verbose}'[Verbose output]' \\
        '--dry-run[Preview without executing]' \\
        '--json[Output as JSON]'
      
      # Command-specific options
      case $line[1] in
        schedule)
          case $line[2] in
            create|edit)
              _arguments \\
                '--name[Job name]:name:' \\
                '--schedule[Schedule expression]:schedule:' \\
                '--agent[Target agent]:agent:(main code music social orezi)' \\
                '--message[Message content]:message:' \\
                '--auto-delete[Auto-delete after run]' \\
                '--examples[Show schedule examples]'
              ;;
            execute|show|delete)
              _arguments '*:uuid:('
              ;;
          esac
          ;;
        message)
          case $line[2] in
            send)
              _arguments \\
                '(-a --agent)'{-a,--agent}'[Target agent]:agent:(main code music social orezi)' \\
                '(-m --message)'{-m,--message}'[Message content]:message:' \\
                '(-c --channel)'{-c,--channel}'[Channel]:channel:' \\
                '--request-reply[Wait for reply]' \\
                '--background[Fire-and-forget mode]' \\
                '--private[Internal agent-only communication]' \\
                '--timeout[Timeout in ms]:timeout:'
              ;;
            handoff)
              _arguments \\
                '(-a --agent)'{-a,--agent}'[Target agent]:agent:(main code music social orezi)' \\
                '(-m --message)'{-m,--message}'[Message content]:message:' \\
                '--context[JSON context]:context:' \\
                '--return-after[Expect return handoff]' \\
                '--return-timeout[Return timeout ms]:timeout:'
              ;;
            status|ack)
              _arguments '*:message-id:'
              ;;
            list)
              _arguments \\
                '--agent[Filter by agent]:agent:(main code music social orezi)' \\
                '--handoffs[Show handoffs only]' \\
                '--limit[Limit results]:limit:'
              ;;
          esac
          ;;
      esac
      ;;
  esac
}

compdef _clawgate clawgate
`;
  }

  if (shell === "fish") {
    return `# clawgate fish completion
# Source: clawgate completion --shell fish | source
# Or install: clawgate completion --shell fish --install

complete -c clawgate -f

# Main commands
complete -c clawgate -n "__fish_use_subcommand" -a "schedule" -d "Scheduled agent messaging"
complete -c clawgate -n "__fish_use_subcommand" -a "message" -d "Agent communication"
complete -c clawgate -n "__fish_use_subcommand" -a "completion" -d "Shell completion"

# Schedule subcommands
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "create" -d "Create scheduled job"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "list" -d "List jobs"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "show" -d "Show job details"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "execute" -d "Execute job now"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "edit" -d "Edit job"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "delete" -d "Delete job"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "cron" -d "Manage system cron"
complete -c clawgate -n "__fish_seen_subcommand_from schedule" -a "logs" -d "View job logs"

# Message subcommands
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "send" -d "Send message"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "handoff" -d "Handoff with context"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "status" -d "Check message status"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "list" -d "List messages"
complete -c clawgate -n "__fish_seen_subcommand_from message" -a "ack" -d "Acknowledge message"

# Common options
complete -c clawgate -s h -l help -d "Show help"
complete -c clawgate -s v -l verbose -d "Verbose output"
complete -c clawgate -l dry-run -d "Preview without executing"
complete -c clawgate -l json -d "Output as JSON"

# Schedule options
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -l name -d "Job name"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -l schedule -d "Schedule expression"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -s a -l agent -d "Target agent" -a "main code music social orezi"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -s m -l message -d "Message content"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create edit" -l auto-delete -d "Auto-delete after run"
complete -c clawgate -n "__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from create" -l examples -d "Show schedule examples"

# Message options
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -s a -l agent -d "Target agent" -a "main code music social orezi"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -s m -l message -d "Message content"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -s c -l channel -d "Channel"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l request-reply -d "Wait for reply"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l background -d "Fire-and-forget mode"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l private -d "Internal agent-only"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send" -l timeout -d "Timeout in ms"

complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -s a -l agent -d "Target agent" -a "main code music social orezi"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -s m -l message -d "Message content"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -l context -d "JSON context"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -l return-after -d "Expect return handoff"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from handoff" -l return-timeout -d "Return timeout ms"

complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from list" -l agent -d "Filter by agent" -a "main code music social orezi"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from list" -l handoffs -d "Show handoffs only"
complete -c clawgate -n "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from list" -l limit -d "Limit results"
`;
  }

  // Default bash
  return `# clawgate bash completion
# Source: eval "$(clawgate completion --shell bash)"
# Or install: clawgate completion --shell bash --install

_clawgate_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[\${COMP_CWORD}]}"
  prev="\${COMP_WORDS[\${COMP_CWORD}-1]}"
  
  # Main commands
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "schedule message completion" -- \${cur}) )
    return 0
  fi
  
  # Subcommands based on module
  case "\${COMP_WORDS[1]}" in
    schedule)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "create list show execute edit delete cron logs" -- \${cur}) )
        return 0
      fi
      ;;
    message)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "send handoff status list ack" -- \${cur}) )
        return 0
      fi
      ;;
  esac
  
  # Options
  local common_opts="-h --help -v --verbose --dry-run --json"
  local schedule_opts="--name --schedule --agent --message --auto-delete --examples"
  local message_send_opts="-a --agent -m --message -c --channel --request-reply --background --private --timeout --priority"
  local message_handoff_opts="-a --agent -m --message --context --context-file --return-after --return-timeout"
  local message_list_opts="--agent --handoffs --limit"
  
  if [[ "\${cur}" == -* ]]; then
    case "\${COMP_WORDS[1]}" in
      schedule)
        COMPREPLY=( $(compgen -W "\${common_opts} \${schedule_opts}" -- \${cur}) )
        ;;
      message)
        case "\${COMP_WORDS[2]}" in
          send)
            COMPREPLY=( $(compgen -W "\${common_opts} \${message_send_opts}" -- \${cur}) )
            ;;
          handoff)
            COMPREPLY=( $(compgen -W "\${common_opts} \${message_handoff_opts}" -- \${cur}) )
            ;;
          list)
            COMPREPLY=( $(compgen -W "\${common_opts} \${message_list_opts}" -- \${cur}) )
            ;;
          *)
            COMPREPLY=( $(compgen -W "\${common_opts}" -- \${cur}) )
            ;;
        esac
        ;;
      *)
        COMPREPLY=( $(compgen -W "\${common_opts}" -- \${cur}) )
        ;;
    esac
    return 0
  fi
  
  # Agent completion for --agent or -a
  if [[ "\${prev}" == "--agent" || "\${prev}" == "-a" ]]; then
    COMPREPLY=( $(compgen -W "main code music social orezi" -- \${cur}) )
    return 0
  fi
  
  return 0
}

complete -F _clawgate_completions clawgate
`;
}

function installCompletion(shell: string) {
  const home = homedir();
  let targetFile: string;
  let content: string;
  
  switch (shell) {
    case "bash":
      targetFile = join(home, ".bash_completion");
      content = generateCompletion("bash");
      break;
    case "zsh":
      // Check for oh-my-zsh
      const zshCustom = join(home, ".oh-my-zsh", "custom", "completions");
      if (existsSync(zshCustom)) {
        targetFile = join(zshCustom, "_clawgate");
      } else {
        targetFile = join(home, ".zshrc");
        content = '# ClawGate completion\\neval "$(clawgate completion --shell zsh)"\\n';
        console.log(`Appending to ${targetFile}...`);
        console.log("Please restart your shell or run: source " + targetFile);
        return;
      }
      content = generateCompletion("zsh");
      break;
    case "fish":
      const fishDir = join(home, ".config", "fish", "completions");
      if (!existsSync(fishDir)) {
        mkdirSync(fishDir, { recursive: true });
      }
      targetFile = join(fishDir, "clawgate.fish");
      content = generateCompletion("fish");
      break;
    default:
      console.error(`Unknown shell: ${shell}`);
      console.log("Supported: bash, zsh, fish");
      process.exit(1);
  }
  
  try {
    writeFileSync(targetFile, content);
    console.log(`✅ Completion installed to: ${targetFile}`);
    console.log("Please restart your shell or source the file.");
  } catch (err) {
    console.error(`Failed to write to ${targetFile}:`, err);
    process.exit(1);
  }
}

// ============================================================
// SCHEDULE MODULE
// ============================================================
program
  .command("schedule", "Schedule module - System cron wrapper for OpenClaw", {
    executableFile: "./scheduler/cli.js",
  });

// ============================================================
// MESSAGE MODULE
// ============================================================
program
  .command("message", "Message module - Agent-to-agent communication and handoff", {
    executableFile: "./message/cli.js",
  });

// Parse and run
program.parse();
