import { createInterface } from 'node:readline/promises';

import type {
  AgentSession,
  AvailableModel,
  ModelConfig,
} from 'chatollama-agent-runtime';

export interface RunCliOptions {
  readonly session: AgentSession;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly error: NodeJS.WritableStream;
  readonly models?: readonly AvailableModel[];
  readonly resolveModel?: (model: AvailableModel) => ModelConfig;
  readonly saveModel?: (model: AvailableModel) => Promise<void>;
}

export async function runCli(options: RunCliOptions): Promise<void> {
  const { session, input, output, error } = options;
  const models = [...(options.models ?? [])].sort((left, right) =>
    left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model),
  );
  const resolveModel = options.resolveModel ?? (model => model);
  const saveModel = options.saveModel ?? (async () => {});
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
      case 'model.changed':
        break;
    }
  });

  output.write('ChatOllama Agent CLI\nType /exit to quit.\n\nYou> ');
  let selectingModel = false;

  try {
    for await (const line of readline) {
      const prompt = line.trim();

      if (selectingModel) {
        selectingModel = false;
        if (prompt.length === 0) {
          output.write('Selection cancelled.\nYou> ');
          continue;
        }
        const index = Number(prompt);
        const selected = Number.isInteger(index) ? models[index - 1] : undefined;
        if (!selected) {
          error.write('[error] Invalid model number\n');
          output.write('You> ');
          continue;
        }
        await switchModel(selected);
        output.write('You> ');
        continue;
      }

      if (prompt === '/exit') {
        output.write('Goodbye.\n');
        return;
      }
      if (prompt.length === 0) {
        output.write('You> ');
        continue;
      }

      if (prompt === '/models') {
        if (models.length === 0) {
          output.write(
            'No models available. Start Ollama or configure a supported API key.\nYou> ',
          );
          continue;
        }
        const current = session.getSnapshot().model;
        output.write('Available models:\n');
        models.forEach((model, index) => {
          const marker = model.provider === current.provider && model.model === current.model
            ? ' *'
            : '';
          output.write(`${index + 1}. ${model.provider}/${model.model}${marker}\n`);
        });
        output.write('Select model number (Enter to cancel): ');
        selectingModel = true;
        continue;
      }

      if (prompt === '/model') {
        error.write('[error] Usage: /model <provider>/<model-id>\n');
        output.write('You> ');
        continue;
      }

      if (prompt.startsWith('/model ')) {
        const requested = prompt.slice('/model '.length).trim();
        const selected = models.find(model =>
          `${model.provider}/${model.model}` === requested,
        );
        if (!selected) {
          error.write(`[error] Model not available: ${requested || '(empty)'}\n`);
        } else {
          await switchModel(selected);
        }
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

  async function switchModel(model: AvailableModel): Promise<void> {
    try {
      session.setModel(resolveModel(model));
    } catch (switchError) {
      const message = switchError instanceof Error
        ? switchError.message
        : 'Model switch failed';
      error.write(`[error] ${message}\n`);
      return;
    }

    output.write(`Switched to ${model.provider}/${model.model}\n`);
    try {
      await saveModel(model);
    } catch {
      error.write('[warning] Model changed, but the default could not be saved\n');
    }
  }
}
