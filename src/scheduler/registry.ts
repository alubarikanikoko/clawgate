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
import type { Job, CreateJobInput, Schedule } from "./types.js";
import { validateJob } from "./validator.js";

export class Registry {
  private jobsDir: string;
  private schedulesDir: string;

  constructor(jobsDir: string, schedulesDir: string) {
    this.jobsDir = jobsDir;
    this.schedulesDir = schedulesDir;
  }

  // Job CRUD

  create(input: CreateJobInput): Job {
    const now = new Date().toISOString();
    const id = randomUUID();

    const job: Job = {
      id,
      name: input.name,
      description: input.description,
      target: input.target,
      payload: input.payload,
      execution: {
        enabled: input.enabled ?? true,
        timeoutMs: 60000,
        maxRetries: 3,
        retryDelayMs: 5000,
        expectFinal: false,
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

    // Create schedule
    const schedule: Schedule = {
      jobId: id,
      cronExpression: input.schedule,
      timezone: input.timezone,
      nextRun: null,
      lastRun: null,
    };
    this.saveSchedule(schedule);

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
    const schedulePath = join(this.schedulesDir, `${id}.json`);

    let deleted = false;

    if (existsSync(jobPath)) {
      unlinkSync(jobPath);
      deleted = true;
    }

    if (existsSync(schedulePath)) {
      unlinkSync(schedulePath);
    }

    return deleted;
  }

  exists(id: string): boolean {
    return existsSync(join(this.jobsDir, `${id}.json`));
  }

  // Schedule operations

  getSchedule(jobId: string): Schedule | null {
    const path = join(this.schedulesDir, `${jobId}.json`);
    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content) as Schedule;
    } catch (err) {
      console.error(`Failed to read schedule for ${jobId}:`, err);
      return null;
    }
  }

  updateSchedule(jobId: string, updates: Partial<Schedule>): Schedule | null {
    const schedule = this.getSchedule(jobId);
    if (!schedule) {
      return null;
    }

    const updated: Schedule = { ...schedule, ...updates };
    this.saveSchedule(updated);
    return updated;
  }

  // Private helpers

  private saveJob(job: Job): void {
    const path = join(this.jobsDir, `${job.id}.json`);
    writeFileSync(path, JSON.stringify(job, null, 2) + "\n", "utf-8");
  }

  private saveSchedule(schedule: Schedule): void {
    const path = join(this.schedulesDir, `${schedule.jobId}.json`);
    writeFileSync(path, JSON.stringify(schedule, null, 2) + "\n", "utf-8");
  }
}
