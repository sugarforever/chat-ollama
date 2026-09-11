import {
  accessSync,
  closeSync,
  constants,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

import { parseDocument } from 'yaml';

import type {
  WorkspaceSkillDescriptor,
  WorkspaceSkillWarning,
  WorkspaceSkillWarningCode,
} from './types.js';

const SKILLS_DIRECTORY = join('.agents', 'skills');
const MAX_SKILL_FILE_BYTES = 262_144;
const MAX_SKILL_FRONTMATTER_BYTES = 16_384;

export interface WorkspaceSkillDiscoveryResult {
  readonly skills: readonly WorkspaceSkillDescriptor[];
  readonly warnings: readonly WorkspaceSkillWarning[];
}

export function discoverWorkspaceSkills(workspaceRoot: string): WorkspaceSkillDiscoveryResult {
  const canonicalRoot = realpathSync(workspaceRoot);
  const skillsRoot = join(canonicalRoot, SKILLS_DIRECTORY);
  let directories: string[];
  try {
    directories = readdirSync(skillsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
      .map(entry => entry.name)
      .sort(compareCodeUnits);
  } catch (error) {
    if (hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR')) {
      return { skills: [], warnings: [] };
    }
    return { skills: [], warnings: [] };
  }

  const skills: WorkspaceSkillDescriptor[] = [];
  const warnings: WorkspaceSkillWarning[] = [];
  const names = new Set<string>();

  for (const directory of directories) {
    const candidate = join(skillsRoot, directory, 'SKILL.md');
    const locator = toWorkspaceLocator(canonicalRoot, candidate);
    let canonical: string;
    try {
      canonical = realpathSync(candidate);
    } catch (error) {
      if (hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR')) continue;
      warnings.push(warning('FILE_UNREADABLE', locator, 'file could not be read.'));
      continue;
    }
    if (!isWithin(canonicalRoot, canonical)) {
      warnings.push(warning('PATH_OUTSIDE_WORKSPACE', locator, 'resolved path is outside the workspace.'));
      continue;
    }

    try {
      const stats = statSync(canonical);
      if (!stats.isFile()) continue;
      if (stats.size > MAX_SKILL_FILE_BYTES) {
        warnings.push(warning('FILE_TOO_LARGE', locator, `file exceeds the ${MAX_SKILL_FILE_BYTES.toLocaleString('en-US')}-byte discovery limit.`));
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
    const buffer = Buffer.alloc(MAX_SKILL_FRONTMATTER_BYTES + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.byteLength, 0);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
    const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) throw new Error('Invalid frontmatter');
    if (Buffer.byteLength(match[0]) > MAX_SKILL_FRONTMATTER_BYTES) {
      throw new Error('Frontmatter is too large');
    }
    return match[1];
  } finally {
    closeSync(descriptor);
  }
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

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`);
}

function toWorkspaceLocator(root: string, target: string): string {
  return relative(root, target).split(sep).join('/');
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
