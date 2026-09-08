import type {
  AvailableModel,
  ModelConfig,
  ProviderId,
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
): ModelConfig {
  const provider = selected?.provider ?? parseProvider(env.AGENT_PROVIDER ?? 'ollama');
  const model = selected?.model ?? env.AGENT_MODEL ?? DEFAULT_MODELS[provider];
  const baseURL = env.AGENT_BASE_URL ?? selected?.baseURL;
  const apiKey = env.AGENT_API_KEY ?? providerCredential(provider, env);

  if (provider === 'openai') {
    return {
      provider: 'openai',
      model,
      baseURL,
      apiKey,
    };
  }

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      model,
      baseURL: baseURL ?? 'http://localhost:11434/v1',
      apiKey: apiKey ?? 'ollama',
    };
  }

  return { provider, model, baseURL, apiKey };
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

function providerCredential(
  provider: ProviderId,
  env: NodeJS.ProcessEnv,
): string | undefined {
  switch (provider) {
    case 'ollama': return undefined;
    case 'openai': return env.OPENAI_API_KEY;
    case 'anthropic': return env.ANTHROPIC_API_KEY;
    case 'google': return env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
    case 'deepseek': return env.DEEPSEEK_API_KEY;
    case 'openrouter': return env.OPENROUTER_API_KEY;
  }
}
