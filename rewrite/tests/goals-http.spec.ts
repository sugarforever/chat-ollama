import { beforeAll, afterEach, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { goalApp } from './fixtures/goal-app';
import { goalModel } from './fixtures/goal-model';
beforeAll(() => execFileSync('pnpm', ['build'], { stdio: 'pipe' }), 120000);
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
test('production entrypoint admits a Goal once, fences mutations, and serves scoped saved results', async () => {
  const model = await goalModel(); cleanup.push(() => model.close());
  const app = await goalApp(model.endpoint.baseUrl); cleanup.push(() => app.close());
  const input = { text: 'Write an introduction from supplied facts', providerId: 'legacy', modelId: 'fixture', requestId: 'one', authorizeTextWork: true };
  expect((await fetch(app.origin + '/api/goals', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' }, body: JSON.stringify(input) })).status).toBe(403);
  const created = await app.request('/api/goals', input); expect(created.status).toBe(201);
  const { id } = await created.json();
  expect(await (await app.request('/api/goals', input)).json()).toEqual({ id });
  expect((await app.request('/api/goals', { ...input, text: 'Changed' })).status).toBe(409);
  expect((await app.request('/api/goals', { ...input, principalId: 'forged', requestId: 'forged' })).status).toBe(400);
  await expect.poll(async () => (await (await app.request(`/api/goals/${id}`)).json()).goal.lifecycle, { timeout: 10000 }).toBe('completed');
  const saved = await (await app.request(`/api/goals/${id}`)).json();
  const artifactId = saved.artifacts[0].id;
  const artifact = await app.request(`/api/goals/${id}/artifacts/${encodeURIComponent(artifactId)}?download=1`);
  expect(artifact.status).toBe(200); expect(await artifact.text()).toContain('## Background');
  expect(artifact.headers.get('content-disposition')).toContain('attachment');
  const other = await (await app.request('/api/goals', { ...input, requestId: 'other', authorizeTextWork: false })).json();
  expect((await app.request(`/api/goals/${other.id}/artifacts/${encodeURIComponent(artifactId)}`)).status).toBe(404);
  expect((await app.request(`/api/goals/${other.id}/commands`, { requestId: 'bad', action: 'pause' })).status).toBe(400);
  expect((await app.request(`/api/goals/${other.id}/commands`, { requestId: 'stale', expectedRevision: 99, action: 'pause' })).status).toBe(409);
  expect((await app.request('/api/goals/unknown')).status).toBe(404);
  expect(JSON.stringify(saved)).not.toContain('fixture-secret');
});

test('HTTP API exposes deliverables, rejects answering completed deliverable with 409, and completes after answering waiting deliverable', async () => {
  const model = await goalModel({ deliverables: true }); cleanup.push(() => model.close());
  const app = await goalApp(model.endpoint.baseUrl); cleanup.push(() => app.close());
  const input = { text: '准备发布说明、150字以内更新介绍和兼容性说明', providerId: 'legacy', modelId: 'fixture', requestId: 'deliv-http', authorizeTextWork: true };
  const created = await app.request('/api/goals', input); expect(created.status).toBe(201);
  const { id } = await created.json();

  await expect.poll(async () => (await (await app.request(`/api/goals/${id}`)).json()).goal.questionDeliverableId, { timeout: 10000 }).toBe('compat-notes');
  const waiting = await (await app.request(`/api/goals/${id}`)).json();
  expect(waiting.deliverables.map((d: any) => [d.id, d.state])).toEqual([
    ['release-notes', 'succeeded'],
    ['short-summary', 'succeeded'],
    ['compat-notes', 'waiting'],
  ]);
  const priorArtifacts = structuredClone(waiting.artifacts);

  const dup = await app.request(`/api/goals/${id}/commands`, {
    requestId: 'ans-done', expectedRevision: waiting.goal.revision,
    action: 'answer', deliverableId: 'release-notes', text: 'noop',
  });
  expect(dup.status).toBe(409);

  const ans = await app.request(`/api/goals/${id}/commands`, {
    requestId: 'ans-compat', expectedRevision: waiting.goal.revision,
    action: 'answer', deliverableId: 'compat-notes', text: 'macOS 15 + Node 24 实测通过',
  });
  expect(ans.status).toBe(200);

  await expect.poll(async () => (await (await app.request(`/api/goals/${id}`)).json()).goal.lifecycle, { timeout: 10000 }).toBe('completed');
  const completed = await (await app.request(`/api/goals/${id}`)).json();
  expect(completed.artifacts.slice(0, 2)).toEqual(priorArtifacts);
  expect(completed.artifacts).toHaveLength(4);
  const compatArtifact = completed.artifacts.find((a: any) => a.deliverableId === 'compat-notes');
  const downloaded = await app.request(`/api/goals/${id}/artifacts/${encodeURIComponent(compatArtifact.id)}?download=1`);
  expect(downloaded.status).toBe(200);
  expect(await downloaded.text()).toContain('macOS 15 + Node 24 实测通过');
});


test('ambiguous multi-deliverable answers return a public conflict without changing accepted state', async () => {
  const model = await goalModel({ deliverables: true, deliverableAskId: 'release-notes' }); cleanup.push(() => model.close());
  const app = await goalApp(model.endpoint.baseUrl); cleanup.push(() => app.close());
  const { id } = await (await app.request('/api/goals', { text: 'Three independent text deliveries', providerId: 'legacy', modelId: 'fixture', requestId: 'ambiguous-http', authorizeTextWork: true })).json();
  await expect.poll(async () => (await (await app.request(`/api/goals/${id}`)).json()).goal.questionDeliverableId, { timeout: 10000 }).toBe('release-notes');
  let snapshot = await (await app.request(`/api/goals/${id}`)).json();
  for (const action of ['pause', 'review']) {
    expect((await app.request(`/api/goals/${id}/commands`, { requestId: `ambiguous-${action}`, expectedRevision: snapshot.goal.revision, action })).status).toBe(200);
    snapshot = await (await app.request(`/api/goals/${id}`)).json();
  }
  const reply = await app.request(`/api/goals/${id}/commands`, { requestId: 'unscoped', expectedRevision: snapshot.goal.revision, action: 'answer', text: 'Which item?' });
  expect(reply.status).toBe(409);
  expect((await reply.json()).error.code).toBe('DELIVERABLE_REQUIRED');
  expect(await (await app.request(`/api/goals/${id}`)).json()).toEqual(snapshot);
});
