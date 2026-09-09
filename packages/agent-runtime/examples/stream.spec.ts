import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('stream example', () => {
  it('runs offline and never prints configured credentials', async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--no-warnings', '--import', 'tsx', 'examples/stream.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AGENT_PROVIDER: 'mock',
          OPENAI_API_KEY: 'example-secret',
        },
      },
    );

    expect(stdout).toBe(
      '[step 1] started\n' +
      '[tool getCurrentUtcTime] running {"timezone":"UTC"}\n' +
      '[tool getCurrentUtcTime] completed 2026-09-09T12:00:00.000Z\n' +
      '[step 1] completed: tool-calls\n' +
      '[step 2] started\n' +
      'The current UTC time is 2026-09-09T12:00:00.000Z.\n' +
      '[step 2] completed: stop\n',
    );
    expect(stderr).toBe('');
    expect(`${stdout}${stderr}`).not.toContain('example-secret');
  });
});
