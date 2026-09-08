import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runNodeCli } from '../test-utils/run-node-cli.js';
import { VirtualTerminal } from '../test-utils/virtual-terminal.js';
import { runMain, type RunMainOptions } from './main.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function preferencePath(content?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agent-startup-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'agent.json');
  if (content !== undefined) await writeFile(path, content);
  return path;
}

const offlineFetch: typeof fetch = async () => { throw new Error('unavailable secret'); };
const ollamaFetch: typeof fetch = async () => Response.json({ models: [{ name: 'z-model' }, { name: 'a-model' }] });

async function runPiped(options: RunMainOptions, commands = '/models\n/exit\n') {
  const input = new PassThrough();
  const output = new PassThrough();
  const error = new PassThrough();
  let stdout = '';
  let stderr = '';
  output.on('data', chunk => { stdout += chunk; });
  error.on('data', chunk => { stderr += chunk; });
  input.end(commands);
  await runMain({ env: {}, input, output, error, ...options });
  return { stdout, stderr };
}

describe('agent CLI entry point', () => {
  it('starts without credentials or Ollama and delivers sanitized discovery warnings', async () => {
    const result = await runPiped({ fetch: offlineFetch, preferencesPath: await preferencePath() });
    expect(result.stdout).toContain('No models are available');
    expect(result.stdout).toContain('Goodbye.');
    expect(result.stderr).toContain('[warning] ollama: Model discovery failed.');
    expect(result.stderr).not.toContain('secret');
    expect(result.stdout + result.stderr).not.toContain('\x1b');
  });

  it('restores the saved selection from the discovered list', async () => {
    const result = await runPiped({ fetch: ollamaFetch, preferencesPath: await preferencePath('{"provider":"ollama","model":"z-model"}') });
    expect(result.stdout).toContain('ollama/z-model (current)');
    expect(result.stdout).not.toContain('ollama/a-model (current)');
  });

  it('prefers an explicit environment selection to the saved model', async () => {
    const result = await runPiped({ env: { AGENT_PROVIDER: 'ollama', AGENT_MODEL: 'a-model' }, fetch: ollamaFetch, preferencesPath: await preferencePath('{"provider":"ollama","model":"z-model"}') });
    expect(result.stdout).toContain('ollama/a-model (current)');
  });

  it('warns about invalid and stale preferences without blocking fallback selection', async () => {
    for (const saved of ['{"apiKey":"never-print-me"}', '{"provider":"ollama","model":"removed"}']) {
      const result = await runPiped({ fetch: ollamaFetch, preferencesPath: await preferencePath(saved) });
      expect(result.stdout).toContain('ollama/a-model (current)');
      expect(result.stderr).toContain('[warning] Saved model preference');
      expect(result.stderr).not.toContain('never-print-me');
    }
  });

  it('persists command selection for the next startup', async () => {
    const path = await preferencePath();
    const options = { fetch: ollamaFetch, preferencesPath: path };
    const result = await runPiped(options, '/model ollama/z-model\n/exit\n');
    expect(result.stdout).toContain('Switched to ollama/z-model.');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ provider: 'ollama', model: 'z-model', baseURL: 'http://localhost:11434/v1' });
    expect((await runPiped(options)).stdout).toContain('ollama/z-model (current)');
  });
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
    const result = await runPiped({ env: { AGENT_PROVIDER: 'ollama' }, fetch: ollamaFetch, preferencesPath: await preferencePath() }, '/exit\n');

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
    const done = runMain({ env: { AGENT_PROVIDER: 'ollama' }, input, output, error, terminal, fetch: offlineFetch, preferencesPath: await preferencePath() });
    try {
      await vi.waitFor(async () => {
        expect(await terminal.screen()).toContain('Model: ollama/qwen3:8b');
        expect(await terminal.screen()).toContain('[warning] ollama: Model discovery failed.');
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

    await runMain({ env: { AGENT_PROVIDER: 'ollama' }, input, output, error, fetch: ollamaFetch, preferencesPath: await preferencePath() });

    expect(stdout).toContain('You> Goodbye.\n');
    expect(stdout).not.toContain('\x1b');
  });
});
