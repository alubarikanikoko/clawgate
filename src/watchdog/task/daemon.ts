/**
 * Task Watchdog Daemon
 * Long-running process that manages task watchdog pings
 */

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import type { TaskWatchdogState } from "./types.js";
import { WATCHDOG_PROMPT_TEMPLATE } from "./types.js";

const STATE_DIR = path.join(homedir(), ".clawgate", "task-watchdogs");
const DAEMON_PID_FILE = path.join(STATE_DIR, "daemon.pid");

interface RunningTask {
  state: TaskWatchdogState;
  timer: NodeJS.Timeout | null;
}

const runningTasks: Map<string, RunningTask> = new Map();

// Save daemon PID
function saveDaemonPid(): void {
  fs.writeFileSync(DAEMON_PID_FILE, String(process.pid));
}

// Get daemon PID
function getDaemonPid(): number | null {
  if (!fs.existsSync(DAEMON_PID_FILE)) return null;
  try {
    return parseInt(fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim());
  } catch {
    return null;
  }
}

// Check if daemon is running
function isDaemonRunning(): boolean {
  const pid = getDaemonPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Load all active tasks and start their timers
function loadAndStartAllTasks(): void {
  if (!fs.existsSync(STATE_DIR)) return;
  
  const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith(".json") && f !== "daemon.pid");
  
  for (const file of files) {
    const taskId = file.replace(".json", "");
    try {
      startTaskTimer(taskId);
    } catch {
      // Skip corrupt files
    }
  }
}

// Start timer for a single task - always read fresh from disk
function startTaskTimer(taskId: string): void {
  if (runningTasks.has(taskId)) {
    return; // Already running
  }
  
  // Read fresh from disk
  const taskFile = path.join(STATE_DIR, `${taskId}.json`);
  if (!fs.existsSync(taskFile)) return;
  
  let task: TaskWatchdogState;
  try {
    task = JSON.parse(fs.readFileSync(taskFile, "utf-8"));
  } catch {
    return;
  }
  
  const intervalMs = task.intervalMinutes * 60 * 1000;
  
  const timer = setTimeout(async () => {
    await sendPing(taskId);
  }, intervalMs);
  
  runningTasks.set(taskId, { state: task, timer });
  console.log(`[daemon] Started timer for ${taskId} (${task.intervalMinutes}min)`);
}

// Send ping to agent
async function sendPing(taskId: string): Promise<void> {
  const taskFile = path.join(STATE_DIR, `${taskId}.json`);
  if (!fs.existsSync(taskFile)) {
    console.log(`[daemon] Task file not found: ${taskId}`);
    return;
  }
  
  let task: TaskWatchdogState;
  try {
    task = JSON.parse(fs.readFileSync(taskFile, "utf-8"));
  } catch {
    console.log(`[daemon] Failed to parse task: ${taskId}`);
    return;
  }
  
  if (task.status !== "active") {
    console.log(`[daemon] Task not active: ${taskId}`);
    return;
  }
  
  // Build and send message
  const pingNumber = task.pingCount + 1;
  const message = buildWatchdogMessage(task.taskId, task.title, pingNumber, task.maxPings);
  
  console.log(`[daemon] Sending ping ${pingNumber}/${task.maxPings} to ${task.agentId}`);
  
  // Use clawgate message send
  const cmd = `clawgate message send --agent ${task.agentId} --message "${message.replace(/"/g, '\\"')}" --background`;
  
  exec(cmd, (_err, _stdout, _stderr) => {
    if (_err) {
      console.error(`[daemon] Failed to send ping: ${_err.message}`);
    } else {
      // Update ping count
      task.pingCount += 1;
      task.lastPingAt = new Date().toISOString();
      fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
      console.log(`[daemon] Ping sent: ${taskId} (${task.pingCount}/${task.maxPings})`);
      
      // Check if max pings reached
      if (task.pingCount >= task.maxPings) {
        task.status = "expired";
        fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
        console.log(`[daemon] Task expired: ${taskId}`);
      }
    }
    
    // Schedule next ping
    scheduleNextPing(taskId);
  });
}

// Schedule next ping - always read fresh from disk
function scheduleNextPing(taskId: string): void {
  const taskFile = path.join(STATE_DIR, `${taskId}.json`);
  if (!fs.existsSync(taskFile)) {
    runningTasks.delete(taskId);
    return;
  }
  
  let task: TaskWatchdogState;
  try {
    task = JSON.parse(fs.readFileSync(taskFile, "utf-8"));
  } catch {
    runningTasks.delete(taskId);
    return;
  }
  
  if (task.status !== "active") {
    runningTasks.delete(taskId);
    return;
  }
  
  // Remove existing timer entry so it gets recreated
  runningTasks.delete(taskId);
  
  startTaskTimer(taskId);
}

// Build watchdog message using template from types.ts
function buildWatchdogMessage(taskId: string, title: string, pingNumber: number, maxPings: number): string {
  return WATCHDOG_PROMPT_TEMPLATE
    .replace("{TITLE}", title)
    .replace("{PING_NUMBER}", String(pingNumber))
    .replace("{MAX_PINGS}", String(maxPings))
    .replace("{TASK_ID}", taskId);
}

// Handle signals
process.on("SIGTERM", () => {
  console.log("[daemon] Received SIGTERM, shutting down...");
  for (const [_taskId, running] of runningTasks) {
    if (running.timer) clearTimeout(running.timer);
  }
  runningTasks.clear();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[daemon] Received SIGINT, shutting down...");
  for (const [_taskId, running] of runningTasks) {
    if (running.timer) clearTimeout(running.timer);
  }
  runningTasks.clear();
  process.exit(0);
});

// Main - check if running directly
const isMain = process.argv[1]?.includes("daemon.js");

if (isMain) {
  if (isDaemonRunning()) {
    console.log("Daemon already running (PID:", getDaemonPid() + ")");
    process.exit(1);
  }
  
  console.log("[daemon] Starting task watchdog daemon...");
  saveDaemonPid();
  loadAndStartAllTasks();
  console.log(`[daemon] Running with ${runningTasks.size} active tasks`);
  
  // Keep process alive
  setInterval(() => {
    // Periodic health check - reload any new tasks
    loadAndStartAllTasks();
  }, 60000);
}

export { isDaemonRunning, getDaemonPid, sendPing };
