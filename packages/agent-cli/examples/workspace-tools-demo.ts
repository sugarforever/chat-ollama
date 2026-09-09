import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { MockLanguageModelV3, mockValues, simulateReadableStream } from 'ai/test';

import { createAgentSessionWithModel } from '../../agent-runtime/src/session-core.js';
import { runCli } from '../src/cli.js';

const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatollama-workspace-demo-'));

try {
  await mkdir(join(workspaceRoot, 'src'));
  await writeFile(join(workspaceRoot, 'README.md'), '# Demo workspace\n');
  await writeFile(join(workspaceRoot, 'src', 'hello.ts'), 'export const greeting = "hello workspace";\n');

  const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
    mockStream([
      { type: 'stream-start', warnings: [] },
      { type: 'tool-call', toolCallId: 'read-1', toolName: 'read_file', input: '{"path":"README.md"}' },
      { type: 'tool-call', toolCallId: 'list-1', toolName: 'list_directory', input: '{"path":"src"}' },
      { type: 'tool-call', toolCallId: 'grep-1', toolName: 'grep', input: '{"query":"hello workspace","path":"src"}' },
      { type: 'tool-call', toolCallId: 'find-1', toolName: 'find_files', input: '{"pattern":"*.ts","path":"src"}' },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage(4) },
    ]),
    mockStream([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Workspace inspection completed.' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(3) },
    ]),
  );
  const session = createAgentSessionWithModel({
    id: 'workspace-tools-demo',
    model: new MockLanguageModelV3({
      provider: 'mock',
      modelId: 'workspace-tools-model',
      doStream: async () => nextStream(),
    }),
    descriptor: { provider: 'openai-compatible', model: 'workspace-tools-model' },
    generateId: () => 'workspace-demo-run',
    workspaceRoot,
  });

  await runCli({
    session,
    input: Readable.from(['Inspect this workspace.\n', '/exit\n']),
    output: process.stdout,
    error: process.stdout,
  });
} finally {
  await rm(workspaceRoot, { recursive: true, force: true });
}

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
