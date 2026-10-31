import { afterEach, beforeAll, expect, test } from 'vitest';
import { execFileSync, fork } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalogue } from '../src/lib/server/db';
import { modelServer } from './fixtures/model-server';
const cleanups: (() => Promise<unknown>)[] = [];
beforeAll(() => execFileSync('pnpm', ['build'], { stdio: 'pipe' }), 120000);
afterEach(async () => { for (const fn of cleanups.reverse()) await fn(); cleanups.length = 0; });
async function until<T>(read: () => T | Promise<T>, check: (value: T) => boolean) {
  for (let i = 0; i < 400; i++) { const value = await read(); if (check(value)) return value; await new Promise(r => setTimeout(r, 25)); }
  throw new Error('Condition not reached');
}
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'chat-api-'));
  cleanups.push(() => rm(directory, { force: true, recursive: true }));
  const model = await modelServer(); cleanups.push(() => model.close());
  async function start() {
    const proc = fork('tests/fixtures/http-child.ts', [], { execArgv: ['--import', 'tsx'], env: { ...process.env, DATA_DIR: directory, CHAT_BASE_URL: model.baseUrl, CHAT_MODEL_ID: 'fixture' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let stderr = ''; proc.stderr?.on('data', x => stderr += x);
    const port = await new Promise<number>((resolve, reject) => { proc.once('message', (m: any) => resolve(m.port)); proc.once('exit', () => reject(new Error(stderr))); });
    cleanups.push(async () => { if (proc.exitCode === null && proc.signalCode === null) { proc.kill('SIGKILL'); await new Promise(r => proc.once('exit', r)); } });
    const url = `http://127.0.0.1:${port}/api/conversations`;
    const request = (path = '', body?: unknown) => fetch(url + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { proc, url, request, async create() { const res = await request('', { modelId: 'fixture', knowledgeBaseIds: [], mcpServerIds: [] }); expect(res.status).toBe(201); return (await res.json()).id as string; } };
  }
  return { directory, model, start };
}
// Catches ignoring request content on retry, non-atomic busy admission, and metadata lost after admission.
test('HTTP admission deduplicates, rejects conflicts and concurrent distinct requests, and survives SIGKILL', async () => {
  const { model, start } = await setup(); const app = await start(); const id = await app.create();
  const responses = await Promise.all(['first', 'second'].map(requestId => app.request(`/${id}/messages`, { requestId, content: requestId })));
  expect(responses.map(x => x.status).sort()).toEqual([202, 409]);
  const accepted = responses.findIndex(x => x.status === 202); const requestId = ['first', 'second'][accepted]; const admission = await responses[accepted].json();
  const retries = await Promise.all([app.request(`/${id}/messages`, { requestId, content: requestId }), app.request(`/${id}/messages`, { requestId, content: requestId })]);
  for (const retry of retries) { expect(retry.status).toBe(202); expect(await retry.json()).toEqual(admission); }
  const conflict = await app.request(`/${id}/messages`, { requestId, content: 'changed' }); expect(conflict.status).toBe(409); expect((await conflict.json()).error.code).toBe('REQUEST_CONFLICT');
  await until(() => model.requests.length, n => n === 1);
  app.proc.kill('SIGKILL'); await new Promise(r => app.proc.once('exit', r));
  const restarted = await start();
  const retried = await restarted.request(`/${id}/messages`, { requestId, content: requestId }); expect(retried.status).toBe(202); expect(await retried.json()).toEqual(admission);
  expect((await (await restarted.request()).json()).map((x: any) => x.id)).toContain(id);
  model.release();
  const done = await until(async () => (await restarted.request(`/${id}`)).json(), x => x.status === 'idle' && x.entries.some((e: any) => e.content === 'Recovered answer'));
  expect(done.entries.filter((e: any) => e.kind === 'user')).toHaveLength(1);
  expect(model.requests.length).toBeLessThanOrEqual(2);
  const finalRetry = await restarted.request(`/${id}/messages`, { requestId, content: requestId }); expect(await finalRetry.json()).toEqual(admission);
  const conflictAfterRestart = await restarted.request(`/${id}/messages`, { requestId, content: 'changed after restart' }); expect(conflictAfterRestart.status).toBe(409);
  const requestCount = model.requests.length;
  restarted.proc.kill('SIGKILL'); await new Promise(r => restarted.proc.once('exit', r));
  const completedRestart = await start(); const recovered = await (await completedRestart.request(`/${id}`)).json();
  expect(recovered.entries).toEqual(done.entries); expect(recovered.status).toBe('idle');
  expect(model.requests).toHaveLength(requestCount);
});
// Catches observer-disconnect cancellation and missed terminal state on Last-Event-ID reconnect.
test('SSE immediately resnapshots, disconnect leaves work running and reconnect sees completion', async () => {
  const { model, start } = await setup(); const app = await start(); const id = await app.create();
  const controller = new AbortController(); const events = await fetch(`${app.url}/${id}/events`, { signal: controller.signal }); expect(events.headers.get('content-type')).toContain('text/event-stream');
  const reader = events.body!.getReader(); const first = new TextDecoder().decode((await reader.read()).value); expect(first).toContain('"type":"snapshot"'); expect(first).toContain('"status":"idle"');
  expect((await app.request(`/${id}/messages`, { requestId: 'sse', content: 'Continue' })).status).toBe(202);
  await until(() => model.requests.length, n => n === 1); controller.abort(); model.release();
  await until(async () => (await app.request(`/${id}`)).json(), x => x.status === 'idle' && x.entries.some((e: any) => e.content === 'Recovered answer'));
  const reconnect = new AbortController(); const res = await fetch(`${app.url}/${id}/events`, { headers: { 'last-event-id': '999999' }, signal: reconnect.signal });
  const final = new TextDecoder().decode((await res.body!.getReader().read()).value); reconnect.abort(); expect(final).toContain('Recovered answer'); expect(final).toContain('"status":"idle"');
});
// Catches unhandled repeated abort and accidental creation of unknown or malformed session paths.
test('Stop is repeatable and invalid or unknown IDs never create sessions', async () => {
  const { directory, model, start } = await setup(); const app = await start(); const id = await app.create();
  await app.request(`/${id}/messages`, { requestId: 'stop', content: 'Wait' }); await until(() => model.requests.length, n => n === 1);
  const stops = await Promise.all([app.request(`/${id}/stop`, {}), app.request(`/${id}/stop`, {})]); expect(stops.every(x => x.status === 202)).toBe(true);
  await until(async () => (await app.request(`/${id}`)).json(), x => x.status === 'idle');
  const before = await readdir(join(directory, 'sessions'));
  for (const path of ['/unknown', '/unknown/events', '/unknown/messages', '/bad%2Fid']) { const res = await app.request(path, path.endsWith('messages') ? { requestId: 'x', content: 'x' } : undefined); expect([400, 404]).toContain(res.status); expect((await res.json()).error.code).toBeDefined(); }
  expect(await readdir(join(directory, 'sessions'))).toEqual(before);
});

// Recreates the durable creation intent left by a crash before a pi session file exists.
test('startup completes interrupted catalogue creation with its saved config', async () => {
  const { directory, start } = await setup();
  await mkdir(join(directory, 'sessions'));
  const catalogue = openCatalogue(join(directory, 'sessions', 'catalogue.sqlite'));
  catalogue.insert('creation-interrupted', { modelId: 'fixture', knowledgeBaseIds: ['collection-one'], mcpServerIds: ['server-one'] }); catalogue.close();
  const app = await start();
  const list = await (await app.request()).json();
  expect(list).toEqual([expect.objectContaining({ id: 'creation-interrupted', config: { modelId: 'fixture', knowledgeBaseIds: ['collection-one'], mcpServerIds: ['server-one'] } })]);
  expect((await app.request('/creation-interrupted')).status).toBe(200);
  expect(await readdir(join(directory, 'sessions'))).toContain('creation-interrupted.sqlite');
});
