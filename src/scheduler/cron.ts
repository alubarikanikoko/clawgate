/**
 * ClawGate Scheduler - Crontab Management
 */

import { execSync } from "child_process";

const CLAWGATE_HEADER = "# ClawGate managed jobs - DO NOT EDIT BELOW";
const CLAWGATE_FOOTER = "# ClawGate end";

export interface CronEntry {
  jobId: string;
  cronExpression: string;
  command: string;
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

    if (inClawGateSection && line.trim()) {
      // Parse: "* * * * * clawgate execute <jobId>"
      const match = line.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+clawgate execute (\S+)$/);
      if (match) {
        entries.push({
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
    
    for (const entry of entries) {
      result.push(`${entry.cronExpression} clawgate execute ${entry.jobId}`);
    }
    
    result.push(CLAWGATE_FOOTER);
  }

  return result.join("\n") + "\n";
}

export function addToCrontab(
  jobId: string,
  cronExpression: string
): void {
  const existing = readCrontab();
  const entries = parseCrontab(existing);

  // Remove existing entry for this job if present
  const filtered = entries.filter((e) => e.jobId !== jobId);

  // Add new entry
  filtered.push({
    jobId,
    cronExpression,
    command: `${cronExpression} clawgate execute ${jobId}`,
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
