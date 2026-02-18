/**
 * ClawGate Scheduler - Job Validation
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateJob(job: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!job || typeof job !== "object") {
    return { valid: false, errors: [{ field: "", message: "Job must be an object" }] };
  }

  const j = job as Record<string, unknown>;

  // Required fields
  if (!j.id || typeof j.id !== "string") {
    errors.push({ field: "id", message: "id is required and must be a string" });
  }

  if (!j.name || typeof j.name !== "string" || j.name.trim() === "") {
    errors.push({ field: "name", message: "name is required and must be a non-empty string" });
  }

  // Schedule validation
  if (!j.schedule || typeof j.schedule !== "object") {
    errors.push({ field: "schedule", message: "schedule is required" });
  } else {
    const sched = j.schedule as Record<string, unknown>;
    if (!sched.cronExpression || typeof sched.cronExpression !== "string") {
      errors.push({ field: "schedule.cronExpression", message: "schedule.cronExpression is required" });
    }
  }

  // Target validation
  if (!j.target || typeof j.target !== "object") {
    errors.push({ field: "target", message: "target is required" });
  } else {
    const target = j.target as Record<string, unknown>;
    if (!target.type || !["agent", "message"].includes(target.type as string)) {
      errors.push({ field: "target.type", message: "target.type must be 'agent' or 'message'" });
    }
  }

  // Payload validation
  if (!j.payload || typeof j.payload !== "object") {
    errors.push({ field: "payload", message: "payload is required" });
  } else {
    const payload = j.payload as Record<string, unknown>;
    if (!payload.type || !["text", "template", "file"].includes(payload.type as string)) {
      errors.push({ field: "payload.type", message: "payload.type must be 'text', 'template', or 'file'" });
    }

    // Content validation based on type
    if (payload.type === "text" && (!payload.content || typeof payload.content !== "string")) {
      errors.push({ field: "payload.content", message: "payload.content is required when type is 'text'" });
    }

    if (payload.type === "template" && (!payload.template || typeof payload.template !== "string")) {
      errors.push({ field: "payload.template", message: "payload.template is required when type is 'template'" });
    }

    if (payload.type === "file" && (!payload.filePath || typeof payload.filePath !== "string")) {
      errors.push({ field: "payload.filePath", message: "payload.filePath is required when type is 'file'" });
    }
  }

  // Execution validation
  if (!j.execution || typeof j.execution !== "object") {
    errors.push({ field: "execution", message: "execution is required" });
  } else {
    const exec = j.execution as Record<string, unknown>;
    if (typeof exec.enabled !== "boolean") {
      errors.push({ field: "execution.enabled", message: "execution.enabled must be a boolean" });
    }
    if (typeof exec.timeoutMs !== "number" || exec.timeoutMs < 1000) {
      errors.push({ field: "execution.timeoutMs", message: "execution.timeoutMs must be at least 1000" });
    }
    if (typeof exec.autoDelete !== "boolean") {
      errors.push({ field: "execution.autoDelete", message: "execution.autoDelete must be a boolean" });
    }
    if (exec.maxRuns !== undefined && (typeof exec.maxRuns !== "number" || exec.maxRuns < 1)) {
      errors.push({ field: "execution.maxRuns", message: "execution.maxRuns must be a positive number" });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCreateInput(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: [{ field: "", message: "Input must be an object" }] };
  }

  const i = input as Record<string, unknown>;

  if (!i.name || typeof i.name !== "string" || i.name.trim() === "") {
    errors.push({ field: "name", message: "name is required and must be non-empty" });
  }

  if (!i.schedule || typeof i.schedule !== "string") {
    errors.push({ field: "schedule", message: "schedule is required" });
  }

  if (!i.target || typeof i.target !== "object") {
    errors.push({ field: "target", message: "target is required" });
  }

  if (!i.payload || typeof i.payload !== "object") {
    errors.push({ field: "payload", message: "payload is required" });
  }

  return { valid: errors.length === 0, errors };
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map((e) => `  - ${e.field}: ${e.message}`).join("\n");
}
