import { afterEach, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAgreement } from '../src/lib/goals/contracts';
import { openGoalRuntime } from '../src/lib/server/goals/runtime';
import { goalModel } from './fixtures/goal-model';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
});

async function setup(options: Parameters<typeof goalModel>[0] & {
  now?: () => number;
  globalDailyRequests?: number;
  phaseTimeoutMs?: number;
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'goals-deliverables-verify-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const model = await goalModel(options);
  cleanup.push(() => model.close());
  const open = async () => {
    const runtime = await openGoalRuntime({
      file: join(dir, 'goals.sqlite'),
      resolveEndpoint: () => model.endpoint,
      now: options.now,
      globalDailyRequests: options.globalDailyRequests,
      phaseTimeoutMs: options.phaseTimeoutMs,
    });
    cleanup.push(() => runtime.close());
    return runtime;
  };
  const runtime = await open();
  return { dir, model, runtime, open };
}

async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 10000): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('Condition not reached within timeout');
}

const multiInput = {
  text: '为本次版本发布准备三项独立文本交付：发布说明、150字以内更新介绍、基于实测记录的兼容性说明。',
  requestId: 'verify-multi-create',
  providerId: 'fixture',
  modelId: 'fixture',
  authorizeTextWork: true,
};

test('1-3. partial blocking, explicit answer attribution, deep-equal preservation of prior deliverables, 409 on succeeded item, and reopen persistence', async () => {
  const { runtime, model, open } = await setup({ deliverables: true });
  const { id } = await runtime.create(multiInput);

  // Wait for first two deliverables to succeed and third to wait with question
  const waiting = await until(
    () => runtime.snapshot(id),
    s =>
      s.deliverables.length === 3 &&
      s.deliverables.find(d => d.id === 'release-notes')?.state === 'succeeded' &&
      s.deliverables.find(d => d.id === 'short-summary')?.state === 'succeeded' &&
      s.deliverables.find(d => d.id === 'compat-notes')?.state === 'waiting' &&
      s.goal.questionDeliverableId === 'compat-notes' &&
      !!s.goal.question
  );

  expect(waiting.goal.lifecycle).toBe('active');
  expect(waiting.goal.agreement?.deliverables).toHaveLength(3);
  expect(model.calls.every(c => !c.body.tools?.length)).toBe(true);

  // Snapshot exact state of first two deliverables before answering third
  const releaseBefore = structuredClone(waiting.deliverables.find(d => d.id === 'release-notes')!);
  const summaryBefore = structuredClone(waiting.deliverables.find(d => d.id === 'short-summary')!);
  const releaseArtifactBefore = structuredClone(waiting.artifacts.find(a => a.id === releaseBefore.artifactId)!);
  const summaryArtifactBefore = structuredClone(waiting.artifacts.find(a => a.id === summaryBefore.artifactId)!);
  const priorResultsBefore = structuredClone(
    waiting.activity.filter(a => a.kind === 'result' && (a.deliverableId === 'release-notes' || a.deliverableId === 'short-summary'))
  );
  expect(releaseArtifactBefore.deliverableId).toBe('release-notes');
  expect(summaryArtifactBefore.deliverableId).toBe('short-summary');
  expect(priorResultsBefore).toHaveLength(2);

  // Answering an already succeeded deliverable must be rejected with 409 DELIVERABLE_COMPLETED
  await expect(
    runtime.control(id, {
      requestId: 'ans-completed',
      expectedRevision: waiting.goal.revision,
      action: 'answer',
      deliverableId: 'release-notes',
      text: 'Do not overwrite',
    })
  ).rejects.toMatchObject({ status: 409, code: 'DELIVERABLE_COMPLETED' });

  // Answering a non-existent deliverable must be rejected with 404 DELIVERABLE_NOT_FOUND
  await expect(
    runtime.control(id, {
      requestId: 'ans-missing-id',
      expectedRevision: waiting.goal.revision,
      action: 'answer',
      deliverableId: 'does-not-exist',
      text: 'Unknown item',
    })
  ).rejects.toMatchObject({ status: 404, code: 'DELIVERABLE_NOT_FOUND' });

  const callsBeforeAnswer = model.calls.length;
  const agreementBefore = structuredClone(waiting.goal.agreement);

  // Submit explicit deliverableId answer for third deliverable (and verify requestId idempotency)
  const answerCmd = {
    requestId: 'ans-compat-explicit',
    expectedRevision: waiting.goal.revision,
    action: 'answer' as const,
    deliverableId: 'compat-notes',
    text: 'macOS 15 + Node 24.7.0 实测通过，无破坏性变更。',
  };
  await runtime.control(id, answerCmd);
  // Duplicate requestId must be idempotent
  await runtime.control(id, answerCmd);
  // Conflicting payload with same requestId must fail with 409 REQUEST_CONFLICT
  await expect(
    runtime.control(id, { ...answerCmd, text: 'Different payload' })
  ).rejects.toMatchObject({ status: 409, code: 'REQUEST_CONFLICT' });

  const completed = await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed');

  // Agreement preserved (never cleared)
  expect(completed.goal.agreement).toEqual(agreementBefore);
  expect(completed.deliverables.every(d => d.state === 'succeeded')).toBe(true);

  // Strict deep-equal check (#6): first two deliverables' artifactId, content, evidence, and result activities unchanged
  const releaseAfter = completed.deliverables.find(d => d.id === 'release-notes')!;
  const summaryAfter = completed.deliverables.find(d => d.id === 'short-summary')!;
  expect(releaseAfter.artifactId).toBe(releaseBefore.artifactId);
  expect(summaryAfter.artifactId).toBe(summaryBefore.artifactId);
  expect(releaseAfter.evidence).toEqual(releaseBefore.evidence);
  expect(summaryAfter.evidence).toEqual(summaryBefore.evidence);
  expect(completed.artifacts.find(a => a.id === releaseAfter.artifactId)).toEqual(releaseArtifactBefore);
  expect(completed.artifacts.find(a => a.id === summaryAfter.artifactId)).toEqual(summaryArtifactBefore);

  const priorResultsAfter = completed.activity.filter(
    a => a.kind === 'result' && (a.deliverableId === 'release-notes' || a.deliverableId === 'short-summary')
  );
  expect(priorResultsAfter).toEqual(priorResultsBefore);
  expect(completed.activity.filter(a => a.kind === 'result')).toHaveLength(3);

  // Model calls after answering must ONLY target compat-notes (no duplicate work/verify for prior items)
  const postAnswerCalls = model.calls.slice(callsBeforeAnswer);
  expect(postAnswerCalls.map(c => `${c.purpose}:${c.deliverableId}`)).toEqual([
    'review:compat-notes',
    'work:compat-notes',
    'verify:compat-notes',
    'verify:null',
  ]);
  expect(model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'release-notes')).toHaveLength(1);
  expect(model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'short-summary')).toHaveLength(1);
  expect(model.calls.filter(c => c.purpose === 'verify' && c.deliverableId === 'release-notes')).toHaveLength(1);
  expect(model.calls.filter(c => c.purpose === 'verify' && c.deliverableId === 'short-summary')).toHaveLength(1);

  // Close and reopen: all three artifacts and evidence remain intact with zero new model calls
  const totalCalls = model.calls.length;
  await runtime.close();
  const reopened = await open();
  const persisted = await reopened.snapshot(id);
  expect(persisted.goal.lifecycle).toBe('completed');
  expect(persisted.artifacts).toEqual(completed.artifacts);
  expect(persisted.deliverables).toEqual(completed.deliverables);
  expect(model.calls).toHaveLength(totalCalls);
});

