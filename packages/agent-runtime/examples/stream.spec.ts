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

    expect(stdout).toBe('Hello from the mock model.\n');
    expect(stderr).toBe('');
    expect(`${stdout}${stderr}`).not.toContain('example-secret');
  });
});
