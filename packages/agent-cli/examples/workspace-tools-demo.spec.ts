import { describe, expect, it } from 'vitest';

import { runNodeCli } from '../test-utils/run-node-cli.js';

describe('workspace tools CLI demo', () => {
  it('reads, lists, searches, writes, and edits through the real Runtime without network access', async () => {
    const { stdout, stderr } = await runNodeCli('examples/workspace-tools-demo.ts', '');

    expect(stderr).toBe('');
    expect(stdout).toContain('[tool read_file] completed {"ok":true,"content":"1: # Demo workspace"');
    expect(stdout).toContain('[tool list_directory] completed {"ok":true,"entries":[{"name":"hello.ts","type":"file"}]');
    expect(stdout).toContain('[tool grep] completed {"ok":true,"matches":[{"path":"src/hello.ts","line":1,"text":"export const greeting = \\"hello workspace\\";"}]');
    expect(stdout).toContain('[tool find_files] completed {"ok":true,"files":["src/hello.ts"]');
    expect(stdout).toContain('[tool write_file] running {"path":"notes/status.txt","content":"draft\\n"}');
    expect(stdout).toContain('[tool write_file] completed {"ok":true,"path":"notes/status.txt","bytesWritten":6,"created":true}');
    expect(stdout).toContain('[tool edit_file] completed {"ok":true,"path":"notes/status.txt","bytesWritten":6,"replacements":1}');
    expect(stdout).toContain('Assistant (openai-compatible/workspace-tools-model)> Workspace inspection and update completed.');
  });
});
