import { afterEach, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGoalRuntime } from '../src/lib/server/goals/runtime';
import { goalModel } from './fixtures/goal-model';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
async function setup(options: { reject?: boolean; weekly?: boolean; missing?: boolean; maintain?: boolean; unresolvedWeekly?: boolean; collapsedWindow?: boolean; prepareUnscheduled?: boolean; deliverables?: boolean; deliverableAskId?: string; deliverableRejectId?: string; deliverableNeedsUserId?: string; deliverableBadVerify?: { id: string; mode: 'criterion-mismatch' | 'evidence-mismatch' }; now?: () => number; phaseTimeoutMs?: number; globalDailyRequests?: number; retrospectMinutes?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'goals-test-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const model = await goalModel(options); cleanup.push(() => model.close());
  const open = async () => {
    const runtime = await openGoalRuntime({ file: join(dir, 'goals.sqlite'), resolveEndpoint: () => model.endpoint, now: options.now, phaseTimeoutMs: options.phaseTimeoutMs, globalDailyRequests: options.globalDailyRequests, retrospectMinutes: options.retrospectMinutes });
    cleanup.push(() => runtime.close()); return runtime;
  };
  const runtime = await open();
  return { model, runtime, open, dir };
}
const input = { text: 'Write an introduction: background is a goal-driven assistant; uses are durable text work.', requestId: 'create', providerId: 'fixture', modelId: 'fixture', authorizeTextWork: true };
async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const end = Date.now() + 10000;
  while (Date.now() < end) { const value = await read(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 20)); }
  throw new Error('Goal did not reach expected state');
}
test('once goal produces saved content and separate evidence before completion; retries and reopen retain identity', async () => {
  const { runtime, model, open } = await setup();
  const created = await runtime.create(input);
  expect(await runtime.create(input)).toEqual(created);
  await expect(runtime.create({ ...input, text: 'Changed' })).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
  const done = await until(() => runtime.snapshot(created.id), s => s.goal.lifecycle === 'completed');
  expect(done.artifacts[0].content).toContain('## Background');
  expect(done.occurrences[0].evidence.length).toBeGreaterThan(0);
  expect(done.activity.filter(a => a.kind === 'result')).toHaveLength(1);
  expect(model.calls.map(c => c.purpose)).toEqual(['interpret', 'review', 'work', 'verify']);
  expect(model.calls.every(c => !c.body.tools?.length)).toBe(true);
  await runtime.close(); const reopened = await open();
  expect(await reopened.create(input)).toEqual(created);
  expect((await reopened.snapshot(created.id)).artifacts).toEqual(done.artifacts);
  expect(model.calls).toHaveLength(4);
});
test('no authorization means draft; explicit standing authorization enables work and ordinary answers never grant it', async () => {
  const { runtime, model } = await setup();
  const created = await runtime.create({ ...input, authorizeTextWork: false });
  const draft = await runtime.snapshot(created.id);
  expect(draft.goal.lifecycle).toBe('draft'); expect(model.calls).toHaveLength(0);
  await runtime.control(created.id, { requestId: 'answer', expectedRevision: draft.goal.revision, action: 'answer', text: 'Yes' });
  expect((await runtime.snapshot(created.id)).goal.authorized).toBe(false);
  await runtime.control(created.id, { requestId: 'grant', expectedRevision: draft.goal.revision + 1, action: 'authorize' });
  await until(() => runtime.snapshot(created.id), s => s.goal.lifecycle === 'completed');
});
test('pause fences an in-flight result; resume keeps saved artifact and does not regenerate it', async () => {
  const { runtime, model } = await setup(); model.hold('verify');
  const { id } = await runtime.create(input);
  const verifying = await until(() => runtime.snapshot(id), s => s.artifacts.length === 1);
  const command = { requestId: 'pause', expectedRevision: verifying.goal.revision, action: 'pause' as const };
  await runtime.control(id, command); await runtime.control(id, command);
  model.release('verify');
  expect((await runtime.snapshot(id)).goal.lifecycle).toBe('paused');
  expect((await runtime.snapshot(id)).activity.filter(a => a.kind === 'result')).toHaveLength(0);
  const paused = await runtime.snapshot(id);
  await runtime.control(id, { requestId: 'resume', expectedRevision: paused.goal.revision, action: 'resume' });
  const done = await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed');
  expect(done.artifacts).toHaveLength(1);
  expect(model.calls.filter(c => c.purpose === 'work')).toHaveLength(1);
});
test('rejected verification never produces success and revisions stop at the bound', async () => {
  const { runtime } = await setup({ reject: true });
  const { id } = await runtime.create(input);
  const blocked = await until(() => runtime.snapshot(id), s => !!s.goal.question && s.artifacts.length > 0);
  expect(blocked.goal.lifecycle).toBe('active');
  expect(blocked.occurrences[0].state).toBe('waiting');
  expect(blocked.activity.filter(a => a.kind === 'result')).toHaveLength(0);
  expect(blocked.artifacts).toHaveLength(3);
});
test('missing live capability asks concretely without claiming delivery', async () => {
  const { runtime } = await setup({ missing: true });
  const { id } = await runtime.create(input);
  const blocked = await until(() => runtime.snapshot(id), s => s.goal.question?.includes('current evidence') === true);
  expect(blocked.goal.lifecycle).toBe('active');
  expect(blocked.artifacts).toHaveLength(0);
});

