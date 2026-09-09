import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('agent CLI tool loop demo', () => {
  it('runs the real Runtime and plain CLI without a network or credential', async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--no-warnings', '--import', 'tsx', 'examples/tool-loop-demo.ts'],
      { cwd: process.cwd(), env: { ...process.env, OPENAI_API_KEY: 'demo-secret' } },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('[tool getCurrentUtcTime] running {"timezone":"UTC"}');
    expect(stdout).toContain('[tool getCurrentUtcTime] completed 2026-09-09T12:00:00.000Z');
    expect(stdout).toContain('Assistant (openai-compatible/tool-loop-model)> The current UTC time is 2026-09-09T12:00:00.000Z.');
    expect(stdout).toContain('[run demo-run-1] completed');
    expect(stdout).toContain('Goodbye.');
    expect(stdout).not.toContain('\x1b');
    expect(stdout).not.toContain('demo-secret');
  });
});
