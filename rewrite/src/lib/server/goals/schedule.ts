import { Temporal } from '@js-temporal/polyfill';
import { weeklySchema, type WeeklySchedule } from '../../goals/contracts';

export class ScheduleConflict extends Error {
  constructor(public localDate: string) {
    super(`DST leaves no valid preparation/delivery window on ${localDate}. Choose different local times.`);
  }
}

/** Future windows only. Existing admitted work is never replaced by this calculation. */
export function nextWindow(goalId: string, revision: number, input: WeeklySchedule, after: number) {
  const schedule = weeklySchema.parse(input);
  if (!Number.isFinite(after)) throw new RangeError('Invalid instant');
  let day = Temporal.Instant.fromEpochMilliseconds(after).toZonedDateTimeISO(schedule.timezone).toPlainDate();
  const end = schedule.endDate ? Temporal.PlainDate.from(schedule.endDate) : null;
  for (let offset = 0; offset < 8; offset++, day = day.add({ days: 1 })) {
    if (end && Temporal.PlainDate.compare(day, end) > 0) return null;
    if (!schedule.weekdays.includes(day.dayOfWeek)) continue;
    const instant = (time: string) => day.toPlainDateTime(Temporal.PlainTime.from(time))
      .toZonedDateTime(schedule.timezone, { disambiguation: 'compatible' }).epochMilliseconds;
    const startAt = instant(schedule.startLocalTime);
    if (startAt < after) continue;
    const dueAt = instant(schedule.dueLocalTime);
    if (dueAt <= startAt) throw new ScheduleConflict(String(day));
    return { key: `${goalId}:${revision}:${day}`, startAt, dueAt };
  }
  return null;
}
