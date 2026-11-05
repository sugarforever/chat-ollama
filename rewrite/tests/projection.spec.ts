import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openAgentSession } from '../src/lib/server/runtime/session';
import { modelServer } from './fixtures/model-server';
// Catches retaining a callback that throws during its initial registration notification.
test('a throwing initial listener is removed before later committed updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'watch-')); const model = await modelServer();
  const session = await openAgentSession('one', join(directory, 'one.sqlite'), { baseUrl: model.baseUrl, apiKey: '', modelId: 'fixture' });
  try {
    let calls = 0; expect(() => session.watch(() => { calls++; throw new Error('closed browser'); })).toThrow('closed browser');
    await session.submit('watch', 'hello'); model.release();
    for (let i = 0; i < 200 && !(await session.snapshot()).entries.some(e => e.content === 'Recovered answer'); i++) await new Promise(r => setTimeout(r, 25));
    expect((await session.snapshot()).entries.some(e => e.content === 'Recovered answer')).toBe(true); expect(calls).toBe(1);
  } finally { await session.close(); await model.close(); await rm(directory, { recursive: true, force: true }); }
});

// Catches losing committed in-flight text and retaining unsupported failure detection after restart.
test('snapshot includes a committed partial and retains it when explicitly stopped', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'partial-')); const model = await modelServer();
  const session = await openAgentSession('one', join(directory, 'one.sqlite'), { baseUrl: model.baseUrl, apiKey: '', modelId: 'fixture' });
  try {
    await session.submit('partial', 'hello');
    for (let i = 0; i < 200 && !model.requests.length; i++) await new Promise(r => setTimeout(r, 25));
    model.partial();
    let found = false;
    for (let i = 0; i < 200; i++) { const state = await session.snapshot(); if (state.entries.some(e => e.kind === 'assistant' && e.content === 'Partial answer')) { expect(state.status).toBe('running'); found = true; break; } await new Promise(r => setTimeout(r, 25)); }
    expect(found).toBe(true); const statuses: string[] = []; const detach = session.watch(state => statuses.push(state.status)); await session.stop(); detach();
    expect(statuses).toContain('cancelling');
    expect((await session.snapshot()).entries.some(e => e.content === 'Partial answer')).toBe(true);
  } finally { await session.close(); await model.close(); await rm(directory, { recursive: true, force: true }); }
});
test('model failure status survives reopen without exposing upstream secret errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'failure-')); const model = await modelServer({ failure: true });
  const endpoint = { baseUrl: model.baseUrl, apiKey: '', modelId: 'fixture' };
  let session = await openAgentSession('one', join(directory, 'one.sqlite'), endpoint);
  try {
    await session.submit('failure', 'hello');
    for (let i = 0; i < 200 && (await session.snapshot()).status !== 'failed'; i++) await new Promise(r => setTimeout(r, 25));
    expect((await session.snapshot()).status).toBe('failed'); expect(JSON.stringify(await session.snapshot())).not.toContain('fixture-secret');
    await session.close(); session = await openAgentSession('one', join(directory, 'one.sqlite'), endpoint);
    expect((await session.snapshot()).status).toBe('failed'); expect(model.requests).toHaveLength(1);
  } finally { await session.close(); await model.close(); await rm(directory, { recursive: true, force: true }); }
});

// Catches dropping tool progress, duplicating completed calls, and losing interrupted-action uncertainty.
test('projects live tools and persisted uncertain results without pi fields', async () => {
  const { projectState } = await import('../src/lib/server/runtime/projection');
  const state = projectState({ id: 'one', revision: '7', live: { run: { taskId: 9 as any, inputs: [8 as any] }, tools: [{ callId: 'call-a', name: 'send', status: 'running', output: 'Sending' }] }, entries: [] });
  expect(state.entries).toEqual([{ id: 'tool:call-a', kind: 'tool', toolName: 'send', content: 'Sending', toolStatus: 'running' }]);
  const result = projectState({ id: 'one', revision: '8', entries: [{ id: 10 as any, conversationId: 1 as any, kind: 'pi.tool-result', model: [{ role: 'toolResult', toolCallId: 'call-a', toolName: 'send', content: [{ type: 'text', text: 'Uncertain result' }], isError: true, timestamp: 1 }], data: { diagnostics: [{ severity: 'error', code: 'interrupted', message: 'Uncertain result' }] } }] });
  expect(result.entries).toEqual([{ id: '10', kind: 'tool', toolName: 'send', content: 'Uncertain result', toolStatus: 'done', uncertain: true }]);
  expect(result.status).toBe('interrupted');
});
