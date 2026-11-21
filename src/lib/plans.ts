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

export type DayStatus = 'before' | 'after' | 'rest' | 'done' | 'missed' | 'today' | 'upcoming' | 'bonus';

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

export function dayStatus(p: TrainPlan, key: string, today: string, done: Set<string>): DayStatus {
  if (key < p.start) return 'before';
  if (key > planEnd(p)) return 'after';
  const training = isTrainingDay(p, key);
  if (done.has(key)) return training ? 'done' : 'bonus';
  if (!training) return 'rest';
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
  let remaining = 0;
  for (let i = 0; i < p.days; i++) {
    const k = addDays(p.start, i);
    const s = dayStatus(p, k, today, done);
    if (s === 'done' || s === 'missed' || s === 'today' || s === 'upcoming') trainingDays++;
    if (s === 'done') doneCount++;
    if (s === 'missed') missed++;
    if (s === 'today' || s === 'upcoming') remaining++;
  }
  // Streak: walk back over training days from today; a pending today doesn't break it.
  let streak = 0;
  for (let k = today > planEnd(p) ? planEnd(p) : today; k >= p.start; k = addDays(k, -1)) {
    if (!isTrainingDay(p, k)) continue;
    if (done.has(k)) streak++;
    else if (k === today) continue;
    else break;
  }
  const dayIndex = Math.round((parseDay(today).getTime() - parseDay(p.start).getTime()) / 864e5);
  return {
    trainingDays,
    done: doneCount,
    missed,
    remaining,
    percent: trainingDays ? Math.round((doneCount / trainingDays) * 100) : 0,
    streak,
    dayNumber: dayIndex >= 0 && dayIndex < p.days ? dayIndex + 1 : null,
    finished: today > planEnd(p),
  };
}

/** Active plans whose workout is due today and not yet done. */
export function dueToday(plans: TrainPlan[], history: SessionLog[], today: string) {
  return plans
    .filter((p) => !p.archived)
    .map((p) => ({ plan: p, status: dayStatus(p, today, today, completedDays(p, history)) }))
    .filter((x) => x.status === 'today' || x.status === 'done');
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
