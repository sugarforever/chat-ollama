import type { AvailableModel, ProviderId } from './types.js';

export const PROVIDER_CREDENTIALS = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
} as const satisfies Record<Exclude<ProviderId, 'ollama'>, readonly string[]>;

export const BUILT_IN_MODELS: readonly AvailableModel[] = [
  { provider: 'openai', model: 'gpt-5-mini' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'openrouter', model: 'openai/gpt-5-mini' },
];

export function credentialFor(
  provider: Exclude<ProviderId, 'ollama'>,
  env: NodeJS.ProcessEnv,
): string | undefined {
  for (const name of PROVIDER_CREDENTIALS[provider]) {
    const value = env[name];
    if (value) return value;
  }
  return undefined;
}
