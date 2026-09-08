import type { AvailableModel, ProviderId } from './types.js';

interface ProviderDefinition {
  readonly id: Exclude<ProviderId, 'ollama'>;
  readonly credentialNames: readonly string[];
  readonly models: readonly string[];
}

export const PROVIDER_CATALOG: readonly ProviderDefinition[] = [
  {
    id: 'openai',
    credentialNames: ['OPENAI_API_KEY'],
    models: ['gpt-5', 'gpt-5-mini'],
  },
  {
    id: 'anthropic',
    credentialNames: ['ANTHROPIC_API_KEY'],
    models: ['claude-haiku-4-5', 'claude-sonnet-4-5'],
  },
  {
    id: 'google',
    credentialNames: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'deepseek',
    credentialNames: ['DEEPSEEK_API_KEY'],
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'openrouter',
    credentialNames: ['OPENROUTER_API_KEY'],
    models: ['anthropic/claude-sonnet-4-5', 'openai/gpt-5-mini'],
  },
];

export function getCredential(
  provider: Exclude<ProviderId, 'ollama'>,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const definition = PROVIDER_CATALOG.find(({ id }) => id === provider);
  return definition?.credentialNames
    .map((name) => env[name]?.trim())
    .find((value): value is string => Boolean(value));
}

export function getConfiguredModels(env: NodeJS.ProcessEnv): AvailableModel[] {
  return PROVIDER_CATALOG.flatMap(({ id, models }) => {
    if (!getCredential(id, env)) {
      return [];
    }

    return models.map((model) => ({ provider: id, model }));
  });
}
