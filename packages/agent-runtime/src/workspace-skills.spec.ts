import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { ToolSet } from 'ai';

import {
  discoverWorkspaceSkills,
  renderWorkspaceSkillsCatalog,
} from './workspace-skills.js';
import { createWorkspaceTools } from './workspace-tools.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('workspace Skill discovery', () => {
  it('discovers descriptors in stable name and locator order without retaining bodies', async () => {
    const root = await createRoot();
    await createSkill(root, 'z-last', '---\nname: beta\ndescription: Second skill\n---\nSECRET BETA BODY\n');
    await createSkill(root, 'a-first', '---\nname: alpha\ndescription: First skill\n---\nSECRET ALPHA BODY\n');

    const result = discoverWorkspaceSkills(root);

    expect(result).toEqual({
      skills: [
        { name: 'alpha', description: 'First skill', locator: '.agents/skills/a-first/SKILL.md' },
        { name: 'beta', description: 'Second skill', locator: '.agents/skills/z-last/SKILL.md' },
      ],
      warnings: [],
    });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('returns an empty result when the workspace has no Skills directory', async () => {
    const root = await createRoot();

    expect(discoverWorkspaceSkills(root)).toEqual({ skills: [], warnings: [] });
    expect(renderWorkspaceSkillsCatalog([])).toBeUndefined();
  });

  it.each([
    ['missing opening delimiter', 'name: broken\ndescription: no delimiter\n'],
    ['malformed YAML', '---\nname: [broken\ndescription: invalid\n---\n'],
    ['missing description', '---\nname: incomplete\n---\n'],
  ])('skips %s with a stable invalid-frontmatter warning', async (_label, content) => {
    const root = await createRoot();
    await createSkill(root, 'broken', content);

    expect(discoverWorkspaceSkills(root)).toEqual({
      skills: [],
      warnings: [{
        code: 'INVALID_FRONTMATTER',
        locator: '.agents/skills/broken/SKILL.md',
        message: 'Skipped .agents/skills/broken/SKILL.md: invalid YAML frontmatter with non-empty name and description required.',
      }],
    });
  });

  it('keeps the first stable locator and warns for a duplicate name', async () => {
    const root = await createRoot();
    await createSkill(root, 'b-copy', '---\nname: shared\ndescription: Later locator\n---\n');
    await createSkill(root, 'a-original', '---\nname: shared\ndescription: First locator\n---\n');

    expect(discoverWorkspaceSkills(root)).toEqual({
      skills: [{ name: 'shared', description: 'First locator', locator: '.agents/skills/a-original/SKILL.md' }],
      warnings: [{
        code: 'DUPLICATE_NAME',
        locator: '.agents/skills/b-copy/SKILL.md',
        message: 'Skipped .agents/skills/b-copy/SKILL.md: duplicate Skill name "shared".',
      }],
    });
  });

  it('skips a file over the documented size limit without parsing it', async () => {
    const root = await createRoot();
    await createSkill(root, 'huge', `---\nname: huge\ndescription: Too large\n---\n${'x'.repeat(60_001)}`);

    expect(discoverWorkspaceSkills(root)).toEqual({
      skills: [],
      warnings: [{
        code: 'FILE_TOO_LARGE',
        locator: '.agents/skills/huge/SKILL.md',
        message: 'Skipped .agents/skills/huge/SKILL.md: file exceeds the 60,000-byte discovery limit.',
      }],
    });
  });

  it('accepts a maximum-size single-line Skill that read_file can return completely', async () => {
    const root = await createRoot();
    const header = '---\nname: wide\ndescription: Fully retrievable\n---\n';
    const sentinel = 'THE_END';
    await createSkill(root, 'wide', `${header}${'x'.repeat(60_000 - Buffer.byteLength(header) - sentinel.length)}${sentinel}`);

    expect(discoverWorkspaceSkills(root).skills).toHaveLength(1);
    const result = await execute(createWorkspaceTools({ workspaceRoot: root }), 'read_file', {
      path: '.agents/skills/wide/SKILL.md',
    });
    expect(result).toMatchObject({ ok: true, truncated: false, startLine: 1, endLine: 5 });
    expect(String(result.content).endsWith(sentinel)).toBe(true);
  });

  it('warns when the existing Skills root cannot be enumerated', async () => {
    const root = await createRoot();
    const skillsRoot = join(root, '.agents', 'skills');
    await mkdir(skillsRoot, { recursive: true });
    await chmod(skillsRoot, 0o000);

    try {
      expect(discoverWorkspaceSkills(root)).toEqual({
        skills: [],
        warnings: [{
          code: 'FILE_UNREADABLE',
          locator: '.agents/skills',
          message: 'Skipped .agents/skills: directory could not be read.',
        }],
      });
    } finally {
      await chmod(skillsRoot, 0o700);
    }
  });

  it('skips an unreadable Skill without preventing other Skills from loading', async () => {
    const root = await createRoot();
    await createSkill(root, 'good', '---\nname: good\ndescription: Still available\n---\n');
    const unreadable = await createSkill(root, 'unreadable', '---\nname: hidden\ndescription: Cannot read\n---\n');
    await chmod(unreadable, 0o000);

    try {
      expect(discoverWorkspaceSkills(root)).toEqual({
        skills: [{ name: 'good', description: 'Still available', locator: '.agents/skills/good/SKILL.md' }],
        warnings: [{
          code: 'FILE_UNREADABLE',
          locator: '.agents/skills/unreadable/SKILL.md',
          message: 'Skipped .agents/skills/unreadable/SKILL.md: file could not be read.',
        }],
      });
    } finally {
      await chmod(unreadable, 0o600);
    }
  });

  it('skips a Skill symlink that resolves outside the workspace', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    const outsideSkill = join(outside, 'SKILL.md');
    await writeFile(outsideSkill, '---\nname: escaped\ndescription: Outside\n---\n');
    const skillDirectory = join(root, '.agents', 'skills', 'escaped');
    await mkdir(skillDirectory, { recursive: true });
    await symlink(outsideSkill, join(skillDirectory, 'SKILL.md'));

    expect(discoverWorkspaceSkills(root)).toEqual({
      skills: [],
      warnings: [{
        code: 'PATH_OUTSIDE_WORKSPACE',
        locator: '.agents/skills/escaped/SKILL.md',
        message: 'Skipped .agents/skills/escaped/SKILL.md: resolved path is outside the workspace.',
      }],
    });
  });

  it('rejects an external Skills-root symlink before enumerating it', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await createSkill(outside, 'private-directory-name', '---\nname: escaped\ndescription: Outside\n---\n');
    await mkdir(join(root, '.agents'), { recursive: true });
    await symlink(join(outside, '.agents', 'skills'), join(root, '.agents', 'skills'));

    expect(discoverWorkspaceSkills(root)).toEqual({
      skills: [],
      warnings: [{
        code: 'PATH_OUTSIDE_WORKSPACE',
        locator: '.agents/skills',
        message: 'Skipped .agents/skills: resolved path is outside the workspace.',
      }],
    });
  });

  it('does not decode or retain a Skill body while reading frontmatter', async () => {
    const root = await createRoot();
    const header = '---\nname: boundary\ndescription: Header closes early\n---\n';
    const body = `${'x'.repeat(16_384 - Buffer.byteLength(header))}😀`;
    await createSkill(root, 'boundary', `${header}${body}`);

    expect(discoverWorkspaceSkills(root)).toEqual({
      skills: [{
        name: 'boundary',
        description: 'Header closes early',
        locator: '.agents/skills/boundary/SKILL.md',
      }],
      warnings: [],
    });
  });

  it('warns when an existing SKILL.md symlink has a missing target', async () => {
    const root = await createRoot();
    const skillDirectory = join(root, '.agents', 'skills', 'dangling');
    await mkdir(skillDirectory, { recursive: true });
    await symlink(join(root, 'missing-SKILL.md'), join(skillDirectory, 'SKILL.md'));

    expect(discoverWorkspaceSkills(root)).toEqual({
      skills: [],
      warnings: [{
        code: 'FILE_UNREADABLE',
        locator: '.agents/skills/dangling/SKILL.md',
        message: 'Skipped .agents/skills/dangling/SKILL.md: file could not be read.',
      }],
    });
  });

  it('renders a compact deterministic catalog that directs on-demand read_file use', () => {
    expect(renderWorkspaceSkillsCatalog([
      { name: 'alpha', description: 'First skill', locator: '.agents/skills/alpha/SKILL.md' },
      { name: 'beta', description: 'Second skill', locator: '.agents/skills/beta/SKILL.md' },
    ])).toBe([
      'Workspace Skills are available. When a Skill matches the task, use read_file with its locator to read the complete SKILL.md before following it.',
      '- alpha: First skill (locator: .agents/skills/alpha/SKILL.md)',
      '- beta: Second skill (locator: .agents/skills/beta/SKILL.md)',
    ].join('\n'));
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workspace-skills-'));
  roots.push(root);
  return root;
}

async function createSkill(root: string, directory: string, content: string): Promise<string> {
  const skillDirectory = join(root, '.agents', 'skills', directory);
  await mkdir(skillDirectory, { recursive: true });
  const path = join(skillDirectory, 'SKILL.md');
  await writeFile(path, content);
  return path;
}

async function execute(tools: ToolSet, name: string, input: unknown): Promise<Record<string, unknown>> {
  const result = await tools[name]!.execute!(input as never, {
    toolCallId: 'test-call', messages: [], abortSignal: undefined, context: undefined,
  });
  return result as Record<string, unknown>;
}
