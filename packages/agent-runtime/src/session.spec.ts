import {
  MockLanguageModelV3,
  mockValues,
  simulateReadableStream,
} from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createAgentSession } from './index.js';
import { createAgentSessionWithModel } from './session-core.js';
import type { RuntimeEvent } from './types.js';

describe('AgentSession streaming', () => {
  it('creates a public Session from model configuration without exposing secrets', () => {
    const session = createAgentSession({
      id: 'configured-session',
      model: {
        provider: 'openai-compatible',
        name: 'ollama',
        model: 'qwen3:8b',
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'configuration-secret',
      },
    });

    expect(session.getSnapshot()).toEqual({
      id: 'configured-session',
      messages: [],
    });
    expect(JSON.stringify(session.getSnapshot())).not.toContain(
      'configuration-secret',
    );
  });

  it('translates an AI SDK text stream into Runtime events and completed memory', async () => {
    const streamResult = {
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
          { type: 'text-delta', id: 'text-1', delta: ' world' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 2, text: 2, reasoning: 0 },
            },
          },
        ],
        chunkDelayInMs: null,
      }),
    } satisfies Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
    const nextStream = mockValues(streamResult);
    const model = new MockLanguageModelV3({
      provider: 'mock',
      modelId: 'mock-model',
      doStream: async () => nextStream(),
    });
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await session.prompt('Say hello');

    expect(events).toEqual([
      { type: 'run.started', runId: 'run-1', input: 'Say hello' },
      {
        type: 'model.started',
        runId: 'run-1',
        model: { provider: 'openai', model: 'mock-model' },
      },
      { type: 'model.delta', runId: 'run-1', delta: 'Hello' },
      { type: 'model.delta', runId: 'run-1', delta: ' world' },
      {
        type: 'model.completed',
        runId: 'run-1',
        message: { role: 'assistant', content: 'Hello world' },
      },
      { type: 'run.completed', runId: 'run-1' },
    ]);
    expect(session.getSnapshot()).toEqual({
      id: 'session-1',
      messages: [
        { role: 'user', content: 'Say hello' },
        { role: 'assistant', content: 'Hello world' },
      ],
    });
    expect(model.doStreamCalls[0]?.prompt).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Say hello' }] },
    ]);
  });

  it('stops delivering events after a listener unsubscribes', async () => {
    const model = createTextModel(['ignored']);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const events: RuntimeEvent[] = [];
    const unsubscribe = session.subscribe(event => events.push(event));

    unsubscribe();
    await session.prompt('Hello');

    expect(events).toEqual([]);
  });

  it('isolates listener failures from the run and other subscribers', async () => {
    const model = createTextModel(['Hello']);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(() => {
      throw new Error('listener failed');
    });
    session.subscribe(event => events.push(event));

    await session.prompt('Hello');

    expect(events.map(event => event.type)).toEqual([
      'run.started',
      'model.started',
      'model.delta',
      'model.completed',
      'run.completed',
    ]);
    expect(session.getSnapshot().messages).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hello' },
    ]);
  });

  it('applies subscription changes after delivery of the current event', async () => {
    const model = createTextModel(['Hello']);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const received: RuntimeEvent['type'][] = [];
    let unsubscribeSecond = () => {};
    session.subscribe(() => unsubscribeSecond());
    unsubscribeSecond = session.subscribe(event => received.push(event.type));

    await session.prompt('Hello');

    expect(received).toEqual(['run.started']);
  });

  it('publishes a sanitized failure and rejects with a stable error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error('provider exposed api-secret in its error');
      },
    });
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    try {
      await expect(session.prompt('Hello')).rejects.toThrow(
        'Model request failed',
      );

      expect(events).toEqual([
        { type: 'run.started', runId: 'run-1', input: 'Hello' },
        {
          type: 'model.started',
          runId: 'run-1',
          model: { provider: 'openai', model: 'mock-model' },
        },
        {
          type: 'run.failed',
          runId: 'run-1',
          error: { message: 'Model request failed' },
        },
      ]);
      expect(JSON.stringify(events)).not.toContain('api-secret');
      expect(session.getSnapshot().messages).toEqual([
        { role: 'user', content: 'Hello' },
      ]);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('cancels an active stream without persisting its partial answer', async () => {
    const model = createTextModel(['partial', ' answer'], 20);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    const prompt = session.prompt('Hello');
    session.cancel();
    await prompt;

    expect(events.map(event => event.type)).toEqual([
      'run.started',
      'model.started',
      'run.cancelled',
    ]);
    expect(session.getSnapshot().messages).toEqual([
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('rejects a concurrent prompt without replacing the active run', async () => {
    const model = createTextModel(['first answer'], 20);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });

    const firstPrompt = session.prompt('First');
    await expect(session.prompt('Second')).rejects.toThrow(
      'Session already has an active run',
    );
    session.cancel();
    await firstPrompt;

    expect(session.getSnapshot().messages).toEqual([
      { role: 'user', content: 'First' },
    ]);
    expect(model.doStreamCalls).toHaveLength(1);
  });
});

function createTextModel(
  deltas: string[],
  chunkDelayInMs: number | null = null,
): MockLanguageModelV3 {
  const streamResult = {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        ...deltas.map(delta => ({
          type: 'text-delta' as const,
          id: 'text-1',
          delta,
        })),
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: deltas.length,
              text: deltas.length,
              reasoning: 0,
            },
          },
        },
      ],
      chunkDelayInMs,
    }),
  } satisfies Awaited<ReturnType<MockLanguageModelV3['doStream']>>;

  return new MockLanguageModelV3({ doStream: async () => streamResult });
}
