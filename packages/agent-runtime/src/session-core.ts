import { randomUUID } from 'node:crypto';

import { streamText, type LanguageModel, type ModelMessage } from 'ai';

import type {
  AgentSession,
  AssistantMessage,
  ModelDescriptor,
  RuntimeEvent,
  RuntimeEventListener,
  SessionMessage,
  SessionSnapshot,
  UserMessage,
} from './types.js';

interface CreateAgentSessionWithModelOptions {
  readonly id: string;
  readonly model: LanguageModel;
  readonly descriptor: ModelDescriptor;
  readonly generateId?: () => string;
}

class InMemoryAgentSession implements AgentSession {
  readonly #id: string;
  readonly #model: LanguageModel;
  readonly #descriptor: ModelDescriptor;
  readonly #generateId: () => string;
  readonly #listeners = new Set<RuntimeEventListener>();
  readonly #messages: SessionMessage[] = [];
  #activeRun:
    | { readonly runId: string; readonly controller: AbortController }
    | undefined;

  constructor(options: CreateAgentSessionWithModelOptions) {
    this.#id = options.id;
    this.#model = options.model;
    this.#descriptor = options.descriptor;
    this.#generateId = options.generateId ?? randomUUID;
  }

  getSnapshot(): SessionSnapshot {
    return {
      id: this.#id,
      messages: this.#messages.map(message => ({ ...message })),
    };
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async prompt(input: string): Promise<void> {
    if (this.#activeRun !== undefined) {
      throw new Error('Session already has an active run');
    }

    const runId = this.#generateId();
    const controller = new AbortController();
    const activeRun = { runId, controller };
    this.#activeRun = activeRun;
    const userMessage: UserMessage = { role: 'user', content: input };
    this.#messages.push(userMessage);
    this.#publish({ type: 'run.started', runId, input });
    this.#publish({
      type: 'model.started',
      runId,
      model: this.#descriptor,
    });

    const messages = this.#messages.map(message => ({
      role: message.role,
      content: message.content,
    })) satisfies ModelMessage[];
    let streamError: unknown;

    try {
      const result = streamText({
        model: this.#model,
        messages,
        abortSignal: controller.signal,
        onError: ({ error }) => {
          streamError = error;
        },
      });
      let content = '';

      for await (const delta of result.textStream) {
        if (controller.signal.aborted) {
          break;
        }
        content += delta;
        this.#publish({ type: 'model.delta', runId, delta });
      }

      if (controller.signal.aborted) {
        this.#publish({ type: 'run.cancelled', runId });
        return;
      }
      if (streamError !== undefined) {
        throw streamError;
      }

      const assistantMessage: AssistantMessage = {
        role: 'assistant',
        content,
      };
      this.#messages.push(assistantMessage);
      this.#publish({
        type: 'model.completed',
        runId,
        message: assistantMessage,
      });
      this.#publish({ type: 'run.completed', runId });
    } catch {
      if (controller.signal.aborted) {
        this.#publish({ type: 'run.cancelled', runId });
        return;
      }

      const message = 'Model request failed';
      this.#publish({ type: 'run.failed', runId, error: { message } });
      throw new Error(message);
    } finally {
      if (this.#activeRun === activeRun) {
        this.#activeRun = undefined;
      }
    }
  }

  cancel(): void {
    this.#activeRun?.controller.abort();
  }

  #publish(event: RuntimeEvent): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // Subscriber failures must not corrupt the active run.
      }
    }
  }
}

export function createAgentSessionWithModel(
  options: CreateAgentSessionWithModelOptions,
): AgentSession {
  return new InMemoryAgentSession(options);
}
