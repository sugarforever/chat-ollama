import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getPreferencesPath,
  readModelPreference,
  writeModelPreference,
} from './preferences.js';

describe('model preferences', () => {
  it.each([
    ['darwin', {}, '/Users/test', '/Users/test/Library/Application Support/ChatOllama/agent.json'],
    ['win32', { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' }, 'C:\\Users\\test', 'C:\\Users\\test\\AppData\\Roaming/ChatOllama/agent.json'],
    ['linux', { XDG_CONFIG_HOME: '/config' }, '/home/test', '/config/ChatOllama/agent.json'],
    ['linux', {}, '/home/test', '/home/test/.config/ChatOllama/agent.json'],
  ] as const)('uses the platform user config directory on %s', (platform, env, home, expected) => {
    expect(getPreferencesPath({ platform, env, home })).toBe(expected);
  });

  it('recovers from corrupt JSON without including file content in its warning', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const filePath = join(directory, 'agent.json');
    await writeFile(filePath, '{"apiKey":"file-secret"', 'utf8');

    const result = await readModelPreference(filePath);

    expect(result).toEqual({
      warning: 'Saved model preference is invalid and was ignored',
    });
    expect(JSON.stringify(result)).not.toContain('file-secret');
  });

  it('writes only non-secret provider, model, and endpoint fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const filePath = join(directory, 'nested', 'agent.json');

    await writeModelPreference(filePath, {
      provider: 'ollama',
      model: 'qwen3:8b',
      baseURL: 'http://localhost:11434/v1',
    });

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseURL: 'http://localhost:11434/v1',
    });
  });

  it('rejects unsupported or secret-bearing preference shapes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const filePath = join(directory, 'agent.json');
    await writeFile(
      filePath,
      JSON.stringify({ provider: 'openai', model: 'gpt-5-mini', apiKey: 'secret' }),
      'utf8',
    );

    expect(await readModelPreference(filePath)).toEqual({
      warning: 'Saved model preference is invalid and was ignored',
    });
  });

  it('rejects endpoint metadata that can contain credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const filePath = join(directory, 'agent.json');
    await writeFile(filePath, JSON.stringify({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseURL: 'https://user:password@example.test/v1?token=secret',
    }), 'utf8');

    expect(await readModelPreference(filePath)).toEqual({
      warning: 'Saved model preference is invalid and was ignored',
    });
    await writeModelPreference(filePath, {
      provider: 'ollama',
      model: 'qwen3:8b',
      baseURL: 'https://example.test/v1?token=secret',
    });
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
    });
  });
});
