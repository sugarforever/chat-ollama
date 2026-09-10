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

    const completedToolResult = (toolName: string) => {
      const prefix = `[tool ${toolName}] completed `;
      const line = stdout.split('\n').find(candidate => candidate.startsWith(prefix));
      expect(line, `${toolName} completion output`).toBeDefined();
      return JSON.parse(line!.slice(prefix.length)) as Record<string, unknown>;
    };

    const writeResult = completedToolResult('write_file');
    expect(writeResult).toMatchObject({ ok: true, path: 'notes/status.txt', bytesWritten: 6, created: true });
    expect(writeResult.version).toBe('sha256:7eb2ca55b87a4d45d66a63f76db11f9b4aa9106472a62b5865060f9fd8eadaaa');

    const editResult = completedToolResult('edit_file');
    expect(editResult).toMatchObject({ ok: true, path: 'notes/status.txt', bytesWritten: 6, replacements: 1 });
    expect(editResult.version).toBe('sha256:ed1a545bb85e55816bbf9566b028b2a0bc456b88f49f6f266c0401048824194b');
    expect(stdout).toContain('Assistant (openai-compatible/workspace-tools-model)> Workspace inspection and update completed.');
  });
});
