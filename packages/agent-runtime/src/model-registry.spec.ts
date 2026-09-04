import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { createLanguageModel, describeModel } from './model-registry.js';

describe('model registry', () => {
  it('creates the requested OpenAI model', () => {
    const model = createLanguageModel({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'openai-secret',
    });

    if (typeof model === 'string') {
      throw new Error('Expected the registry to construct a model instance');
    }
    expect(model.provider).toBe('openai.responses');
    expect(model.modelId).toBe('gpt-test');
  });

  it('creates an OpenAI-compatible model with the configured provider name', () => {
    const model = createLanguageModel({
      provider: 'openai-compatible',
      name: 'ollama',
      model: 'qwen3:8b',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama-secret',
    });

    if (typeof model === 'string') {
      throw new Error('Expected the registry to construct a model instance');
    }
    expect(model.provider).toBe('ollama.chat');
    expect(model.modelId).toBe('qwen3:8b');
  });

  it('sends compatible requests to the configured base URL with its API key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'response-1',
          object: 'chat.completion',
          created: 1,
          model: 'qwen3:8b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    try {
      const model = createLanguageModel({
        provider: 'openai-compatible',
        name: 'ollama',
        model: 'qwen3:8b',
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'request-secret',
      });

      const result = await generateText({ model, prompt: 'Hello', maxRetries: 0 });

      expect(result.text).toBe('Hello');
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] ?? [];
      expect(String(url)).toBe('http://localhost:11434/v1/chat/completions');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer request-secret',
      );
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: 'qwen3:8b',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('describes a configured model without credentials or endpoint details', () => {
    const descriptor = describeModel({
      provider: 'openai-compatible',
      name: 'private-endpoint',
      model: 'model-1',
      baseURL: 'https://models.example.test/v1?token=url-secret',
      apiKey: 'api-secret',
    });

    expect(descriptor).toEqual({
      provider: 'openai-compatible',
      model: 'model-1',
    });
    expect(JSON.stringify(descriptor)).not.toContain('secret');
  });
});
