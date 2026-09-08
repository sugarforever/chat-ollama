import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { AvailableModel, ProviderId } from 'chatollama-agent-runtime';

export type ModelPreference = AvailableModel;

export interface PreferencesReadResult {
  readonly preference?: ModelPreference;
  readonly warning?: string;
}

interface PreferencesPathOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
}

const PROVIDERS = new Set<ProviderId>([
  'ollama',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'openrouter',
]);

export function getPreferencesPath(options: PreferencesPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  let directory: string;

  if (platform === 'darwin') {
    directory = join(home, 'Library', 'Application Support');
  } else if (platform === 'win32') {
    directory = env.APPDATA ?? join(home, 'AppData', 'Roaming');
  } else {
    directory = env.XDG_CONFIG_HOME ?? join(home, '.config');
  }

  return join(directory, 'ChatOllama', 'agent.json');
}

export async function readModelPreference(
  filePath = getPreferencesPath(),
): Promise<PreferencesReadResult> {
  try {
    const value: unknown = JSON.parse(await readFile(filePath, 'utf8'));
    if (!isModelPreference(value)) {
      return { warning: 'Saved model preference is invalid and was ignored' };
    }
    return { preference: value };
  } catch (error) {
    if (isNotFound(error)) return {};
    return { warning: 'Saved model preference is invalid and was ignored' };
  }
}

export async function writeModelPreference(
  filePath: string,
  preference: ModelPreference,
): Promise<void> {
  const content: ModelPreference = {
    provider: preference.provider,
    model: preference.model,
    ...(preference.baseURL ? { baseURL: preference.baseURL } : {}),
  };
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(content, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

function isModelPreference(value: unknown): value is ModelPreference {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !['provider', 'model', 'baseURL'].includes(key))) return false;
  return (
    typeof record.provider === 'string' &&
    PROVIDERS.has(record.provider as ProviderId) &&
    typeof record.model === 'string' &&
    record.model.length > 0 &&
    (record.baseURL === undefined || typeof record.baseURL === 'string')
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'ENOENT';
}
