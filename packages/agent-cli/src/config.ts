import {
  resolveModelConfig,
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

const PROVIDERS = new Set(Object.keys(DEFAULT_MODELS));

export function readModelConfig(
  env: NodeJS.ProcessEnv,
  selected?: AvailableModel,
  useAgentOverrides = true,
): ModelConfig {
  const provider = selected?.provider ?? parseProvider(env.AGENT_PROVIDER ?? 'ollama');
  const model = selected?.model ?? env.AGENT_MODEL ?? DEFAULT_MODELS[provider];
  return resolveModelConfig(
    { provider, model, baseURL: selected?.baseURL },
    env,
    { useAgentOverrides },
  );
}

interface ResolveStartupModelOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly saved?: ModelPreference;
  readonly available: readonly AvailableModel[];
}

export interface StartupModelResolution {
  readonly selection: AvailableModel;
  readonly source: 'environment' | 'saved' | 'fallback';
  readonly notices: string[];
}

export function resolveStartupModel(
  options: ResolveStartupModelOptions,
): StartupModelResolution {
  const notices: string[] = [];
  if (
    options.env.AGENT_PROVIDER !== undefined ||
    options.env.AGENT_MODEL !== undefined ||
    options.env.AGENT_BASE_URL !== undefined ||
    options.env.AGENT_API_KEY !== undefined
  ) {
    const provider = parseProvider(options.env.AGENT_PROVIDER ?? 'ollama');
    return {
      selection: {
        provider,
        model: options.env.AGENT_MODEL ?? DEFAULT_MODELS[provider],
        ...(options.env.AGENT_BASE_URL ? { baseURL: options.env.AGENT_BASE_URL } : {}),
      },
      source: 'environment',
      notices,
    };
  }

  if (options.saved) {
    const match = options.available.find(model =>
      model.provider === options.saved?.provider && model.model === options.saved.model,
    );
    if (match) return { selection: { ...match, ...options.saved }, source: 'saved', notices };
  }

  const fallback = [...options.available].sort((left, right) =>
    left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model),
  )[0] ?? {
    provider: 'ollama' as const,
    model: DEFAULT_MODELS.ollama,
    baseURL: 'http://localhost:11434/v1',
  };
  if (options.saved) {
    notices.push(
      `Saved model ${options.saved.provider}/${options.saved.model} is unavailable; using ${fallback.provider}/${fallback.model}`,
    );
  }
  return { selection: fallback, source: 'fallback', notices };
}

function parseProvider(value: string): ProviderId {
  if (!PROVIDERS.has(value)) {
    throw new Error(`Unsupported AGENT_PROVIDER: ${value}`);
  }
  return value as ProviderId;
}
