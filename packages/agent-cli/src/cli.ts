import { createInterface } from 'node:readline/promises';

import type { AgentSession } from 'chatollama-agent-runtime';

export interface RunCliOptions {
  readonly session: AgentSession;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly error: NodeJS.WritableStream;
}

export async function runCli(options: RunCliOptions): Promise<void> {
  const { session, input, output, error } = options;
  const readline = createInterface({ input, output });
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
    }
  });

  output.write('ChatOllama Agent CLI\nType /exit to quit.\n\nYou> ');

  try {
    for await (const line of readline) {
      const prompt = line.trim();

      if (prompt === '/exit') {
        output.write('Goodbye.\n');
        return;
      }
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
