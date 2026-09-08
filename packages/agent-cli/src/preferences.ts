import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
  readonly rm: typeof rm;
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
    if (hasErrorCode(error, 'ENOENT')) {
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
  operations: PreferenceFileOperations = { mkdir, writeFile, rename, rm },
): Promise<void> {
  const content: ModelPreference = {
    provider: preference.provider,
    model: preference.model,
    ...(preference.baseURL && isSafeEndpoint(preference.baseURL)
      ? { baseURL: preference.baseURL }
      : {}),
  };
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  await operations.mkdir(dirname(filePath), { recursive: true });
  let created = false;
  try {
    await operations.writeFile(temporaryPath, JSON.stringify(content), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    created = true;
    await operations.rename(temporaryPath, filePath);
  } catch (error) {
    // An exclusive-create collision belongs to somebody else; leave it alone.
    if (created || !hasErrorCode(error, 'EEXIST')) {
      await operations.rm(temporaryPath, { force: true }).catch(() => {});
    }
    throw error;
  }
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

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
