import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';

import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import { runNodeCli } from '../test-utils/run-node-cli.js';
import { VirtualTerminal } from '../test-utils/virtual-terminal.js';
import { runMain } from './main.js';

describe('agent CLI entry point', () => {
  it('preserves the Node shebang in the compiled executable', async () => {
    const source = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
    const compiledEntry = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    expect(compiledEntry.split('\n', 1)[0]).toBe('#!/usr/bin/env node');
  });

  it('creates a real Runtime session and exits without making a model request', async () => {
    const result = await runNodeCli('src/main.ts', '/exit\n', {
      AGENT_PROVIDER: 'ollama',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      'ChatOllama Agent CLI\nType /exit to quit.\n\nYou> Goodbye.\n',
    );
    expect(result.stderr).toBe('');
  });

  it('reports an unsupported provider without a stack trace', async () => {
    const result = await runNodeCli('src/main.ts', '', {
      AGENT_PROVIDER: 'unsupported',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Unsupported AGENT_PROVIDER: unsupported\n');
  });

  it('uses the interactive terminal when both input and output are TTYs', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const output = Object.assign(new PassThrough(), { isTTY: true });
    const error = new PassThrough();
    const terminal = new VirtualTerminal();
    let rawOutput = '';
    output.on('data', chunk => { rawOutput += chunk; });
    // A plain-mode regression can still exit, making the screen assertion fail.
    input.end('/exit\n');
    const done = runMain({ env: { AGENT_PROVIDER: 'ollama' }, input, output, error, terminal });
    try {
      await vi.waitFor(async () => {
        expect(await terminal.screen()).toContain('Model: ollama/qwen3:8b');
      });
      terminal.type('/exit');
      terminal.sendInput('\x1b');
      terminal.sendInput('\r');
      await done;
      expect(terminal.stopped).toBe(true);
      expect(rawOutput).toBe('');
    } finally {
      terminal.sendInput('\x03');
      await done;
      terminal.dispose();
    }
  });

  it.each([
    { inputTTY: false, outputTTY: false },
    { inputTTY: true, outputTTY: false },
    { inputTTY: false, outputTTY: true },
  ])('keeps plain output for inputTTY=$inputTTY, outputTTY=$outputTTY', async ({ inputTTY, outputTTY }) => {
    const input = Object.assign(new PassThrough(), { isTTY: inputTTY });
    const output = Object.assign(new PassThrough(), { isTTY: outputTTY });
    const error = new PassThrough();
    let stdout = '';
    output.on('data', chunk => { stdout += chunk; });
    input.end('/exit\n');

    await runMain({ env: { AGENT_PROVIDER: 'ollama' }, input, output, error });

    expect(stdout).toContain('You> Goodbye.\n');
    expect(stdout).not.toContain('\x1b');
  });
});
