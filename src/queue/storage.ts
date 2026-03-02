/**
 * Queue Module Storage
 * JSON dependency graph persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { TaskDefinition, DependencyGraph } from './types.js';

export const QUEUE_DIR = path.join(homedir(), '.clawgate', 'queue');

function ensureQueueDir(): void {
  if (!fs.existsSync(QUEUE_DIR)) {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
  }
}

function getProjectPath(project: string): string {
  return path.join(QUEUE_DIR, `${project}.json`);
}

export function loadDependencyGraph(project: string): DependencyGraph {
  ensureQueueDir();
  const filePath = getProjectPath(project);
  
  if (!fs.existsSync(filePath)) {
    return {
      project,
      tasks: {},
      updatedAt: new Date().toISOString()
    };
  }
  
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as DependencyGraph;
}

export function saveDependencyGraph(graph: DependencyGraph): void {
  ensureQueueDir();
  graph.updatedAt = new Date().toISOString();
  fs.writeFileSync(getProjectGraphPath(graph.project), JSON.stringify(graph, null, 2));
}

function getProjectGraphPath(project: string): string {
  return path.join(QUEUE_DIR, `${project}.json`);
}

export function loadTask(taskId: string, project: string): TaskDefinition | null {
  const graph = loadDependencyGraph(project);
  return graph.tasks[taskId] || null;
}

export function saveTask(task: TaskDefinition): void {
  const graph = loadDependencyGraph(task.project);
  graph.tasks[task.id] = task;
  saveDependencyGraph(graph);
}

export function deleteTask(taskId: string, project: string): boolean {
  const graph = loadDependencyGraph(project);
  if (graph.tasks[taskId]) {
    delete graph.tasks[taskId];
    saveDependencyGraph(graph);
    return true;
  }
  return false;
}

export function listAllTasks(project?: string): TaskDefinition[] {
  ensureQueueDir();
  
  if (project) {
    const graph = loadDependencyGraph(project);
    return Object.values(graph.tasks);
  }
  
  const tasks: TaskDefinition[] = [];
  const files = fs.readdirSync(QUEUE_DIR);
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const projName = file.replace('.json', '');
      const graph = loadDependencyGraph(projName);
      tasks.push(...Object.values(graph.tasks));
    }
  }
  
  return tasks;
}

export function listTasksByProject(project: string): TaskDefinition[] {
  const graph = loadDependencyGraph(project);
  return Object.values(graph.tasks);
}

export function listTasksByState(project: string, state: TaskDefinition['state']): TaskDefinition[] {
  return listTasksByProject(project).filter(t => t.state === state);
}
