import { describe, expect, it } from 'vitest';

import { runNodeCli } from '../test-utils/run-node-cli.js';

describe('agent CLI mock Runtime demo', () => {
  it('streams a response from piped input without network or credential output', async () => {
    const result = await runNodeCli(
      'examples/mock-runtime.ts',
      'Hello\n/exit\n',
      { AGENT_API_KEY: 'demo-secret' },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'Assistant (openai-compatible/mock-model)> Hello from the mock Runtime.\n',
    );
    expect(result.stdout).toContain('Goodbye.\n');
    expect(result.stderr).toBe(
      '[run demo-run-1] started\n[run demo-run-1] completed\n',
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain('demo-secret');
  });
});
