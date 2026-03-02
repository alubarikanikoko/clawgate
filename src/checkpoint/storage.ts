import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export const STORAGE_DIR = path.join(homedir(), '.clawgate', 'checkpoints');

export interface CheckpointData {
  id: string;
  project: string;
  phase: string;
  agent: string;
  status: 'active' | 'completed' | 'failed' | 'aborted' | 'success';
  createdAt: string;
  completedAt?: string;
  evidence?: string;
}

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function getCheckpointPath(id: string): string {
  return path.join(STORAGE_DIR, `${id}.json`);
}

export function saveCheckpoint(checkpoint: CheckpointData): void {
  ensureStorageDir();
  fs.writeFileSync(getCheckpointPath(checkpoint.id), JSON.stringify(checkpoint, null, 2));
}

export function loadCheckpoint(id: string): CheckpointData | null {
  const filePath = getCheckpointPath(id);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as CheckpointData;
}

export function deleteCheckpointFile(id: string): boolean {
  const filePath = getCheckpointPath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export function listAllCheckpoints(): CheckpointData[] {
  ensureStorageDir();
  const files = fs.readdirSync(STORAGE_DIR);
  const checkpoints: CheckpointData[] = [];
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const id = file.replace('.json', '');
      const cp = loadCheckpoint(id);
      if (cp) {
        checkpoints.push(cp);
      }
    }
  }
  
  return checkpoints.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function listCheckpointsByProject(project: string): CheckpointData[] {
  return listAllCheckpoints().filter(cp => cp.project === project);
}

export function listCheckpointsByStatus(status: string): CheckpointData[] {
  return listAllCheckpoints().filter(cp => cp.status === status);
}
