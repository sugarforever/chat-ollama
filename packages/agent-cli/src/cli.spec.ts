import { PassThrough } from 'node:stream';

import type {
  AgentSession,
  AvailableModel,
  ModelConfig,
  ModelDescriptor,
  RuntimeEvent,
  RuntimeEventListener,
  SessionSnapshot,
} from 'chatollama-agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import { runCli } from './cli.js';

describe('Runtime event-driven CLI', () => {
  it('submits terminal input and writes model deltas before the run completes', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({ session: runtime, ...terminal.streams });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('Hello\n');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello']));

    runtime.emit({ type: 'run.started', runId: 'run-1', input: 'Hello' });
    runtime.emit({
      type: 'model.started',
      runId: 'run-1',
      model: { provider: 'openai-compatible', model: 'mock-model' },
    });
    runtime.emit({ type: 'model.delta', runId: 'run-1', delta: 'Hello' });

    expect(terminal.stdout()).toContain(
      'Assistant (openai-compatible/mock-model)> Hello',
    );
    expect(terminal.stdout()).not.toContain('Hello world');

    runtime.emit({ type: 'model.delta', runId: 'run-1', delta: ' world' });
    runtime.emit({
      type: 'model.completed',
      runId: 'run-1',
      message: { role: 'assistant', content: 'Hello world' },
    });
    runtime.emit({ type: 'run.completed', runId: 'run-1' });
    runtime.completePrompt();

    await vi.waitFor(() =>
      expect(terminal.stdout().match(/You> /g)).toHaveLength(2),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(terminal.stdout()).toContain(
      'Assistant (openai-compatible/mock-model)> Hello world\n',
    );
    expect(terminal.stdout()).toContain('Goodbye.\n');
    expect(terminal.stderr()).toBe(
      '[run run-1] started\n[run run-1] completed\n',
    );
  });

  it('exits without submitting /exit to the Runtime', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({ session: runtime, ...terminal.streams });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('/exit\n');
    await cli;

    expect(runtime.inputs).toEqual([]);
    expect(terminal.stdout()).toContain('Goodbye.\n');
    expect(runtime.listenerCount).toBe(0);
  });

  it('cleans up the Runtime subscription when terminal input closes', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({ session: runtime, ...terminal.streams });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.end();
    await cli;

    expect(runtime.inputs).toEqual([]);
    expect(runtime.listenerCount).toBe(0);
    expect(terminal.stdout()).not.toContain('Goodbye.\n');
  });

  it('ignores blank input without submitting it to the Runtime', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({ session: runtime, ...terminal.streams });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('   \n');
    await vi.waitFor(() =>
      expect(terminal.stdout().match(/You> /g)).toHaveLength(2),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(runtime.inputs).toEqual([]);
  });

  it('reports a generic error when prompt rejects without a failure event', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({ session: runtime, ...terminal.streams });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('Hello\n');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello']));
    runtime.failPrompt();

    await vi.waitFor(() =>
      expect(terminal.stdout().match(/You> /g)).toHaveLength(2),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(terminal.stderr()).toBe('[error] Runtime prompt failed\n');
  });

  it('prints a Runtime failure once and continues to the next prompt', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({ session: runtime, ...terminal.streams });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('Hello\n');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello']));
    runtime.emit({ type: 'run.started', runId: 'run-1', input: 'Hello' });
    runtime.emit({
      type: 'model.started',
      runId: 'run-1',
      model: { provider: 'openai', model: 'gpt-test' },
    });
    runtime.emit({
      type: 'run.failed',
      runId: 'run-1',
      error: { message: 'Model request failed' },
    });
    runtime.failPrompt();

    await vi.waitFor(() =>
      expect(terminal.stdout().match(/You> /g)).toHaveLength(2),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(terminal.stdout()).toContain('Assistant (openai/gpt-test)> \n');
    expect(terminal.stderr()).toBe(
      '[run run-1] started\n[error] Model request failed\n',
    );
  });

  it('reports a Runtime cancellation and continues to the next prompt', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({ session: runtime, ...terminal.streams });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('Hello\n');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello']));
    runtime.emit({ type: 'run.started', runId: 'run-1', input: 'Hello' });
    runtime.emit({
      type: 'model.started',
      runId: 'run-1',
      model: { provider: 'openai', model: 'gpt-test' },
    });
    runtime.emit({ type: 'run.cancelled', runId: 'run-1' });
    runtime.completePrompt();

    await vi.waitFor(() =>
      expect(terminal.stdout().match(/You> /g)).toHaveLength(2),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(terminal.stdout()).toContain('Assistant (openai/gpt-test)> \n');
    expect(terminal.stderr()).toBe(
      '[run run-1] started\n[run run-1] cancelled\n',
    );
  });

  it('lists models and accepts the next line as a numbered selection', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const written: AvailableModel[] = [];
    const cli = runCli({
      session: runtime,
      ...terminal.streams,
      availableModels: MODELS,
      env: { OPENAI_API_KEY: 'secret' },
      writePreference: async selection => {
        written.push(selection);
      },
    });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('/models\n');
    await vi.waitFor(() =>
      expect(terminal.stdout()).toContain(
        '1. anthropic/claude-sonnet-4-5\n2. ollama/qwen3:8b (current)\n3. openai/gpt-5-mini\n4. openrouter/openai/gpt-5-mini\n',
      ),
    );
    terminal.input.write('3\n');
    await vi.waitFor(() =>
      expect(terminal.stdout()).toContain('Switched to openai/gpt-5-mini.\n'),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(runtime.getSnapshot().model).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
    });
    expect(written).toEqual([{ provider: 'openai', model: 'gpt-5-mini' }]);
  });

  it('accepts a direct model command and preserves slashes in the model ID', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({
      session: runtime,
      ...terminal.streams,
      availableModels: MODELS,
      env: { OPENROUTER_API_KEY: 'secret' },
      writePreference: async () => {},
    });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('/model openrouter/openai/gpt-5-mini\n');
    await vi.waitFor(() =>
      expect(terminal.stdout()).toContain(
        'Switched to openrouter/openai/gpt-5-mini.\n',
      ),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(runtime.getSnapshot().model).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-5-mini',
    });
  });

  it('prints startup warnings and still accepts exit', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({
      session: runtime,
      ...terminal.streams,
      notices: ['OpenAI model discovery failed'],
    });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('/exit\n');
    await cli;

    expect(terminal.stderr()).toBe(
      '[warning] OpenAI model discovery failed\n',
    );
    expect(terminal.stdout()).toContain('Goodbye.\n');
  });

  it('guides setup when startup has no available provider', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({
      session: runtime,
      ...terminal.streams,
      availableModels: [],
    });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('/models\n');
    await vi.waitFor(() =>
      expect(terminal.stdout()).toContain(
        'No models are available. Configure provider credentials and try again.\n',
      ),
    );
    terminal.input.write('/exit\n');
    await cli;

    expect(runtime.getSnapshot().model).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
    });
  });

  it('keeps all plain-mode output free of ANSI escape bytes', async () => {
    const runtime = new ControlledRuntime();
    const terminal = createTerminal();
    const cli = runCli({
      session: runtime,
      ...terminal.streams,
      availableModels: MODELS,
      notices: ['Ollama discovery unavailable'],
    });

    await vi.waitFor(() => expect(terminal.stdout()).toContain('You> '));
    terminal.input.write('/models\n\n/exit\n');
    await cli;

    expect(`${terminal.stdout()}${terminal.stderr()}`).not.toMatch(
      /\u001b\[[0-?]*[ -/]*[@-~]/,
    );
  });
});

