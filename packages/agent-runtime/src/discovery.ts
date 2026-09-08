import { BUILT_IN_MODELS, credentialFor } from './provider-catalog.js';
import type {
  AvailableModel,
  DiscoverModelsOptions,
  DiscoveryWarning,
  ModelDiscoveryResult,
  ModelConfig,
  ProviderId,
} from './types.js';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 1_500;

export async function discoverModels(
  options: DiscoverModelsOptions = {},
): Promise<ModelDiscoveryResult> {
  const env = options.env ?? process.env;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const models = BUILT_IN_MODELS.filter(model =>
    credentialFor(model.provider as Exclude<ProviderId, 'ollama'>, env),
  );

  const discoveries = await Promise.all([
    discoverOllama(env, fetchImplementation, timeoutMs),
    credentialFor('openai', env)
      ? discoverOpenAI(env, fetchImplementation, timeoutMs)
      : Promise.resolve({ models: [], warnings: [] }),
  ]);

  return {
    models: sortAndDedupe([
      ...models,
      ...discoveries.flatMap(result => result.models),
    ]),
    warnings: discoveries.flatMap(result => result.warnings),
  };
}

async function discoverOllama(
  env: NodeJS.ProcessEnv,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<ModelDiscoveryResult> {
  const configured = env.AGENT_PROVIDER === undefined || env.AGENT_PROVIDER === 'ollama'
    ? env.AGENT_BASE_URL
    : undefined;
  const rootURL = configured
    ? configured.replace(/\/v1\/?$/, '').replace(/\/$/, '')
    : DEFAULT_OLLAMA_BASE_URL;
  const baseURL = `${rootURL}/v1`;

  return discoverEndpoint('ollama', async signal => {
    const response = await fetchImplementation(`${rootURL}/api/tags`, { signal });
    if (!response.ok) throw new Error('request failed');
    const payload: unknown = await response.json();
    if (!isOllamaPayload(payload)) throw new Error('invalid response');
    return payload.models.map(({ name }) => ({
      provider: 'ollama' as const,
      model: name,
      baseURL,
    }));
  }, timeoutMs);
}

export function resolveModelConfig(
  selection: AvailableModel,
  env: NodeJS.ProcessEnv = process.env,
): ModelConfig {
  const baseURL = env.AGENT_BASE_URL ?? selection.baseURL;
  const apiKey = env.AGENT_API_KEY ?? (
    selection.provider === 'ollama'
      ? 'ollama'
      : credentialFor(selection.provider, env)
  );
  return {
    provider: selection.provider,
    model: selection.model,
    baseURL: baseURL ?? (selection.provider === 'ollama'
      ? 'http://localhost:11434/v1'
      : undefined),
    apiKey,
  };
}

async function discoverOpenAI(
  env: NodeJS.ProcessEnv,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<ModelDiscoveryResult> {
  const baseURL = (env.AGENT_PROVIDER === 'openai' && env.AGENT_BASE_URL) ||
    'https://api.openai.com/v1';
  const apiKey = credentialFor('openai', env);

  return discoverEndpoint('openai', async signal => {
    const response = await fetchImplementation(`${baseURL.replace(/\/$/, '')}/models`, {
      signal,
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error('request failed');
    const payload: unknown = await response.json();
    if (!isOpenAIModelsPayload(payload)) throw new Error('invalid response');
    return payload.data.map(({ id }) => ({ provider: 'openai' as const, model: id }));
  }, timeoutMs);
}

async function discoverEndpoint(
  provider: ProviderId,
  operation: (signal: AbortSignal) => Promise<AvailableModel[]>,
  timeoutMs: number,
): Promise<ModelDiscoveryResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timeout.unref?.();

  try {
    return { models: await operation(controller.signal), warnings: [] };
  } catch {
    const warning: DiscoveryWarning = {
      provider,
      message: timedOut ? 'Model discovery timed out' : 'Model discovery failed',
    };
    return { models: [], warnings: [warning] };
  } finally {
    clearTimeout(timeout);
  }
}

function sortAndDedupe(models: AvailableModel[]): AvailableModel[] {
  const byId = new Map<string, AvailableModel>();
  for (const model of models) {
    byId.set(`${model.provider}\0${model.model}`, model);
  }
  return [...byId.values()].sort((left, right) =>
    left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model),
  );
}

function isOllamaPayload(value: unknown): value is { models: { name: string }[] } {
  if (!isRecord(value) || !Array.isArray(value.models)) return false;
  return value.models.every(model => isRecord(model) && typeof model.name === 'string');
}

function isOpenAIModelsPayload(value: unknown): value is { data: { id: string }[] } {
  if (!isRecord(value) || !Array.isArray(value.data)) return false;
  return value.data.every(model => isRecord(model) && typeof model.id === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
