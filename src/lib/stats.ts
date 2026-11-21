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

export interface Practice {
  /** Sessions this combo was drilled in. */
  sessions: number;
  /** When it was last drilled. */
  last: Date;
}

/** How often and how recently each combo was drilled, by lower-case combo name (history stores names). */
export function practiceStats(history: Pick<SessionLog, 'date' | 'combos'>[]): Map<string, Practice> {
  const out = new Map<string, Practice>();
  for (const h of history) {
    const when = new Date(h.date);
    for (const name of new Set((h.combos ?? []).map((n) => n.toLowerCase()))) {
      const p = out.get(name);
      if (!p) out.set(name, { sessions: 1, last: when });
      else {
        p.sessions++;
        if (when > p.last) p.last = when;
      }
    }
  }
  return out;
}

/** Days since a combo was last drilled (Infinity if never). */
export function daysSince(p: Practice | undefined, now = new Date()): number {
  return p ? Math.floor((now.getTime() - p.last.getTime()) / 86_400_000) : Infinity;
}

/** A combo you care about is "due" when it hasn't been drilled for this many days. */
export const DUE_AFTER_DAYS = 7;