const MODELS = [
  { provider: 'ollama', model: 'qwen3:8b' },
  { provider: 'openrouter', model: 'openai/gpt-5-mini' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  { provider: 'openai', model: 'gpt-5-mini' },
] satisfies readonly AvailableModel[];

class ControlledRuntime implements AgentSession {
  readonly inputs: string[] = [];
  readonly #listeners = new Set<RuntimeEventListener>();
  #resolvePrompt: (() => void) | undefined;
  #rejectPrompt: ((error: Error) => void) | undefined;
  #model: ModelDescriptor = { provider: 'ollama', model: 'qwen3:8b' };

  get listenerCount(): number {
    return this.#listeners.size;
  }

  getSnapshot(): SessionSnapshot {
    return { id: 'mock-session', messages: [], model: { ...this.#model } };
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setModel(config: ModelConfig): void {
    this.#model = { provider: config.provider, model: config.model };
  }

  prompt(input: string): Promise<void> {
    this.inputs.push(input);
    return new Promise((resolve, reject) => {
      this.#resolvePrompt = resolve;
      this.#rejectPrompt = reject;
    });
  }

  cancel(): void {}

  emit(event: RuntimeEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  completePrompt(): void {
    this.#resolvePrompt?.();
  }

  failPrompt(): void {
    this.#rejectPrompt?.(new Error('Model request failed'));
  }
}

function createTerminal() {
  const input = new PassThrough();
  const output = new PassThrough();
  const error = new PassThrough();
  let stdout = '';
  let stderr = '';
  output.setEncoding('utf8');
  error.setEncoding('utf8');
  output.on('data', chunk => {
    stdout += chunk;
  });
  error.on('data', chunk => {
    stderr += chunk;
  });

  return {
    streams: { input, output, error },
    input,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}
