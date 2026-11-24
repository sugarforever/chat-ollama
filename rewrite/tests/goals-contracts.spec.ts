import { expect, test } from 'vitest';
import { parseAgreement, parseGoalInput } from '../src/lib/goals/contracts';
import { nextWindow } from '../src/lib/server/goals/schedule';

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
