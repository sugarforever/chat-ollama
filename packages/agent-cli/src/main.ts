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
  const initial = resolveStartupModel({ env, available: [] });
  const preferencesPath = options.preferencesPath ?? getPreferencesPath({ env });
  const saved = await readModelPreference(preferencesPath);
  // Explicit selections replace the entire saved selection, including its endpoint.
  const discoverySelection = initial.source === 'environment' ? initial.selection : saved.preference;
  const endpointProvider = discoverySelection?.provider ?? 'ollama';
  const discoveryBaseURL = env.AGENT_BASE_URL || discoverySelection?.baseURL;
  const discovery = await discoverModels({
    env,
    fetch: options.fetch,
    ollamaBaseURL: endpointProvider === 'ollama' ? discoveryBaseURL : undefined,
    openaiBaseURL: endpointProvider === 'openai' ? discoveryBaseURL : undefined,
  });
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

  const ci = env.CI?.trim().toLowerCase();
  const isCI = Boolean(ci && ci !== 'false' && ci !== '0');
  if (input.isTTY && output.isTTY && !isCI) {
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