test('2. implicit answer (omitting deliverableId) auto-routes to questionDeliverableId and preserves prior deliverables', async () => {
  const { runtime, model } = await setup({ deliverables: true });
  const { id } = await runtime.create({ ...multiInput, requestId: 'verify-implicit' });

  const waiting = await until(
    () => runtime.snapshot(id),
    s => s.goal.questionDeliverableId === 'compat-notes' && s.deliverables.filter(d => d.state === 'succeeded').length === 2
  );
  const priorArtifacts = structuredClone(waiting.artifacts);
  const priorResults = structuredClone(waiting.activity.filter(a => a.kind === 'result'));
  const callsBefore = model.calls.length;

  // Omit deliverableId — should auto-route to compat-notes
  await runtime.control(id, {
    requestId: 'ans-implicit',
    expectedRevision: waiting.goal.revision,
    action: 'answer',
    text: 'Linux + Node 24 实测通过。',
  });

  const completed = await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed');
  expect(completed.artifacts.slice(0, 2)).toEqual(priorArtifacts);
  expect(completed.activity.filter(a => a.kind === 'result').slice(0, 2)).toEqual(priorResults);
  expect(completed.deliverables.find(d => d.id === 'compat-notes')?.clarifications).toEqual(['Linux + Node 24 实测通过。']);
  expect(model.calls.slice(callsBefore).filter(c => c.deliverableId).every(c => c.deliverableId === 'compat-notes')).toBe(true);
});

