import { randomUUID } from 'node:crypto';

import { stepCountIs, ToolLoopAgent, type LanguageModel, type ModelMessage } from 'ai';

import { createLanguageModel, describeModel } from './model-registry.js';
import { createDemoTools } from './tools.js';
import type {
  AgentSession,
  AssistantMessage,
  ModelDescriptor,
  ModelConfig,
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
  readonly createModel?: (config: ModelConfig) => LanguageModel;
  readonly generateId?: () => string;
  readonly now?: () => Date;
}

interface CurrentModel {
  readonly model: LanguageModel;
  readonly descriptor: ModelDescriptor;
}

class InMemoryAgentSession implements AgentSession {
  readonly #id: string;
  readonly #createModel: (config: ModelConfig) => LanguageModel;
  readonly #generateId: () => string;
  readonly #listeners = new Set<RuntimeEventListener>();
  readonly #messages: SessionMessage[] = [];
  readonly #modelMessages: ModelMessage[] = [];
  readonly #now: () => Date;
  #currentModel: CurrentModel;
  #activeRun:
    | { readonly runId: string; readonly controller: AbortController }
    | undefined;

  constructor(options: CreateAgentSessionWithModelOptions) {
    this.#id = options.id;
    this.#currentModel = {
      model: options.model,
      descriptor: options.descriptor,
    };
    this.#createModel = options.createModel ?? createLanguageModel;
    this.#generateId = options.generateId ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
  }

  getSnapshot(): SessionSnapshot {
    return {
      id: this.#id,
      messages: this.#messages.map(message => ({ ...message })),
      model: { ...this.#currentModel.descriptor },
    };
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setModel(config: ModelConfig): void {
    if (this.#activeRun !== undefined) {
      throw new Error('Session has an active run');
    }

    const current: CurrentModel = {
      model: this.#createModel(config),
      descriptor: describeModel(config),
    };
    const previous = this.#currentModel.descriptor;
    this.#currentModel = current;
    this.#publish({
      type: 'model.changed',
      previous,
      current: current.descriptor,
    });
  }

  reset(): void {
    if (this.#activeRun !== undefined) {
      throw new Error('Session has an active run');
    }

    this.#messages.splice(0);
    this.#modelMessages.splice(0);
    this.#publish({
      type: 'session.reset',
      model: this.#currentModel.descriptor,
    });
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
      model: this.#currentModel.descriptor,
    });

    this.#modelMessages.push({ role: 'user', content: input });
    const messages: ModelMessage[] = [...this.#modelMessages];
    let streamError: unknown;
    let streamFailed = false;

    try {
      const agent = new ToolLoopAgent({
        model: this.#currentModel.model,
        tools: createDemoTools(this.#now),
        stopWhen: stepCountIs(4),
        prepareCall: options => ({ ...options, onError: () => {} }),
      });
      const result = await agent.stream({
        messages,
        abortSignal: controller.signal,
      });
      let content = '';
      let step = 0;
      let finalReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' = 'other';

      streamLoop: for await (const part of result.fullStream) {
        if (controller.signal.aborted) {
          break;
        }
        switch (part.type) {
          case 'start-step':
            step += 1;
            content = '';
            this.#publish({ type: 'step.started', runId, step });
            break;
          case 'text-delta':
            content += part.text;
            this.#publish({ type: 'model.delta', runId, delta: part.text });
            break;
          case 'tool-call': {
            const call = {
              type: 'tool-call' as const,
              callId: part.toolCallId,
              toolName: part.toolName,
              input: summarize(part.input),
            };
            this.#messages.push(call);
            this.#publish({ type: 'tool.started', runId, call });
            break;
          }
          case 'tool-result': {
            if (part.preliminary) break;
            const toolResult = {
              type: 'tool-result' as const,
              callId: part.toolCallId,
              toolName: part.toolName,
              status: 'success' as const,
              output: summarize(part.output),
            };
            this.#messages.push(toolResult);
            this.#publish({ type: 'tool.completed', runId, result: toolResult });
            break;
          }
          case 'tool-error': {
            const toolResult = {
              type: 'tool-result' as const,
              callId: part.toolCallId,
              toolName: part.toolName,
              status: 'error' as const,
              output: 'Tool execution failed',
            };
            this.#messages.push(toolResult);
            this.#publish({ type: 'tool.failed', runId, result: toolResult });
            streamError = part.error;
            streamFailed = true;
            this.#publish({ type: 'step.completed', runId, step, reason: 'error' });
            controller.abort();
            break streamLoop;
          }
          case 'finish-step':
            finalReason = part.finishReason;
            this.#publish({ type: 'step.completed', runId, step, reason: part.finishReason });
            break;
          case 'error':
            streamError = part.error;
            streamFailed = true;
            if (step > 0) {
              this.#publish({ type: 'step.completed', runId, step, reason: 'error' });
            }
            controller.abort();
            break streamLoop;
        }
      }

      if (streamFailed) {
        throw streamError;
      }
      if (controller.signal.aborted) {
        this.#publish({ type: 'run.cancelled', runId });
        return;
      }

      if (step >= 4 && finalReason === 'tool-calls') {
        this.#modelMessages.push(...await result.responseMessages);
        this.#publish({ type: 'run.stopped', runId, reason: 'step-limit' });
        return;
      }

      const assistantMessage: AssistantMessage = {
        role: 'assistant',
        content,
      };
      this.#messages.push(assistantMessage);
      this.#modelMessages.push(...await result.responseMessages);
      this.#publish({
        type: 'model.completed',
        runId,
        message: assistantMessage,
      });
      this.#publish({ type: 'run.completed', runId });
    } catch {
      if (controller.signal.aborted && !streamFailed) {
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

function summarize(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '[unavailable]';
  }
}

export function createAgentSessionWithModel(
  options: CreateAgentSessionWithModelOptions,
): AgentSession {
  return new InMemoryAgentSession(options);
}
