/**
 * ClawGate Scheduler - Crontab Management
 * 
 * Converts all schedules to UTC to avoid CRON_TZ compatibility issues.
 * CRON_TZ is not universally supported, but UTC conversion works everywhere.
 */

import { execSync } from "child_process";

const CLAWGATE_HEADER = "# ClawGate managed jobs - DO NOT EDIT BELOW";
const CLAWGATE_FOOTER = "# ClawGate end";

function getClawgatePath(): string {
  // Resolve path to the CLI entry point
  // From ~/.clawgate/cron.d entry: node ~/Emma\ Projects/clawgate/dist/scheduler/cli.js
  const homedir = process.env.HOME || "/home/office";
  const cliPath = `${homedir}/Emma Projects/clawgate/dist/scheduler/cli.js`;
  // Escape spaces for cron
  return `node ${cliPath.replace(/ /g, "\\ ")}`;
}

export interface CronEntry {
  jobId: string;
  cronExpression: string;
  timezone: string;
  command: string;
}

/**
 * Convert a cron expression from a source timezone to UTC
 * This avoids relying on CRON_TZ which isn't universally supported
 */
function convertCronToUTC(cronExpression: string, sourceTimezone: string): string {
  // Parse the 5 fields: minute hour day month day-of-week
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    // Invalid cron, return as-is
    return cronExpression;
  }

  const [minute, hour, day, month, dayOfWeek] = parts;

  // If already UTC or no timezone specified, return as-is
  if (!sourceTimezone || sourceTimezone === "UTC" || sourceTimezone === "Etc/UTC") {
    return cronExpression;
  }

  // Try to get the UTC offset for this timezone at the current time
  try {
    const now = new Date();
    
    // Calculate offset by comparing same moment in both timezones
    const utcTime = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzTime = new Date(now.toLocaleString("en-US", { timeZone: sourceTimezone }));
    const offsetMs = tzTime.getTime() - utcTime.getTime();
    const offsetHours = Math.round(offsetMs / (60 * 60 * 1000));

    // For special cases like "*" or lists, we can't easily convert
    // Only convert simple numeric hours
    if (hour !== "*" && !hour.includes(",") && !hour.includes("/") && !hour.includes("-")) {
      const hourNum = parseInt(hour, 10);
      if (!isNaN(hourNum)) {
        // Convert to UTC by subtracting the offset
        let utcHour = (hourNum - offsetHours + 24) % 24;
        
        // Handle day boundary crossings
        let utcDay = day;
        let utcDayOfWeek = dayOfWeek;
        let utcMonth = month;
        
        // If hour crosses midnight going to UTC
        if (hourNum - offsetHours < 0) {
          // Need to adjust day backward
          if (day !== "*" && !day.includes(",") && !day.includes("/") && !day.includes("-")) {
            const dayNum = parseInt(day, 10);
            if (!isNaN(dayNum) && dayNum > 1) {
              utcDay = String(dayNum - 1);
            } else {
              // Complex case - just return original
              return cronExpression;
            }
          }
        }
        
        // If hour crosses midnight going from UTC
        if (hourNum - offsetHours >= 24) {
          // Need to adjust day forward
          if (day !== "*" && !day.includes(",") && !day.includes("/") && !day.includes("-")) {
            const dayNum = parseInt(day, 10);
            if (!isNaN(dayNum) && dayNum < 31) {
              utcDay = String(dayNum + 1);
            } else {
              // Complex case - just return original
              return cronExpression;
            }
          }
        }
        
        return `${minute} ${utcHour} ${utcDay} ${utcMonth} ${utcDayOfWeek}`;
      }
    }
    
    // For complex expressions or "*", we can't easily convert
    // Return original and log a warning
    console.warn(`Warning: Complex cron expression "${cronExpression}" with timezone "${sourceTimezone}" cannot be converted to UTC. Using system local time.`);
    return cronExpression;
  } catch (err) {
    console.warn(`Warning: Failed to convert timezone ${sourceTimezone} to UTC: ${err}`);
    return cronExpression;
  }
}