test('3-4. pause fences in-flight verify on a deliverable; resume reuses saved artifact without regenerating work and preserves prior item', async () => {
  const { runtime, model, open } = await setup({ deliverables: true });
  model.hold('verify:short-summary');
  const { id } = await runtime.create({ ...multiInput, requestId: 'verify-pause-resume' });

  // Wait until release-notes succeeded and short-summary is in verifying with saved artifact
  const verifying = await until(
    () => runtime.snapshot(id),
    s =>
      s.deliverables.find(d => d.id === 'release-notes')?.state === 'succeeded' &&
      s.deliverables.find(d => d.id === 'short-summary')?.state === 'verifying' &&
      !!s.deliverables.find(d => d.id === 'short-summary')?.artifactId
  );
  const releaseArtifactBefore = structuredClone(
    verifying.artifacts.find(a => a.deliverableId === 'release-notes')!
  );
  const summaryArtifactBefore = structuredClone(
    verifying.artifacts.find(a => a.deliverableId === 'short-summary')!
  );

  // Pause while verify:short-summary is in-flight
  await runtime.control(id, { requestId: 'pause-mid-verify', expectedRevision: verifying.goal.revision, action: 'pause' });
  model.release('verify:short-summary');

  const paused = await runtime.snapshot(id);
  expect(paused.goal.lifecycle).toBe('paused');
  expect(paused.deliverables.find(d => d.id === 'short-summary')?.state).toBe('verifying');
  expect(paused.activity.filter(a => a.kind === 'result')).toHaveLength(1);

  // Close & reopen while paused, then resume
  await runtime.close();
  const reopened = await open();
  const pausedAfterReopen = await reopened.snapshot(id);
  expect(pausedAfterReopen.goal.lifecycle).toBe('paused');
  await reopened.control(id, { requestId: 'resume-mid-verify', expectedRevision: pausedAfterReopen.goal.revision, action: 'resume' });

  const waiting = await until(
    () => reopened.snapshot(id),
    s =>
      s.deliverables.find(d => d.id === 'short-summary')?.state === 'succeeded' &&
      s.goal.questionDeliverableId === 'compat-notes'
  );

  // short-summary must NOT have been regenerated (work count === 1) and both artifacts match
  expect(model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'short-summary')).toHaveLength(1);
  expect(waiting.artifacts.find(a => a.id === releaseArtifactBefore.id)).toEqual(releaseArtifactBefore);
  expect(waiting.artifacts.find(a => a.id === summaryArtifactBefore.id)).toEqual(summaryArtifactBefore);
});

