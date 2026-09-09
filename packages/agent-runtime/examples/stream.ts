import {
  MockLanguageModelV3,
  mockValues,
  simulateReadableStream,
} from 'ai/test';

import { createAgentSession } from '../src/index.js';
import { createAgentSessionWithModel } from '../src/session-core.js';
import type { AgentSession } from '../src/types.js';

async function main(): Promise<void> {
  const session = createExampleSession();
  let textOpen = false;
  session.subscribe(event => {
    switch (event.type) {
      case 'step.started':
        process.stdout.write(`[step ${event.step}] started\n`);
        break;
      case 'step.completed':
        if (textOpen) {
          process.stdout.write('\n');
          textOpen = false;
        }
        process.stdout.write(`[step ${event.step}] completed: ${event.reason}\n`);
        break;
      case 'tool.started':
        process.stdout.write(`[tool ${event.call.toolName}] running ${event.call.input}\n`);
        break;
      case 'tool.completed':
        process.stdout.write(`[tool ${event.result.toolName}] completed ${event.result.output}\n`);
        break;
      case 'tool.failed':
        process.stdout.write(`[tool ${event.result.toolName}] failed ${event.result.output}\n`);
        break;
      case 'model.delta':
        textOpen = true;
        process.stdout.write(event.delta);
        break;
      case 'model.completed':
        if (textOpen) process.stdout.write('\n');
        textOpen = false;
        break;
    }
  });

  await session.prompt(
    process.env.AGENT_PROMPT ?? 'Reply with a short greeting.',
  );
}

function createExampleSession(): AgentSession {
  const provider = process.env.AGENT_PROVIDER ?? 'mock';

  if (provider === 'mock') {
    const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
      mockStream([
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'demo-call-1', toolName: 'getCurrentUtcTime', input: '{"timezone":"UTC"}' },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage(1) },
      ]),
      mockStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'The current UTC time is ' },
        { type: 'text-delta', id: 'text-1', delta: '2026-09-09T12:00:00.000Z.' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(2) },
      ]),
    );
    const model = new MockLanguageModelV3({
      doStream: async () => nextStream(),
    });

    return createAgentSessionWithModel({
      id: 'example-session',
      model,
      descriptor: { provider: 'openai-compatible', model: 'mock-model' },
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey === undefined) {
      throw new Error('OPENAI_API_KEY is required for the OpenAI example');
    }

    return createAgentSession({
      workspaceRoot: process.cwd(),
      model: {
        provider: 'openai',
        model: process.env.AGENT_MODEL ?? 'gpt-5-mini',
        apiKey,
      },
    });
  }

  if (provider === 'ollama') {
    return createAgentSession({
      workspaceRoot: process.cwd(),
      model: {
        provider: 'openai-compatible',
        name: 'ollama',
        model: process.env.AGENT_MODEL ?? 'qwen3:8b',
        baseURL:
          process.env.AGENT_BASE_URL ?? 'http://localhost:11434/v1',
        apiKey: process.env.AGENT_API_KEY ?? 'ollama',
      },
    });
  }

  throw new Error(`Unsupported AGENT_PROVIDER: ${provider}`);
}

function mockStream(
  chunks: Parameters<typeof simulateReadableStream>[0]['chunks'],
): Awaited<ReturnType<MockLanguageModelV3['doStream']>> {
  return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 10 }) } as Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
}

function usage(outputTokens: number) {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
  };
}

await main().catch(error => {
  const message = error instanceof Error ? error.message : 'Runtime failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
