import { describe, expect, it, vi } from 'vitest';

import { discoverModels } from './discovery.js';

const emptyCatalogFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/api/tags')) {
    return new Response(JSON.stringify({ models: [] }), { status: 200 });
  }

  return new Response(JSON.stringify({ data: [] }), { status: 200 });
};

describe('model discovery credential catalog', () => {
  it.each([
    {
      name: 'OpenAI',
      env: { OPENAI_API_KEY: 'openai-test-key' },
      provider: 'openai',
      models: ['gpt-5', 'gpt-5-mini'],
    },
    {
      name: 'Anthropic',
      env: { ANTHROPIC_API_KEY: 'anthropic-test-key' },
      provider: 'anthropic',
      models: ['claude-haiku-4-5', 'claude-sonnet-4-5'],
    },
    {
      name: 'Google Gemini via GEMINI_API_KEY',
      env: { GEMINI_API_KEY: 'gemini-test-key' },
      provider: 'google',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    },
    {
      name: 'Google Gemini via GOOGLE_GENERATIVE_AI_API_KEY',
      env: { GOOGLE_GENERATIVE_AI_API_KEY: 'google-test-key' },
      provider: 'google',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    },
    {
      name: 'DeepSeek',
      env: { DEEPSEEK_API_KEY: 'deepseek-test-key' },
      provider: 'deepseek',
      models: ['deepseek-chat', 'deepseek-reasoner'],
    },
    {
      name: 'OpenRouter',
      env: { OPENROUTER_API_KEY: 'openrouter-test-key' },
      provider: 'openrouter',
      models: ['anthropic/claude-sonnet-4-5', 'openai/gpt-5-mini'],
    },
  ])('includes the exact built-in $name catalog only after its credential is set', async ({
    env,
    provider,
    models,
  }) => {
    const result = await discoverModels({ env, fetch: emptyCatalogFetch });

    expect(result.models).toEqual(models.map((model) => ({ provider, model })));
    expect(JSON.stringify(result)).not.toContain('test-key');
  });

  it('does not make remote providers available for absent or blank credentials', async () => {
    const result = await discoverModels({
      env: {
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: ' ',
        GEMINI_API_KEY: '',
        GOOGLE_GENERATIVE_AI_API_KEY: ' ',
        DEEPSEEK_API_KEY: '',
        OPENROUTER_API_KEY: ' ',
      },
      fetch: emptyCatalogFetch,
    });

    expect(result.models).toEqual([]);
  });

  it('sorts the combined built-in catalog by provider and model', async () => {
    const result = await discoverModels({
      env: {
        OPENAI_API_KEY: 'openai-test-key',
        ANTHROPIC_API_KEY: 'anthropic-test-key',
      },
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }

        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
    });

    expect(result.models).toEqual([
      { provider: 'anthropic', model: 'claude-haiku-4-5' },
      { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      { provider: 'openai', model: 'gpt-5' },
      { provider: 'openai', model: 'gpt-5-mini' },
    ]);
  });
});