test('5. per-goal and global dailyRequests budgets persist across restart; auth/revoke/cancel enforced on deliverables', async () => {
  // Global budget = 4: interpret(1) + release-notes review(2), work(3), verify(4) -> exhausted before short-summary
  const { runtime, model, open } = await setup({ deliverables: true, globalDailyRequests: 4 });
  const { id } = await runtime.create({ ...multiInput, requestId: 'verify-budget' });

  const exhausted = await until(
    () => runtime.snapshot(id),
    s => s.goal.waiting === 'Daily model budget exhausted'
  );
  expect(model.calls).toHaveLength(4);
  expect(exhausted.deliverables.find(d => d.id === 'release-notes')?.state).toBe('succeeded');

  // Reopen must keep budget exhausted and not make new calls
  await runtime.close();
  const reopened = await open();
  const afterReopen = await reopened.snapshot(id);
  expect(afterReopen.goal.waiting).toBe('Daily model budget exhausted');
  expect(model.calls).toHaveLength(4);

  // Per-goal budget = 2 on another goal with sufficient global budget
  const { runtime: rt2, model: m2 } = await setup({ deliverables: true, globalDailyRequests: 50 });
  const g2 = await rt2.create({ ...multiInput, requestId: 'verify-per-goal-budget', dailyRequests: 2 });
  await until(() => rt2.snapshot(g2.id), s => s.goal.waiting === 'Daily model budget exhausted');
  expect(m2.calls).toHaveLength(2);

  // Draft -> authorize -> revoke -> cancel lifecycle
  const g3 = await rt2.create({ ...multiInput, requestId: 'verify-auth', authorizeTextWork: false });
  const draft = await rt2.snapshot(g3.id);
  expect(draft.goal.lifecycle).toBe('draft');
  await rt2.control(g3.id, { requestId: 'revoke-g3', expectedRevision: draft.goal.revision, action: 'revoke' });
  const revoked = await rt2.snapshot(g3.id);
  expect(revoked.goal.authorized).toBe(false);
  await rt2.control(g3.id, { requestId: 'cancel-g3', expectedRevision: revoked.goal.revision, action: 'cancel' });
  expect((await rt2.snapshot(g3.id)).goal.lifecycle).toBe('cancelled');
});

test('6. contract boundaries and legacy once/weekly/maintain compatibility', async () => {
  const validSpec = (n: number) => ({
    id: `item-${n}`,
    title: `Item ${n}`,
    criteria: [`Criterion ${n}`],
    missing: [],
  });

  // >5 deliverables rejected
  expect(() =>
    parseAgreement({
      objective: 'Too many deliverables',
      criteria: ['Done'],
      mode: 'once',
      schedule: null,
      missing: [],
      deliverables: [1, 2, 3, 4, 5, 6].map(validSpec),
    })
  ).toThrow();

  // Duplicate deliverable IDs rejected
  expect(() =>
    parseAgreement({
      objective: 'Duplicate ids',
      criteria: ['Done'],
      mode: 'once',
      schedule: null,
      missing: [],
      deliverables: [validSpec(1), validSpec(1)],
    })
  ).toThrow();

  // Non-once modes (weekly / maintain) with deliverables rejected
  expect(() =>
    parseAgreement({
      objective: 'Weekly with deliverables',
      criteria: ['Done'],
      mode: 'weekly',
      schedule: { timezone: 'Europe/Dublin', weekdays: [5], startLocalTime: '09:00', dueLocalTime: '12:00', endDate: null },
      missing: [],
      deliverables: [validSpec(1)],
    })
  ).toThrow();
  expect(() =>
    parseAgreement({
      objective: 'Maintain with deliverables',
      criteria: ['Done'],
      mode: 'maintain',
      schedule: null,
      missing: [],
      deliverables: [validSpec(1)],
    })
  ).toThrow();

  // Legacy single-output once goal still returns deliverables: [] and completes cleanly
  const { runtime } = await setup();
  const { id } = await runtime.create({
    text: 'Write an introduction from supplied facts',
    requestId: 'verify-legacy-once',
    providerId: 'fixture',
    modelId: 'fixture',
    authorizeTextWork: true,
  });
  const legacyDone = await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed');
  expect(legacyDone.deliverables).toEqual([]);
  expect(legacyDone.artifacts).toHaveLength(1);
});


