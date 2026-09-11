import { relative, resolve, sep } from 'node:path';

export function isWithinWorkspace(workspaceRoot: string, target: string): boolean {
  return target === workspaceRoot || target.startsWith(`${workspaceRoot}${sep}`);
}

export function toWorkspacePath(workspaceRoot: string, target: string): string {
  return relative(workspaceRoot, resolve(workspaceRoot, target)).split(sep).join('/');
}
