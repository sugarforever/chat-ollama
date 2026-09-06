import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  AgentSession,
  AssistantMessage,
  RuntimeEvent,
  SessionSnapshot,
  UserMessage,
} from './types.js';

describe('Runtime public contract', () => {
  it('represents messages and events with ChatOllama-owned data', () => {
    const user = { role: 'user', content: 'Hello' } satisfies UserMessage;
    const assistant = {
      role: 'assistant',
      content: 'Hi',
    } satisfies AssistantMessage;
    const snapshot = {
      id: 'session-1',
      messages: [user, assistant],
    } satisfies SessionSnapshot;

    const events = [
      { type: 'run.started', runId: 'run-1', input: 'Hello' },
      {
        type: 'model.started',
        runId: 'run-1',
        model: { provider: 'openai', model: 'gpt-5-mini' },
      },
      { type: 'model.delta', runId: 'run-1', delta: 'Hi' },
      { type: 'model.completed', runId: 'run-1', message: assistant },
      { type: 'run.completed', runId: 'run-1' },
      {
        type: 'run.failed',
        runId: 'run-1',
        error: { message: 'Model request failed' },
      },
      { type: 'run.cancelled', runId: 'run-1' },
    ] satisfies RuntimeEvent[];

    expect(snapshot).toEqual({
      id: 'session-1',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    });
    expect(events.map(event => event.type)).toEqual([
      'run.started',
      'model.started',
      'model.delta',
      'model.completed',
      'run.completed',
      'run.failed',
      'run.cancelled',
    ]);
  });

  it('keeps the Session surface limited to state and run control', () => {
    expectTypeOf<AgentSession>().toHaveProperty('getSnapshot');
    expectTypeOf<AgentSession>().toHaveProperty('subscribe');
    expectTypeOf<AgentSession>().toHaveProperty('prompt');
    expectTypeOf<AgentSession>().toHaveProperty('cancel');
  });
});
