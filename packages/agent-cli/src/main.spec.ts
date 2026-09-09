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
  it('uses the supplied startup directory as the Runtime workspace root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-workspace-root-'));
    temporaryDirectories.push(parent);

    await expect(runPiped({
      cwd: join(parent, 'missing-workspace'),
      fetch: ollamaFetch,
      preferencesPath: await preferencePath(),
    }, '/exit\n')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects invalid AGENT_MAX_STEPS before model discovery', async () => {
    let fetchCalled = false;

    await expect(runPiped({
      env: { AGENT_MAX_STEPS: '0' },
      fetch: async () => {
        fetchCalled = true;
        return Response.json({ models: [] });
      },
      preferencesPath: await preferencePath(),
    })).rejects.toThrow('AGENT_MAX_STEPS must be a positive safe integer');

    expect(fetchCalled).toBe(false);
  });

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

  it('discovers the saved safe Ollama endpoint before restoring its custom model', async () => {
    const requests: string[] = [];
    const result = await runPiped({
      preferencesPath: await preferencePath('{"provider":"ollama","model":"custom-model","baseURL":"http://custom.test:1234/v1"}'),
      fetch: async input => {
        requests.push(String(input));
        if (String(input) === 'http://custom.test:1234/api/tags') {
          return Response.json({ models: [{ name: 'custom-model' }] });
        }
        throw new Error('Default Ollama is unavailable');
      },
    });
    expect(requests).toEqual(['http://custom.test:1234/api/tags']);
    expect(result.stdout).toContain('ollama/custom-model (current)');
    expect(result.stderr).toBe('');
  });

  it.each([undefined, 'ollama'])('lets AGENT_BASE_URL override the saved endpoint with provider=%s', async provider => {
    const requests: string[] = [];
    const result = await runPiped({
      env: { AGENT_PROVIDER: provider, AGENT_BASE_URL: 'http://explicit.test:4321/v1' },
      preferencesPath: await preferencePath('{"provider":"ollama","model":"custom-model","baseURL":"http://custom.test:1234/v1"}'),
      fetch: async input => {
        requests.push(String(input));
        return Response.json({ models: [{ name: 'custom-model' }] });
      },
    });
    expect(requests).toEqual(['http://explicit.test:4321/api/tags']);
    expect(result.stderr).toBe('');
  });

  it.each([
    { name: 'provider only', env: { AGENT_PROVIDER: 'ollama' }, model: 'qwen3:8b' },
    { name: 'model only', env: { AGENT_MODEL: 'explicit-model' }, model: 'explicit-model' },
    { name: 'provider and model', env: { AGENT_PROVIDER: 'ollama', AGENT_MODEL: 'explicit-model' }, model: 'explicit-model' },
  ])('ignores saved endpoint metadata for an explicit $name selection', async ({ env, model }) => {
    const requests: string[] = [];
    const result = await runPiped({
      env,
      preferencesPath: await preferencePath('{"provider":"ollama","model":"explicit-model","baseURL":"http://saved.test:1234/v1"}'),
      fetch: async input => {
        requests.push(String(input));
        return Response.json({ models: String(input) === 'http://localhost:11434/api/tags'
          ? [{ name: 'qwen3:8b' }, { name: 'explicit-model' }]
          : [{ name: 'saved-endpoint-only' }] });
      },
    });

    expect(requests).toEqual(['http://localhost:11434/api/tags']);
    expect(result.stdout).toContain(`ollama/${model} (current)`);
    expect(result.stdout).not.toContain('saved-endpoint-only');
    expect(result.stderr).toBe('');
  });

  it('excludes incompatible inventory models from listing, direct selection, and saved fallback', async () => {
    const result = await runPiped({
      env: { OPENAI_API_KEY: 'mixed-inventory-secret' },
      preferencesPath: await preferencePath('{"provider":"openai","model":"dall-e-3"}'),
      fetch: async input => String(input).endsWith('/api/tags')
        ? Response.json({ models: [] })
        : Response.json({ data: [{ id: 'dall-e-3' }, { id: 'gpt-4.1' }, { id: 'text-embedding-3-small' }] }),
    }, '/models\n\n/model openai/text-embedding-3-small\n/models\n/exit\n');
    expect(result.stdout).not.toMatch(/\d+\. openai\/(?:dall-e|text-embedding)/);
    expect(result.stdout.match(/openai\/gpt-4.1 \(current\)/g)).toHaveLength(2);
    expect(result.stdout).toContain('Unknown model: openai/text-embedding-3-small');
    expect(result.stdout).not.toContain('Switched to');
    expect(result.stderr).toContain('Saved model preference is unavailable');
    expect(result.stdout + result.stderr).not.toMatch(/mixed-inventory-secret|\x1b/);
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

  it.each([
    { ci: 'true', plain: true }, { ci: '1', plain: true },
    { ci: 'yes', plain: true }, { ci: 'TRUE', plain: true },
    { ci: 'false', plain: false }, { ci: '0', plain: false },
    { ci: '', plain: false }, { ci: undefined, plain: false },
  ])('selects the correct TTY mode for CI=$ci', async ({ ci, plain }) => {
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const output = Object.assign(new PassThrough(), { isTTY: true });
    const error = new PassThrough();
    const terminal = new VirtualTerminal();
    let stdout = '';
    let stderr = '';
    output.on('data', chunk => { stdout += chunk; });
    error.on('data', chunk => { stderr += chunk; });
    input.end('/exit\n');
    const done = runMain({ env: { CI: ci }, input, output, error, terminal, fetch: ollamaFetch, preferencesPath: await preferencePath() });
    try {
      await vi.waitFor(async () => {
        if (plain) expect(stdout).toContain('Goodbye.');
        else expect(await terminal.screen()).toContain('Model: ollama/a-model');
      });
      if (plain) {
        expect(terminal.writes).toEqual([]);
        expect(stdout + stderr).not.toContain('\x1b');
      } else {
        expect(stdout).toBe('');
      }
    } finally {
      terminal.sendInput('\x03');
      await done;
      terminal.dispose();
    }
  });
});
