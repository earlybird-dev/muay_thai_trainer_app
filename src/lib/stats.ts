import type { SessionLog } from './storage';

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Consecutive days (ending today, or yesterday if nothing yet today) with at least one session. */
export function streakDays(history: Pick<SessionLog, 'date'>[], today = new Date()): number {
  const days = new Set(history.map((h) => dayKey(new Date(h.date))));
  const d = new Date(today);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
