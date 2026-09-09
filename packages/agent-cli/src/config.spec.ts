import { describe, expect, it } from 'vitest';

import { readMaxSteps, readModelConfig, resolveStartupModel } from './config.js';

describe('CLI model configuration', () => {
  it('reads a positive integer step budget and defaults to four', () => {
    expect(readMaxSteps({})).toBe(4);
    expect(readMaxSteps({ AGENT_MAX_STEPS: '128' })).toBe(128);
  });

  it.each(['0', '-1', '1.5', 'Infinity', 'many'])(
    'rejects invalid AGENT_MAX_STEPS value %s',
    value => {
      expect(() => readMaxSteps({ AGENT_MAX_STEPS: value })).toThrow(
        'AGENT_MAX_STEPS must be a positive safe integer',
      );
    },
  );

  it('defaults to the local Ollama OpenAI-compatible endpoint', () => {
    expect(readModelConfig({})).toEqual({
      provider: 'ollama',
      name: 'ollama',
      model: 'qwen3:8b',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama',
    });
  });

  it('maps model, base URL, and API key overrides for Ollama', () => {
    expect(
      readModelConfig({
        AGENT_PROVIDER: 'ollama',
        AGENT_MODEL: 'llama3.2',
        AGENT_BASE_URL: 'http://models.example.test/v1',
        AGENT_API_KEY: 'compatible-secret',
      }),
    ).toEqual({
      provider: 'ollama',
      name: 'ollama',
      model: 'llama3.2',
      baseURL: 'http://models.example.test/v1',
      apiKey: 'compatible-secret',
    });
  });

  it('maps OpenAI model, base URL, and credential variables', () => {
    expect(
      readModelConfig({
        AGENT_PROVIDER: 'openai',
        AGENT_MODEL: 'gpt-test',
        AGENT_BASE_URL: 'https://openai.example.test/v1',
        OPENAI_API_KEY: 'openai-secret',
      }),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-test',
      baseURL: 'https://openai.example.test/v1',
      apiKey: 'openai-secret',
    });
  });

  it('uses the default OpenAI model when no model override is provided', () => {
    expect(readModelConfig({ AGENT_PROVIDER: 'openai' })).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      baseURL: undefined,
      apiKey: undefined,
    });
  });

  it('maps credentials for every supported named provider', () => {
    expect(
      readModelConfig({ AGENT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a' }),
    ).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      baseURL: undefined,
      apiKey: 'a',
    });
    expect(
      readModelConfig({
        AGENT_PROVIDER: 'google',
        GOOGLE_GENERATIVE_AI_API_KEY: 'g',
      }),
    ).toEqual({
      provider: 'google',
      model: 'gemini-2.5-flash',
      baseURL: undefined,
      apiKey: 'g',
    });
    expect(
      readModelConfig({ AGENT_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd' }),
    ).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'd',
      name: 'deepseek',
    });
    expect(
      readModelConfig({
        AGENT_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'r',
      }),
    ).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-5-mini',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'r',
      name: 'openrouter',
    });
  });

  it('rejects unsupported provider names before creating a Session', () => {
    expect(() => readModelConfig({ AGENT_PROVIDER: 'unsupported' })).toThrow(
      'Unsupported AGENT_PROVIDER: unsupported',
    );
    expect(() => readModelConfig({ AGENT_PROVIDER: 'toString' })).toThrow(
      'Unsupported AGENT_PROVIDER: toString',
    );
  });

  it('prioritizes explicit selection, then a valid saved choice, then sorted fallback', () => {
    const available = [
      { provider: 'openai' as const, model: 'z-model' },
      { provider: 'anthropic' as const, model: 'a-model' },
    ];

    expect(
      resolveStartupModel({
        env: { AGENT_PROVIDER: 'openai', AGENT_MODEL: 'explicit' },
        saved: { provider: 'anthropic', model: 'a-model' },
        available,
      }),
    ).toEqual({
      selection: { provider: 'openai', model: 'explicit' },
      source: 'environment',
      notices: [],
    });
    expect(
      resolveStartupModel({
        env: {},
        saved: { provider: 'openai', model: 'z-model' },
        available,
      }).source,
    ).toBe('saved');
    expect(resolveStartupModel({ env: {}, available }).selection).toEqual({
      provider: 'anthropic',
      model: 'a-model',
    });
  });

  it.each([
    { name: 'provider only', env: { AGENT_PROVIDER: 'ollama' }, model: 'qwen3:8b' },
    { name: 'model only', env: { AGENT_MODEL: 'explicit-model' }, model: 'explicit-model' },
    { name: 'provider and model', env: { AGENT_PROVIDER: 'ollama', AGENT_MODEL: 'explicit-model' }, model: 'explicit-model' },
  ])('constructs the default endpoint for an explicit $name selection despite a saved endpoint', ({ env, model }) => {
    const saved = { provider: 'ollama' as const, model: 'explicit-model', baseURL: 'http://saved.test:1234/v1' };
    const resolved = resolveStartupModel({ env, saved, available: [saved] });

    expect(resolved.source).toBe('environment');
    expect(readModelConfig(env, resolved.selection)).toMatchObject({
      provider: 'ollama',
      model,
      baseURL: 'http://localhost:11434/v1',
    });
  });

  it('reports a stale saved choice and uses legacy Ollama when nothing is available', () => {
    expect(
      resolveStartupModel({
        env: {},
        saved: { provider: 'openai', model: 'missing' },
        available: [],
      }),
    ).toEqual({
      selection: {
        provider: 'ollama',
        model: 'qwen3:8b',
        baseURL: 'http://localhost:11434/v1',
      },
      source: 'fallback',
      notices: [
        'Saved model preference is unavailable; using a fallback model',
      ],
    });
  });

  it('never includes stale preference values in a startup notice', () => {
    const secret = 'saved-model-secret';

    const result = resolveStartupModel({
      env: {},
      saved: { provider: 'openai', model: secret },
      available: [],
    });

    expect(result.notices).toEqual([
      'Saved model preference is unavailable; using a fallback model',
    ]);
    expect(JSON.stringify(result.notices)).not.toContain(secret);
  });

  it('uses code-unit lexical ordering for fallback models', () => {
    const result = resolveStartupModel({
      env: {},
      available: [
        { provider: 'ollama', model: 'Zebra' },
        { provider: 'ollama', model: 'apple' },
      ],
    });

    expect(result.selection).toEqual({ provider: 'ollama', model: 'Zebra' });
  });
});
