import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

let directory;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'chatollama-release-notes-'));
});

after(() => {
  rmSync(directory, { recursive: true, force: true });
});

function build(body, version = '0.5.0', pullRequests) {
  const input = join(directory, `input-${Math.random()}.md`);
  const output = join(directory, `output-${Math.random()}.md`);
  writeFileSync(input, JSON.stringify(pullRequests ?? [{
    merged_at: '2026-09-09T00:00:00Z',
    base: { ref: 'main' },
    title: `chore(agent): release v${version}`,
    body,
  }]));
  const result = spawnSync(
    process.execPath,
    ['scripts/build-agent-release-notes.mjs', version, input, output],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  return { ...result, output };
}

describe('agent release notes', () => {
  it('publishes the curated PR section and package links', () => {
    const result = build(`## Summary

Internal release preparation.

## Release notes

### Highlights

- Workspace search works without a system ripgrep installation.

### Fixes

- Bounded search output.

## Verification

- pnpm test:agent
`);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(result.output, 'utf8'), `### Highlights

- Workspace search works without a system ripgrep installation.

### Fixes

- Bounded search output.

## Packages

- [chatollama-agent@0.5.0](https://www.npmjs.com/package/chatollama-agent/v/0.5.0)
- [chatollama-agent-runtime@0.5.0](https://www.npmjs.com/package/chatollama-agent-runtime/v/0.5.0)
`);
  });

  it('rejects a release PR without curated notes', () => {
    const result = build('## Summary\n\nNo public notes yet.\n');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release PR body must contain/);
  });

  it('handles CRLF notes and stops at the next level-two heading', () => {
    const result = build('## Release notes\r\n\r\n### Highlights\r\n\r\n- Clear notes.\r\n\r\n## Verification\r\n\r\n- Hidden.\r\n', '0.5.0-rc.1');

    assert.equal(result.status, 0, result.stderr);
    const notes = readFileSync(result.output, 'utf8');
    assert.match(notes, /### Highlights\r?\n\r?\n- Clear notes\./);
    assert.doesNotMatch(notes, /Hidden/);
    assert.match(notes, /chatollama-agent@0\.5\.0-rc\.1/);
  });

  it('rejects malformed semantic versions', () => {
    const result = build('## Release notes\n\n### Highlights\n\n- Notes.\n', '01.5.0');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /valid SemVer/);
  });

  it('rejects missing or ambiguous associated release PRs', () => {
    const body = '## Release notes\n\n### Highlights\n\n- Notes.\n';
    const unrelated = { merged_at: '2026-09-09T00:00:00Z', base: { ref: 'main' }, title: 'feat: unrelated', body };
    const release = { ...unrelated, title: 'chore(agent): release v0.5.0' };

    for (const pullRequests of [[unrelated], [release, release]]) {
      const result = build(body, '0.5.0', pullRequests);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /exactly one associated release PR/);
    }
  });
});
