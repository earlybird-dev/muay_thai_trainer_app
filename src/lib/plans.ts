/**
 * Saved workouts (a named Train setup) and training plans (a weekly schedule of one workout).
 * Everything here is pure so it can be unit-tested; dates are local calendar days "YYYY-MM-DD".
 */
import type { Combo } from '../data/combos';
import type { Level } from '../data/techniques';
import { formatClock, type SessionConfig } from './sessionEngine';
import type { SessionLog } from './storage';
import { DUE_AFTER_DAYS, daysSince, practiceStats } from './stats';

/**
 * Which combos a session draws from: everything, a level, your own, the coach's essentials, your favourites,
 * the ones due for practice, or a hand-picked list ("pick").
 */
export type PoolKind = 'all' | Level | 'mine' | 'essentials' | 'favorites' | 'due' | 'pick';

/** What the smart pools need to know about the user. */
export interface PoolContext {
  favorites: string[];
  history: SessionLog[];
  now?: Date;
}

export interface Workout {
  id: string;
  name: string;
  config: SessionConfig;
  /** Which combos: a level/pool (random each time) or a hand-picked list ("pick", kept in order). */
  pool: {
    kind: PoolKind;
    comboIds: string[];
    /** Level/all/mine pools: combos the user unticked, left out of the pool. */
    excluded?: string[];
  };
  updatedAt?: string;
}

export interface TrainPlan {
  id: string;
  name: string;
  workoutId: string;
  /** First day, local "YYYY-MM-DD". */
  start: string;
  /** Length in days (e.g. 30). */
  days: number;
  /** Training weekdays, 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  reminder: { enabled: boolean; time: string /* "HH:MM" */ };
  /** Manual ticks, by date. */
  marks: Record<string, 'done'>;
  archived?: boolean;
  updatedAt?: string;
}

// ---------- dates ----------

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (key: string, n: number) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const weekday = (key: string) => parseDay(key).getDay();

export const WEEKDAYS = [
  { id: 1, short: 'Mon' },
  { id: 2, short: 'Tue' },
  { id: 3, short: 'Wed' },
  { id: 4, short: 'Thu' },
  { id: 5, short: 'Fri' },
  { id: 6, short: 'Sat' },
  { id: 0, short: 'Sun' },
];

// ---------- workouts ----------

export function resolvePool(pool: Workout['pool'], allCombos: Combo[], myCombos: Combo[], ctx?: PoolContext): Combo[] {
  if (pool.kind === 'pick') {
    const byId = new Map(allCombos.map((c) => [c.id, c]));
    return pool.comboIds.map((id) => byId.get(id)).filter((c): c is Combo => !!c);
  }
  const out = new Set(pool.excluded ?? []);
  return poolBase(pool.kind, allCombos, myCombos, ctx).filter((c) => !out.has(c.id));
}

/** Every combo a level/all/mine pool draws from, before unticked ones are removed. */
export function poolBase(kind: Exclude<PoolKind, 'pick'>, allCombos: Combo[], myCombos: Combo[], ctx?: PoolContext): Combo[] {
  switch (kind) {
    case 'all':
      return allCombos;
    case 'mine':
      return myCombos;
    case 'essentials':
      return allCombos.filter((c) => c.essential);
    case 'favorites': {
      const fav = new Set(ctx?.favorites ?? []);
      return allCombos.filter((c) => fav.has(c.id));
    }
    case 'due':
      return dueCombos(allCombos, myCombos, ctx);
    default:
      return allCombos.filter((c) => c.level === kind);
  }
}

export const workoutSeconds = (c: SessionConfig) =>
  c.mode === 'drill'
    ? c.prepSec + c.drillCount * c.drillSec + Math.max(0, c.drillCount - 1) * c.drillRestSec
    : c.prepSec + c.rounds * c.roundSec + Math.max(0, c.rounds - 1) * c.restSec;

