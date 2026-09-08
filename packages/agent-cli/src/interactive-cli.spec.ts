import {
  createAgentSession,
  type AgentSession,
  type AvailableModel,
  type ModelConfig,
  type RuntimeEvent,
  type RuntimeEventListener,
  type SessionSnapshot,
} from 'chatollama-agent-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VirtualTerminal } from '../test-utils/virtual-terminal.js';
import { runInteractiveCli } from './interactive-cli.js';

const MODELS = [
  { provider: 'ollama', model: 'qwen3:8b' },
  { provider: 'openai', model: 'gpt-5-mini' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5' },
] satisfies AvailableModel[];

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function startCli(session: AgentSession = createAgentSession({
  model: { provider: 'ollama', name: 'ollama', model: 'qwen3:8b', baseURL: 'http://localhost:11434/v1' },
})) {
  const terminal = new VirtualTerminal();
  const written: AvailableModel[] = [];
  const done = runInteractiveCli({
    terminal,
    session,
    availableModels: MODELS,
    env: { OPENAI_API_KEY: 'test', ANTHROPIC_API_KEY: 'test' },
    writePreference: async selection => { written.push(selection); },
  });
  cleanups.push(async () => {
    terminal.sendInput('\x03');
    await done;
    terminal.dispose();
  });
  return { terminal, session, written, done };
}

async function openPicker(terminal: VirtualTerminal): Promise<string> {
  terminal.type('/models');
  // Dismiss completion before submitting the exact command.
  terminal.sendInput('\x1b');
  terminal.sendInput('\r');
  return terminal.screen();
}

describe('pi-tui interactive CLI', () => {
  it('marks the current Session model independently of picker focus before and after switching', async () => {
    const { terminal } = startCli();
    await terminal.screen();
    let screen = await openPicker(terminal);
    expect(screen).toContain('→ anthropic/claude-sonnet-4-5');
    expect(screen).toContain('ollama/qwen3:8b (current)');
    expect(screen).not.toContain('anthropic/claude-sonnet-4-5 (current)');

    terminal.sendInput('\r');
    expect(await terminal.screen()).toContain('Switched to anthropic/claude-sonnet-4-5.');
    screen = await openPicker(terminal);
    expect(screen).toContain('anthropic/claude-sonnet-4-5 (current)');
    expect(screen).not.toContain('ollama/qwen3:8b (current)');
    terminal.sendInput('\x1b[B');
    screen = await terminal.screen();
    expect(screen).toContain('→ ollama/qwen3:8b');
    expect(screen).toContain('anthropic/claude-sonnet-4-5 (current)');
  });

  it('offers /models, /model, and /exit when the editor receives /', async () => {
    const { terminal } = startCli();
    await terminal.screen();
    terminal.type('/');
    const screen = await terminal.screen();
    // pi-tui displays command names without their leading slash.
    expect(screen).toMatch(/^→ models\s+/m);
    expect(screen).toMatch(/^\s+model\s+/m);
    expect(screen).toMatch(/^\s+exit\s+/m);
    terminal.sendInput('\t');
    terminal.sendInput('\r');
    expect(await terminal.screen()).toContain('→ anthropic/claude-sonnet-4-5');
  });

  it('moves the model picker with Down and Up, then commits Enter through the command handler', async () => {
    const { terminal, session, written } = startCli();
    await terminal.screen();
    expect(await openPicker(terminal)).toContain('→ anthropic/claude-sonnet-4-5');
    terminal.sendInput('\x1b[B');
    expect(await terminal.screen()).toContain('→ ollama/qwen3:8b');
    terminal.sendInput('\x1b[B');
    expect(await terminal.screen()).toContain('→ openai/gpt-5-mini');
    terminal.sendInput('\x1b[A');
    expect(await terminal.screen()).toContain('→ ollama/qwen3:8b');
    terminal.sendInput('\x1b[A');
    terminal.sendInput('\r');
    expect(await terminal.screen()).toContain('Switched to anthropic/claude-sonnet-4-5.');
    expect(session.getSnapshot().model).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-5' });
    expect(written).toEqual([{ provider: 'anthropic', model: 'claude-sonnet-4-5' }]);
    terminal.type('draft after selection');
    expect(await terminal.screen()).toContain('draft after selection');
  });

  it('cancels the model picker with Escape and returns focus to the editor', async () => {
    const { terminal, session, written } = startCli();
    await terminal.screen();
    await openPicker(terminal);
    terminal.sendInput('\x1b[B');
    terminal.sendInput('\x1b');
    expect(await terminal.screen()).toContain('Model selection cancelled.');
    expect(session.getSnapshot().model).toEqual({ provider: 'ollama', model: 'qwen3:8b' });
    expect(written).toEqual([]);
    terminal.type('still focused');
    expect(await terminal.screen()).toContain('still focused');
  });

  it('renders multiple stream deltas while preserving unfinished editor text and focus', async () => {
    const runtime = new ControlledRuntime();
    const { terminal } = startCli(runtime);
    await terminal.screen();
    terminal.type('Hello');
    terminal.sendInput('\r');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello']));
    runtime.emit({ type: 'run.started', runId: 'run-1', input: 'Hello' });
    runtime.emit({ type: 'model.started', runId: 'run-1', model: { provider: 'ollama', model: 'qwen3:8b' } });
    terminal.type('unfinished');

    runtime.emit({ type: 'model.delta', runId: 'run-1', delta: 'Hello' });
    let screen = await terminal.screen();
    expect(screen).toContain('Assistant (ollama/qwen3:8b)> Hello');
    expect(screen).toContain('unfinished');
    expect(screen).toContain('[run run-1] started');

    runtime.emit({ type: 'model.delta', runId: 'run-1', delta: ' world' });
    terminal.resize(60, 20);
    terminal.type(' draft');
    screen = await terminal.screen();
    expect(screen).toContain('Assistant (ollama/qwen3:8b)> Hello world');
    expect(screen).toContain('unfinished draft');
    expect(terminal.writes).not.toContain('Hello');
    expect(terminal.writes).not.toContain(' world');

    runtime.emit({ type: 'model.completed', runId: 'run-1', message: { role: 'assistant', content: 'Hello world' } });
    runtime.emit({ type: 'run.completed', runId: 'run-1' });
    runtime.completePrompt();
    expect(await terminal.screen()).toContain('[run run-1] completed');
    terminal.sendInput('\r');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello', 'unfinished draft']));
    runtime.completePrompt();
  });

  it('reports a runtime failure once and accepts another prompt afterwards', async () => {
    const runtime = new ControlledRuntime();
    const { terminal } = startCli(runtime);
    await terminal.screen();
    terminal.type('Hello');
    terminal.sendInput('\r');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello']));
    runtime.emit({ type: 'run.failed', runId: 'run-1', error: { message: 'Model request failed' } });
    runtime.failPrompt();
    const screen = await terminal.screen();
    expect(screen.match(/\[error\]/g)).toHaveLength(1);
    expect(screen).toContain('[error] Model request failed');
    terminal.type('retry');
    terminal.sendInput('\r');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello', 'retry']));
    runtime.completePrompt();
  });

  it('cancels an active run and releases the terminal and subscription on Ctrl+C', async () => {
    const runtime = new ControlledRuntime();
    const { terminal, done } = startCli(runtime);
    await terminal.screen();
    terminal.type('Hello');
    terminal.sendInput('\r');
    await vi.waitFor(() => expect(runtime.inputs).toEqual(['Hello']));
    expect(runtime.listenerCount).toBe(1);
    terminal.sendInput('\x03');
    await done;
    expect(terminal.stopped).toBe(true);
    expect(runtime.cancelled).toBe(true);
    expect(runtime.listenerCount).toBe(0);
  });
});

class ControlledRuntime implements AgentSession {
  readonly inputs: string[] = [];
  readonly #listeners = new Set<RuntimeEventListener>();
  #resolve?: () => void;
  #reject?: (error: Error) => void;
  cancelled = false;

  get listenerCount(): number { return this.#listeners.size; }
  getSnapshot(): SessionSnapshot {
    return { id: 'controlled', messages: [], model: { provider: 'ollama', model: 'qwen3:8b' } };
  }
  subscribe(listener: RuntimeEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  setModel(_config: ModelConfig): void {
    throw new Error('Session has an active run');
  }
  prompt(input: string): Promise<void> {
    this.inputs.push(input);
    return new Promise((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
  }
  emit(event: RuntimeEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
  completePrompt(): void { this.#resolve?.(); }
  failPrompt(): void { this.#reject?.(new Error('Model request failed')); }
  cancel(): void { this.cancelled = true; this.completePrompt(); }
}