describe('isolated network model discovery', () => {
  it.each([true, false])('bounds a hanging response body (honors abort: %s)', async honorsAbort => {
    vi.useFakeTimers();
    let wasAborted = false;
    let settled: Awaited<ReturnType<typeof discoverModels>> | undefined;
    try {
      const pending = discoverModels({
        env: { OPENAI_API_KEY: 'body-test-secret' },
        timeoutMs: 10,
        fetch: async (input, init) => {
          if (String(input).endsWith('/api/tags')) {
            return Response.json({ models: [{ name: 'local-model' }] });
          }
          return new Response(new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () => {
                wasAborted = true;
                if (honorsAbort) controller.error(new DOMException('body-secret', 'AbortError'));
              });
            },
          }));
        },
      }).then(result => { settled = result; });

      await vi.advanceTimersByTimeAsync(20);

      expect(wasAborted).toBe(true);
      expect(settled).toEqual({
        models: [
          { provider: 'ollama', model: 'local-model', baseURL: 'http://localhost:11434/v1' },
          { provider: 'openai', model: 'gpt-5' },
          { provider: 'openai', model: 'gpt-5-mini' },
        ],
        warnings: [{ provider: 'openai', message: 'Model discovery timed out.' }],
      });
      expect(JSON.stringify(settled)).not.toContain('secret');
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it('excludes incompatible and unknown OpenAI inventory IDs from the available text models', async () => {
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'inventory-test-secret' },
      fetch: async input => String(input).endsWith('/api/tags')
        ? Response.json({ models: [] })
        : Response.json({ data: [
          { id: 'gpt-4.1-mini-2025-04-14' }, { id: 'gpt-5' }, { id: 'gpt-4.1' },
          { id: 'text-embedding-3-small' }, { id: 'dall-e-3' }, { id: 'gpt-image-1' },
          { id: 'whisper-1' }, { id: 'tts-1' }, { id: 'omni-moderation-latest' },
          { id: 'gpt-4o-realtime-preview' }, { id: 'gpt-4o-audio-preview' },
          { id: 'gpt-4o-mini-transcribe' }, { id: 'gpt-3.5-turbo-instruct' },
          { id: 'unknown-future-model' },
        ] }),
    });

    expect(result.models.map(({ model }) => model)).toEqual([
      'gpt-4.1', 'gpt-4.1-mini-2025-04-14', 'gpt-5', 'gpt-5-mini',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('sorts discovered IDs in locale-independent code-unit order', async () => {
    const result = await discoverModels({
      env: {},
      fetch: async () => Response.json({ models: [
        { name: 'a-model' }, { name: 'Z-model' }, { name: 'ä-model' }, { name: '_model' },
      ] }),
    });
    expect(result.models.map(({ model }) => model)).toEqual(['Z-model', '_model', 'a-model', 'ä-model']);
  });

  it('merges multiple Ollama tags and OpenAI /models results without duplicates', async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'openai-test-key' },
      ollamaBaseURL: 'http://localhost:11434/v1?access_token=ollama-secret',
      openaiBaseURL: 'https://openai.example.test/v1?api_key=openai-secret',
      fetch: async (input, init) => {
        const url = String(input);
        requests.push({
          url,
          authorization: new Headers(init?.headers).get('authorization'),
        });
        if (url === 'http://localhost:11434/api/tags') {
          return new Response(
            JSON.stringify({ models: [{ name: 'zeta:latest' }, { name: 'alpha:latest' }] }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({ data: [{ id: 'gpt-5-mini' }, { id: 'gpt-5-nano' }] }),
          { status: 200 },
        );
      },
    });

    expect(requests).toEqual([
      { url: 'http://localhost:11434/api/tags', authorization: null },
      { url: 'https://openai.example.test/v1/models', authorization: 'Bearer openai-test-key' },
    ]);
    expect(result).toEqual({
      models: [
        { provider: 'ollama', model: 'alpha:latest', baseURL: 'http://localhost:11434/v1' },
        { provider: 'ollama', model: 'zeta:latest', baseURL: 'http://localhost:11434/v1' },
        { provider: 'openai', model: 'gpt-5', },
        {
          provider: 'openai',
          model: 'gpt-5-mini',
          baseURL: 'https://openai.example.test/v1',
        },
        {
          provider: 'openai',
          model: 'gpt-5-nano',
          baseURL: 'https://openai.example.test/v1',
        },
      ],
      warnings: [],
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('aborts a timed-out provider request while preserving other providers', async () => {
    let wasAborted = false;
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'openai-test-key' },
      timeoutMs: 1,
      fetch: async (input, init) => {
        if (String(input).endsWith('/api/tags')) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              wasAborted = true;
              reject(new DOMException('ollama-secret', 'AbortError'));
            });
          });
        }

        return new Response(JSON.stringify({ data: [{ id: 'gpt-5-nano' }] }), { status: 200 });
      },
    });

    expect(wasAborted).toBe(true);
    expect(result.models).toContainEqual({ provider: 'openai', model: 'gpt-5-nano', baseURL: 'https://api.openai.com/v1' });
    expect(result.warnings).toEqual([
      { provider: 'ollama', message: 'Model discovery timed out.' },
    ]);
    expect(JSON.stringify(result)).not.toContain('ollama-secret');
  });

  it('aborts a timed-out OpenAI /models request while preserving Ollama and curated models', async () => {
    let wasAborted = false;
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'openai-test-key' },
      timeoutMs: 1,
      fetch: async (input, init) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'qwen3:8b' }] }),
            { status: 200 },
          );
        }

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            wasAborted = true;
            reject(new DOMException('openai-timeout-secret', 'AbortError'));
          });
        });
      },
    });

    expect(wasAborted).toBe(true);
    expect(result).toEqual({
      models: [
        { provider: 'ollama', model: 'qwen3:8b', baseURL: 'http://localhost:11434/v1' },
        { provider: 'openai', model: 'gpt-5' },
        { provider: 'openai', model: 'gpt-5-mini' },
      ],
      warnings: [{ provider: 'openai', message: 'Model discovery timed out.' }],
    });
    expect(JSON.stringify(result)).not.toContain('openai-timeout-secret');
    expect(JSON.stringify(result)).not.toContain('openai-test-key');
  });

  it('keeps built-in models while reporting HTTP and malformed-data discovery failures', async () => {
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'openai-test-key' },
      fetch: async (input) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response('ollama-secret', { status: 503 });
        }

        return new Response(JSON.stringify({ data: 'not-an-array' }), { status: 200 });
      },
    });

    expect(result.models).toEqual([
      { provider: 'openai', model: 'gpt-5' },
      { provider: 'openai', model: 'gpt-5-mini' },
    ]);
    expect(result.warnings).toEqual([
      { provider: 'ollama', message: 'Model discovery failed.' },
      { provider: 'openai', message: 'Model discovery returned invalid data.' },
    ]);
    expect(JSON.stringify(result)).not.toContain('ollama-secret');
    expect(JSON.stringify(result)).not.toContain('openai-test-key');
  });

  it('keeps curated OpenAI models when its /models endpoint returns a non-2xx response', async () => {
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'openai-test-key' },
      fetch: async (input) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'qwen3:8b' }] }),
            { status: 200 },
          );
        }

        return new Response('openai-http-secret', { status: 429 });
      },
    });

    expect(result).toEqual({
      models: [
        { provider: 'ollama', model: 'qwen3:8b', baseURL: 'http://localhost:11434/v1' },
        { provider: 'openai', model: 'gpt-5' },
        { provider: 'openai', model: 'gpt-5-mini' },
      ],
      warnings: [{ provider: 'openai', message: 'Model discovery failed.' }],
    });
    expect(JSON.stringify(result)).not.toContain('openai-http-secret');
    expect(JSON.stringify(result)).not.toContain('openai-test-key');
  });

  it('reports malformed JSON without exposing the response body', async () => {
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'openai-test-key' },
      fetch: async (input) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }

        return new Response('openai-response-secret', { status: 200 });
      },
    });

    expect(result.warnings).toEqual([
      { provider: 'openai', message: 'Model discovery returned invalid data.' },
    ]);
    expect(JSON.stringify(result)).not.toContain('openai-response-secret');
  });

  it('isolates a rejected provider without exposing its error or blocking another result', async () => {
    const result = await discoverModels({
      env: { OPENAI_API_KEY: 'openai-test-key' },
      fetch: async (input) => {
        if (String(input).endsWith('/api/tags')) {
          throw new Error('Ollama rejected Bearer ollama-secret');
        }

        return new Response(JSON.stringify({ data: [{ id: 'gpt-5-nano' }] }), { status: 200 });
      },
    });

    expect(result.models).toContainEqual({
      provider: 'openai',
      model: 'gpt-5-nano',
      baseURL: 'https://api.openai.com/v1',
    });
    expect(result.warnings).toEqual([
      { provider: 'ollama', message: 'Model discovery failed.' },
    ]);
    expect(JSON.stringify(result)).not.toContain('ollama-secret');
  });
});
