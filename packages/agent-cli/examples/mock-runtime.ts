import { setTimeout } from 'node:timers/promises';

import type {
  AgentSession,
  ModelConfig,
  ModelDescriptor,
  RuntimeEvent,
  RuntimeEventListener,
  SessionMessage,
  SessionSnapshot,
} from 'chatollama-agent-runtime';

import { runCli } from '../src/cli.js';

class MockRuntime implements AgentSession {
  readonly #listeners = new Set<RuntimeEventListener>();
  readonly #messages: SessionMessage[] = [];
  #runNumber = 0;
  #model: ModelDescriptor = {
    provider: 'openai-compatible',
    model: 'mock-model',
  };

  getSnapshot(): SessionSnapshot {
    return {
      id: 'demo-session',
      messages: this.#messages.map(message => ({ ...message })),
      model: { ...this.#model },
      skills: [],
      skillWarnings: [],
    };
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setModel(config: ModelConfig): void {
    this.#model = { provider: config.provider, model: config.model };
  }

  reset(): void {
    this.#messages.splice(0);
    this.#publish({ type: 'session.reset', model: this.#model });
  }

  async prompt(input: string): Promise<void> {
    const runId = `demo-run-${++this.#runNumber}`;
    this.#messages.push({ role: 'user', content: input });
    this.#publish({ type: 'run.started', runId, input });
    this.#publish({
      type: 'model.started',
      runId,
      model: this.#model,
    });

    const deltas = ['Hello from ', 'the mock Runtime.'];
    let content = '';
    for (const delta of deltas) {
      await setTimeout(10);
      content += delta;
      this.#publish({ type: 'model.delta', runId, delta });
    }

    const message = { role: 'assistant' as const, content };
    this.#messages.push(message);
    this.#publish({ type: 'model.completed', runId, message });
    this.#publish({ type: 'run.completed', runId });
  }

  cancel(): void {}

  #publish(event: RuntimeEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}

await runCli({
  session: new MockRuntime(),
  input: process.stdin,
  output: process.stdout,
  error: process.stderr,
});
