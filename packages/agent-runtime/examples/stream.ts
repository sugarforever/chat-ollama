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
  session.subscribe(event => {
    if (event.type === 'model.delta') {
      process.stdout.write(event.delta);
    } else if (event.type === 'model.completed') {
      process.stdout.write('\n');
    }
  });

  await session.prompt(
    process.env.AGENT_PROMPT ?? 'Reply with a short greeting.',
  );
}

function createExampleSession(): AgentSession {
  const provider = process.env.AGENT_PROVIDER ?? 'mock';

  if (provider === 'mock') {
    const streamResult = {
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: 'Hello from ',
          },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: 'the mock model.',
          },
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
              outputTokens: { total: 5, text: 5, reasoning: 0 },
            },
          },
        ],
        chunkDelayInMs: 10,
      }),
    } satisfies Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
    const nextStream = mockValues(streamResult);
    const model = new MockLanguageModelV3({
      doStream: async () => nextStream(),
    });

    return createAgentSessionWithModel({
      id: 'example-session',
      model,
      descriptor: { provider: 'openai-compatible', model: 'mock-model' },
    });
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey === undefined) {
      throw new Error('OPENAI_API_KEY is required for the OpenAI example');
    }

    return createAgentSession({
      model: {
        provider: 'openai',
        model: process.env.AGENT_MODEL ?? 'gpt-5-mini',
        apiKey,
      },
    });
  }

  if (provider === 'ollama') {
    return createAgentSession({
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

await main().catch(error => {
  const message = error instanceof Error ? error.message : 'Runtime failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
