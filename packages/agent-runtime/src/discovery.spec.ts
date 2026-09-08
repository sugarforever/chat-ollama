import { describe, expect, it, vi } from 'vitest';

import { discoverModels, resolveModelConfig } from './discovery.js';

describe('provider model discovery', () => {
  it.each([
    ['openai', { OPENAI_API_KEY: 'secret' }],
    ['anthropic', { ANTHROPIC_API_KEY: 'secret' }],
    ['google', { GEMINI_API_KEY: 'secret' }],
    ['google', { GOOGLE_GENERATIVE_AI_API_KEY: 'secret' }],
    ['deepseek', { DEEPSEEK_API_KEY: 'secret' }],
    ['openrouter', { OPENROUTER_API_KEY: 'secret' }],
  ] as const)('includes %s only when its credential is configured', async (provider, env) => {
    const result = await discoverModels({
      env,
      fetch: vi.fn(async () => new Response('', { status: 503 })),
    });

    expect(result.models.some(model => model.provider === provider)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('does not expose remote catalog entries without credentials', async () => {
    const result = await discoverModels({
      env: {},
      fetch: vi.fn(async () => new Response('', { status: 503 })),
    });

    expect(result.models).toEqual([]);
    expect(result.warnings).toEqual([
      { provider: 'ollama', message: 'Model discovery failed' },
    ]);
  });

  it('discovers multiple locally installed Ollama models from /api/tags', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('http://localhost:11434/api/tags');
      return new Response(
        JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.2:latest' }] }),
        { headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await discoverModels({ env: {}, fetch });

    expect(result).toEqual({
      models: [
        {
          provider: 'ollama',
          model: 'llama3.2:latest',
          baseURL: 'http://localhost:11434/v1',
        },
        {
          provider: 'ollama',
          model: 'qwen3:8b',
          baseURL: 'http://localhost:11434/v1',
        },
      ],
      warnings: [],
    });
  });

  it('merges OpenAI endpoint models with its built-in catalog', async () => {
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('localhost')) {
        return new Response('', { status: 503 });
      }
      expect(url).toBe('https://api.openai.com/v1/models');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer endpoint-key');
      return new Response(
        JSON.stringify({ data: [{ id: 'gpt-5-mini' }, { id: 'gpt-endpoint' }] }),
        { headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'endpoint-key' },
      fetch,
    });

    expect(result.models.filter(model => model.provider === 'openai')).toEqual([
      { provider: 'openai', model: 'gpt-5-mini' },
      { provider: 'openai', model: 'gpt-endpoint' },
    ]);
    expect(JSON.stringify(result)).not.toContain('endpoint-key');
  });

  it('isolates a timed-out provider and keeps other available catalogs', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('localhost')) {
          return Promise.resolve(new Response('', { status: 503 }));
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('api-secret timeout')));
        });
      });

      const pending = discoverModels({
        env: {
          OPENAI_API_KEY: 'api-secret',
          ANTHROPIC_API_KEY: 'anthropic-secret',
        },
        fetch,
        timeoutMs: 10,
      });
      await vi.advanceTimersByTimeAsync(10);
      const result = await pending;

      expect(result.models.some(model => model.provider === 'anthropic')).toBe(true);
      expect(result.warnings).toContainEqual({
        provider: 'openai',
        message: 'Model discovery timed out',
      });
      expect(JSON.stringify(result)).not.toContain('secret');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a provider-specific custom endpoint away from Ollama discovery', async () => {
    const requested: string[] = [];
    await discoverModels({
      env: {
        AGENT_PROVIDER: 'openai',
        AGENT_BASE_URL: 'https://openai.example.test/v1',
        OPENAI_API_KEY: 'secret',
      },
      fetch: vi.fn(async input => {
        requested.push(String(input));
        return new Response('', { status: 503 });
      }),
    });

    expect(requested).toContain('http://localhost:11434/api/tags');
    expect(requested).toContain('https://openai.example.test/v1/models');
  });

  it.each([
    ['openai', 'OPENAI_API_KEY'],
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['google', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    ['deepseek', 'DEEPSEEK_API_KEY'],
    ['openrouter', 'OPENROUTER_API_KEY'],
  ] as const)('resolves %s credentials inside the Runtime boundary', (provider, envName) => {
    expect(resolveModelConfig(
      { provider, model: 'model-id' },
      { [envName]: 'provider-secret' },
    )).toEqual({
      provider,
      model: 'model-id',
      baseURL: undefined,
      apiKey: 'provider-secret',
    });
  });

  it('does not reuse generic startup overrides after switching providers', () => {
    expect(resolveModelConfig(
      { provider: 'anthropic', model: 'claude-test' },
      {
        AGENT_API_KEY: 'ollama-secret',
        AGENT_BASE_URL: 'http://ollama.example.test/v1',
        ANTHROPIC_API_KEY: 'anthropic-secret',
      },
      { useAgentOverrides: false },
    )).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      baseURL: undefined,
      apiKey: 'anthropic-secret',
    });
  });

  it('discovers Ollama at a saved non-default endpoint', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      models: [{ name: 'saved-model' }],
    })));

    const result = await discoverModels({
      env: {},
      ollamaBaseURL: 'http://saved.example.test:11434/v1',
      fetch,
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://saved.example.test:11434/api/tags',
      expect.any(Object),
    );
    expect(result.models).toContainEqual({
      provider: 'ollama',
      model: 'saved-model',
      baseURL: 'http://saved.example.test:11434/v1',
    });
  });
});
