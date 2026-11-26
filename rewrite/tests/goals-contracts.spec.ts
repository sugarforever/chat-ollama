import { expect, test } from 'vitest';
import { parseAgreement, parseGoalInput } from '../src/lib/goals/contracts';
import { nextWindow, ScheduleConflict } from '../src/lib/server/goals/schedule';

test('text-only goals require no URL and model interpretation cannot grant tools', () => {
  expect(parseGoalInput({ text: 'Write an introduction', providerId: 'legacy', modelId: 'fixture', requestId: 'one' }).text).toBe('Write an introduction');
  expect(() => parseAgreement({ objective: 'Publish', criteria: ['Posted'], mode: 'once', schedule: null, missing: [], grants: ['bash'] })).toThrow();
});
test('weekly delivery follows Dublin local time across DST with stable period identity', () => {
  const schedule = { timezone: 'Europe/Dublin', weekdays: [5], startLocalTime: '09:00', dueLocalTime: '12:00', endDate: null };
  const first = nextWindow('g', 2, schedule, Date.parse('2027-03-25T00:00Z'))!;
  const next = nextWindow('g', 2, schedule, first.startAt + 1)!;
  expect(first.key).toBe('g:2:2027-03-26');
  expect(new Date(next.startAt).toISOString()).toBe('2027-04-02T08:00:00.000Z');
  expect(new Date(next.dueAt).toISOString()).toBe('2027-04-02T11:00:00.000Z');
});
test('DST gap shifts forward; fold chooses earlier instant; end date is inclusive', () => {
  const schedule = { timezone: 'Europe/Dublin', weekdays: [7], startLocalTime: '01:30', dueLocalTime: '04:00', endDate: null };
  expect(new Date(nextWindow('g', 1, schedule, Date.parse('2027-03-28T00:00Z'))!.startAt).toISOString()).toBe('2027-03-28T01:30:00.000Z');
  expect(new Date(nextWindow('g', 1, schedule, Date.parse('2027-10-31T00:00Z'))!.startAt).toISOString()).toBe('2027-10-31T00:30:00.000Z');
  expect(nextWindow('g', 1, { ...schedule, endDate: '2027-03-28' }, Date.parse('2027-03-29T00:00Z'))).toBeNull();
});
test('invalid or unresolved calendar contracts cannot silently become intervals', () => {
  const base = { objective: 'Forecast', criteria: ['Coverage'], mode: 'weekly', missing: [] };
  expect(() => parseAgreement({ ...base, schedule: { timezone: '', weekdays: [5], startLocalTime: '09:00', dueLocalTime: '12:00', endDate: null } })).toThrow();
  expect(() => parseAgreement({ ...base, schedule: { timezone: 'Europe/Dublin', weekdays: [5], startLocalTime: '13:00', dueLocalTime: '12:00', endDate: null } })).toThrow();
});

test('impossible ISO end dates are rejected at admission', () => {
  for (const endDate of ['2027-02-30', '2027-13-01'])
    expect(() => parseAgreement({ objective: 'Forecast', criteria: ['Coverage'], mode: 'weekly', missing: [], schedule: { timezone: 'Europe/Dublin', weekdays: [5], startLocalTime: '09:00', dueLocalTime: '12:00', endDate } })).toThrow();
});
test('DST-collapsed window surfaces a recoverable schedule conflict instead of inventing a deadline', () => {
  expect(() => nextWindow('g', 1, { timezone: 'Europe/Dublin', weekdays: [7], startLocalTime: '01:30', dueLocalTime: '02:00', endDate: null }, Date.parse('2027-03-28T00:00Z'))).toThrow(ScheduleConflict);
});

test('deliverables contract validates once-only multi-deliverable specs and rejects invalid shapes', () => {
  const valid = parseAgreement({
    objective: 'Prepare release package',
    criteria: ['Release notes', 'Short summary', 'Compat notes'],
    mode: 'once',
    schedule: null,
    missing: [],
    deliverables: [
      { id: 'release-notes', title: '发布说明', criteria: ['包含变更'] },
      { id: 'short-summary', title: '更新介绍', criteria: ['150字以内'], missing: [] },
      { id: 'compat-notes', title: '兼容性说明', criteria: ['引用实测记录'], missing: ['缺少实测记录'] },
    ],
  });
  expect(valid.deliverables).toHaveLength(3);
  expect(valid.deliverables?.[0].missing).toEqual([]);

  // Max 5 deliverables
  expect(() => parseAgreement({
    objective: 'Too many',
    criteria: ['All'],
    mode: 'once',
    schedule: null,
    missing: [],
    deliverables: Array.from({ length: 6 }, (_, i) => ({ id: `item-${i}`, title: `Item ${i}`, criteria: ['Done'], missing: [] })),
  })).toThrow();

  // Unique IDs
  expect(() => parseAgreement({
    objective: 'Dup IDs',
    criteria: ['All'],
    mode: 'once',
    schedule: null,
    missing: [],
    deliverables: [
      { id: 'dup', title: 'One', criteria: ['A'], missing: [] },
      { id: 'dup', title: 'Two', criteria: ['B'], missing: [] },
    ],
  })).toThrow();

  // Invalid ID slug
  expect(() => parseAgreement({
    objective: 'Bad ID',
    criteria: ['All'],
    mode: 'once',
    schedule: null,
    missing: [],
    deliverables: [{ id: 'Bad_ID!', title: 'One', criteria: ['A'], missing: [] }],
  })).toThrow();

  // Non-once modes cannot have non-empty deliverables
  expect(() => parseAgreement({
    objective: 'Weekly',
    criteria: ['Coverage'],
    mode: 'weekly',
    schedule: { timezone: 'Europe/Dublin', weekdays: [5], startLocalTime: '09:00', dueLocalTime: '12:00', endDate: null },
    missing: [],
    deliverables: [{ id: 'one', title: 'One', criteria: ['A'], missing: [] }],
  })).toThrow();
  expect(() => parseAgreement({
    objective: 'Maintain',
    criteria: ['Coverage'],
    mode: 'maintain',
    schedule: null,
    missing: [],
    deliverables: [{ id: 'one', title: 'One', criteria: ['A'], missing: [] }],
  })).toThrow();
});
