#!/usr/bin/env node
import { createAgentSession, discoverModels } from 'chatollama-agent-runtime';

import { runCli } from './cli.js';
import {
  readModelConfig,
  resolveInteractiveModel,
  resolveStartupModel,
} from './config.js';
import {
  getPreferencesPath,
  readModelPreference,
  writeModelPreference,
} from './preferences.js';

async function main(): Promise<void> {
  if (process.env.AGENT_PROVIDER !== undefined) {
    readModelConfig(process.env);
  }
  const preferencesPath = getPreferencesPath();
  const saved = await readModelPreference(preferencesPath);
  if (saved.warning) process.stderr.write(`[warning] ${saved.warning}\n`);
  const discovery = await discoverModels({
    env: process.env,
    ollamaBaseURL: saved.preference?.provider === 'ollama'
      ? saved.preference.baseURL
      : undefined,
  });
  for (const warning of discovery.warnings) {
    process.stderr.write(`[warning] ${warning.provider}: ${warning.message}\n`);
  }
  const resolution = resolveStartupModel({
    env: process.env,
    saved: saved.preference,
    available: discovery.models,
  });
  for (const notice of resolution.notices) {
    process.stderr.write(`[warning] ${notice}\n`);
  }
  const session = createAgentSession({
    model: readModelConfig(process.env, resolution.selection),
  });

  await runCli({
    session,
    models: discovery.models,
    resolveModel: model => resolveInteractiveModel(process.env, model, resolution),
    saveModel: model => writeModelPreference(preferencesPath, model),
    input: process.stdin,
    output: process.stdout,
    error: process.stderr,
  });
}

await main().catch(error => {
  const message = error instanceof Error ? error.message : 'Agent CLI failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
