/**
 * Queue Module Core
 * Task dependency graph and state machine management
 */

import {
  TaskDefinition,
  TaskState,
  QueueStatus,
  BlockedTask
} from './types.js';
import {
  loadDependencyGraph,
  saveDependencyGraph,
  loadTask,
  listAllTasks,
  listTasksByProject
} from './storage.js';

// ============================================================
// TASK DEFINITION
// ============================================================

export function define(
  taskId: string,
  project: string,
  agent: string,
  command: string,
  options: {
    dependsOn?: string[];
    timeout?: number;
    retry?: number;
  } = {}
): TaskDefinition {
  const graph = loadDependencyGraph(project);
  
  if (graph.tasks[taskId]) {
    throw new Error(`Task '${taskId}' already exists in project '${project}'`);
  }
  
  // Validate dependencies exist
  if (options.dependsOn) {
    for (const depId of options.dependsOn) {
      if (!graph.tasks[depId]) {
        throw new Error(`Dependency '${depId}' not found in project '${project}'`);
      }
    }
  }
  
  const task: TaskDefinition = {
    id: taskId,
    project,
    agent,
    command,
    dependsOn: options.dependsOn || [],
    timeout: options.timeout,
    retry: options.retry ?? 0,
    state: 'defined',
    createdAt: new Date().toISOString(),
    retryCount: 0
  };
  
  graph.tasks[taskId] = task;
  saveDependencyGraph(graph);
  
  return task;
}

// ============================================================
// TASK SUBMISSION
// ============================================================

export function submit(taskId: string, project: string): TaskDefinition {
  const graph = loadDependencyGraph(project);
  const task = graph.tasks[taskId];
  
  if (!task) {
    throw new Error(`Task '${taskId}' not found in project '${project}'`);
  }
  
  if (task.state !== 'defined') {
    throw new Error(`Task '${taskId}' is already in state '${task.state}'`);
  }
  
  // Check if dependencies are satisfied
  const hasIncompleteDeps = task.dependsOn?.some(depId => {
    const dep = graph.tasks[depId];
    return !dep || dep.state !== 'complete';
  }) ?? false;
  
  if (hasIncompleteDeps) {
    task.state = 'waiting';
  } else {
    task.state = 'queued';
  }
  
  task.queuedAt = new Date().toISOString();
  saveDependencyGraph(graph);
  
  return task;
}

// ============================================================
// STATUS QUERY
// ============================================================

export function status(project?: string): QueueStatus | QueueStatus[] {
  if (project) {
    const tasks = listTasksByProject(project);
    return buildStatus(project, tasks);
  }
  
  const allTasks = listAllTasks();
  const projects = [...new Set(allTasks.map(t => t.project))];
  
  return projects.map(p => {
    const tasks = allTasks.filter(t => t.project === p);
    return buildStatus(p, tasks);
  });
}

function buildStatus(project: string, tasks: TaskDefinition[]): QueueStatus {
  const summary = {
    total: tasks.length,
    defined: tasks.filter(t => t.state === 'defined').length,
    queued: tasks.filter(t => t.state === 'queued').length,
    waiting: tasks.filter(t => t.state === 'waiting').length,
    ready: tasks.filter(t => t.state === 'ready').length,
    running: tasks.filter(t => t.state === 'running').length,
    complete: tasks.filter(t => t.state === 'complete').length,
    failed: tasks.filter(t => t.state === 'failed').length
  };
  
  return {
    project,
    tasks: tasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    summary
  };
}

// ============================================================
// GET NEXT TASK
// ============================================================

export function next(project: string, agent: string): TaskDefinition | null {
  const graph = loadDependencyGraph(project);
  const agentTasks = Object.values(graph.tasks).filter(t => 
    t.agent === agent && (t.state === 'queued' || t.state === 'ready')
  );
  
  // First check for ready tasks
  const readyTasks = agentTasks.filter(t => t.state === 'ready');
  if (readyTasks.length > 0) {
    return readyTasks.sort((a, b) => 
      new Date(a.queuedAt || a.createdAt).getTime() - 
      new Date(b.queuedAt || b.createdAt).getTime()
    )[0];
  }
  
  // Then check for queued tasks that can become ready
  const queuedTasks = agentTasks.filter(t => t.state === 'queued');
  for (const task of queuedTasks) {
    const depsSatisfied = task.dependsOn?.every(depId => 
      graph.tasks[depId]?.state === 'complete'
    ) ?? true;
    
    if (depsSatisfied) {
      task.state = 'ready';
      saveDependencyGraph(graph);
      return task;
    }
  }
  
  return null;
}

// Start a task (transition from ready to running)
export function start(taskId: string, project: string): TaskDefinition {
  const graph = loadDependencyGraph(project);
  const task = graph.tasks[taskId];
  
  if (!task) {
    throw new Error(`Task '${taskId}' not found in project '${project}'`);
  }
  
  if (task.state !== 'ready') {
    throw new Error(`Task '${taskId}' must be in 'ready' state to start (current: ${task.state})`);
  }
  
  task.state = 'running';
  task.startedAt = new Date().toISOString();
  saveDependencyGraph(graph);
  
  return task;
}

