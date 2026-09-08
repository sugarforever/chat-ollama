import { PassThrough } from 'node:stream';

import type {
  AgentSession,
  RuntimeEvent,
  RuntimeEventListener,
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
});

class ControlledRuntime implements AgentSession {
  readonly inputs: string[] = [];
  readonly #listeners = new Set<RuntimeEventListener>();
  #resolvePrompt: (() => void) | undefined;
  #rejectPrompt: ((error: Error) => void) | undefined;

  get listenerCount(): number {
    return this.#listeners.size;
  }

  getSnapshot() {
    return { id: 'mock-session', messages: [] };
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
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
