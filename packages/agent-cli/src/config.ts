import {
  createModelConfig,
  type AvailableModel,
  type ModelConfig,
  type ProviderId,
} from 'chatollama-agent-runtime';

import type { ModelPreference } from './preferences.js';

const DEFAULT_MODELS: Record<ProviderId, string> = {
  ollama: 'qwen3:8b',
  openai: 'gpt-5-mini',
  anthropic: 'claude-sonnet-4-5',
  google: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
  openrouter: 'openai/gpt-5-mini',
};

const LEGACY_OLLAMA_SELECTION: AvailableModel = {
  provider: 'ollama',
  model: 'qwen3:8b',
  baseURL: 'http://localhost:11434/v1',
};

export interface ResolveStartupModelOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly saved?: ModelPreference;
  readonly available: readonly AvailableModel[];
}

export interface StartupModelResolution {
  readonly selection: AvailableModel;
  readonly source: 'environment' | 'saved' | 'fallback';
  readonly notices: readonly string[];
}

export function readModelConfig(
  env: NodeJS.ProcessEnv,
  selected?: AvailableModel,
): ModelConfig {
  const selection = selected ?? getEnvironmentSelection(env);
  const config = createModelConfig(selection, env);

  return {
    ...config,
    ...(env.AGENT_BASE_URL ? { baseURL: env.AGENT_BASE_URL } : {}),
    ...(env.AGENT_API_KEY ? { apiKey: env.AGENT_API_KEY } : {}),
  };
}

export function resolveStartupModel(
  options: ResolveStartupModelOptions,
): StartupModelResolution {
  const { env, saved, available } = options;
  if (env.AGENT_PROVIDER !== undefined || env.AGENT_MODEL !== undefined) {
    return {
      selection: getEnvironmentSelection(env),
      source: 'environment',
      notices: [],
    };
  }

  if (saved) {
    const savedModel = available.find(
      candidate =>
        candidate.provider === saved.provider && candidate.model === saved.model,
    );
    if (savedModel) {
      return {
        selection: { ...savedModel, ...(saved.baseURL ? { baseURL: saved.baseURL } : {}) },
        source: 'saved',
        notices: [],
      };
    }
  }

  const fallback = [...available].sort(compareModels)[0] ?? LEGACY_OLLAMA_SELECTION;
  const notices = saved
    ? [
        `Saved model ${saved.provider}/${saved.model} is unavailable; using ${fallback.provider}/${fallback.model}`,
      ]
    : [];
  return { selection: fallback, source: 'fallback', notices };
}

function getEnvironmentSelection(env: NodeJS.ProcessEnv): AvailableModel {
  const provider = env.AGENT_PROVIDER ?? 'ollama';
  if (!isProviderId(provider)) {
    throw new Error(`Unsupported AGENT_PROVIDER: ${provider}`);
  }

  return {
    provider,
    model: env.AGENT_MODEL ?? DEFAULT_MODELS[provider],
    ...(env.AGENT_BASE_URL ? { baseURL: env.AGENT_BASE_URL } : {}),
  };
}

function isProviderId(value: string): value is ProviderId {
  return Object.hasOwn(DEFAULT_MODELS, value);
}

function compareModels(left: AvailableModel, right: AvailableModel): number {
  return (
    left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)
  );
}
