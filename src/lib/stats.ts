import { STRIKES, type Technique } from '../data/techniques';
import { PRACTICE_LENGTHS } from './sessionEngine';
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

// ---------- History dashboard ----------

const pad = (n: number) => String(n).padStart(2, '0');
/** Local "YYYY-MM-DD". */
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Monday of the week containing d. */
const mondayOf = (d: Date) => {
  const s = startOfDay(d);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
};

/** Seconds trained per local day. */
export function secondsByDay(history: Pick<SessionLog, 'date' | 'durationSec'>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const h of history) {
    const k = localKey(new Date(h.date));
    out.set(k, (out.get(k) ?? 0) + Math.max(0, h.durationSec));
  }
  return out;
}

/** Longest run of consecutive days with at least one session. */
export function bestStreak(history: Pick<SessionLog, 'date'>[]): number {
  const days = [...new Set(history.map((h) => localKey(new Date(h.date))))].sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of days) {
    const [y, m, d] = k.split('-').map(Number);
    const cur = new Date(y, m - 1, d);
    run = prev && Math.round((cur.getTime() - prev.getTime()) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return best;
}

export interface HeatDay {
  key: string;
  seconds: number;
  /** 0 = none, 1–4 = more training. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

/** The last `weeks` Monday-first weeks (columns) of days, with a 0–4 training level for each. */
export function activityGrid(history: Pick<SessionLog, 'date' | 'durationSec'>[], weeks = 16, today = new Date()): HeatDay[][] {
  const byDay = secondsByDay(history);
  const start = mondayOf(today);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const todayKey = localKey(today);
  const cols: HeatDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      const key = localKey(d);
      const seconds = byDay.get(key) ?? 0;
      const min = seconds / 60;
      const level = (seconds <= 0 ? 0 : min < 10 ? 1 : min < 20 ? 2 : min < 35 ? 3 : 4) as HeatDay['level'];
      col.push({ key, seconds, level, future: key > todayKey });
    }
    cols.push(col);
  }
  return cols;
}

export interface WeekTotal {
  /** Monday, "YYYY-MM-DD". */
  start: string;
  minutes: number;
  sessions: number;
}

/** Minutes and sessions for each of the last `weeks` weeks (Monday-first), oldest first. */
export function weeklyTotals(history: Pick<SessionLog, 'date' | 'durationSec'>[], weeks = 8, today = new Date()): WeekTotal[] {
  const thisMonday = mondayOf(today);
  const out: WeekTotal[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const s = new Date(thisMonday);
    s.setDate(s.getDate() - w * 7);
    out.push({ start: localKey(s), minutes: 0, sessions: 0 });
  }
  const first = out[0].start;
  for (const h of history) {
    const k = localKey(mondayOf(new Date(h.date)));
    if (k < first) continue;
    const wk = out.find((x) => x.start === k);
    if (!wk) continue;
    wk.minutes += h.durationSec / 60;
    wk.sessions++;
  }
  for (const wk of out) wk.minutes = Math.round(wk.minutes);
  return out;
}

/** The combos drilled in the most sessions (names as logged), most first. */
export function topCombos(history: Pick<SessionLog, 'date' | 'combos'>[], n = 6): { name: string; sessions: number }[] {
  const count = new Map<string, { name: string; sessions: number }>();
  for (const h of history)
    for (const name of new Set(h.combos ?? [])) {
      const k = name.toLowerCase();
      const c = count.get(k) ?? { name, sessions: 0 };
      c.sessions++;
      count.set(k, c);
    }
  return [...count.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)).slice(0, n);
}

// ---------- Session types ----------

const STRIKE_BY_NAME = new Map(STRIKES.map((t) => [t.name, t]));

/**
 * The strike a drill from its Learn page was about, if this was one: a single block of that drill's
 * length, named after a strike, outside any workout. (Going by the content labels older ones too.)
 */
export function learnedStrike(s: Pick<SessionLog, 'mode' | 'rounds' | 'roundSec' | 'combos' | 'workoutId' | 'planId'>): Technique | null {
  if (s.mode !== 'drill' || s.rounds !== 1 || !PRACTICE_LENGTHS.includes(s.roundSec) || s.workoutId || s.planId || s.combos?.length !== 1) return null;
  return STRIKE_BY_NAME.get(s.combos[0]) ?? null;
}

export type SessionType = 'drill' | 'rounds' | 'learn';
export const SESSION_TYPES: { id: SessionType; chip: string; name: string }[] = [
  { id: 'drill', chip: 'Drill', name: 'Combo drill' },
  { id: 'rounds', chip: 'Rounds', name: 'Rounds' },
  { id: 'learn', chip: 'Learn', name: 'Learn' },
];
export const sessionType = (s: Parameters<typeof learnedStrike>[0]): SessionType =>
  learnedStrike(s) ? 'learn' : s.mode === 'drill' ? 'drill' : 'rounds';

// ---------- Session list filters ----------

export interface SessionFilter {
  /** One local day, "YYYY-MM-DD" (takes the place of `days`). */
  day?: string | null;
  /** The last N days, today included. */
  days?: number | null;
  type?: SessionType | null;
  /** A saved workout's id. */
  workoutId?: string | null;
}

/** The sessions matching every filter that is set, in the same order. */
export function filterSessions<T extends Pick<SessionLog, 'date'> & Parameters<typeof sessionType>[0]>(history: T[], f: SessionFilter, today = new Date()): T[] {
  const from = startOfDay(today);
  from.setDate(from.getDate() - ((f.days ?? 1) - 1));
  return history.filter((s) => {
    const when = new Date(s.date);
    if (f.day ? localKey(when) !== f.day : f.days ? when < from : false) return false;
    if (f.type && sessionType(s) !== f.type) return false;
    return !f.workoutId || s.workoutId === f.workoutId;
  });
}

// ---------- Start and finish times ----------

/** Session id that also carries when it started: "s-<start>-<finish>" (base 36 ms). Ids sync as they are. */
export const sessionId = (startedAt: number, finishedAt: number) => `s-${startedAt.toString(36)}-${finishedAt.toString(36)}`;

/**
 * When a session started and finished. Sessions logged before starts were recorded only know their
 * finish, so their start is estimated from the time trained (pauses aren't counted): `exact` is false.
 */
export function sessionTimes(s: Pick<SessionLog, 'id' | 'date' | 'durationSec'>): { start: Date; end: Date; exact: boolean } {
  const end = new Date(s.date);
  const trainedMs = Math.max(0, s.durationSec) * 1000;
  const m = /^s-([0-9a-z]+)-[0-9a-z]+$/.exec(s.id);
  const start = m ? parseInt(m[1], 36) : NaN;
  const span = end.getTime() - start;
  // Ignore a start that can't be right (it must leave room for the time trained).
  const exact = span >= trainedMs - 5000 && span <= 24 * 60 * 60 * 1000;
  return { start: exact ? new Date(start) : new Date(end.getTime() - trainedMs), end, exact };
}

/** "5:49 PM – 6:11 PM"; "~" marks an estimated start, and a start on the day before names that day. */
export function sessionTimeRange(s: Pick<SessionLog, 'id' | 'date' | 'durationSec'>): string {
  const { start, end, exact } = sessionTimes(s);
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = localKey(start) === localKey(end) ? '' : `${start.toLocaleDateString(undefined, { weekday: 'short' })} `;
  return `${exact ? '' : '~'}${day}${time(start)} – ${time(end)}`;
}
