import { afterEach, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionManager } from '../src/lib/server/runtime/manager';
import { modelServer } from './fixtures/model-server';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
async function setup(firstTool = false) {
  const directory = await mkdtemp(join(tmpdir(), 'message-queue-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const model = await modelServer({ firstTool });
  cleanup.push(() => model.close());
  const options = { directory, endpoint: { baseUrl: model.baseUrl, modelId: 'fixture', apiKey: '' } };
  let manager = createSessionManager(options);
  cleanup.push(() => manager.close());
  return { model, session: await manager.openSession('queue'), async restart() {
    await manager.close(); manager = createSessionManager(options); await manager.resume(); return manager.getSession('queue');
  } };
}
test('queues concurrent follow-ups, deduplicates pending input and promotes the same durable submission across restart', async () => {
  const fixture = await setup();
  let session = fixture.session;
  await session.submit('first', 'Initial question');
  await expect.poll(() => fixture.model.requests.length).toBe(1);
  const [a, b] = await Promise.all([session.submit('a', 'Use a table'), session.submit('b', 'Include sources')]);
  expect((await session.snapshot()).queue).toEqual([
    { id: a.id, content: 'Use a table', mode: 'followUp' },
    { id: b.id, content: 'Include sources', mode: 'followUp' }
  ]);
  expect(await session.submit('a', 'Use a table')).toEqual(a);
  await expect(session.submit('a', 'Changed')).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
  await session.steer(b.id);
  await session.steer(b.id);
  session = await fixture.restart();
  expect((await session.snapshot()).queue).toEqual([
    { id: a.id, content: 'Use a table', mode: 'followUp' },
    { id: b.id, content: 'Include sources', mode: 'steer' }
  ]);
  fixture.model.release();
  await expect.poll(async () => (await session.snapshot()).status, { timeout: 5000 }).toBe('idle');
  const done = await session.snapshot();
  expect(done.queue).toEqual([]);
  expect(done.entries.filter(e => e.kind === 'user').map(e => e.content)).toEqual(['Initial question', 'Use a table', 'Include sources']);
  await expect(session.steer(b.id)).rejects.toMatchObject({ code: 'NOT_QUEUED' });
});
test('Stop withdraws pending inputs and prevents them from running later', async () => {
  const { session, model } = await setup();
  await session.submit('first', 'Initial');
  await expect.poll(() => model.requests.length).toBe(1);
  const queued = await session.submit('queued', 'Pending');
  await session.stop();
  expect((await session.snapshot()).queue).toEqual([]);
  expect(await session.submit('queued', 'Pending')).toEqual(queued);
  await expect(session.submit('queued', 'Changed')).rejects.toMatchObject({code:'REQUEST_CONFLICT'});
  model.release();
  await session.submit('next', 'Next');
  await expect.poll(async () => (await session.snapshot()).status).toBe('idle');
  expect((await session.snapshot()).entries.some(e => e.content === 'Pending')).toBe(false);
});

test('steering enters model context at the native post-tool boundary before follow-ups', async () => {
  const { session, model } = await setup(true);
  await session.submit('first', 'Initial');
  await expect.poll(() => model.requests.length).toBe(1);
  await session.submit('later', 'Follow up after the answer');
  const steering = await session.submit('steer', 'Change direction now');
  await session.steer(steering.id);
  model.release();
  await expect.poll(async () => (await session.snapshot()).status, { timeout: 5000 }).toBe('idle');
  const prompts = model.requests.map(r => JSON.parse(r.prompt).messages.map((m: any) => m.content).join('\n'));
  expect(prompts[1]).toContain('Change direction now');
  expect(prompts[1]).not.toContain('Follow up after the answer');
  expect(prompts[2]).toContain('Follow up after the answer');
});

test('failed runs remain failed with a retained queue that Stop can clear', async () => {
  const { session, model } = await setup();
  await session.submit('first', 'Initial');
  await expect.poll(() => model.requests.length).toBe(1);
  await session.submit('queued', 'Pending');
  await model.close();
  await expect.poll(async () => (await session.snapshot()).status, {timeout:15000}).toBe('failed');
  expect((await session.snapshot()).queue).toHaveLength(1);
  await expect(session.steer((await session.snapshot()).queue![0].id)).rejects.toMatchObject({code:'NOT_RUNNING'});
  await session.stop();
  expect((await session.snapshot()).queue).toEqual([]);
});
