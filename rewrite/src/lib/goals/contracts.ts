import { z } from 'zod';

const shortText = z.string().trim().min(1).max(4000);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const weeklySchema = z.object({
  timezone: z.string().min(1).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  startLocalTime: clock,
  dueLocalTime: clock,
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).strict().refine(value => value.dueLocalTime > value.startLocalTime, 'Delivery must follow preparation on the same local day');
export const agreementSchema = z.object({
  objective: shortText,
  criteria: z.array(shortText).min(1).max(20),
  mode: z.enum(['once', 'weekly', 'maintain']),
  schedule: weeklySchema.nullable(),
  missing: z.array(shortText).max(20),
}).strict().refine(value => value.mode === 'weekly' ? value.schedule !== null || value.missing.length > 0 : value.schedule === null);
export const goalInputSchema = z.object({
  text: z.string().trim().min(1).max(32000),
  requestId: z.string().min(1).max(200),
  providerId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  modelId: z.string().trim().min(1).max(200),
  // Explicit UI input, never inferred from model text.
  authorizeTextWork: z.boolean().default(false),
  priority: z.number().int().min(0).max(10).default(5),
  dailyRequests: z.number().int().min(1).max(100).default(12),
  deadlineAt: z.number().int().positive().nullable().default(null),
}).strict();
export const parseGoalInput = (value: unknown) => goalInputSchema.parse(value);
export const parseAgreement = (value: unknown) => agreementSchema.parse(value);
export type GoalInput = z.infer<typeof goalInputSchema>;
export type Agreement = z.infer<typeof agreementSchema>;
export type WeeklySchedule = z.infer<typeof weeklySchema>;
export type Goal = {
  id: string; originalText: string; providerId: string; modelId: string;
  revision: number; generation: number; lifecycle: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  agreement: Agreement | null; authorized: boolean; priority: number; dailyRequests: number; deadlineAt: number | null;
  createdAt: number; nextReviewAt: number | null; nextRetrospectAt: number | null;
  retrospectCursor: number; occurrenceKey: string | null; taskId: number | null;
  waiting: string | null; question: string | null;
};
export type Occurrence = {
  key: string; goalId: string; startAt: number; dueAt: number | null;
  state: 'running' | 'waiting' | 'verifying' | 'succeeded' | 'failed';
  artifactId: string | null; evidence: string[];
};
export type Artifact = { id: string; goalId: string; occurrenceKey: string; content: string; createdAt: number };
export type Activity = {
  id: string; goalId: string; at: number;
  kind: 'interpret' | 'review' | 'work' | 'verification' | 'retrospect' | 'control' | 'question' | 'result' | 'failure';
  summary: string; evidence: string[];
};
export type GoalSnapshot = { goal: Goal; occurrences: Occurrence[]; artifacts: Artifact[]; activity: Activity[] };
