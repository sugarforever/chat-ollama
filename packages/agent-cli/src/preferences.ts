import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { AvailableModel, ProviderId } from 'chatollama-agent-runtime';

const PROVIDERS = new Set<ProviderId>([
  'ollama',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'openrouter',
]);

const INVALID_PREFERENCE_WARNING =
  'Saved model preference is invalid and was ignored';

export type ModelPreference = AvailableModel;

export interface PreferencesPathOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
}

export interface PreferenceFileOperations {
  readonly mkdir: typeof mkdir;
  readonly writeFile: typeof writeFile;
  readonly rename: typeof rename;
}

export interface PreferencesReadResult {
  readonly preference?: ModelPreference;
  readonly warning?: string;
}

export function getPreferencesPath(
  options: PreferencesPathOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();

  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'ChatOllama', 'agent.json');
  }

  if (platform === 'win32') {
    return join(
      env.APPDATA || join(home, 'AppData', 'Roaming'),
      'ChatOllama',
      'agent.json',
    );
  }

  return join(
    env.XDG_CONFIG_HOME || join(home, '.config'),
    'ChatOllama',
    'agent.json',
  );
}

export async function readModelPreference(
  filePath = getPreferencesPath(),
): Promise<PreferencesReadResult> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      return {};
    }
    return { warning: INVALID_PREFERENCE_WARNING };
  }

  try {
    const parsed: unknown = JSON.parse(content);
    return isModelPreference(parsed)
      ? { preference: parsed }
      : { warning: INVALID_PREFERENCE_WARNING };
  } catch {
    return { warning: INVALID_PREFERENCE_WARNING };
  }
}

export async function writeModelPreference(
  filePath: string,
  preference: ModelPreference,
  operations: PreferenceFileOperations = { mkdir, writeFile, rename },
): Promise<void> {
  const content: ModelPreference = {
    provider: preference.provider,
    model: preference.model,
    ...(preference.baseURL && isSafeEndpoint(preference.baseURL)
      ? { baseURL: preference.baseURL }
      : {}),
  };
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  await operations.mkdir(dirname(filePath), { recursive: true });
  await operations.writeFile(temporaryPath, JSON.stringify(content), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await operations.rename(temporaryPath, filePath);
}

function isModelPreference(value: unknown): value is ModelPreference {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.every(key => key === 'provider' || key === 'model' || key === 'baseURL') &&
    typeof value.provider === 'string' &&
    PROVIDERS.has(value.provider as ProviderId) &&
    typeof value.model === 'string' &&
    value.model.length > 0 &&
    (value.baseURL === undefined ||
      (typeof value.baseURL === 'string' && isSafeEndpoint(value.baseURL)))
  );
}

function isSafeEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNotFound(error: unknown): error is { readonly code: 'ENOENT' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
