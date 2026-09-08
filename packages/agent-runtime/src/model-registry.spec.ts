import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import * as registry from './model-registry.js';
import { createLanguageModel, describeModel } from './model-registry.js';
import type { AvailableModel, ModelConfig } from './types.js';

type ModelConfigResolver = (
  selection: AvailableModel,
  env: NodeJS.ProcessEnv,
) => ModelConfig;

const createModelConfig = (registry as typeof registry & {
  createModelConfig: ModelConfigResolver;
}).createModelConfig;

describe('model registry', () => {
  const providerCases = [
    {
      name: 'OpenAI',
      selection: { provider: 'openai', model: 'gpt-test' },
      env: { OPENAI_API_KEY: 'openai-secret' },
      config: {
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'openai-secret',
      },
      providerId: 'openai.responses',
    },
    {
      name: 'Anthropic',
      selection: { provider: 'anthropic', model: 'claude-test' },
      env: { ANTHROPIC_API_KEY: 'anthropic-secret' },
      config: {
        provider: 'anthropic',
        model: 'claude-test',
        apiKey: 'anthropic-secret',
      },
      providerId: 'anthropic.messages',
    },
    {
      name: 'Google',
      selection: { provider: 'google', model: 'gemini-test' },
      env: { GEMINI_API_KEY: 'google-secret' },
      config: {
        provider: 'google',
        model: 'gemini-test',
        apiKey: 'google-secret',
      },
      providerId: 'google.generative-ai',
    },
    {
      name: 'Ollama',
      selection: {
        provider: 'ollama',
        model: 'qwen3:8b',
        baseURL: 'http://ollama.example.test/v1',
      },
      env: {},
      config: {
        provider: 'ollama',
        name: 'ollama',
        model: 'qwen3:8b',
        baseURL: 'http://ollama.example.test/v1',
        apiKey: 'ollama',
      },
      providerId: 'ollama.chat',
    },
    {
      name: 'DeepSeek',
      selection: { provider: 'deepseek', model: 'deepseek-chat' },
      env: { DEEPSEEK_API_KEY: 'deepseek-secret' },
      config: {
        provider: 'deepseek',
        name: 'deepseek',
        model: 'deepseek-chat',
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'deepseek-secret',
      },
      providerId: 'deepseek.chat',
    },
    {
      name: 'OpenRouter',
      selection: { provider: 'openrouter', model: 'openai/gpt-test' },
      env: { OPENROUTER_API_KEY: 'openrouter-secret' },
      config: {
        provider: 'openrouter',
        name: 'openrouter',
        model: 'openai/gpt-test',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: 'openrouter-secret',
      },
      providerId: 'openrouter.chat',
    },
  ] satisfies readonly {
    readonly name: string;
    readonly selection: AvailableModel;
    readonly env: NodeJS.ProcessEnv;
    readonly config: ModelConfig;
    readonly providerId: string;
  }[];

  it.each(providerCases)('resolves and constructs the requested $name model', ({
    selection,
    env,
    config,
    providerId,
  }) => {
    const resolved = createModelConfig(selection, env);

    expect(resolved).toEqual(config);
    const model = createLanguageModel(resolved);
    if (typeof model === 'string') {
      throw new Error('Expected the registry to construct a model instance');
    }
    expect(model.provider).toBe(providerId);
    expect(model.modelId).toBe(selection.model);
  });

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
    const descriptor = describeModel(
      createModelConfig(
        { provider: 'deepseek', model: 'model-1' },
        { DEEPSEEK_API_KEY: 'api-secret' },
      ),
    );

    expect(descriptor).toEqual({
      provider: 'deepseek',
      model: 'model-1',
    });
    expect(JSON.stringify(descriptor)).not.toContain('secret');
  });
});
