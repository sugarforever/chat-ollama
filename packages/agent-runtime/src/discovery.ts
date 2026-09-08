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
        models: data.data
          .filter(({ id }) => isOpenAITextModel(id))
          .map(({ id }) => ({ provider: 'openai', model: id, baseURL })),
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
    return await new Promise<unknown>((resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new DiscoveryTimeoutError();
        // Settle the deadline before native fetch/body abort handlers can reject.
        reject(error);
        controller.abort(error);
      }, Math.max(1, timeoutMs));
      void Promise.resolve()
        .then(async () => {
          const response = await fetcher(url, { ...init, signal: controller.signal });
          if (!response.ok) {
            throw new Error('Model discovery request failed');
          }

          try {
            return await response.json();
          } catch {
            if (controller.signal.aborted) throw new DiscoveryTimeoutError();
            throw new InvalidDiscoveryDataError();
          }
        })
        .then(resolve, reject);
    });
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

function isOpenAITextModel(id: string): boolean {
  // /models is an inventory, without endpoint capability flags. Our OpenAI
  // adapter uses text Responses, so admit these explicit text families and
  // their dated snapshots only. Audio, realtime, image, embedding, and unknown
  // IDs stay out of automatic discovery; AGENT_MODEL remains an explicit opt-in.
  return /^(?:gpt-5(?:-mini|-nano)?|gpt-4\.1(?:-mini|-nano)?|gpt-4o(?:-mini)?|o3(?:-mini)?|o4-mini)(?:-\d{4}-\d{2}-\d{2})?$/.test(id);
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
      compareCodeUnits(left.provider, right.provider) || compareCodeUnits(left.model, right.model),
  );
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
