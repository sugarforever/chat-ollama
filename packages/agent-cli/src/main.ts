#!/usr/bin/env node
import { createAgentSession } from 'chatollama-agent-runtime';

import { runCli } from './cli.js';
import { readModelConfig } from './config.js';

async function main(): Promise<void> {
  const session = createAgentSession({ model: readModelConfig(process.env) });

  await runCli({
    session,
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
