/**
 * ClawGate Scheduler - Template Resolution
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { JobPayload } from "./types.js";

export interface TemplateVariables {
  [key: string]: string | (() => string);
}

export function resolvePayload(
  payload: JobPayload,
  templatesDir: string,
  extraVars?: Record<string, string>
): string {
  let content: string;

  // Resolve based on type
  switch (payload.type) {
    case "text":
      content = payload.content || "";
      break;

    case "file":
      if (!payload.filePath) {
        throw new Error("filePath is required for file payload");
      }
      const fullPath = payload.filePath.startsWith("/")
        ? payload.filePath
        : join(templatesDir, payload.filePath);
      if (!existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
      }
      content = readFileSync(fullPath, "utf-8");
      break;

    case "template":
      if (!payload.template) {
        throw new Error("template name is required for template payload");
      }
      const templatePath = join(templatesDir, `${payload.template}.txt`);
      if (!existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
      }
      content = readFileSync(templatePath, "utf-8");
      break;

    default:
      throw new Error(`Unknown payload type: ${(payload as { type: string }).type}`);
  }

  // Apply variable substitution
  const variables: TemplateVariables = {
    // Built-in variables
    date: () => new Date().toISOString().split("T")[0],
    time: () => new Date().toISOString(),
    timestamp: () => Date.now().toString(),
    // User-defined variables
    ...(payload.variables || {}),
    // Extra variables from CLI
    ...(extraVars || {}),
  };

  return substituteVariables(content, variables);
}

export function substituteVariables(
  content: string,
  variables: TemplateVariables
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) {
      return match; // Leave unchanged if not found
    }
    if (typeof value === "function") {
      return value();
    }
    return value;
  });
}

export function listTemplates(templatesDir: string): string[] {
  if (!existsSync(templatesDir)) {
    return [];
  }
  const files = readFileSync(templatesDir, { encoding: "utf-8" });
  return files
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(".txt", ""));
}
