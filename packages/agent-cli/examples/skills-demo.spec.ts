import { describe, expect, it } from 'vitest';

import { runNodeCli } from '../test-utils/run-node-cli.js';

describe('workspace Skills CLI demo', () => {
  it('lists a Runtime snapshot Skill, loads its body with read_file, and answers from it', async () => {
    const { stdout, stderr } = await runNodeCli('examples/skills-demo.ts', '');

    expect(stderr).toBe('');
    expect(stdout).toContain('Workspace Skills:\n1. release-note — Write concise release notes');
    expect(stdout).toContain('[tool read_file] running {"path":".agents/skills/release-note/SKILL.md"}');
    expect(stdout).toContain('Always end release notes with: Ship small, learn fast.');
    expect(stdout).toContain('Assistant (openai-compatible/skills-demo-model)> Ship small, learn fast.');
  });
});
