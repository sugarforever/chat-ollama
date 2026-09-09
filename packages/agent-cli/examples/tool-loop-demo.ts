import { Readable } from 'node:stream';

import {
  MockLanguageModelV3,
  mockValues,
  simulateReadableStream,
} from 'ai/test';

import { createAgentSessionWithModel } from '../../agent-runtime/src/session-core.js';
import { runCli } from '../src/cli.js';

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

const session = createAgentSessionWithModel({
  id: 'tool-loop-demo',
  model: new MockLanguageModelV3({
    provider: 'mock',
    modelId: 'tool-loop-model',
    doStream: async () => nextStream(),
  }),
  descriptor: { provider: 'openai-compatible', model: 'tool-loop-model' },
  generateId: () => 'demo-run-1',
  now: () => new Date('2026-09-09T12:00:00.000Z'),
});

await runCli({
  session,
  input: Readable.from(['What time is it?\n', '/exit\n']),
  output: process.stdout,
  error: process.stdout,
});

function mockStream(
  chunks: Parameters<typeof simulateReadableStream>[0]['chunks'],
): Awaited<ReturnType<MockLanguageModelV3['doStream']>> {
  return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 5 }) } as Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
}

function usage(outputTokens: number) {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
  };
}
