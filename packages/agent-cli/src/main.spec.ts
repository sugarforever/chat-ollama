import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { runNodeCli } from '../test-utils/run-node-cli.js';

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
    const ollama = await startFakeOllama();
    const result = await runNodeCli('src/main.ts', '/exit\n', await cleanEnv({
      AGENT_PROVIDER: 'ollama',
      AGENT_BASE_URL: `${ollama.url}/v1`,
    }));
    await ollama.close();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      'ChatOllama Agent CLI\nType /exit to quit.\n\nYou> Goodbye.\n',
    );
    expect(result.stderr).toBe('');
  });

  it('reports an unsupported provider without a stack trace', async () => {
    const result = await runNodeCli('src/main.ts', '', await cleanEnv({
      AGENT_PROVIDER: 'unsupported',
    }));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Unsupported AGENT_PROVIDER: unsupported\n');
  });

  it('discovers Ollama models and exposes /models from the real entry point', async () => {
    const ollama = await startFakeOllama();
    const result = await runNodeCli('src/main.ts', '/models\n\n/exit\n', await cleanEnv({
      AGENT_BASE_URL: `${ollama.url}/v1`,
    }));
    await ollama.close();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1. ollama/llama3.2:latest');
    expect(result.stdout).toContain('2. ollama/qwen3:8b *');
    expect(result.stdout).toContain('Goodbye.\n');
    expect(result.stderr).toBe('');
  });

  it('enters the command loop when no credential or Ollama service is available', async () => {
    const result = await runNodeCli('src/main.ts', '/models\n/exit\n', await cleanEnv({
      AGENT_BASE_URL: 'http://127.0.0.1:1/v1',
    }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'No models available. Start Ollama or configure a supported API key.\n',
    );
    expect(result.stdout).toContain('Goodbye.\n');
    expect(result.stderr).toBe('[warning] ollama: Model discovery failed\n');
  });

  it('restores a selected model from its saved custom Ollama endpoint', async () => {
    const ollama = await startFakeOllama();
    const home = await mkdtemp(join(tmpdir(), 'chatollama-saved-endpoint-'));
    const first = await runNodeCli('src/main.ts', '/models\n2\n/exit\n', await cleanEnv({
      HOME: home,
      AGENT_BASE_URL: `${ollama.url}/v1`,
    }));
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain('Switched to ollama/qwen3:8b');

    const second = await runNodeCli('src/main.ts', '/models\n\n/exit\n', await cleanEnv({
      HOME: home,
    }));
    await ollama.close();

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('2. ollama/qwen3:8b *');
    expect(second.stderr).toBe('');
  });
});

async function cleanEnv(overrides: NodeJS.ProcessEnv = {}): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(join(tmpdir(), 'chatollama-main-'));
  return {
    HOME: home,
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GEMINI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    OPENROUTER_API_KEY: '',
    ...overrides,
  };
}

async function startFakeOllama(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      models: [{ name: 'qwen3:8b' }, { name: 'llama3.2:latest' }],
    }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('Missing server port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()),
    ),
  };
}
