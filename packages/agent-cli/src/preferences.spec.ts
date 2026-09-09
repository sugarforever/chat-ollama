import { mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
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
    [
      'darwin',
      {},
      '/Users/test',
      '/Users/test/Library/Application Support/ChatOllama/agent.json',
    ],
    [
      'win32',
      { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
      'C:\\Users\\test',
      'C:\\Users\\test\\AppData\\Roaming/ChatOllama/agent.json',
    ],
    [
      'linux',
      { XDG_CONFIG_HOME: '/config' },
      '/home/test',
      '/config/ChatOllama/agent.json',
    ],
    [
      'linux',
      {},
      '/home/test',
      '/home/test/.config/ChatOllama/agent.json',
    ],
  ] as const)(
    'uses the platform user config directory on %s',
    (platform, env, home, expected) => {
      expect(getPreferencesPath({ platform, env, home })).toBe(expected);
    },
  );

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
      JSON.stringify({
        provider: 'openai',
        model: 'gpt-5-mini',
        apiKey: 'secret',
      }),
      'utf8',
    );

    expect(await readModelPreference(filePath)).toEqual({
      warning: 'Saved model preference is invalid and was ignored',
    });
  });

  it('writes through a sibling temporary file before renaming it', async () => {
    const operations: string[] = [];
    const path = '/config/ChatOllama/agent.json';

    await writeModelPreference(
      path,
      { provider: 'openai', model: 'gpt-5-mini' },
      {
        mkdir: async directory => {
          operations.push(`mkdir:${directory}`);
        },
        writeFile: async (filePath, content) => {
          operations.push(`write:${filePath}:${content}`);
        },
        rename: async (temporaryPath, targetPath) => {
          operations.push(`rename:${temporaryPath}:${targetPath}`);
        },
        rm,
      },
    );

    expect(operations).toHaveLength(3);
    expect(operations[1]).toMatch(/^write:\/config\/ChatOllama\/agent\.json\.\d+\.[a-f0-9-]+\.tmp:/);
    expect(operations[2]).toMatch(
      /^rename:\/config\/ChatOllama\/agent\.json\.\d+\.[a-f0-9-]+\.tmp:\/config\/ChatOllama\/agent\.json$/,
    );
  });

  it('keeps concurrent writes in one process independent and leaves no temporary files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const filePath = join(directory, 'agent.json');
    let writes = 0;
    let release!: () => void;
    const bothWritten = new Promise<void>(resolve => { release = resolve; });
    const operations = {
      mkdir, rename, rm,
      writeFile: (async (...args: Parameters<typeof writeFile>) => {
        await writeFile(...args);
        if (++writes === 2) release();
        await bothWritten;
      }) as typeof writeFile,
    };
    try {
      const results = await Promise.allSettled([
        writeModelPreference(filePath, { provider: 'ollama', model: 'first' }, operations),
        writeModelPreference(filePath, { provider: 'ollama', model: 'second' }, operations),
      ]);
      expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(['first', 'second']).toContain((await readModelPreference(filePath)).preference?.model);
      expect(await readdir(directory)).toEqual(['agent.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses a pre-existing temporary symlink without overwriting or removing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const protectedPath = join(directory, 'protected.json');
    await writeFile(protectedPath, 'untouched');
    let temporaryPath = '';
    try {
      await expect(writeModelPreference(join(directory, 'agent.json'), { provider: 'ollama', model: 'first' }, {
        mkdir, rename, rm,
        writeFile: async (path, content, options) => {
          temporaryPath = String(path);
          await symlink(protectedPath, temporaryPath);
          await writeFile(path, content, options);
        },
      })).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(protectedPath, 'utf8')).toBe('untouched');
      expect(await readlink(temporaryPath)).toBe(protectedPath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['EACCES', 'EEXIST'])('cleans up its temporary file after rename failure (%s) while preserving the saved preference', async code => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const filePath = join(directory, 'agent.json');
    await writeFile(filePath, '{"provider":"ollama","model":"original"}');
    try {
      await expect(writeModelPreference(filePath, { provider: 'ollama', model: 'next' }, {
        mkdir, writeFile, rm,
        rename: async () => { throw Object.assign(new Error('Rename failed'), { code }); },
      })).rejects.toThrow('Rename failed');
      expect((await readModelPreference(filePath)).preference?.model).toBe('original');
      expect(await readdir(directory)).toEqual(['agent.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects endpoint metadata that can contain credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chatollama-preferences-'));
    const filePath = join(directory, 'agent.json');
    await writeFile(
      filePath,
      JSON.stringify({
        provider: 'ollama',
        model: 'qwen3:8b',
        baseURL: 'https://user:password@example.test/v1?token=secret',
      }),
      'utf8',
    );

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
