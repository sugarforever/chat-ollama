import { describe, expect, it } from 'vitest';

import { runNodeCli } from '../test-utils/run-node-cli.js';

describe('workspace tools CLI demo', () => {
  it('reads, lists, greps, and finds files through the real Runtime without network access', async () => {
    const { stdout, stderr } = await runNodeCli('examples/workspace-tools-demo.ts', '');

    expect(stderr).toBe('');
    expect(stdout).toContain('[tool read_file] completed {"ok":true,"content":"1: # Demo workspace"');
    expect(stdout).toContain('[tool list_directory] completed {"ok":true,"entries":[{"name":"hello.ts","type":"file"}]');
    expect(stdout).toContain('[tool grep] completed {"ok":true,"matches":[{"path":"src/hello.ts","line":1,"text":"export const greeting = \\"hello workspace\\";"}]');
    expect(stdout).toContain('[tool find_files] completed {"ok":true,"files":["src/hello.ts"]');
    expect(stdout).toContain('Assistant (openai-compatible/workspace-tools-model)> Workspace inspection completed.');
  });
});
