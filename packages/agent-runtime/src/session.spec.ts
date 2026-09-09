import {
  MockLanguageModelV3,
  mockValues,
  simulateReadableStream,
} from 'ai/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createAgentSession } from './index.js';
import { createAgentSessionWithModel } from './session-core.js';
import type { RuntimeEvent } from './types.js';

describe('AgentSession streaming', () => {
  it('runs a workspace file tool through the existing lifecycle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-session-workspace-'));
    try {
      await writeFile(join(root, 'hello.txt'), 'hello workspace\n');
      const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
        createToolCallStream('read-1', 'read_file', { path: 'hello.txt' }),
        createTextStream(['Found it.']),
      );
      const model = new MockLanguageModelV3({ doStream: async () => nextStream() });
      const session = createAgentSessionWithModel({
        id: 'session-1',
        model,
        descriptor: { provider: 'openai', model: 'mock-model' },
        generateId: () => 'run-1',
        workspaceRoot: root,
      });
      const events: RuntimeEvent[] = [];
      session.subscribe(event => events.push(event));

      await session.prompt('Read hello.txt');

      expect(events).toContainEqual({
        type: 'tool.started',
        runId: 'run-1',
        call: { type: 'tool-call', callId: 'read-1', toolName: 'read_file', input: '{"path":"hello.txt"}' },
      });
      expect(events).toContainEqual({
        type: 'tool.completed',
        runId: 'run-1',
        result: expect.objectContaining({
          type: 'tool-result', callId: 'read-1', toolName: 'read_file', status: 'success',
          output: expect.stringContaining('1: hello workspace'),
        }),
      });
      expect(events.at(-1)).toEqual({ type: 'run.completed', runId: 'run-1' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs a tool call through ToolLoopAgent before streaming the final answer', async () => {
    const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
      createToolCallStream('call-1', 'getCurrentUtcTime', { timezone: 'UTC' }),
      createTextStream(['The time is ', '2026-09-09T12:00:00.000Z.']),
    );
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
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await session.prompt('What time is it?');

    expect(events).toEqual([
      { type: 'run.started', runId: 'run-1', input: 'What time is it?' },
      { type: 'model.started', runId: 'run-1', model: { provider: 'openai', model: 'mock-model' } },
      { type: 'step.started', runId: 'run-1', step: 1 },
      {
        type: 'tool.started',
        runId: 'run-1',
        call: { type: 'tool-call', callId: 'call-1', toolName: 'getCurrentUtcTime', input: '{"timezone":"UTC"}' },
      },
      {
        type: 'tool.completed',
        runId: 'run-1',
        result: { type: 'tool-result', callId: 'call-1', toolName: 'getCurrentUtcTime', status: 'success', output: '2026-09-09T12:00:00.000Z' },
      },
      { type: 'step.completed', runId: 'run-1', step: 1, reason: 'tool-calls' },
      { type: 'step.started', runId: 'run-1', step: 2 },
      { type: 'model.delta', runId: 'run-1', delta: 'The time is ' },
      { type: 'model.delta', runId: 'run-1', delta: '2026-09-09T12:00:00.000Z.' },
      { type: 'step.completed', runId: 'run-1', step: 2, reason: 'stop' },
      { type: 'model.completed', runId: 'run-1', message: { role: 'assistant', content: 'The time is 2026-09-09T12:00:00.000Z.' } },
      { type: 'run.completed', runId: 'run-1' },
    ]);
    expect(session.getSnapshot().messages).toEqual([
      { role: 'user', content: 'What time is it?' },
      { type: 'tool-call', callId: 'call-1', toolName: 'getCurrentUtcTime', input: '{"timezone":"UTC"}' },
      { type: 'tool-result', callId: 'call-1', toolName: 'getCurrentUtcTime', status: 'success', output: '2026-09-09T12:00:00.000Z' },
      { role: 'assistant', content: 'The time is 2026-09-09T12:00:00.000Z.' },
    ]);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1]?.prompt).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'What time is it?' }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'getCurrentUtcTime', input: { timezone: 'UTC' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'getCurrentUtcTime', output: { type: 'text', value: '2026-09-09T12:00:00.000Z' } }] },
    ]);
  });

  it.each([
    ['unknown tool', 'missingTool', { timezone: 'UTC' }],
    ['invalid tool input', 'getCurrentUtcTime', { timezone: 'Europe/Dublin' }],
  ])('terminates a %s with a sanitized failure and no assistant message', async (_case, toolName, input) => {
    const model = new MockLanguageModelV3({
      doStream: async () => createToolCallStream('bad-call', toolName, input),
    });
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await expect(session.prompt('Use a bad tool')).rejects.toThrow('Model request failed');

    expect(events.at(-1)).toEqual({
      type: 'run.failed',
      runId: 'run-1',
      error: { message: 'Model request failed' },
    });
    expect(events.filter(event => event.type === 'run.failed')).toHaveLength(1);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(events.some(event => event.type === 'model.delta')).toBe(false);
    expect(session.getSnapshot().messages.some(message => 'role' in message && message.role === 'assistant')).toBe(false);
  });

  it('sanitizes a demo tool execution failure and records its call association', async () => {
    const recoveryModel = createTextModel(['Recovered']);
    const model = new MockLanguageModelV3({
      doStream: async () => createToolCallStream('call-1', 'getCurrentUtcTime', { timezone: 'UTC' }),
    });
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
      now: () => { throw new Error('private tool detail'); },
      createModel: () => recoveryModel,
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await expect(session.prompt('Get time')).rejects.toThrow('Model request failed');

    expect(events).toContainEqual({
      type: 'tool.failed',
      runId: 'run-1',
      result: { type: 'tool-result', callId: 'call-1', toolName: 'getCurrentUtcTime', status: 'error', output: 'Tool execution failed' },
    });
    expect(events).toContainEqual({
      type: 'step.completed', runId: 'run-1', step: 1, reason: 'error',
    });
    expect(JSON.stringify(events)).not.toContain('private tool detail');
    expect(model.doStreamCalls).toHaveLength(1);
    expect(session.getSnapshot().messages.at(-1)).toEqual({
      type: 'tool-result', callId: 'call-1', toolName: 'getCurrentUtcTime', status: 'error', output: 'Tool execution failed',
    });

    session.setModel({ provider: 'openai', model: 'recovery-model' });
    await session.prompt('Try safely');

    expect(recoveryModel.doStreamCalls[0]?.prompt).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Get time' }] },
      { role: 'user', content: [{ type: 'text', text: 'Try safely' }] },
    ]);
    expect(JSON.stringify(recoveryModel.doStreamCalls[0]?.prompt)).not.toContain('private tool detail');
  });

  it('treats an undefined thrown by the tool as a failed run', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => createToolCallStream('call-1', 'getCurrentUtcTime', { timezone: 'UTC' }),
    });
    const session = createAgentSessionWithModel({
      id: 'session-1', model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
      now: () => { throw undefined; },
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await expect(session.prompt('Get time')).rejects.toThrow('Model request failed');

    expect(events.at(-1)).toEqual({
      type: 'run.failed', runId: 'run-1', error: { message: 'Model request failed' },
    });
    expect(events).toContainEqual({
      type: 'step.completed', runId: 'run-1', step: 1, reason: 'error',
    });
  });

  it('stops after four tool steps and keeps their context for the next prompt', async () => {
    const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
      ...Array.from({ length: 4 }, (_, index) =>
        createToolCallStream(`call-${index + 1}`, 'getCurrentUtcTime', { timezone: 'UTC' })),
      createTextStream(['Recovered']),
    );
    const model = new MockLanguageModelV3({ doStream: async () => nextStream() });
    const session = createAgentSessionWithModel({
      id: 'session-1', model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await session.prompt('Keep calling');

    expect(model.doStreamCalls).toHaveLength(4);
    expect(events.at(-1)).toEqual({ type: 'run.stopped', runId: 'run-1', reason: 'step-limit' });
    expect(events.filter(event => event.type === 'step.completed')).toHaveLength(4);
    expect(session.getSnapshot().messages.some(message => 'role' in message && message.role === 'assistant')).toBe(false);

    await session.prompt('Recover now');

    const recoveryPrompt = model.doStreamCalls[4]?.prompt;
    expect(recoveryPrompt?.at(0)).toEqual({
      role: 'user', content: [{ type: 'text', text: 'Keep calling' }],
    });
    expect(recoveryPrompt?.at(-1)).toEqual({
      role: 'user', content: [{ type: 'text', text: 'Recover now' }],
    });
    expect(recoveryPrompt?.filter(message => message.role === 'tool')).toHaveLength(4);
  });

  it('stops at the step limit even when tool-calling steps include text', async () => {
    const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
      ...Array.from({ length: 4 }, (_, index) =>
        createTextAndToolCallStream(
          `before-${index + 1} `,
          `call-${index + 1}`,
        )),
    );
    const model = new MockLanguageModelV3({ doStream: async () => nextStream() });
    const session = createAgentSessionWithModel({
      id: 'session-1', model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await session.prompt('Keep calling with preambles');

    expect(events.at(-1)).toEqual({ type: 'run.stopped', runId: 'run-1', reason: 'step-limit' });
    expect(session.getSnapshot().messages.some(message => 'role' in message && message.role === 'assistant')).toBe(false);
  });

  it('stops at the configured per-run step limit', async () => {
    const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
      createToolCallStream('call-1', 'getCurrentUtcTime', { timezone: 'UTC' }),
      createToolCallStream('call-2', 'getCurrentUtcTime', { timezone: 'UTC' }),
    );
    const model = new MockLanguageModelV3({ doStream: async () => nextStream() });
    const options = {
      id: 'session-1', model,
      descriptor: { provider: 'openai' as const, model: 'mock-model' },
      generateId: () => 'run-1',
      now: () => new Date('2026-09-09T12:00:00.000Z'),
      maxSteps: 2,
    };
    const session = createAgentSessionWithModel(options);
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    await session.prompt('Stop sooner');

    expect(model.doStreamCalls).toHaveLength(2);
    expect(events.at(-1)).toEqual({
      type: 'run.stopped', runId: 'run-1', reason: 'step-limit',
    });
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    'rejects invalid maxSteps value %s',
    maxSteps => {
      const model = createTextModel(['unused']);
      const options = {
        id: 'session-1', model,
        descriptor: { provider: 'openai' as const, model: 'mock-model' },
        maxSteps,
      };

      expect(() => createAgentSessionWithModel(options)).toThrow(
        'maxSteps must be a positive safe integer',
      );
    },
  );

  it('creates a public Session from model configuration without exposing secrets', () => {
    const session = createAgentSession({
      id: 'configured-session',
      workspaceRoot: process.cwd(),
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
      model: { provider: 'openai-compatible', model: 'qwen3:8b' },
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
      { type: 'step.started', runId: 'run-1', step: 1 },
      { type: 'model.delta', runId: 'run-1', delta: 'Hello' },
      { type: 'model.delta', runId: 'run-1', delta: ' world' },
      { type: 'step.completed', runId: 'run-1', step: 1, reason: 'stop' },
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
      model: { provider: 'openai', model: 'mock-model' },
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
      'step.started',
      'model.delta',
      'step.completed',
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

  it('keeps a cancelled user turn in model history for the next prompt', async () => {
    const firstModel = createTextModel(['partial'], 20);
    const secondModel = createTextModel(['recovered']);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model: firstModel,
      descriptor: { provider: 'openai', model: 'first-model' },
      createModel: () => secondModel,
      generateId: () => 'run-1',
    });

    const cancelled = session.prompt('Keep this question');
    await vi.waitFor(() => expect(firstModel.doStreamCalls).toHaveLength(1));
    session.cancel();
    await cancelled;
    session.setModel({ provider: 'openai', model: 'second-model' });
    await session.prompt('Try again');

    expect(secondModel.doStreamCalls[0]?.prompt).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Keep this question' }] },
      { role: 'user', content: [{ type: 'text', text: 'Try again' }] },
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
    await vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(1));
    session.cancel();
    await firstPrompt;

    expect(session.getSnapshot().messages).toEqual([
      { role: 'user', content: 'First' },
    ]);
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it('switches an idle session model, updates its snapshot, and publishes one typed change', () => {
    const firstModel = createTextModel(['first answer']);
    const secondModel = createTextModel(['second answer']);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model: firstModel,
      descriptor: { provider: 'openai', model: 'first-model' },
      createModel: config => {
        if (config.model === 'second-model') {
          return secondModel;
        }
        throw new Error(`Unexpected model: ${config.model}`);
      },
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    session.setModel({ provider: 'openai', model: 'second-model' });

    expect(session.getSnapshot()).toEqual({
      id: 'session-1',
      messages: [],
      model: { provider: 'openai', model: 'second-model' },
    });
    expect(events).toEqual([
      {
        type: 'model.changed',
        previous: { provider: 'openai', model: 'first-model' },
        current: { provider: 'openai', model: 'second-model' },
      },
    ]);
  });

  it('uses the switched controlled model for the next prompt while retaining history', async () => {
    const firstModel = createTextModel(['first answer']);
    const secondModel = createTextModel(['second answer']);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model: firstModel,
      descriptor: { provider: 'openai', model: 'first-model' },
      createModel: config => {
        if (config.model === 'second-model') {
          return secondModel;
        }
        throw new Error(`Unexpected model: ${config.model}`);
      },
    });

    await session.prompt('First prompt');
    session.setModel({ provider: 'openai', model: 'second-model' });
    await session.prompt('Second prompt');

    expect(firstModel.doStreamCalls).toHaveLength(1);
    expect(secondModel.doStreamCalls).toHaveLength(1);
    expect(secondModel.doStreamCalls[0]?.prompt).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'First prompt' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'Second prompt' }] },
    ]);
    expect(session.getSnapshot().messages).toEqual([
      { role: 'user', content: 'First prompt' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'Second prompt' },
      { role: 'assistant', content: 'second answer' },
    ]);
  });

  it('resets completed history while retaining the selected model', async () => {
    const firstModel = createTextModel(['first answer']);
    const secondModel = createTextModel(['second answer']);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model: firstModel,
      descriptor: { provider: 'openai', model: 'first-model' },
      createModel: config => {
        if (config.model === 'second-model') return secondModel;
        throw new Error(`Unexpected model: ${config.model}`);
      },
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));
    await session.prompt('Remember this');
    session.setModel({ provider: 'openai', model: 'second-model' });

    session.reset();

    expect(session.getSnapshot()).toEqual({
      id: 'session-1',
      messages: [],
      model: { provider: 'openai', model: 'second-model' },
    });
    expect(events.at(-1)).toEqual({
      type: 'session.reset',
      model: { provider: 'openai', model: 'second-model' },
    });
  });

  it('rejects reset during an active run without changing history or model', async () => {
    const model = createTextModel(['answer'], 20);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model,
      descriptor: { provider: 'openai', model: 'mock-model' },
      generateId: () => 'run-1',
    });
    const prompt = session.prompt('Keep this pending');

    expect(() => session.reset()).toThrow('Session has an active run');
    expect(session.getSnapshot()).toEqual({
      id: 'session-1',
      messages: [{ role: 'user', content: 'Keep this pending' }],
      model: { provider: 'openai', model: 'mock-model' },
    });

    session.cancel();
    await prompt;
  });

  it('rejects model switching during an active stream without replacing the selected model', async () => {
    const firstModel = createTextModel(['first answer'], 20);
    const secondModel = createTextModel(['second answer']);
    const createModel = vi.fn(() => secondModel);
    const session = createAgentSessionWithModel({
      id: 'session-1',
      model: firstModel,
      descriptor: { provider: 'openai', model: 'first-model' },
      createModel,
    });
    const events: RuntimeEvent[] = [];
    session.subscribe(event => events.push(event));

    const prompt = session.prompt('First prompt');

    expect(() =>
      session.setModel({ provider: 'openai', model: 'second-model' }),
    ).toThrow('Session has an active run');
    expect(session.getSnapshot().model).toEqual({
      provider: 'openai',
      model: 'first-model',
    });
    expect(secondModel.doStreamCalls).toHaveLength(0);
    expect(createModel).not.toHaveBeenCalled();
    expect(events.some(event => event.type === 'model.changed')).toBe(false);

    session.cancel();
    await prompt;
    session.setModel({ provider: 'openai', model: 'second-model' });
    expect(createModel).toHaveBeenCalledExactlyOnceWith({ provider: 'openai', model: 'second-model' });
    expect(session.getSnapshot().model).toEqual({ provider: 'openai', model: 'second-model' });
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

function createToolCallStream(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Awaited<ReturnType<MockLanguageModelV3['doStream']>> {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        { type: 'tool-call' as const, toolCallId, toolName, input: JSON.stringify(input) },
        { type: 'finish' as const, finishReason: { unified: 'tool-calls' as const, raw: 'tool-calls' }, usage: usage(1) },
      ],
      chunkDelayInMs: null,
    }),
  } satisfies Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
}

function createTextStream(
  deltas: string[],
): Awaited<ReturnType<MockLanguageModelV3['doStream']>> {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        { type: 'text-start' as const, id: 'text-final' },
        ...deltas.map(delta => ({ type: 'text-delta' as const, id: 'text-final', delta })),
        { type: 'text-end' as const, id: 'text-final' },
        { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: 'stop' }, usage: usage(deltas.length) },
      ],
      chunkDelayInMs: null,
    }),
  } satisfies Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
}

function createTextAndToolCallStream(
  text: string,
  toolCallId: string,
): Awaited<ReturnType<MockLanguageModelV3['doStream']>> {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: `text-${toolCallId}` },
        { type: 'text-delta', id: `text-${toolCallId}`, delta: text },
        { type: 'text-end', id: `text-${toolCallId}` },
        { type: 'tool-call', toolCallId, toolName: 'getCurrentUtcTime', input: '{"timezone":"UTC"}' },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage(1) },
      ],
      chunkDelayInMs: null,
    }),
  };
}

function usage(outputTokens: number) {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
  };
}
