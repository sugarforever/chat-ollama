import { defineDoc, defineDocFamily } from '@earendil-works/pi-durable';
import type { Activity, Artifact, Goal, Occurrence } from '../../goals/contracts';
export type GoalState = { goal: Goal | null; periods: number; artifacts: number; activities: number; revisions: number; plan: string; phaseDeadline: number; phaseRequests: number; scheduleRevision: number; window: { key: string; startAt: number; dueAt: number } | null };
export const Goals = defineDocFamily<GoalState, null>({
  kind: 'app.goal', scope: 'session', family: true, version: 1,
  initial: () => ({ goal: null, periods: 0, artifacts: 0, activities: 0, revisions: 0, plan: '', phaseDeadline: 0, phaseRequests: 0, scheduleRevision: 1, window: null }), checkpointWhen: () => true,
});
export const GoalIndex = defineDoc({ kind: 'app.goal-index', scope: 'session', version: 1, initial: () => ({ ids: [] as string[] }), checkpointWhen: () => true });
export const Periods = defineDocFamily<{ value: Occurrence | null }, null>({ kind: 'app.goal-period', scope: 'session', family: true, version: 1, initial: () => ({ value: null }), checkpointWhen: () => true });
export const Artifacts = defineDocFamily<{ value: Artifact | null }, null>({ kind: 'app.goal-artifact', scope: 'session', family: true, version: 1, initial: () => ({ value: null }), checkpointWhen: () => true });
export const Activities = defineDocFamily<{ value: Activity | null }, null>({ kind: 'app.goal-activity', scope: 'session', family: true, version: 1, initial: () => ({ value: null }), checkpointWhen: () => true });
export const Receipts = defineDocFamily<{ hash: string; id: string }, null>({ kind: 'app.goal-receipt', scope: 'session', family: true, version: 1, initial: () => ({ hash: '', id: '' }), checkpointWhen: () => true });
export const Requests = defineDocFamily<{ count: number }, null>({ kind: 'app.goal-budget', scope: 'session', family: true, version: 1, initial: () => ({ count: 0 }), checkpointWhen: () => true });
export const Permits = defineDoc({ kind: 'app.goal-permits', scope: 'session', version: 1, initial: () => ({ owners: {} as Record<string, number> }), checkpointWhen: () => true });
