import {
  createModelConfig,
  type AgentSession,
  type AvailableModel,
} from 'chatollama-agent-runtime';

export type CommandInputMode = 'prompt' | 'model-selection';

export type ParsedCommand =
  | { readonly type: 'show-models' }
  | {
      readonly type: 'select-model';
      readonly provider: string;
      readonly model: string;
    }
  | { readonly type: 'select-model-number'; readonly number: number }
  | { readonly type: 'cancel-model-selection' }
  | { readonly type: 'new-session' }
  | { readonly type: 'exit' }
  | { readonly type: 'prompt'; readonly input: string }
  | {
      readonly type: 'invalid';
      readonly message: string;
      readonly inputMode?: CommandInputMode;
    };

export type CommandResult =
  | {
      readonly type: 'continue';
      readonly inputMode: CommandInputMode;
      readonly lines: readonly string[];
    }
  | { readonly type: 'prompt'; readonly input: string }
  | { readonly type: 'exit' };

export type PreferenceWriter = (selection: AvailableModel) => Promise<void>;

export interface CreateCommandHandlerOptions {
  readonly session: AgentSession;
  readonly availableModels: readonly AvailableModel[];
  readonly env: NodeJS.ProcessEnv;
  readonly writePreference: PreferenceWriter;
}

export type CommandHandler = (command: ParsedCommand) => Promise<CommandResult>;

const MODEL_USAGE = 'Usage: /model <provider>/<model-id>';

export function parseCommandInput(
  input: string,
  mode: CommandInputMode = 'prompt',
): ParsedCommand {
  const value = input.trim();

  if (mode === 'model-selection') {
    if (value.length === 0) {
      return { type: 'cancel-model-selection' };
    }
    if (/^\d+$/.test(value)) {
      return { type: 'select-model-number', number: Number(value) };
    }
  }

  if (value === '/models') {
    return { type: 'show-models' };
  }
  if (value === '/new') {
    return { type: 'new-session' };
  }
  if (value === '/exit') {
    return { type: 'exit' };
  }
  if (value === '/model' || value.startsWith('/model ')) {
    const selection = value.slice('/model'.length).trim();
    const slash = selection.indexOf('/');
    if (slash <= 0 || slash === selection.length - 1) {
      return { type: 'invalid', message: MODEL_USAGE };
    }
    return {
      type: 'select-model',
      provider: selection.slice(0, slash),
      model: selection.slice(slash + 1),
    };
  }

  if (mode === 'model-selection') {
    return {
      type: 'invalid',
      inputMode: 'model-selection',
      message:
        'Invalid model selection. Enter a listed number, or press Enter to cancel.',
    };
  }

  return { type: 'prompt', input: value };
}

export function createCommandHandler(
  options: CreateCommandHandlerOptions,
): CommandHandler {
  const models = [...options.availableModels].sort(compareModels);

  return async command => {
    switch (command.type) {
      case 'show-models':
        return listModels(models, options.session);
      case 'select-model': {
        const selection = models.find(
          candidate =>
            candidate.provider === command.provider &&
            candidate.model === command.model,
        );
        if (!selection) {
          return continueWith(
            'prompt',
            `Unknown model: ${command.provider}/${command.model}. Run /models to see available models.`,
          );
        }
        return switchModel(options, selection);
      }
      case 'select-model-number': {
        const selection = models[command.number - 1];
        if (!selection) {
          return continueWith(
            'model-selection',
            'Invalid model selection. Enter a listed number, or press Enter to cancel.',
          );
        }
        return switchModel(options, selection);
      }
      case 'cancel-model-selection':
        return continueWith('prompt', 'Model selection cancelled.');
      case 'new-session':
        return resetSession(options.session);
      case 'invalid':
        return continueWith(command.inputMode ?? 'prompt', command.message);
      case 'prompt':
        return { type: 'prompt', input: command.input };
      case 'exit':
        return { type: 'exit' };
    }
  };
}

function resetSession(session: AgentSession): CommandResult {
  try {
    session.reset();
    return continueWith('prompt', 'Conversation cleared.');
  } catch (error) {
    const message =
      error instanceof Error && error.message === 'Session has an active run'
        ? error.message
        : 'Conversation reset failed';
    return continueWith('prompt', `Could not clear conversation: ${message}`);
  }
}

function listModels(
  models: readonly AvailableModel[],
  session: AgentSession,
): CommandResult {
  if (models.length === 0) {
    return continueWith(
      'prompt',
      'No models are available. Configure provider credentials and try again.',
    );
  }

  const current = session.getSnapshot().model;
  return {
    type: 'continue',
    inputMode: 'model-selection',
    lines: [
      'Available models:',
      ...models.map((model, index) => {
        const marker =
          model.provider === current.provider && model.model === current.model
            ? ' (current)'
            : '';
        return `${index + 1}. ${model.provider}/${model.model}${marker}`;
      }),
      'Enter a model number, or press Enter to cancel.',
    ],
  };
}

async function switchModel(
  options: CreateCommandHandlerOptions,
  selection: AvailableModel,
): Promise<CommandResult> {
  const label = `${selection.provider}/${selection.model}`;
  try {
    const config = createModelConfig(selection, options.env);
    options.session.setModel(config);
  } catch (error) {
    const message =
      error instanceof Error && error.message === 'Session has an active run'
        ? error.message
        : 'Model switch failed';
    return continueWith('prompt', `Could not switch model: ${message}`);
  }

  try {
    await options.writePreference(selection);
  } catch {
    return continueWith(
      'prompt',
      `Switched to ${label} for this session, but could not save it as the default.`,
    );
  }

  return continueWith('prompt', `Switched to ${label}.`);
}

function continueWith(
  inputMode: CommandInputMode,
  ...lines: readonly string[]
): CommandResult {
  return { type: 'continue', inputMode, lines };
}

function compareModels(left: AvailableModel, right: AvailableModel): number {
  return compareCodeUnits(left.provider, right.provider) ||
    compareCodeUnits(left.model, right.model);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
