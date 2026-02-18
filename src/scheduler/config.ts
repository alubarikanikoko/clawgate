/**
 * ClawGate Scheduler - Configuration
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, mkdirSync } from "fs";
import type { ClawGateConfig } from "./types.js";

const DEFAULT_CONFIG: ClawGateConfig = {
  openclaw: {
    gatewayUrl: "ws://127.0.0.1:18789",
    token: undefined,
    password: undefined,
  },
  defaults: {
    timezone: "Europe/Vilnius",
    timeoutMs: 60000,
    maxRetries: 3,
    retryDelayMs: 5000,
    expectFinal: false,
  },
  execution: {
    dryRun: false,
    logDirectory: "",
    logRetentionDays: 30,
  },
  paths: {
    stateDir: "",
    jobsDir: "",
    schedulesDir: "",
    logsDir: "",
    locksDir: "",
    templatesDir: "",
  },
};

function resolveStateDir(): string {
  // Check environment variables
  const envDir = process.env.CLAWGATE_STATE_DIR;
  if (envDir) {
    return envDir;
  }

  // Default to ~/.clawgate
  return join(homedir(), ".clawgate");
}

function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function loadConfig(): ClawGateConfig {
  const stateDir = resolveStateDir();
  const configPath = join(stateDir, "config.json");

  // Load user config if exists
  let userConfig: Partial<ClawGateConfig> = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      userConfig = JSON.parse(content);
    } catch (err) {
      console.warn(`Warning: Failed to parse config at ${configPath}:`, err);
    }
  }

  // Merge with defaults
  const config: ClawGateConfig = {
    openclaw: {
      ...DEFAULT_CONFIG.openclaw,
      ...userConfig.openclaw,
    },
    defaults: {
      ...DEFAULT_CONFIG.defaults,
      ...userConfig.defaults,
    },
    execution: {
      ...DEFAULT_CONFIG.execution,
      ...userConfig.execution,
    },
    paths: {
      stateDir,
      jobsDir: ensureDir(join(stateDir, "jobs")),
      schedulesDir: ensureDir(join(stateDir, "schedules")),
      logsDir: ensureDir(join(stateDir, "logs")),
      locksDir: ensureDir(join(stateDir, "locks")),
      templatesDir: ensureDir(join(stateDir, "templates")),
    },
  };

  // Override from environment
  if (process.env.OPENCLAW_GATEWAY_URL) {
    config.openclaw.gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  }
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.openclaw.token = process.env.OPENCLAW_GATEWAY_TOKEN;
  }
  if (process.env.OPENCLAW_GATEWAY_PASSWORD) {
    config.openclaw.password = process.env.OPENCLAW_GATEWAY_PASSWORD;
  }
  if (process.env.CLAWGATE_DRY_RUN === "true") {
    config.execution.dryRun = true;
  }

  return config;
}

export function getConfigPath(): string {
  return join(resolveStateDir(), "config.json");
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}