test('ambiguous unscoped answers cannot reinterpret or erase accepted deliveries', async () => {
  const { runtime } = await setup({ deliverables: true, deliverableAskId: 'release-notes' });
  const { id } = await runtime.create(multiInput);
  const waiting = await until(() => runtime.snapshot(id), s => !!s.goal.question && s.deliverables.some(d => d.state === 'succeeded'));
  await runtime.control(id, { requestId: 'pause-ambiguous', expectedRevision: waiting.goal.revision, action: 'pause' });
  const paused = await runtime.snapshot(id);
  await runtime.control(id, { requestId: 'clear-goal-question', expectedRevision: paused.goal.revision, action: 'review' });
  const before = await runtime.snapshot(id);
  await expect(runtime.control(id, { requestId: 'ambiguous', expectedRevision: before.goal.revision, action: 'answer', text: 'Unscoped answer' })).rejects.toMatchObject({ status: 409, code: 'DELIVERABLE_REQUIRED' });
  expect(await runtime.snapshot(id)).toEqual(before);
});

test('manual review and durable timed waits reconsider waiting items without repeating accepted work', async () => {
  let clock = Date.now();
  const { runtime, model, open } = await setup({ deliverables: true, deliverableWaitOnceId: 'release-notes', now: () => clock });
  const { id } = await runtime.create(multiInput);
  const waiting = await until(() => runtime.snapshot(id), s => !!s.goal.nextReviewAt && s.deliverables.find(d => d.id === 'short-summary')?.state === 'succeeded');
  expect(waiting.goal.nextReviewAt).toBe(clock + 60000);
  expect(waiting.activity.filter(a => a.kind === 'question' && a.deliverableId === 'release-notes')).toHaveLength(0);
  const prior = structuredClone(waiting.artifacts);
  await runtime.close(); clock += 60001;
  const reopened = await open();
  const reviewed = await until(() => reopened.snapshot(id), s => s.deliverables.find(d => d.id === 'release-notes')?.state === 'succeeded');
  expect(reviewed.artifacts.slice(0, prior.length)).toEqual(prior);
  const callsBefore = model.calls.length;
  await reopened.control(id, { requestId: 'manual-review-waiting', expectedRevision: reviewed.goal.revision, action: 'review' });
  await until(() => reopened.snapshot(id), () => model.calls.length > callsBefore);
  expect(model.calls.slice(callsBefore).some(c => c.purpose === 'review' && c.deliverableId === 'compat-notes')).toBe(true);
  expect(model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'short-summary')).toHaveLength(1);
});

test('successful items cannot complete a Goal before overall agreement verification succeeds', async () => {
  const { runtime, model } = await setup({ deliverables: true, rejectAggregate: true });
  const { id } = await runtime.create(multiInput);
  const waiting = await until(() => runtime.snapshot(id), s => s.goal.questionDeliverableId === 'compat-notes');
  await runtime.control(id, { requestId: 'aggregate-answer', expectedRevision: waiting.goal.revision, action: 'answer', deliverableId: 'compat-notes', text: 'macOS tested' });
  const result = await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed' || (s.deliverables.every(d => d.state === 'succeeded') && !!s.goal.question));
  expect(result.goal.lifecycle).toBe('active');
  expect(result.goal.question).toContain('Cross-document requirement');
  expect(model.calls.some(c => c.purpose === 'verify' && !c.deliverableId)).toBe(true);
  expect(result.activity.filter(a => a.kind === 'result')).toHaveLength(3);
  const prior = structuredClone(result.deliverables);
  const artifacts = structuredClone(result.artifacts);
  const calls = model.calls.length;
  await runtime.control(id, { requestId: 'aggregate-clarification', expectedRevision: result.goal.revision, action: 'answer', text: 'Additional overall acceptance context' });
  const retried = await until(() => runtime.snapshot(id), s => !!s.goal.question && model.calls.length > calls);
  expect(retried.deliverables).toEqual(prior);
  expect(retried.artifacts).toEqual(artifacts);
  expect(retried.goal.lifecycle).toBe('active');
  const supplied = JSON.parse(model.calls.at(-1)!.body.messages.find((m: any) => m.role === 'user').content);
  expect(supplied.acceptanceClarifications).toEqual(['Additional overall acceptance context']);
  expect(model.calls.slice(calls).map(c => c.purpose)).toEqual(['verify']);
});
