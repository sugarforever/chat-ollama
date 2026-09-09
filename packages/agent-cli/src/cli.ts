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
  const readline = createInterface({ input, output, terminal: false });
  const handleCommand = createCommandHandler({
    session,
    availableModels: options.availableModels ?? [],
    env: options.env ?? process.env,
    writePreference: options.writePreference ?? (async () => {}),
  });
  let inputMode: CommandInputMode = 'prompt';
  let responseOpen = false;
  let responseStarted = false;
  let assistantLabel = 'Assistant> ';
  let failureReported = false;
  const closeResponse = () => {
    if (!responseOpen) return;
    output.write('\n');
    responseOpen = false;
  };
  const unsubscribe = session.subscribe(event => {
    switch (event.type) {
      case 'run.started':
        responseStarted = false;
        error.write(`[run ${event.runId}] started\n`);
        break;
      case 'step.started':
        error.write(`[step ${event.step}] started\n`);
        break;
      case 'step.completed':
        closeResponse();
        error.write(`[step ${event.step}] completed: ${event.reason}\n`);
        break;
      case 'tool.started':
        closeResponse();
        error.write(
          `[tool ${event.call.toolName}] running ${event.call.input}\n`,
        );
        break;
      case 'tool.completed':
        closeResponse();
        error.write(
          `[tool ${event.result.toolName}] completed ${event.result.output}\n`,
        );
        break;
      case 'tool.failed':
        closeResponse();
        error.write(
          `[tool ${event.result.toolName}] failed ${event.result.output}\n`,
        );
        break;
      case 'model.started':
        assistantLabel = `Assistant (${event.model.provider}/${event.model.model})> `;
        break;
      case 'model.delta':
        if (!responseOpen) {
          output.write(assistantLabel);
          responseOpen = true;
          responseStarted = true;
        }
        output.write(event.delta);
        break;
      case 'model.completed':
        if (responseOpen) closeResponse();
        else if (!responseStarted) output.write(`${assistantLabel}\n`);
        break;
      case 'run.completed':
        error.write(`[run ${event.runId}] completed\n`);
        break;
      case 'run.stopped':
        error.write(`[run ${event.runId}] stopped: step limit reached\n`);
        break;
      case 'run.failed':
        closeResponse();
        error.write(`[error] ${event.error.message}\n`);
        failureReported = true;
        break;
      case 'run.cancelled':
        closeResponse();
        error.write(`[run ${event.runId}] cancelled\n`);
        break;
      case 'model.changed':
      case 'session.reset':
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
    session.cancel();
    readline.close();
  }
}
