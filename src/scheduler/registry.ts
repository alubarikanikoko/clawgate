/**
 * ClawGate Scheduler - Job Registry
 */

import { randomUUID } from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import type { Job, CreateJobInput } from "./types.js";
import { validateJob } from "./validator.js";

export class Registry {
  private jobsDir: string;

  constructor(jobsDir: string) {
    this.jobsDir = jobsDir;
  }

  // Job CRUD

  create(input: CreateJobInput): Job {
    const now = new Date().toISOString();
    const id = randomUUID();

    const job: Job = {
      id,
      name: input.name,
      description: input.description,
      schedule: {
        cronExpression: input.schedule,
        timezone: input.timezone || "Europe/Vilnius",
        nextRun: null,
      },
      target: input.target,
      payload: input.payload,
      execution: {
        enabled: input.enabled ?? true,
        timeoutMs: 60000,
        maxRetries: 3,
        retryDelayMs: 5000,
        expectFinal: false,
        autoDelete: input.autoDelete ?? false,
        maxRuns: input.maxRuns,
      },
      state: {
        lastRun: null,
        lastResult: null,
        runCount: 0,
        failCount: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.saveJob(job);
    return job;
  }

  get(id: string): Job | null {
    const path = join(this.jobsDir, `${id}.json`);
    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, "utf-8");
      const job = JSON.parse(content) as Job;
      
      // Validate
      const validation = validateJob(job);
      if (!validation.valid) {
        console.warn(`Warning: Job ${id} failed validation:`, validation.errors);
      }

      return job;
    } catch (err) {
      console.error(`Failed to read job ${id}:`, err);
      return null;
    }
  }

  getAll(): Job[] {
    if (!existsSync(this.jobsDir)) {
      return [];
    }

    const files = readdirSync(this.jobsDir).filter((f) => f.endsWith(".json"));
    const jobs: Job[] = [];

    for (const file of files) {
      const id = file.replace(".json", "");
      const job = this.get(id);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs.sort((a, b) => a.name.localeCompare(b.name));
  }

  update(id: string, updates: Partial<Job>): Job | null {
    const job = this.get(id);
    if (!job) {
      return null;
    }

    const updated: Job = {
      ...job,
      ...updates,
      id: job.id, // Prevent ID change
      updatedAt: new Date().toISOString(),
    };

    this.saveJob(updated);
    return updated;
  }

  updateState(
    id: string,
    state: Partial<Job["state"]>
  ): Job | null {
    const job = this.get(id);
    if (!job) {
      return null;
    }

    job.state = { ...job.state, ...state };
    job.updatedAt = new Date().toISOString();

    this.saveJob(job);
    return job;
  }

  delete(id: string): boolean {
    const jobPath = join(this.jobsDir, `${id}.json`);

    if (existsSync(jobPath)) {
      unlinkSync(jobPath);
      return true;
    }

    return false;
  }

  exists(id: string): boolean {
    return existsSync(join(this.jobsDir, `${id}.json`));
  }

  // Private helpers

  private saveJob(job: Job): void {
    const path = join(this.jobsDir, `${job.id}.json`);
    writeFileSync(path, JSON.stringify(job, null, 2) + "\n", "utf-8");
  }
}
