import { createInterface } from 'node:readline/promises';

import type { AgentSession, AvailableModel } from 'chatollama-agent-runtime';

import {
  createCommandHandler,
  parseCommandInput,
  type CommandInputMode,
  type PreferenceWriter,
} from './commands.js';

export interface RunCliOptions {
  readonly session: AgentSession;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly error: NodeJS.WritableStream;
  readonly availableModels?: readonly AvailableModel[];
  readonly env?: NodeJS.ProcessEnv;
  readonly writePreference?: PreferenceWriter;
  readonly notices?: readonly string[];
}

export async function runCli(options: RunCliOptions): Promise<void> {
  const { session, input, output, error } = options;
  const readline = createInterface({ input, output });
  const handleCommand = createCommandHandler({
    session,
    availableModels: options.availableModels ?? [],
    env: options.env ?? process.env,
    writePreference: options.writePreference ?? (async () => {}),
  });
  let inputMode: CommandInputMode = 'prompt';
  let responseOpen = false;
  let failureReported = false;
  const unsubscribe = session.subscribe(event => {
    switch (event.type) {
      case 'run.started':
        error.write(`[run ${event.runId}] started\n`);
        break;
      case 'model.started':
        output.write(
          `Assistant (${event.model.provider}/${event.model.model})> `,
        );
        responseOpen = true;
        break;
      case 'model.delta':
        output.write(event.delta);
        break;
      case 'model.completed':
        output.write('\n');
        responseOpen = false;
        break;
      case 'run.completed':
        error.write(`[run ${event.runId}] completed\n`);
        break;
      case 'run.failed':
        if (responseOpen) {
          output.write('\n');
          responseOpen = false;
        }
        error.write(`[error] ${event.error.message}\n`);
        failureReported = true;
        break;
      case 'run.cancelled':
        if (responseOpen) {
          output.write('\n');
          responseOpen = false;
        }
        error.write(`[run ${event.runId}] cancelled\n`);
        break;
      case 'model.changed':
        break;
    }
  });

  for (const notice of options.notices ?? []) {
    error.write(`[warning] ${notice}\n`);
  }
  output.write('ChatOllama Agent CLI\nType /exit to quit.\n\nYou> ');

  try {
    for await (const line of readline) {
      const result = await handleCommand(parseCommandInput(line, inputMode));

      if (result.type === 'exit') {
        output.write('Goodbye.\n');
        return;
      }
      if (result.type === 'continue') {
        for (const outputLine of result.lines) {
          output.write(`${outputLine}\n`);
        }
        inputMode = result.inputMode;
        output.write('You> ');
        continue;
      }

      const prompt = result.input;
      if (prompt.length === 0) {
        output.write('You> ');
        continue;
      }

      failureReported = false;
      try {
        await session.prompt(prompt);
      } catch {
        if (!failureReported) {
          error.write('[error] Runtime prompt failed\n');
        }
      }
      output.write('You> ');
    }
  } finally {
    unsubscribe();
    readline.close();
  }
}
