import { describe, expect, it } from 'vitest';

import {
  readModelConfig,
  resolveInteractiveModel,
  resolveStartupModel,
} from './config.js';

describe('CLI model configuration', () => {
  it('defaults to the local Ollama OpenAI-compatible endpoint', () => {
    expect(readModelConfig({})).toEqual({
      provider: 'ollama',
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
    expect(readModelConfig({ AGENT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a' })).toEqual({
      provider: 'anthropic', model: 'claude-sonnet-4-5', baseURL: undefined, apiKey: 'a',
    });
    expect(readModelConfig({ AGENT_PROVIDER: 'google', GOOGLE_GENERATIVE_AI_API_KEY: 'g' })).toEqual({
      provider: 'google', model: 'gemini-2.5-flash', baseURL: undefined, apiKey: 'g',
    });
    expect(readModelConfig({ AGENT_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd' })).toEqual({
      provider: 'deepseek', model: 'deepseek-chat', baseURL: undefined, apiKey: 'd',
    });
    expect(readModelConfig({ AGENT_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'r' })).toEqual({
      provider: 'openrouter', model: 'openai/gpt-5-mini', baseURL: undefined, apiKey: 'r',
    });
  });

  it('rejects unsupported provider names before creating a Session', () => {
    expect(() => readModelConfig({ AGENT_PROVIDER: 'unsupported' })).toThrow(
      'Unsupported AGENT_PROVIDER: unsupported',
    );
  });

  it('prioritizes explicit selection, then a valid saved choice, then sorted fallback', () => {
    const available = [
      { provider: 'openai' as const, model: 'z-model' },
      { provider: 'anthropic' as const, model: 'a-model' },
    ];

    expect(resolveStartupModel({
      env: { AGENT_PROVIDER: 'openai', AGENT_MODEL: 'explicit' },
      saved: { provider: 'anthropic', model: 'a-model' },
      available,
    })).toEqual({
      selection: { provider: 'openai', model: 'explicit' },
      source: 'environment',
      notices: [],
    });
    expect(resolveStartupModel({
      env: {}, saved: { provider: 'openai', model: 'z-model' }, available,
    }).source).toBe('saved');
    expect(resolveStartupModel({ env: {}, available }).selection).toEqual({
      provider: 'anthropic', model: 'a-model',
    });
  });

  it('reports a stale saved choice and uses legacy Ollama when nothing is available', () => {
    expect(resolveStartupModel({
      env: {},
      saved: { provider: 'openai', model: 'missing' },
      available: [],
    })).toEqual({
      selection: {
        provider: 'ollama',
        model: 'qwen3:8b',
        baseURL: 'http://localhost:11434/v1',
      },
      source: 'fallback',
      notices: [
        'Saved model openai/missing is unavailable; using ollama/qwen3:8b',
      ],
    });
  });

  it('keeps generic overrides only for switches within the explicit startup provider', () => {
    const env = {
      AGENT_PROVIDER: 'ollama',
      AGENT_BASE_URL: 'https://ollama.example.test/v1',
      AGENT_API_KEY: 'ollama-secret',
      ANTHROPIC_API_KEY: 'anthropic-secret',
    };
    const startup = resolveStartupModel({ env, available: [] });

    expect(resolveInteractiveModel(
      env,
      { provider: 'ollama', model: 'other-local-model' },
      startup,
    )).toEqual({
      provider: 'ollama',
      model: 'other-local-model',
      baseURL: 'https://ollama.example.test/v1',
      apiKey: 'ollama-secret',
    });
    expect(resolveInteractiveModel(
      env,
      { provider: 'anthropic', model: 'claude-test' },
      startup,
    )).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      baseURL: undefined,
      apiKey: 'anthropic-secret',
    });
  });
});
