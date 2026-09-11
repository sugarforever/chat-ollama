import type {
  AgentSession,
  AvailableModel,
  ModelConfig,
  ModelDescriptor,
  RuntimeEventListener,
  SessionSnapshot,
  WorkspaceSkillDescriptor,
} from 'chatollama-agent-runtime';
import { describe, expect, it } from 'vitest';

import {
  createCommandHandler,
  parseCommandInput,
} from './commands.js';

const AVAILABLE_MODELS = [
  { provider: 'openrouter', model: 'openai/gpt-5-mini' },
  { provider: 'openai', model: 'gpt-5-mini' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5' },
] satisfies readonly AvailableModel[];

describe('command parsing', () => {
  it('preserves slashes in a direct model ID', () => {
    expect(parseCommandInput('/model openrouter/openai/gpt-5-mini')).toEqual({
      type: 'select-model',
      provider: 'openrouter',
      model: 'openai/gpt-5-mini',
    });
  });

  it('parses numbered selection and cancellation only in selection mode', () => {
    expect(parseCommandInput('2', 'model-selection')).toEqual({
      type: 'select-model-number',
      number: 2,
    });
    expect(parseCommandInput('', 'model-selection')).toEqual({
      type: 'cancel-model-selection',
    });
    expect(parseCommandInput('2')).toEqual({ type: 'prompt', input: '2' });
  });

  it('keeps nonnumeric input in model-selection mode instead of submitting it', () => {
    expect(parseCommandInput('second', 'model-selection')).toEqual({
      type: 'invalid',
      inputMode: 'model-selection',
      message:
        'Invalid model selection. Enter a listed number, or press Enter to cancel.',
    });
  });

  it('parses renderer-independent list, reset, and exit commands', () => {
    expect(parseCommandInput('/models')).toEqual({ type: 'show-models' });
    expect(parseCommandInput('/skills')).toEqual({ type: 'show-skills' });
    expect(parseCommandInput('/new')).toEqual({ type: 'new-session' });
    expect(parseCommandInput('/exit')).toEqual({ type: 'exit' });
  });

  it('returns usage guidance for a malformed direct selection', () => {
    expect(parseCommandInput('/model openai')).toEqual({
      type: 'invalid',
      message: 'Usage: /model <provider>/<model-id>',
    });
  });
});

describe('command handling', () => {
  it('lists workspace Skills only from the Runtime snapshot', async () => {
    const session = new CommandRuntime();
    session.skills = [
      { name: 'alpha', description: 'First workflow', locator: '.agents/skills/alpha/SKILL.md' },
      { name: 'beta', description: 'Second workflow', locator: '.agents/skills/beta/SKILL.md' },
    ];
    const handler = createCommandHandler({
      session,
      availableModels: [],
      env: {},
      writePreference: async () => {},
    });

    await expect(handler({ type: 'show-skills' })).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: [
        'Workspace Skills:',
        '1. alpha — First workflow',
        '2. beta — Second workflow',
      ],
    });
  });

  it('shows a clear empty state when the Runtime snapshot has no Skills', async () => {
    const handler = createCommandHandler({
      session: new CommandRuntime(),
      availableModels: [],
      env: {},
      writePreference: async () => {},
    });

    await expect(handler({ type: 'show-skills' })).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['No workspace Skills were discovered for this session.'],
    });
  });

  it('lists models in deterministic order with numbers and a current marker', async () => {
    const session = new CommandRuntime({
      provider: 'openai',
      model: 'gpt-5-mini',
    });
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: {},
      writePreference: async () => {},
    });

    await expect(handler({ type: 'show-models' })).resolves.toEqual({
      type: 'continue',
      inputMode: 'model-selection',
      lines: [
        'Available models:',
        '1. anthropic/claude-sonnet-4-5',
        '2. openai/gpt-5-mini (current)',
        '3. openrouter/openai/gpt-5-mini',
        'Enter a model number, or press Enter to cancel.',
      ],
    });
  });

  it('guides credential configuration when no models are available', async () => {
    const handler = createCommandHandler({
      session: new CommandRuntime(),
      availableModels: [],
      env: {},
      writePreference: async () => {},
    });

    await expect(handler({ type: 'show-models' })).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: [
        'No models are available. Configure provider credentials and try again.',
      ],
    });
  });

  it('switches a valid direct selection before persisting it', async () => {
    const session = new CommandRuntime();
    const events: string[] = [];
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: { OPENROUTER_API_KEY: 'secret' },
      writePreference: async selection => {
        events.push(`write:${selection.provider}/${selection.model}`);
        expect(session.getSnapshot().model).toEqual({
          provider: 'openrouter',
          model: 'openai/gpt-5-mini',
        });
      },
    });
    session.onSetModel = model => {
      events.push(`switch:${model.provider}/${model.model}`);
    };

    await expect(
      handler({
        type: 'select-model',
        provider: 'openrouter',
        model: 'openai/gpt-5-mini',
      }),
    ).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Switched to openrouter/openai/gpt-5-mini.'],
    });
    expect(events).toEqual([
      'switch:openrouter/openai/gpt-5-mini',
      'write:openrouter/openai/gpt-5-mini',
    ]);
  });

  it('uses the sorted list for numbered selection', async () => {
    const session = new CommandRuntime();
    const written: AvailableModel[] = [];
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: { OPENAI_API_KEY: 'secret' },
      writePreference: async selection => {
        written.push(selection);
      },
    });

    await expect(
      handler({ type: 'select-model-number', number: 2 }),
    ).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Switched to openai/gpt-5-mini.'],
    });
    expect(session.getSnapshot().model).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
    });
    expect(written).toEqual([{ provider: 'openai', model: 'gpt-5-mini' }]);
  });

  it('rejects unavailable and out-of-range selections without changing state', async () => {
    const session = new CommandRuntime();
    const written: AvailableModel[] = [];
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: {},
      writePreference: async selection => {
        written.push(selection);
      },
    });

    await expect(
      handler({
        type: 'select-model',
        provider: 'google',
        model: 'gemini-2.5-flash',
      }),
    ).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: [
        'Unknown model: google/gemini-2.5-flash. Run /models to see available models.',
      ],
    });
    await expect(
      handler({ type: 'select-model-number', number: 99 }),
    ).resolves.toEqual({
      type: 'continue',
      inputMode: 'model-selection',
      lines: [
        'Invalid model selection. Enter a listed number, or press Enter to cancel.',
      ],
    });
    expect(session.getSnapshot().model).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
    });
    expect(written).toEqual([]);
  });

  it('does not persist when the Runtime rejects an active-run switch', async () => {
    const session = new CommandRuntime();
    session.active = true;
    const written: AvailableModel[] = [];
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: { OPENAI_API_KEY: 'secret' },
      writePreference: async selection => {
        written.push(selection);
      },
    });

    await expect(
      handler({
        type: 'select-model',
        provider: 'openai',
        model: 'gpt-5-mini',
      }),
    ).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Could not switch model: Session has an active run'],
    });
    expect(session.getSnapshot().model).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
    });
    expect(written).toEqual([]);
  });

  it('does not expose unexpected Runtime switch errors', async () => {
    const session = new CommandRuntime();
    session.setModelError = new Error('provider response contained secret');
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: { OPENAI_API_KEY: 'secret' },
      writePreference: async () => {},
    });

    const result = await handler({
      type: 'select-model',
      provider: 'openai',
      model: 'gpt-5-mini',
    });

    expect(result).toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Could not switch model: Model switch failed'],
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('keeps the switched session usable when preference persistence fails', async () => {
    const session = new CommandRuntime();
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: { OPENAI_API_KEY: 'secret' },
      writePreference: async () => {
        throw new Error('disk path leaked');
      },
    });

    await expect(
      handler({
        type: 'select-model',
        provider: 'openai',
        model: 'gpt-5-mini',
      }),
    ).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: [
        'Switched to openai/gpt-5-mini for this session, but could not save it as the default.',
      ],
    });
    expect(session.getSnapshot().model).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
    });
  });

  it('clears the Runtime conversation without changing or persisting the model', async () => {
    const session = new CommandRuntime({ provider: 'openai', model: 'gpt-5-mini' });
    const written: AvailableModel[] = [];
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: {},
      writePreference: async selection => { written.push(selection); },
    });

    await expect(handler({ type: 'new-session' })).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Conversation cleared.'],
    });
    expect(session.resetCalls).toBe(1);
    expect(session.getSnapshot().model).toEqual({ provider: 'openai', model: 'gpt-5-mini' });
    expect(written).toEqual([]);
  });

  it('reports active-run reset exclusion and sanitizes unexpected reset errors', async () => {
    const session = new CommandRuntime();
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: {},
      writePreference: async () => {},
    });
    session.active = true;
    await expect(handler({ type: 'new-session' })).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Could not clear conversation: Session has an active run'],
    });

    session.active = false;
    session.resetError = new Error('secret storage detail');
    const result = await handler({ type: 'new-session' });
    expect(result).toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Could not clear conversation: Conversation reset failed'],
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('handles cancellation and exit without mutating the Runtime', async () => {
    const session = new CommandRuntime();
    const handler = createCommandHandler({
      session,
      availableModels: AVAILABLE_MODELS,
      env: {},
      writePreference: async () => {},
    });

    await expect(handler({ type: 'cancel-model-selection' })).resolves.toEqual({
      type: 'continue',
      inputMode: 'prompt',
      lines: ['Model selection cancelled.'],
    });
    await expect(handler({ type: 'exit' })).resolves.toEqual({ type: 'exit' });
    expect(session.getSnapshot().model).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
    });
  });
});

