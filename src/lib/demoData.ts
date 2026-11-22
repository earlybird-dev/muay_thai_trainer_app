import { PRESET_COMBOS } from '../data/combos';
import { DEFAULT_CONFIG, type SessionConfig } from './sessionEngine';
import { addDays, dateKey, parseDay, type TrainPlan, type Workout } from './plans';
import type { AppData, SessionLog } from './storage';

/**
 * Sample practice data for screenshots: ~9 weeks of sessions, two workouts, a plan in
 * progress, some learned techniques and favourite combos. Everything it creates has a
 * "demo-" id, and what it adds to learned/favourites is remembered, so it can be removed
 * again without touching real data.
 */

const PREFIX = 'demo-';
const ADDED_KEY = 'mt-demo-added';

/** Small deterministic random generator, so the sample looks the same each time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DEMO_LEARNED = [
  'stance', 'step', 'switch', 'jab', 'cross', 'lead-hook', 'rear-hook', 'lead-uppercut',
  'teep', 'rear-kick', 'low-kick', 'knee', 'elbow', 'check', 'parry', 'block',
];

/**
 * When a sample session was added, from its id ("demo-<base36 ms>-s-<day>"), or NaN for other ids.
 * Sync uses it so a history clear made before the sample was added doesn't drop it, while a later
 * clear does.
 */
export function demoAddedAt(id: string): number {
  const m = /^demo-([0-9a-z]+)-s-/.exec(id);
  return m ? parseInt(m[1], 36) : NaN;
}

export function buildDemoData(today = dateKey(new Date()), addedAt = Date.now()) {
  const stamp = addedAt.toString(36);
  const rand = rng(20261122);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const essentials = PRESET_COMBOS.filter((c) => c.essential);
  const kicks = PRESET_COMBOS.filter((c) => c.items.some((i) => /kick|teep/.test(i)) && c.level !== 'advanced');
  const general = PRESET_COMBOS.filter((c) => c.level !== 'advanced');

  const fundamentals: Workout = {
    id: `${PREFIX}w-fundamentals`,
    name: 'Fundamentals Drill',
    config: { ...DEFAULT_CONFIG, mode: 'drill', drillSec: 35, drillRestSec: 15, drillCount: 12, prepSec: 10, poolKind: 'essentials' } as SessionConfig,
    pool: { kind: 'essentials', comboIds: [] },
  };
  const fightNight: Workout = {
    id: `${PREFIX}w-fight-night`,
    name: 'Fight Night Rounds',
    config: { ...DEFAULT_CONFIG, mode: 'rounds', rounds: 5, roundSec: 180, restSec: 60, prepSec: 10, poolKind: 'intermediate' } as SessionConfig,
    pool: { kind: 'intermediate', comboIds: [] },
  };

  const planStart = addDays(today, -20);
  const plan: TrainPlan = {
    id: `${PREFIX}p-fundamentals`,
    name: '4-Week Fundamentals',
    workoutId: fundamentals.id,
    start: planStart,
    days: 28,
    weekdays: [1, 3, 5, 6], // Mon, Wed, Fri, Sat
    reminder: { enabled: false, time: '18:30' },
    marks: {},
  };
  const planEndKey = addDays(planStart, plan.days - 1);

  // Which past days have a session: a weekly rhythm, a long run a few weeks back, and a
  // current streak up to yesterday. One plan day is missed so the calendar looks real.
  const weekdayOdds = [0.25, 0.85, 0.45, 0.85, 0.45, 0.8, 0.6]; // Sun..Sat
  const missedPlanDay = addDays(planStart, 9);
  const history: SessionLog[] = [];
  for (let back = 63; back >= 1; back--) {
    const key = addDays(today, -back);
    const wd = parseDay(key).getDay();
    const inPlan = key >= planStart && key <= planEndKey;
    const planDay = inPlan && plan.weekdays.includes(wd);
    let train = rand() < weekdayOdds[wd];
    if (back >= 38 && back <= 50) train = true; // best streak: 13 days
    if (back <= 6) train = true; // current streak into today
    if (planDay) train = key !== missedPlanDay;
    if (!train) continue;

    const rounds = !planDay && rand() < 0.3;
    const hour = rand() < 0.6 ? 18 : 7;
    const at = parseDay(key);
    at.setHours(hour, Math.floor(rand() * 50), 0, 0);

    let log: SessionLog;
    if (rounds) {
      const n = pick([3, 4, 5]);
      const pool = general;
      log = {
        id: `${PREFIX}${stamp}-s-${key}`,
        date: at.toISOString(),
        mode: 'rounds',
        rounds: n,
        completedRounds: n,
        roundSec: 180,
        restSec: 60,
        callouts: n * (22 + Math.floor(rand() * 8)),
        combos: Array.from(new Set(Array.from({ length: 10 }, () => pick(pool).name))),
        durationSec: 10 + n * 180 + (n - 1) * 60,
        workoutId: n === 5 ? fightNight.id : undefined,
      };
    } else {
      const count = planDay ? 12 : pick([8, 10, 12, 14]);
      const done = rand() < 0.12 ? count - 2 - Math.floor(rand() * 3) : count;
      const sec = planDay ? 35 : pick([30, 35, 45]);
      const rest = planDay ? 15 : pick([15, 20]);
      const pool = planDay ? essentials : rand() < 0.4 ? kicks : general;
      log = {
        id: `${PREFIX}${stamp}-s-${key}`,
        date: at.toISOString(),
        mode: 'drill',
        rounds: count,
        completedRounds: done,
        roundSec: sec,
        restSec: rest,
        callouts: done * Math.round(sec / 3),
        combos: Array.from(new Set(Array.from({ length: done }, () => pick(pool).name))),
        durationSec: 10 + done * sec + Math.max(0, done - 1) * rest,
        ...(planDay ? { workoutId: fundamentals.id, planId: plan.id } : {}),
      };
    }
    if (!log.workoutId) delete log.workoutId;
    history.push(log);
  }
  history.reverse(); // newest first, like the app keeps it

  const favorites = essentials.slice(0, 3).map((c) => c.id).concat(kicks.slice(0, 2).map((c) => c.id));
  return { history, workouts: [fundamentals, fightNight], plans: [plan], learned: DEMO_LEARNED, favorites };
}