// ============================================================
// COMPLETE TASK
// ============================================================

export function complete(
  taskId: string, 
  project: string,
  evidence?: string
): TaskDefinition {
  const graph = loadDependencyGraph(project);
  const task = graph.tasks[taskId];
  
  if (!task) {
    throw new Error(`Task '${taskId}' not found in project '${project}'`);
  }
  
  if (task.state !== 'running') {
    throw new Error(`Task '${taskId}' must be in 'running' state to complete (current: ${task.state})`);
  }
  
  task.state = 'complete';
  task.completedAt = new Date().toISOString();
  if (evidence) {
    task.evidence = evidence;
  }
  
  saveDependencyGraph(graph);
  
  // Unblock dependent tasks
  unblockDependents(graph, taskId);
  
  return task;
}

function unblockDependents(graph: ReturnType<typeof loadDependencyGraph>, completedTaskId: string): void {
  const dependents = Object.values(graph.tasks).filter(t => 
    t.dependsOn?.includes(completedTaskId) && t.state === 'waiting'
  );
  
  for (const dep of dependents) {
    const allDepsComplete = dep.dependsOn?.every(d => 
      graph.tasks[d]?.state === 'complete'
    ) ?? true;
    
    if (allDepsComplete) {
      dep.state = 'queued';
      saveDependencyGraph(graph);
    }
  }
}

// ============================================================
// FAIL TASK
// ============================================================

export function fail(
  taskId: string,
  project: string, 
  reason?: string
): TaskDefinition {
  const graph = loadDependencyGraph(project);
  const task = graph.tasks[taskId];
  
  if (!task) {
    throw new Error(`Task '${taskId}' not found in project '${project}'`);
  }
  
  if (task.state !== 'running' && task.state !== 'waiting' && task.state !== 'queued') {
    throw new Error(`Cannot fail task '${taskId}' in state '${task.state}'`);
  }
  
  task.state = 'failed';
  task.completedAt = new Date().toISOString();
  task.failureReason = reason;
  task.retryCount++;
  
  // Check if we should retry
  if (task.retry && task.retryCount <= task.retry) {
    task.state = 'queued';
    delete task.completedAt;
    task.failureReason = `${reason || 'Failed'} (attempt ${task.retryCount}/${task.retry + 1})`;
  }
  
  saveDependencyGraph(graph);
  
  // Alert on dependent tasks
  if (task.state === 'failed') {
    markDependentsBlocked(graph, taskId, reason);
  }
  
  return task;
}

function markDependentsBlocked(
  graph: ReturnType<typeof loadDependencyGraph>, 
  failedTaskId: string,
  reason?: string
): void {
  const dependents = Object.values(graph.tasks).filter(t => 
    t.dependsOn?.includes(failedTaskId) && 
    (t.state === 'waiting' || t.state === 'queued' || t.state === 'ready')
  );
  
  for (const dep of dependents) {
    dep.state = 'waiting';
    dep.failureReason = `Blocked: dependency '${failedTaskId}' failed${reason ? ` - ${reason}` : ''}`;
    saveDependencyGraph(graph);
  }
}

// ============================================================
// LIST BLOCKED TASKS
// ============================================================

export function blocked(project: string): BlockedTask[] {
  const graph = loadDependencyGraph(project);
  const waitingTasks = Object.values(graph.tasks).filter(t => t.state === 'waiting');
  
  const blockedTasks: BlockedTask[] = [];
  
  for (const task of waitingTasks) {
    const blockedBy = task.dependsOn?.filter(depId => {
      const dep = graph.tasks[depId];
      return !dep || dep.state !== 'complete';
    }) ?? [];
    
    if (blockedBy.length > 0) {
      blockedTasks.push({ task, blockedBy });
    }
  }
  
  return blockedTasks;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function getTask(taskId: string, project: string): TaskDefinition | null {
  return loadTask(taskId, project);
}

export function resetTask(taskId: string, project: string): TaskDefinition {
  const graph = loadDependencyGraph(project);
  const task = graph.tasks[taskId];
  
  if (!task) {
    throw new Error(`Task '${taskId}' not found in project '${project}'`);
  }
  
  task.state = 'defined';
  delete task.queuedAt;
  delete task.startedAt;
  delete task.completedAt;
  delete task.failureReason;
  task.retryCount = 0;
  
  saveDependencyGraph(graph);
  return task;
}

export function deleteTask(taskId: string, project: string): boolean {
  const graph = loadDependencyGraph(project);
  
  // Check if other tasks depend on this one
  const dependents = Object.values(graph.tasks).filter(t => 
    t.dependsOn?.includes(taskId)
  );
  
  if (dependents.length > 0) {
    throw new Error(`Cannot delete task '${taskId}': ${dependents.length} task(s) depend on it`);
  }
  
  if (graph.tasks[taskId]) {
    delete graph.tasks[taskId];
    saveDependencyGraph(graph);
    return true;
  }
  
  return false;
}

export { TaskDefinition, TaskState, QueueStatus, BlockedTask };
