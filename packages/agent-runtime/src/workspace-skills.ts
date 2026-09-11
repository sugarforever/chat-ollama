import {
  accessSync,
  closeSync,
  constants,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { parseDocument } from 'yaml';

import type {
  WorkspaceSkillDescriptor,
  WorkspaceSkillWarning,
  WorkspaceSkillWarningCode,
} from './types.js';
import { MAX_WORKSPACE_SKILL_BYTES } from './workspace-limits.js';
import { isWithinWorkspace, toWorkspacePath } from './workspace-paths.js';

const SKILLS_DIRECTORY = join('.agents', 'skills');
const MAX_SKILL_FRONTMATTER_BYTES = 16_384;

export interface WorkspaceSkillDiscoveryResult {
  readonly skills: readonly WorkspaceSkillDescriptor[];
  readonly warnings: readonly WorkspaceSkillWarning[];
}

export function discoverWorkspaceSkills(workspaceRoot: string): WorkspaceSkillDiscoveryResult {
  const canonicalRoot = realpathSync(workspaceRoot);
  const skillsRoot = join(canonicalRoot, SKILLS_DIRECTORY);
  let canonicalSkillsRoot: string;
  try {
    canonicalSkillsRoot = realpathSync(skillsRoot);
  } catch (error) {
    if (hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR')) {
      return { skills: [], warnings: [] };
    }
    return {
      skills: [],
      warnings: [warning('FILE_UNREADABLE', toWorkspacePath(canonicalRoot, skillsRoot), 'directory could not be read.')],
    };
  }
  if (!isWithinWorkspace(canonicalRoot, canonicalSkillsRoot)) {
    const locator = toWorkspacePath(canonicalRoot, skillsRoot);
    return {
      skills: [],
      warnings: [warning('PATH_OUTSIDE_WORKSPACE', locator, 'resolved path is outside the workspace.')],
    };
  }
  let directories: string[];
  try {
    directories = readdirSync(canonicalSkillsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
      .map(entry => entry.name)
      .sort(compareCodeUnits);
  } catch (error) {
    if (hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR')) {
      return { skills: [], warnings: [] };
    }
    return {
      skills: [],
      warnings: [warning('FILE_UNREADABLE', toWorkspacePath(canonicalRoot, skillsRoot), 'directory could not be read.')],
    };
  }

  const skills: WorkspaceSkillDescriptor[] = [];
  const warnings: WorkspaceSkillWarning[] = [];
  const names = new Set<string>();

  for (const directory of directories) {
    const candidate = join(skillsRoot, directory, 'SKILL.md');
    const locator = toWorkspacePath(canonicalRoot, candidate);
    let canonical: string;
    try {
      canonical = realpathSync(candidate);
    } catch (error) {
      if ((hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR')) && !existsLexically(candidate)) continue;
      warnings.push(warning('FILE_UNREADABLE', locator, 'file could not be read.'));
      continue;
    }
    if (!isWithinWorkspace(canonicalRoot, canonical)) {
      warnings.push(warning('PATH_OUTSIDE_WORKSPACE', locator, 'resolved path is outside the workspace.'));
      continue;
    }

    try {
      const stats = statSync(canonical);
      if (!stats.isFile()) continue;
      if (stats.size > MAX_WORKSPACE_SKILL_BYTES) {
        warnings.push(warning('FILE_TOO_LARGE', locator, `file exceeds the ${MAX_WORKSPACE_SKILL_BYTES.toLocaleString('en-US')}-byte discovery limit.`));
        continue;
      }
      accessSync(canonical, constants.R_OK);
    } catch {
      warnings.push(warning('FILE_UNREADABLE', locator, 'file could not be read.'));
      continue;
    }

    let metadata: { readonly name: string; readonly description: string } | undefined;
    try {
      metadata = parseFrontmatter(readFrontmatter(canonical));
    } catch {
      // The stable warning below intentionally hides parser and filesystem details.
    }
    if (!metadata) {
      warnings.push(warning(
        'INVALID_FRONTMATTER',
        locator,
        'invalid YAML frontmatter with non-empty name and description required.',
      ));
      continue;
    }
    if (names.has(metadata.name)) {
      warnings.push(warning('DUPLICATE_NAME', locator, `duplicate Skill name "${metadata.name}".`));
      continue;
    }
    names.add(metadata.name);
    skills.push({ ...metadata, locator });
  }

  skills.sort((left, right) => compareCodeUnits(left.name, right.name) || compareCodeUnits(left.locator, right.locator));
  return { skills, warnings };
}

export function renderWorkspaceSkillsCatalog(
  skills: readonly WorkspaceSkillDescriptor[],
): string | undefined {
  if (skills.length === 0) return undefined;
  return [
    'Workspace Skills are available. When a Skill matches the task, use read_file with its locator to read the complete SKILL.md before following it.',
    ...skills.map(skill => `- ${skill.name}: ${skill.description} (locator: ${skill.locator})`),
  ].join('\n');
}

function readFrontmatter(path: string): string {
  const descriptor = openSync(path, 'r');
  try {
    const bytes = Buffer.alloc(MAX_SKILL_FRONTMATTER_BYTES + 1);
    const byte = Buffer.alloc(1);
    let length = 0;
    let lineStart = 0;
    let contentStart: number | undefined;

    while (length <= MAX_SKILL_FRONTMATTER_BYTES) {
      const bytesRead = readSync(descriptor, byte, 0, 1, length);
      if (bytesRead === 0) {
        if (contentStart !== undefined && isDelimiter(bytes, lineStart, length)) {
          return decodeFrontmatter(bytes.subarray(contentStart, lineStart));
        }
        throw new Error('Invalid frontmatter');
      }
      bytes[length] = byte[0]!;
      length += 1;
      if (byte[0] !== 0x0a) continue;

      if (contentStart === undefined) {
        if (!isOpeningDelimiter(bytes, lineStart, length - 1)) {
          throw new Error('Invalid frontmatter');
        }
        contentStart = length;
      } else if (isDelimiter(bytes, lineStart, length - 1)) {
        return decodeFrontmatter(bytes.subarray(contentStart, lineStart));
      }
      lineStart = length;
    }
    throw new Error('Frontmatter is too large');
  } finally {
    closeSync(descriptor);
  }
}

function decodeFrontmatter(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function isOpeningDelimiter(bytes: Buffer, start: number, end: number): boolean {
  const line = bytes.subarray(start, stripCarriageReturn(bytes, start, end));
  return line.equals(Buffer.from('---')) || line.equals(Buffer.from('\uFEFF---'));
}

function isDelimiter(bytes: Buffer, start: number, end: number): boolean {
  return bytes.subarray(start, stripCarriageReturn(bytes, start, end)).equals(Buffer.from('---'));
}

function stripCarriageReturn(bytes: Buffer, start: number, end: number): number {
  return end > start && bytes[end - 1] === 0x0d ? end - 1 : end;
}

function parseFrontmatter(source: string): { readonly name: string; readonly description: string } | undefined {
  const document = parseDocument(source, { prettyErrors: false, strict: true });
  if (document.errors.length > 0) return undefined;
  const value: unknown = document.toJS({ maxAliasCount: 20 });
  if (!isRecord(value)) return undefined;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  if (!name || !description) return undefined;
  return { name, description };
}

function warning(
  code: WorkspaceSkillWarningCode,
  locator: string,
  detail: string,
): WorkspaceSkillWarning {
  return { code, locator, message: `Skipped ${locator}: ${detail}` };
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function existsLexically(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