/** Merge the sample into the user's data (real data is kept as it is). */
export function addDemoData(d: AppData): AppData {
  const demo = buildDemoData();
  const learnedAdded = demo.learned.filter((id) => !d.learned.includes(id));
  const favAdded = demo.favorites.filter((id) => !d.settings.favorites.includes(id));
  try {
    localStorage.setItem(ADDED_KEY, JSON.stringify({ learned: learnedAdded, favorites: favAdded }));
  } catch {
    /* removal then keeps learned/favourites as they are */
  }
  const cleared = removeDemoData(d, false);
  const now = new Date().toISOString();
  return {
    ...cleared,
    history: [...cleared.history, ...demo.history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500),
    workouts: [...cleared.workouts, ...demo.workouts.map((w) => ({ ...w, updatedAt: now }))],
    plans: [...cleared.plans, ...demo.plans.map((p) => ({ ...p, updatedAt: now }))],
    learned: [...cleared.learned, ...learnedAdded],
    settings: { ...cleared.settings, favorites: [...cleared.settings.favorites, ...favAdded] },
  };
}

/** Take the sample out again; real sessions, workouts and plans are untouched. */
export function removeDemoData(d: AppData, undoAdded = true): AppData {
  let added: { learned: string[]; favorites: string[] } = { learned: [], favorites: [] };
  if (undoAdded) {
    try {
      added = JSON.parse(localStorage.getItem(ADDED_KEY) || '') ?? added;
      localStorage.removeItem(ADDED_KEY);
    } catch {
      /* nothing recorded */
    }
  }
  const isDemo = (id: string) => id.startsWith(PREFIX);
  return {
    ...d,
    history: d.history.filter((s) => !isDemo(s.id)),
    workouts: d.workouts.filter((w) => !isDemo(w.id)),
    plans: d.plans.filter((p) => !isDemo(p.id)),
    learned: d.learned.filter((id) => !added.learned.includes(id)),
    settings: { ...d.settings, favorites: d.settings.favorites.filter((id) => !added.favorites.includes(id)) },
  };
}