export function workoutSummary(w: Workout): string {
  const c = w.config;
  const shape =
    c.mode === 'drill'
      ? `${c.drillCount} combo${c.drillCount === 1 ? '' : 's'} × ${c.drillSec}s, ${c.drillRestSec}s rest`
      : `${c.rounds} round${c.rounds === 1 ? '' : 's'} × ${formatClock(c.roundSec * 1000)}`;
  const pool =
    w.pool.kind === 'pick'
      ? `${w.pool.comboIds.length} picked combo${w.pool.comboIds.length === 1 ? '' : 's'}`
      : w.pool.kind === 'all'
        ? 'all combos'
        : w.pool.kind === 'mine'
          ? 'my combos'
          : w.pool.kind === 'essentials'
            ? 'essential combos'
            : w.pool.kind === 'favorites'
              ? 'favourite combos'
              : w.pool.kind === 'due'
                ? 'combos due for practice'
                : `${w.pool.kind} combos`;
  const left = w.pool.kind !== 'pick' && w.pool.excluded?.length ? ` (−${w.pool.excluded.length})` : '';
  return `${c.mode === 'drill' ? 'Drill' : 'Rounds'} · ${shape} · ${pool}${left} · ${formatClock(workoutSeconds(c) * 1000)}`;
}

// ---------- plans ----------

/**
 * done: trained (counts toward the week); bonus: trained beyond the week's target; moved: a planned day you
 * skipped but made up on another day that week; rest / today / upcoming / missed as usual.
 */
export type DayStatus = 'before' | 'after' | 'rest' | 'done' | 'missed' | 'today' | 'upcoming' | 'bonus' | 'moved';

export const planEnd = (p: TrainPlan) => addDays(p.start, p.days - 1);
export const isTrainingDay = (p: TrainPlan, key: string) => p.weekdays.includes(weekday(key));

/** Days (local keys) on which this plan's workout was completed, from history and manual ticks. */
export function completedDays(p: TrainPlan, history: SessionLog[]): Set<string> {
  const end = planEnd(p);
  const out = new Set<string>();
  for (const h of history) {
    if (h.planId !== p.id && h.workoutId !== p.workoutId) continue;
    if (h.completedRounds <= 0) continue;
    const k = dateKey(new Date(h.date));
    if (k >= p.start && k <= end) out.add(k);
  }
  for (const [k, v] of Object.entries(p.marks)) if (v === 'done') out.add(k);
  return out;
}

/**
 * Plans are a weekly target: the chosen weekdays set how many sessions each 7-day block (counted from the
 * plan's start) asks for, but any day you train counts. So you can train on a rest day instead of a planned
 * one, and the planned day isn't "missed".
 */
const blockOf = (p: TrainPlan, key: string) => Math.floor(dayIndex(p, key) / 7);
const dayIndex = (p: TrainPlan, key: string) => Math.round((parseDay(key).getTime() - parseDay(p.start).getTime()) / 864e5);

function blockDays(p: TrainPlan, block: number): string[] {
  const out: string[] = [];
  for (let i = block * 7; i < Math.min(p.days, block * 7 + 7); i++) out.push(addDays(p.start, i));
  return out;
}

export function dayStatus(p: TrainPlan, key: string, today: string, done: Set<string>): DayStatus {
  if (key < p.start) return 'before';
  if (key > planEnd(p)) return 'after';
  const days = blockDays(p, blockOf(p, key));
  const target = days.filter((k) => isTrainingDay(p, k)).length;
  if (done.has(key)) {
    // Trained: counts, unless the week's target was already met by earlier sessions.
    const before = days.filter((k) => k < key && done.has(k)).length;
    return before < target ? 'done' : 'bonus';
  }
  if (!isTrainingDay(p, key)) return 'rest';
  const trainedInWeek = days.filter((k) => done.has(k) && k <= (today < days[days.length - 1] ? today : days[days.length - 1])).length;
  const plannedUpTo = days.filter((k) => k <= key && isTrainingDay(p, k)).length;
  // Made up elsewhere this week (or the week's target is already met): nothing owed on this day.
  if (trainedInWeek >= plannedUpTo) return key < today ? 'moved' : trainedInWeek >= target ? 'rest' : key === today ? 'today' : 'upcoming';
  if (key < today) return 'missed';
  if (key === today) return 'today';
  return 'upcoming';
}

export interface PlanStats {
  trainingDays: number;
  done: number;
  missed: number;
  remaining: number;
  percent: number;
  /** Consecutive completed training days, counting back from today (today may still be pending). */
  streak: number;
  /** 1-based day number of today within the plan, or null if outside it. */
  dayNumber: number | null;
  finished: boolean;
}

