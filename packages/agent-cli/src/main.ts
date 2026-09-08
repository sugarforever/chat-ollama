#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createAgentSession } from 'chatollama-agent-runtime';

import { runCli } from './cli.js';
import { readModelConfig } from './config.js';
import type { InteractiveTerminal } from './interactive-cli.js';

export interface RunMainOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: NodeJS.ReadableStream & { readonly isTTY?: boolean };
  readonly output?: NodeJS.WritableStream & { readonly isTTY?: boolean };
  readonly error?: NodeJS.WritableStream;
  readonly terminal?: InteractiveTerminal;
}

export async function runMain(options: RunMainOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const session = createAgentSession({ model: readModelConfig(env) });

  if (input.isTTY && output.isTTY) {
    const { runInteractiveCli } = await import('./interactive-cli.js');
    await runInteractiveCli({ session, env, terminal: options.terminal });
    return;
  }

  await runCli({
    session,
    input,
    output,
    error: options.error ?? process.stderr,
    env,
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
