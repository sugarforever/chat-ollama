#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createAgentSession, discoverModels } from 'chatollama-agent-runtime';

import { runCli } from './cli.js';
import { readModelConfig, resolveStartupModel } from './config.js';
import type { InteractiveTerminal } from './interactive-cli.js';
import { getPreferencesPath, readModelPreference, writeModelPreference } from './preferences.js';

export interface RunMainOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: NodeJS.ReadableStream & { readonly isTTY?: boolean };
  readonly output?: NodeJS.WritableStream & { readonly isTTY?: boolean };
  readonly error?: NodeJS.WritableStream;
  readonly terminal?: InteractiveTerminal;
  readonly fetch?: typeof fetch;
  readonly preferencesPath?: string;
}

export async function runMain(options: RunMainOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  // Validate explicit provider/model overrides before any network work.
  resolveStartupModel({ env, available: [] });
  const preferencesPath = options.preferencesPath ?? getPreferencesPath({ env });
  const [discovery, saved] = await Promise.all([
    discoverModels({
      env,
      fetch: options.fetch,
      ...(env.AGENT_PROVIDER === 'ollama' && env.AGENT_BASE_URL
        ? { ollamaBaseURL: env.AGENT_BASE_URL }
        : {}),
      ...(env.AGENT_PROVIDER === 'openai' && env.AGENT_BASE_URL
        ? { openaiBaseURL: env.AGENT_BASE_URL }
        : {}),
    }),
    readModelPreference(preferencesPath),
  ]);
  const resolved = resolveStartupModel({ env, saved: saved.preference, available: discovery.models });
  const session = createAgentSession({ model: readModelConfig(env, resolved.selection) });
  const shared = {
    session,
    env,
    availableModels: discovery.models,
    writePreference: (selection: Parameters<typeof writeModelPreference>[1]) =>
      writeModelPreference(preferencesPath, selection),
    notices: [
      ...discovery.warnings.map(warning => `${warning.provider}: ${warning.message}`),
      ...(saved.warning ? [saved.warning] : []),
      ...resolved.notices,
    ],
  };

  if (input.isTTY && output.isTTY) {
    const { runInteractiveCli } = await import('./interactive-cli.js');
    await runInteractiveCli({ ...shared, terminal: options.terminal });
    return;
  }

  await runCli({
    ...shared,
    input,
    output,
    error: options.error ?? process.stderr,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  await runMain().catch(error => {
    const message = error instanceof Error ? error.message : 'Agent CLI failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