test('Friday work and retrospect survive reopen; each completed period leaves weekly Goal active', async () => {
  let clock = Date.parse('2026-11-27T08:00Z');
  const { runtime, model, open } = await setup({ weekly: true, now: () => clock });
  const { id } = await runtime.create(input);
  const waiting = await until(() => runtime.snapshot(id), s => s.goal.waiting === 'Waiting for the next delivery window');
  expect(waiting.artifacts).toHaveLength(0);
  await runtime.close(); clock = Date.parse('2026-11-27T09:00Z');
  const friday = await open();
  const first = await until(() => friday.snapshot(id), s => s.activity.some(a => a.kind === 'result'));
  expect(first.goal.lifecycle).toBe('active');
  expect(first.occurrences[0].key).toBe(`${id}:1:2026-11-27`);
  expect(first.occurrences[0].dueAt).toBe(Date.parse('2026-11-27T12:00Z'));
  await friday.close(); clock = Date.parse('2026-12-04T09:00Z');
  const next = await open();
  const second = await until(() => next.snapshot(id), s => s.activity.filter(a => a.kind === 'result').length === 2);
  expect(second.goal.lifecycle).toBe('active'); expect(second.artifacts).toHaveLength(2);
  expect(second.occurrences[1].key).toBe(`${id}:1:2026-12-04`);
  expect(second.activity.some(a => a.kind === 'retrospect' && a.evidence.length)).toBe(true);
  expect(model.calls.filter(c => c.purpose === 'work')).toHaveLength(2);
});
test('persistent per-goal and global reservations stop model attempts across restart', async () => {
  const { runtime, model, open } = await setup({ globalDailyRequests: 2 });
  const { id } = await runtime.create(input);
  await until(() => runtime.snapshot(id), s => s.goal.waiting === 'Daily model budget exhausted');
  expect(model.calls).toHaveLength(2);
  await runtime.close(); const reopened = await open();
  expect((await reopened.snapshot(id)).artifacts).toHaveLength(0);
  expect(model.calls).toHaveLength(2);
});
test('independent authorized work advances while another Goal lacks authorization or information', async () => {
  const { runtime } = await setup();
  await runtime.create({ ...input, requestId: 'blocked', authorizeTextWork: false });
  const { id } = await runtime.create(input);
  expect((await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed')).artifacts).toHaveLength(1);
});
test('hard phase deadline cancels a held provider request and exposes a concrete failure', async () => {
  const { runtime, model } = await setup({ phaseTimeoutMs: 100 }); model.hold('work');
  const { id } = await runtime.create(input);
  const blocked = await until(() => runtime.snapshot(id), s => !!s.goal.question);
  expect(blocked.artifacts).toHaveLength(0);
  expect(model.calls.filter(c => c.purpose === 'work').length).toBeLessThanOrEqual(2);
});

test('answer resolves missing calendar information through constrained interpretation without granting tools', async () => {
  const clock = Date.parse('2026-11-27T08:00Z');
  const { runtime, model } = await setup({ unresolvedWeekly: true, now: () => clock });
  const { id } = await runtime.create(input);
  const waiting = await until(() => runtime.snapshot(id), s => s.goal.question?.includes('timezone') === true);
  expect(waiting.goal.agreement?.schedule).toBeNull();
  model.hold('review');
  await runtime.control(id, { requestId: 'clarify', expectedRevision: waiting.goal.revision, action: 'answer', text: 'Europe/Dublin, Friday preparation 09:00, delivery 12:00.' });
  const interpreted = await until(() => runtime.snapshot(id), s => s.goal.agreement?.schedule?.timezone === 'Europe/Dublin' && !s.goal.question);
  expect(interpreted.goal.nextReviewAt).toBe(clock); // Interpreted is not yet scheduled.
  model.release('review');
  const scheduled = await until(() => runtime.snapshot(id), s => s.goal.agreement?.schedule?.timezone === 'Europe/Dublin' && s.goal.waiting === 'Waiting for the next delivery window');
  expect(scheduled.goal.nextReviewAt).toBe(Date.parse('2026-11-27T09:00Z'));
  expect(scheduled.goal.authorized).toBe(true);
  expect(model.calls.filter(c => c.purpose === 'interpret')).toHaveLength(2);
});
test('revocation fences old work while other Goals continue and subsequent resume cannot regrant', async () => {
  const { runtime, model } = await setup(); model.hold('work');
  const { id } = await runtime.create(input);
  const running = await until(() => runtime.snapshot(id), s => s.activity.some(a => a.kind === 'review'));
  await runtime.control(id, { requestId: 'revoke', expectedRevision: running.goal.revision, action: 'revoke' });
  model.release('work');
  const revoked = await runtime.snapshot(id);
  await runtime.control(id, { requestId: 'resume', expectedRevision: revoked.goal.revision, action: 'resume' });
  const other = await runtime.create({ ...input, requestId: 'other' });
  await until(() => runtime.snapshot(other.id), s => s.goal.lifecycle === 'completed');
  expect((await runtime.snapshot(id)).goal.authorized).toBe(false);
  expect((await runtime.snapshot(id)).artifacts).toHaveLength(0);
});

test('an unanswered missing-capability question retains a durable review without repeating notifications', async () => {
  let clock = Date.parse('2026-11-24T08:00Z');
  const { runtime, model, open } = await setup({ missing: true, now: () => clock });
  const { id } = await runtime.create(input);
  const first = await until(() => runtime.snapshot(id), s => !!s.goal.question);
  expect(first.goal.nextReviewAt).toBeGreaterThan(clock);
  await runtime.close(); clock += 86400000;
  const reopened = await open();
  await until(() => reopened.snapshot(id), s => s.activity.filter(a => a.kind === 'review').length === 2);
  const second = await reopened.snapshot(id);
  expect(second.goal.lifecycle).toBe('active');
  expect(second.activity.filter(a => a.kind === 'question')).toHaveLength(1);
  expect(model.calls.filter(c => c.purpose === 'review')).toHaveLength(2);
});
test('a collapsed DST window stays an explicit decision after the date passes instead of skipping silently', async () => {
  let clock = Date.parse('2027-03-28T00:00Z');
  const { runtime, open } = await setup({ collapsedWindow: true, now: () => clock });
  const { id } = await runtime.create(input);
  await until(() => runtime.snapshot(id), s => s.goal.question?.includes('DST') === true);
  await runtime.close(); clock += 86400000;
  const reopened = await open();
  const again = await until(() => reopened.snapshot(id), s => s.activity.filter(a => a.kind === 'review').length === 2);
  expect(again.goal.question).toContain('DST'); expect(again.occurrences).toHaveLength(0);
  expect(again.activity.filter(a => a.kind === 'question')).toHaveLength(1);
  expect(again.goal.lifecycle).toBe('active');
});

test('completed preparation stays succeeded while missing weekly scheduling is reviewed without duplicate results', async () => {
  let clock = Date.parse('2026-11-24T08:00Z');
  const { runtime, open } = await setup({ unresolvedWeekly: true, prepareUnscheduled: true, now: () => clock });
  const { id } = await runtime.create(input);
  const prepared = await until(() => runtime.snapshot(id), s => s.artifacts.length === 1 && !!s.goal.question);
  expect(prepared.occurrences[0].state).toBe('succeeded');
  let current = runtime;
  for (let n = 0; n < 2; n++) {
    await current.close(); clock += 86400000; current = await open();
    await until(() => current.snapshot(id), s => s.goal.nextReviewAt! > clock);
    const saved = await current.snapshot(id);
    expect(saved.artifacts).toHaveLength(1);
    expect(saved.occurrences).toHaveLength(1);
    expect(saved.occurrences[0].state).toBe('succeeded');
    expect(saved.activity.filter(a => a.kind === 'result')).toHaveLength(1);
    expect(saved.activity.filter(a => a.kind === 'question')).toHaveLength(1);
  }
});

test('multi-deliverable once goal completes ready items, blocks on missing item, and answering preserves prior accepted deliverables identically', async () => {
  const { runtime, model } = await setup({ deliverables: true });
  const { id } = await runtime.create({ ...input, text: '准备发布说明、150字以内更新介绍和基于实测记录的兼容性说明' });
  const blocked = await until(() => runtime.snapshot(id), s => s.goal.questionDeliverableId === 'compat-notes' && !!s.goal.question);
  expect(blocked.goal.lifecycle).toBe('active');
  expect(blocked.deliverables.map(d => [d.id, d.state])).toEqual([
    ['release-notes', 'succeeded'],
    ['short-summary', 'succeeded'],
    ['compat-notes', 'waiting'],
  ]);
  expect(blocked.artifacts).toHaveLength(2);
  expect(blocked.artifacts.map(a => a.deliverableId)).toEqual(['release-notes', 'short-summary']);

  // Answering an already succeeded deliverable must be rejected with 409 DELIVERABLE_COMPLETED
  await expect(runtime.control(id, {
    requestId: 'ans-completed', expectedRevision: blocked.goal.revision,
    action: 'answer', deliverableId: 'release-notes', text: 'Do not redo',
  })).rejects.toMatchObject({ status: 409, code: 'DELIVERABLE_COMPLETED' });

  // Capture immutable snapshots of first two deliverables before answering the 3rd
  const firstTwoDeliverablesBefore = structuredClone(blocked.deliverables.slice(0, 2));
  const firstTwoArtifactsBefore = structuredClone(blocked.artifacts);
  const firstTwoResultsBefore = structuredClone(blocked.activity.filter(a => a.kind === 'result'));
  const callsBeforeAnswer = model.calls.length;
  expect(firstTwoResultsBefore.map(a => a.deliverableId)).toEqual(['release-notes', 'short-summary']);

  // Supply missing test records for the 3rd deliverable
  await runtime.control(id, {
    requestId: 'ans-compat', expectedRevision: blocked.goal.revision,
    action: 'answer', deliverableId: 'compat-notes', text: '实测环境：macOS 15 + Node 24.7，历史 SQLite 升级通过。',
  });
  const done = await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed');
  expect(done.deliverables.map(d => [d.id, d.state])).toEqual([
    ['release-notes', 'succeeded'],
    ['short-summary', 'succeeded'],
    ['compat-notes', 'succeeded'],
  ]);
  expect(done.artifacts).toHaveLength(4);
  const compatArtifact = done.artifacts.find(a => a.deliverableId === 'compat-notes');
  expect(compatArtifact?.content).toContain('macOS 15 + Node 24.7');

  // Strict immutability assertions: prior accepted deliverables, artifacts, and result activities are completely unchanged
  expect(done.deliverables.slice(0, 2)).toEqual(firstTwoDeliverablesBefore);
  expect(done.artifacts.filter(a => a.deliverableId && a.deliverableId !== 'compat-notes')).toEqual(firstTwoArtifactsBefore);
  expect(done.activity.filter(a => a.kind === 'result' && a.deliverableId !== 'compat-notes')).toEqual(firstTwoResultsBefore);
  expect(done.activity.filter(a => a.kind === 'result')).toHaveLength(3);

  // Model calls after answering only targeted compat-notes (no interpret, no work/verify for release-notes or short-summary)
  const callsAfterAnswer = model.calls.slice(callsBeforeAnswer);
  expect(callsAfterAnswer.map(c => c.purpose)).toEqual(['review', 'work', 'verify', 'verify']);
  expect(callsAfterAnswer.slice(0, 3).every(c => c.deliverableId === 'compat-notes')).toBe(true);
  expect(callsAfterAnswer[3].deliverableId).toBeNull();
});

test('answer without deliverableId auto-routes to waiting deliverable and preserves prior accepted results', async () => {
  const { runtime, model } = await setup({ deliverables: true });
  const { id } = await runtime.create(input);
  const blocked = await until(() => runtime.snapshot(id), s => s.goal.questionDeliverableId === 'compat-notes');
  const priorArtifacts = structuredClone(blocked.artifacts);
  const callsBefore = model.calls.length;

  await runtime.control(id, {
    requestId: 'implicit-answer', expectedRevision: blocked.goal.revision,
    action: 'answer', text: '实测记录：Ubuntu 24.04 + Node 24 回归全绿。',
  });
  const done = await until(() => runtime.snapshot(id), s => s.goal.lifecycle === 'completed');
  expect(done.artifacts.slice(0, 2)).toEqual(priorArtifacts);
  expect(done.artifacts[2].deliverableId).toBe('compat-notes');
  expect(done.artifacts[2].content).toContain('Ubuntu 24.04');
  expect(model.calls.slice(callsBefore).filter(c => c.deliverableId).every(c => c.deliverableId === 'compat-notes')).toBe(true);
});

test('single deliverable blocked by review ask or verify needsUser still lets other ready deliverables finish', async () => {
  const { runtime } = await setup({ deliverables: true, deliverableAskId: 'release-notes' });
  const { id } = await runtime.create(input);
  const blocked = await until(() => runtime.snapshot(id), s => !!s.goal.question && s.deliverables.some(d => d.id === 'short-summary' && d.state === 'succeeded'));
  expect(blocked.goal.lifecycle).toBe('active');
  expect(blocked.deliverables.find(d => d.id === 'release-notes')?.state).toBe('waiting');
  expect(blocked.deliverables.find(d => d.id === 'short-summary')?.state).toBe('succeeded');
  expect(blocked.deliverables.find(d => d.id === 'compat-notes')?.state).toBe('waiting');
  expect(blocked.goal.questionDeliverableId).toBe('release-notes');

  const second = await setup({ deliverables: true, deliverableNeedsUserId: 'release-notes' });
  const { id: id2 } = await second.runtime.create(input);
  const blocked2 = await until(() => second.runtime.snapshot(id2), s => !!s.goal.question && s.deliverables.some(d => d.id === 'short-summary' && d.state === 'succeeded'));
  expect(blocked2.deliverables.find(d => d.id === 'release-notes')?.state).toBe('waiting');
  expect(blocked2.deliverables.find(d => d.id === 'short-summary')?.state).toBe('succeeded');
});

test('pause and resume during deliverable verify resumes verification without regenerating work', async () => {
  const { runtime, model } = await setup({ deliverables: true });
  model.hold('verify:release-notes');
  const { id } = await runtime.create(input);
  const verifying = await until(() => runtime.snapshot(id), s => s.deliverables.find(d => d.id === 'release-notes')?.state === 'verifying');
  await runtime.control(id, { requestId: 'pause-d', expectedRevision: verifying.goal.revision, action: 'pause' });
  model.release('verify:release-notes');
  const paused = await runtime.snapshot(id);
  expect(paused.goal.lifecycle).toBe('paused');
  expect(paused.deliverables.find(d => d.id === 'release-notes')?.state).toBe('verifying');
  await runtime.control(id, { requestId: 'resume-d', expectedRevision: paused.goal.revision, action: 'resume' });
  const waiting = await until(() => runtime.snapshot(id), s => s.goal.questionDeliverableId === 'compat-notes');
  expect(waiting.deliverables.find(d => d.id === 'release-notes')?.state).toBe('succeeded');
  expect(waiting.deliverables.find(d => d.id === 'short-summary')?.state).toBe('succeeded');
  expect(model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'release-notes')).toHaveLength(1);
});

for (const [mode, expectedDiag] of [
  ['criterion-mismatch', 'missing exact criterion'],
  ['evidence-mismatch', 'not a literal contiguous substring'],
] as const) {
  test(`contradictory verify output (${mode}) is strictly rejected and exposes programmatic reason in activity, revision plan, and waiting question`, async () => {
    const { runtime, model } = await setup({ deliverables: true, deliverableBadVerify: { id: 'compat-notes', mode } });
    const { id } = await runtime.create({ ...input, dailyRequests: 20 });
    const waitingMissing = await until(() => runtime.snapshot(id), s => s.goal.questionDeliverableId === 'compat-notes');
    await runtime.control(id, {
      requestId: `ans-${mode}`, expectedRevision: waitingMissing.goal.revision,
      action: 'answer', deliverableId: 'compat-notes', text: 'macOS 15 + Node 24 实测通过',
    });
    const blocked = await until(
      () => runtime.snapshot(id),
      s => s.goal.questionDeliverableId === 'compat-notes' && (s.deliverables.find(d => d.id === 'compat-notes')?.revisions ?? 0) === 2 && s.deliverables.find(d => d.id === 'compat-notes')?.state === 'waiting',
    );
    expect(blocked.goal.lifecycle).toBe('active');
    const compat = blocked.deliverables.find(d => d.id === 'compat-notes')!;
    expect(compat.state).toBe('waiting');
    expect(blocked.activity.filter(a => a.kind === 'result' && a.deliverableId === 'compat-notes')).toHaveLength(0);

    // Verification activities record the programmatic rejection reason
    const verifications = blocked.activity.filter(a => a.kind === 'verification' && a.deliverableId === 'compat-notes');
    expect(verifications).toHaveLength(3);
    expect(verifications.every(a => a.summary.includes('Strict verification check failed') && a.summary.includes(expectedDiag))).toBe(true);

    // Retry work prompts received the programmatic failure reason in plan
    const compatWorks = model.calls.filter(c => c.purpose === 'work' && c.deliverableId === 'compat-notes');
    expect(compatWorks).toHaveLength(3);
    const retryPrompt = JSON.parse(compatWorks[1].body.messages.find((m: any) => m.role === 'user').content);
    expect(retryPrompt.plan).toContain('Strict verification check failed');
    expect(retryPrompt.plan).toContain(expectedDiag);

    // Waiting question exposes the real programmatic rejection reason instead of only the misleading model claim
    expect(compat.question).toContain('Strict verification check failed');
    expect(compat.question).toContain(expectedDiag);
    expect(blocked.goal.question).toContain(expectedDiag);
  });
}


test('multi-deliverable waits wake for due retrospect without changing accepted work', async () => {
  let clock = Date.now();
  const { runtime, open } = await setup({ deliverables: true, now: () => clock, retrospectMinutes: 1 });
  const { id } = await runtime.create(input);
  const waiting = await until(() => runtime.snapshot(id), s => !!s.goal.questionDeliverableId);
  expect(waiting.goal.nextReviewAt).toBe(clock + 60000);
  await runtime.close(); clock += 60001;
  const reopened = await open();
  const reviewed = await until(() => reopened.snapshot(id), s => s.activity.some(a => a.kind === 'retrospect'));
  const retro = reviewed.activity.find(a => a.kind === 'retrospect')!;
  expect(retro.evidence.length).toBeGreaterThan(0);
  expect(retro.evidence.every(id => waiting.activity.some(a => a.id === id && ['work', 'verification', 'result', 'failure'].includes(a.kind)))).toBe(true);
  expect(reviewed.goal.retrospectCursor).toBeGreaterThan(waiting.goal.retrospectCursor);
  expect(reviewed.artifacts).toEqual(waiting.artifacts);
  expect(reviewed.deliverables).toEqual(waiting.deliverables);
  await reopened.close();
  // Once all recorded work is covered, empty retrospective intervals still sleep.
  for (let interval = 0; interval < 2; interval++) {
    clock += 60001;
    const idle = await open();
    const sleeping = await until(() => idle.snapshot(id), s => s.goal.nextReviewAt !== null && s.goal.nextReviewAt > clock);
    expect(sleeping.activity.filter(a => a.kind === 'retrospect')).toHaveLength(1);
    expect(sleeping.artifacts).toEqual(waiting.artifacts);
    await idle.close();
  }
});

test('manual review does not bypass overdue retrospect for multi-deliverable work', async () => {
  let clock = Date.now();
  const { runtime, model, open } = await setup({ deliverables: true, now: () => clock, retrospectMinutes: 1 });
  const { id } = await runtime.create(input);
  await until(() => runtime.snapshot(id), s => !!s.goal.questionDeliverableId);
  await runtime.close(); clock += 120000;
  const reopened = await open();
  const snapshot = await reopened.snapshot(id);
  await reopened.control(id, { requestId: 'review-due-retrospect', expectedRevision: snapshot.goal.revision, action: 'review' });
  await until(() => reopened.snapshot(id), s => !!s.goal.question && model.calls.filter(c => c.purpose === 'review').length >= 3);
  expect(model.calls.some(c => c.purpose === 'retrospect')).toBe(true);
});

test('unchanged blocked deliverables do not repeat questions across durable reviews', async () => {
  let clock = Date.now();
  const { runtime, open } = await setup({ deliverables: true, deliverableAskId: 'release-notes', now: () => clock });
  const { id } = await runtime.create(input);
  const waiting = await until(() => runtime.snapshot(id), s => !!s.goal.questionDeliverableId);
  const initialQuestions = waiting.activity.filter(a => a.kind === 'question');
  expect(initialQuestions).toHaveLength(1);
  await runtime.close();
  for (let day = 0; day < 2; day++) {
    clock += 86400001;
    const reopened = await open();
    const reviewed = await until(() => reopened.snapshot(id), s => s.goal.nextReviewAt !== null && s.goal.nextReviewAt > clock);
    expect(reviewed.activity.filter(a => a.kind === 'question')).toEqual(initialQuestions);
    expect(reviewed.artifacts).toEqual(waiting.artifacts);
    await reopened.close();
  }
});


test('manual review preserves a delivered question from documents without per-item delivery state', async () => {
  const { runtime, open, dir } = await setup({ deliverables: true, deliverableAskId: 'release-notes' });
  const { id } = await runtime.create(input);
  const waiting = await until(() => runtime.snapshot(id), s => !!s.goal.questionDeliverableId);
  const questions = waiting.activity.filter(a => a.kind === 'question');
  await runtime.close();
  // Reproduce the persisted shape used before deliveredQuestion was introduced.
  const storage = await openNodeSqliteStorage(join(dir, 'goals.sqlite'));
  try {
    const record = await storage.findDocument({ kind: 'app.goal-deliverable', scope: { kind: 'session' }, key: `${id}:deliverable:${waiting.goal.questionDeliverableId}` }, 'current', context);
    const doc = (await storage.document(record!.id, 'current', context))!;
    const value = structuredClone(doc.value);
    delete (value.value as Record<string, unknown>).deliveredQuestion;
    await storage.commit([[{ type: 'document.change', id: record!.id, content: { kind: 'base', version: doc.version, value } }]], () => {}, context);
  } finally { await storage.close(context); }
  const reopened = await open();
  const before = await reopened.snapshot(id);
  expect(before.deliverables.find(d => d.id === waiting.goal.questionDeliverableId)).not.toHaveProperty('deliveredQuestion');
  await reopened.control(id, { requestId: 'review-older-question', expectedRevision: before.goal.revision, action: 'review' });
  const reviewed = await until(() => reopened.snapshot(id), s => !!s.goal.question && s.goal.nextReviewAt !== null && s.goal.nextReviewAt > Date.now());
  expect(reviewed.activity.filter(a => a.kind === 'question')).toEqual(questions);
  await reopened.close();
  const persisted = await open();
  expect((await persisted.snapshot(id)).activity.filter(a => a.kind === 'question')).toEqual(questions);
});