export function readCrontab(): string {
  try {
    return execSync("crontab -l", { encoding: "utf-8" });
  } catch (err) {
    // No crontab exists yet
    return "";
  }
}

export function writeCrontab(content: string): void {
  execSync("crontab -", { input: content, encoding: "utf-8" });
}

export function parseCrontab(content: string): CronEntry[] {
  const entries: CronEntry[] = [];
  const lines = content.split("\n");

  let inClawGateSection = false;

  for (const line of lines) {
    if (line.includes(CLAWGATE_HEADER)) {
      inClawGateSection = true;
      continue;
    }
    if (line.includes(CLAWGATE_FOOTER)) {
      inClawGateSection = false;
      continue;
    }

    if (inClawGateSection && line.trim() && !line.startsWith("#")) {
      // Parse: "0 6 * * * node /path/to/cli.js schedule execute <jobId> # tz:Europe/Vilnius"
      const match = line.match(
        /^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+node\s+.*\s+schedule\s+execute\s+(\S+)(?:\s+#\s+tz:(\S+))?$/
      );
      if (match) {
        entries.push({
          timezone: match[3] || "",
          cronExpression: match[1],
          jobId: match[2],
          command: line.trim(),
        });
      }
    }
  }

  return entries;
}

export function generateCrontab(
  existingContent: string,
  entries: CronEntry[]
): string {
  // Get full path to clawgate CLI
  const clawgatePath = getClawgatePath();
  
  // Extract non-ClawGate content
  const lines = existingContent.split("\n");
  const outsideLines: string[] = [];
  let inClawGateSection = false;

  for (const line of lines) {
    if (line.includes(CLAWGATE_HEADER)) {
      inClawGateSection = true;
      continue;
    }
    if (line.includes(CLAWGATE_FOOTER)) {
      inClawGateSection = false;
      continue;
    }
    if (!inClawGateSection) {
      outsideLines.push(line);
    }
  }

  // Build new crontab
  const result: string[] = [...outsideLines];

  if (entries.length > 0) {
    result.push("");
    result.push(CLAWGATE_HEADER);
    result.push("# This section is managed by ClawGate. Manual edits will be overwritten.");
    result.push("# All schedules are converted to UTC for maximum compatibility.");
    
    for (const entry of entries) {
      // Convert to UTC cron expression
      const utcCron = convertCronToUTC(entry.cronExpression, entry.timezone);
      // Store original timezone in comment for reference
      const tzComment = entry.timezone ? ` # tz:${entry.timezone}` : "";
      result.push(`${utcCron} ${clawgatePath} schedule execute ${entry.jobId}${tzComment}`);
    }
    
    result.push(CLAWGATE_FOOTER);
  }

  return result.join("\n") + "\n";
}

export function addToCrontab(
  jobId: string,
  cronExpression: string,
  timezone?: string
): void {
  const existing = readCrontab();
  const entries = parseCrontab(existing);
  const clawgatePath = getClawgatePath();

  // Remove existing entry for this job if present
  const filtered = entries.filter((e) => e.jobId !== jobId);

  // Add new entry (stores original timezone, will be converted to UTC in generateCrontab)
  filtered.push({
    jobId,
    cronExpression,
    timezone: timezone || "",
    command: `${cronExpression} ${clawgatePath} schedule execute ${jobId}`,
  });

  const newContent = generateCrontab(existing, filtered);
  writeCrontab(newContent);
}

export function removeFromCrontab(jobId: string): void {
  const existing = readCrontab();
  const entries = parseCrontab(existing);

  const filtered = entries.filter((e) => e.jobId !== jobId);

  const newContent = generateCrontab(existing, filtered);
  writeCrontab(newContent);
}

export function listCrontabEntries(): CronEntry[] {
  const existing = readCrontab();
  return parseCrontab(existing);
}

export function validateCronExpression(expression: string): boolean {
  // Basic validation: 5 fields
  const parts = expression.trim().split(/\s+/);
  return parts.length === 5;
}
