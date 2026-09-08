import { getConfiguredModels, getCredential } from './provider-catalog.js';
import type {
  AvailableModel,
  DiscoverModelsOptions,
  DiscoveryWarning,
  ModelDiscoveryResult,
  ProviderId,
} from './types.js';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 2_000;

interface DiscoveryAttempt {
  readonly models: readonly AvailableModel[];
  readonly warning?: DiscoveryWarning;
}

class DiscoveryTimeoutError extends Error {}
class InvalidDiscoveryDataError extends Error {}

export async function discoverModels(
  options: DiscoverModelsOptions = {},
): Promise<ModelDiscoveryResult> {
  const env = options.env ?? process.env;
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = [
    discoverOllama(fetcher, options.ollamaBaseURL ?? DEFAULT_OLLAMA_BASE_URL, timeoutMs),
  ];
  const openaiCredential = getCredential('openai', env);
  if (openaiCredential) {
    attempts.push(
      discoverOpenAI(
        fetcher,
        options.openaiBaseURL ?? DEFAULT_OPENAI_BASE_URL,
        openaiCredential,
        timeoutMs,
      ),
    );
  }

  const results = await Promise.all(attempts);
  const models = deduplicateAndSort([
    ...getConfiguredModels(env),
    ...results.flatMap((result) => result.models),
  ]);
  const warnings = results.flatMap((result) => (result.warning ? [result.warning] : []));

  return { models, warnings };
}

async function discoverOllama(
  fetcher: typeof fetch,
  configuredBaseURL: string,
  timeoutMs: number,
): Promise<DiscoveryAttempt> {
  return discover(
    'ollama',
    async () => {
      const baseURL = getOllamaBaseURL(configuredBaseURL);
      const data = await requestJson(fetcher, `${removeTrailingSlash(baseURL)}/api/tags`, {}, timeoutMs);
      if (!isOllamaResponse(data)) {
        return invalidData('ollama');
      }

      return {
        models: data.models.map(({ name }) => ({
          provider: 'ollama',
          model: name,
          baseURL: `${removeTrailingSlash(baseURL)}/v1`,
        })),
      };
    },
  );
}

async function discoverOpenAI(
  fetcher: typeof fetch,
  configuredBaseURL: string,
  apiKey: string,
  timeoutMs: number,
): Promise<DiscoveryAttempt> {
  return discover(
    'openai',
    async () => {
      const baseURL = getSanitizedBaseURL(configuredBaseURL);
      const data = await requestJson(
        fetcher,
        `${removeTrailingSlash(baseURL)}/models`,
        { headers: { authorization: `Bearer ${apiKey}` } },
        timeoutMs,
      );
      if (!isOpenAIResponse(data)) {
        return invalidData('openai');
      }

      return {
        models: data.data.map(({ id }) => ({ provider: 'openai', model: id, baseURL })),
      };
    },
  );
}

async function discover(
  provider: ProviderId,
  query: () => Promise<DiscoveryAttempt>,
): Promise<DiscoveryAttempt> {
  try {
    return await query();
  } catch (error) {
    return {
      models: [],
      warning: {
        provider,
        message:
          error instanceof DiscoveryTimeoutError
            ? 'Model discovery timed out.'
            : error instanceof InvalidDiscoveryDataError
              ? 'Model discovery returned invalid data.'
            : 'Model discovery failed.',
      },
    };
  }
}

async function requestJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await new Promise<Response>((resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new DiscoveryTimeoutError());
      }, Math.max(1, timeoutMs));
      void Promise.resolve()
        .then(() => fetcher(url, { ...init, signal: controller.signal }))
        .then(resolve, reject);
    });
    if (!response.ok) {
      throw new Error('Model discovery request failed');
    }

    try {
      return await response.json();
    } catch {
      throw new InvalidDiscoveryDataError();
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getOllamaBaseURL(configuredBaseURL: string): string {
  const baseURL = getSanitizedBaseURL(configuredBaseURL);
  return baseURL.endsWith('/v1') ? baseURL.slice(0, -3) : baseURL;
}

function getSanitizedBaseURL(configuredBaseURL: string): string {
  const url = new URL(configuredBaseURL);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return removeTrailingSlash(`${url.origin}${url.pathname}`);
}

function removeTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isOllamaResponse(value: unknown): value is { models: Array<{ name: string }> } {
  return (
    isRecord(value) &&
    Array.isArray(value.models) &&
    value.models.every(
      (model) => isRecord(model) && typeof model.name === 'string' && model.name.length > 0,
    )
  );
}

function isOpenAIResponse(value: unknown): value is { data: Array<{ id: string }> } {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(
      (model) => isRecord(model) && typeof model.id === 'string' && model.id.length > 0,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function invalidData(provider: ProviderId): DiscoveryAttempt {
  return {
    models: [],
    warning: { provider, message: 'Model discovery returned invalid data.' },
  };
}

function deduplicateAndSort(models: AvailableModel[]): AvailableModel[] {
  const deduplicated = new Map<string, AvailableModel>();
  for (const model of models) {
    deduplicated.set(`${model.provider}\u0000${model.model}`, model);
  }

  return [...deduplicated.values()].sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model),
  );
}
