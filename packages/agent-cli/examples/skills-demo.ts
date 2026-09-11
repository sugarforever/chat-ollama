import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { MockLanguageModelV3, mockValues, simulateReadableStream } from 'ai/test';

import { createAgentSessionWithModel } from '../../agent-runtime/src/session-core.js';
import { runCli } from '../src/cli.js';

const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatollama-skills-demo-'));

try {
  const skillDirectory = join(workspaceRoot, '.agents', 'skills', 'release-note');
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, 'SKILL.md'), [
    '---',
    'name: release-note',
    'description: Write concise release notes',
    '---',
    'Always end release notes with: Ship small, learn fast.',
    '',
  ].join('\n'));

  const nextStream = mockValues<Awaited<ReturnType<MockLanguageModelV3['doStream']>>>(
    mockStream([
      { type: 'stream-start', warnings: [] },
      {
        type: 'tool-call',
        toolCallId: 'read-skill-1',
        toolName: 'read_file',
        input: '{"path":".agents/skills/release-note/SKILL.md"}',
      },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage(1) },
    ]),
    mockStream([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Ship small, learn fast.' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(5) },
    ]),
  );
  const session = createAgentSessionWithModel({
    id: 'skills-demo',
    model: new MockLanguageModelV3({
      provider: 'mock',
      modelId: 'skills-demo-model',
      doStream: async () => nextStream(),
    }),
    descriptor: { provider: 'openai-compatible', model: 'skills-demo-model' },
    generateId: () => 'skills-demo-run',
    workspaceRoot,
  });

  await runCli({
    session,
    input: Readable.from([
      '/skills\n',
      'Use the release-note Skill and give me its required closing line.\n',
      '/exit\n',
    ]),
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