class CommandRuntime implements AgentSession {
  active = false;
  resetCalls = 0;
  resetError: Error | undefined;
  setModelError: Error | undefined;
  onSetModel: ((model: ModelConfig) => void) | undefined;
  skills: readonly WorkspaceSkillDescriptor[] = [];
  #model: ModelDescriptor;

  constructor(
    model: ModelDescriptor = { provider: 'ollama', model: 'qwen3:8b' },
  ) {
    this.#model = model;
  }

  getSnapshot(): SessionSnapshot {
    return {
      id: 'command-test',
      messages: [],
      model: { ...this.#model },
      skills: this.skills.map(skill => ({ ...skill })),
      skillWarnings: [],
    };
  }

  subscribe(_listener: RuntimeEventListener): () => void {
    return () => {};
  }

  setModel(config: ModelConfig): void {
    if (this.active) {
      throw new Error('Session has an active run');
    }
    if (this.setModelError) {
      throw this.setModelError;
    }
    this.#model = { provider: config.provider, model: config.model };
    this.onSetModel?.(config);
  }

  reset(): void {
    if (this.active) throw new Error('Session has an active run');
    if (this.resetError) throw this.resetError;
    this.resetCalls += 1;
  }

  async prompt(_input: string): Promise<void> {}

  cancel(): void {}
}
