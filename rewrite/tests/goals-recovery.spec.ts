import { afterEach, expect, test } from 'vitest';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goalModel } from './fixtures/goal-model';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
async function until<T>(read: () => T | Promise<T>, predicate: (value: T) => boolean) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { const value = await read(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 20)); }
  throw Error('Recovery condition not reached');
}
for (const interrupted of ['work', 'verify']) test(`SIGKILL during ${interrupted} resumes native submission; one saved result survives another restart`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goal-crash-')); cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const model = await goalModel(); cleanup.push(() => model.close()); model.hold(interrupted);
  async function child() {
    const messages: any[] = []; let stderr = '';
    const proc = fork('tests/fixtures/goals-child.ts', [], { execArgv: ['--import', 'tsx'], env: { ...process.env, DATA_DIR: dir, BASE_URL: model.endpoint.baseUrl }, stdio: ['ignore','ignore','pipe','ipc'] });
    proc.stderr?.on('data', d => stderr += d); proc.on('message', m => messages.push(m));
    cleanup.push(async () => { if (proc.exitCode === null && proc.signalCode === null) { proc.kill('SIGKILL'); await new Promise(r => proc.once('exit', r)); } });
    await until(() => { if (proc.exitCode !== null || messages.some(m => m.event === 'error')) throw Error(stderr + JSON.stringify(messages)); return messages; }, m => m.some(v => v.event === 'ready'));
    return { proc, messages, async snapshot(id: string) { const n = messages.length; proc.send({ command: 'snapshot', id }); const next = await until(() => messages.slice(n), m => m.some(v => v.event === 'snapshot')); return next.find(v => v.event === 'snapshot').snapshot; }, async close() { proc.send({ command: 'close' }); await new Promise(r => proc.once('exit', r)); } };
  }
  const first = await child(); first.proc.send({ command: 'create', input: { requestId: 'one', text: 'Write an introduction from supplied facts', providerId: 'fixture', modelId: 'fixture', authorizeTextWork: true } });
  await until(() => model.calls, m => m.some(v => v.purpose === interrupted));
  const id = first.messages.find(m => m.event === 'created').id;
  first.proc.kill('SIGKILL'); await new Promise(r => first.proc.once('exit', r)); model.release(interrupted);
  const second = await child(); const done = await until(() => second.snapshot(id), s => s.goal.lifecycle === 'completed');
  expect(done.artifacts).toHaveLength(1); expect(done.activity.filter((a: any) => a.kind === 'result')).toHaveLength(1);
  expect(model.calls.filter(c => c.purpose === interrupted)).toHaveLength(2);
  expect(model.calls.filter(c => c.purpose === 'work')).toHaveLength(interrupted === 'work' ? 2 : 1);
  const calls = model.calls.length; await second.close();
  const third = await child(); expect((await third.snapshot(id)).artifacts).toEqual(done.artifacts);
  expect(model.calls).toHaveLength(calls);
});

test('SIGKILL during deliverable verify resumes verification without regenerating prior deliverables', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goal-crash-deliv-')); cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const model = await goalModel({ deliverables: true }); cleanup.push(() => model.close());
  model.hold('verify:short-summary');
  async function child() {
    const messages: any[] = []; let stderr = '';
    const proc = fork('tests/fixtures/goals-child.ts', [], { execArgv: ['--import', 'tsx'], env: { ...process.env, DATA_DIR: dir, BASE_URL: model.endpoint.baseUrl }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    proc.stderr?.on('data', d => stderr += d); proc.on('message', m => messages.push(m));
    cleanup.push(async () => { if (proc.exitCode === null && proc.signalCode === null) { proc.kill('SIGKILL'); await new Promise(r => proc.once('exit', r)); } });
    await until(() => { if (proc.exitCode !== null || messages.some(m => m.event === 'error')) throw Error(stderr + JSON.stringify(messages)); return messages; }, m => m.some(v => v.event === 'ready'));
    return { proc, messages, async snapshot(id: string) { const n = messages.length; proc.send({ command: 'snapshot', id }); const next = await until(() => messages.slice(n), m => m.some(v => v.event === 'snapshot')); return next.find(v => v.event === 'snapshot').snapshot; }, async close() { proc.send({ command: 'close' }); await new Promise(r => proc.once('exit', r)); } };
  }
  const first = await child();
  first.proc.send({ command: 'create', input: { requestId: 'deliv-crash', text: '准备发布说明、更新介绍与兼容性说明', providerId: 'fixture', modelId: 'fixture', authorizeTextWork: true } });
  await until(() => model.calls, m => m.some(v => v.purpose === 'verify' && v.deliverableId === 'short-summary'));
  const id = first.messages.find(m => m.event === 'created').id;
  first.proc.kill('SIGKILL'); await new Promise(r => first.proc.once('exit', r));
  model.release('verify:short-summary');

  const second = await child();
  const waiting = await until(() => second.snapshot(id), s => s.goal.questionDeliverableId === 'compat-notes');
  expect(waiting.deliverables.map((d: any) => [d.id, d.state])).toEqual([
    ['release-notes', 'succeeded'],
    ['short-summary', 'succeeded'],
    ['compat-notes', 'waiting'],
  ]);
  expect(waiting.artifacts).toHaveLength(2);
  expect(model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'release-notes')).toHaveLength(1);
  expect(model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'short-summary')).toHaveLength(1);
  await second.close();
});