export function planStats(p: TrainPlan, history: SessionLog[], today: string): PlanStats {
  const done = completedDays(p, history);
  let trainingDays = 0;
  let doneCount = 0;
  let missed = 0;
  for (let b = 0; b * 7 < p.days; b++) {
    const days = blockDays(p, b);
    const target = days.filter((k) => isTrainingDay(p, k)).length;
    trainingDays += target;
    doneCount += Math.min(target, days.filter((k) => done.has(k)).length);
    missed += days.filter((k) => dayStatus(p, k, today, done) === 'missed').length;
  }
  const remaining = Math.max(0, trainingDays - doneCount - missed);
  // Streak: consecutive completed sessions counting back from today; rest/moved days don't break it,
  // a missed day does, and a pending today doesn't.
  let streak = 0;
  for (let k = today > planEnd(p) ? planEnd(p) : today; k >= p.start; k = addDays(k, -1)) {
    const st = dayStatus(p, k, today, done);
    if (st === 'done' || st === 'bonus') streak++;
    else if (st === 'missed') break;
  }
  const idx = dayIndex(p, today);
  return {
    trainingDays,
    done: doneCount,
    missed,
    remaining,
    percent: trainingDays ? Math.round((doneCount / trainingDays) * 100) : 0,
    streak,
    dayNumber: idx >= 0 && idx < p.days ? idx + 1 : null,
    finished: today > planEnd(p),
  };
}

export function dueToday(plans: TrainPlan[], history: SessionLog[], today: string) {
  return plans
    .filter((p) => !p.archived)
    .map((p) => ({ plan: p, status: dayStatus(p, today, today, completedDays(p, history)) }))
    .filter((x) => x.status === 'today' || x.status === 'done' || x.status === 'bonus');
}

/** Calendar weeks (Mon–Sun rows) covering the plan, padded with null outside it. */
export function planWeeks(p: TrainPlan): (string | null)[][] {
  const first = p.start;
  const lead = (weekday(first) + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < p.days; i++) cells.push(addDays(first, i));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Monday-first week columns for the Activity-style plan calendar: starting the week of the 1st of the
 * plan's start month, at least `minWeeks` long, and always long enough to reach the plan's last day.
 */
export function planWeekColumns(p: TrainPlan, minWeeks = 26): string[][] {
  const first = `${p.start.slice(0, 7)}-01`;
  const startMonday = addDays(first, -((weekday(first) + 6) % 7));
  const needed = Math.floor(dayIndex({ ...p, start: startMonday }, planEnd(p)) / 7) + 1;
  const cols: string[][] = [];
  for (let w = 0; w < Math.max(minWeeks, needed); w++) {
    const col: string[] = [];
    for (let i = 0; i < 7; i++) col.push(addDays(startMonday, w * 7 + i));
    cols.push(col);
  }
  return cols;
}

/** Full calendar months covering the plan, each as Monday-first weeks (null = other month). */
export function planMonths(p: TrainPlan): { key: string; weeks: (string | null)[][] }[] {
  const out: { key: string; weeks: (string | null)[][] }[] = [];
  const end = planEnd(p);
  let first = `${p.start.slice(0, 7)}-01`;
  while (first <= end) {
    const cells: (string | null)[] = Array.from({ length: (weekday(first) + 6) % 7 }, () => null);
    let k = first;
    while (k.slice(0, 7) === first.slice(0, 7)) {
      cells.push(k);
      k = addDays(k, 1);
    }
    while (cells.length % 7) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    out.push({ key: first, weeks });
    first = k; // first day of the next month
  }
  return out;
}

/**
 * Combos you care about (essentials, favourites, your own) not drilled for DUE_AFTER_DAYS days —
 * never-drilled first, then the longest ago.
 */
export function dueCombos(allCombos: Combo[], myCombos: Combo[], ctx?: PoolContext): Combo[] {
  const fav = new Set(ctx?.favorites ?? []);
  const mine = new Set(myCombos.map((c) => c.id));
  const stats = practiceStats(ctx?.history ?? []);
  const now = ctx?.now ?? new Date();
  return allCombos
    .filter((c) => c.essential || fav.has(c.id) || mine.has(c.id))
    .map((c) => ({ c, age: daysSince(stats.get(c.name.toLowerCase()), now) }))
    .filter((x) => x.age >= DUE_AFTER_DAYS)
    .sort((a, b) => (a.age === b.age ? 0 : b.age > a.age ? 1 : -1))
    .map((x) => x.c);
}
