/**
 * Pure training-session planner. A session is fully planned up front (deterministic for a seed),
 * then the UI asks "what is the state at elapsed time t?" and "what happened between t0 and t1?".
 * This keeps timing correct even when the browser throttles timers.
 */

export type TrainMode = 'drill' | 'rounds';

export interface SessionConfig {
  /**
   * drill:  one combo at a time — called on every rep for `drillSec`, then `drillRestSec` rest,
   *         then the next combo, for `drillCount` combos.
   * rounds: classic rounds with random callouts from the pool.
   */
  mode: TrainMode;
  drillSec: number;
  drillRestSec: number;
  drillCount: number;
  rounds: number;
  roundSec: number;
  restSec: number;
  prepSec: number;
  /** Seconds of breathing room after a combo finishes, before the next callout. */
  minGap: number;
  maxGap: number;
  order: 'random' | 'sequential';
  /** Final seconds of each round with no callouts ("freestyle"). 0 = off. */
  freestyleSec: number;
  comboIds: string[];
}

export const DEFAULT_CONFIG: SessionConfig = {
  mode: 'drill',
  drillSec: 30,
  drillRestSec: 15,
  drillCount: 6,
  rounds: 3,
  roundSec: 180,
  restSec: 60,
  prepSec: 5,
  minGap: 2.5,
  maxGap: 4.5,
  order: 'random',
  freestyleSec: 0,
  comboIds: [],
};

export interface PlanCombo {
  id: string;
  items: string[];
}

export type SegmentKind = 'prep' | 'round' | 'rest';

export interface Segment {
  kind: SegmentKind;
  round: number; // 1-based; for rest = the round just finished
  start: number; // ms
  end: number; // ms
  /** Drill mode: the combo drilled in this block (round), or coming up next (prep/rest). */
  comboId?: string;
}

export type SessionEvent =
  | { type: 'round-start'; at: number; round: number }
  | { type: 'round-end'; at: number; round: number }
  | { type: 'warning'; at: number; round: number }
  | { type: 'freestyle'; at: number; round: number }
  | { type: 'callout'; at: number; round: number; comboId: string; index: number; rep?: number }
  /** Drill mode: announce the upcoming combo during the rest. */
  | { type: 'next'; at: number; round: number; comboId: string }
  | { type: 'done'; at: number };

export interface Plan {
  total: number;
  segments: Segment[];
  events: SessionEvent[];
}

export const MS_PER_STRIKE = 700;
const WARNING_SEC = 10;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seconds between the end of one rep and the next call, within [minGap, maxGap]. */
const gapMs = (config: SessionConfig, rand: () => number) => {
  const min = Math.max(0.5, Math.min(config.minGap, config.maxGap)) * 1000;
  const max = Math.max(min, config.maxGap * 1000);
  return min + rand() * (max - min);
};

/** The combos to drill, in order. Random order uses every combo once before repeating any. */
export function drillOrder(config: SessionConfig, pool: PlanCombo[], rand: () => number): PlanCombo[] {
  const n = Math.max(1, Math.floor(config.drillCount));
  if (pool.length === 0) return [];
  if (config.order === 'sequential') return Array.from({ length: n }, (_, i) => pool[i % pool.length]);
  const out: PlanCombo[] = [];
  let bag: PlanCombo[] = [];
  while (out.length < n) {
    if (bag.length === 0) {
      bag = [...pool];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // never the same combo twice in a row across a reshuffle
      if (bag.length > 1 && out.length && bag[0].id === out[out.length - 1].id) [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    out.push(bag.shift()!);
  }
  return out;
}

function buildDrillPlan(config: SessionConfig, pool: PlanCombo[], rand: () => number): Plan {
  const segments: Segment[] = [];
  const events: SessionEvent[] = [];
  const blocks = drillOrder(config, pool, rand);
  const workMs = Math.max(5, config.drillSec) * 1000;
  const restMs = Math.max(0, config.drillRestSec) * 1000;

  let t = 0;
  if (config.prepSec > 0 && blocks.length) {
    segments.push({ kind: 'prep', round: 1, start: 0, end: config.prepSec * 1000, comboId: blocks[0].id });
    t = config.prepSec * 1000;
  }
  let index = 0;
  blocks.forEach((combo, i) => {
    const r = i + 1;
    const start = t;
    const end = t + workMs;
    segments.push({ kind: 'round', round: r, start, end, comboId: combo.id });
    events.push({ type: 'round-start', at: start, round: r });
    // Call the same combo on every rep until there isn't time for another one.
    const repMs = combo.items.length * MS_PER_STRIKE;
    let c = start + 1200;
    let rep = 1;
    while (c + Math.min(repMs, 1500) < end) {
      events.push({ type: 'callout', at: c, round: r, comboId: combo.id, index: index++, rep: rep++ });
      c += repMs + gapMs(config, rand);
    }
    events.push({ type: 'round-end', at: end, round: r });
    t = end;
    const next = blocks[i + 1];
    if (next && restMs > 0) {
      segments.push({ kind: 'rest', round: r, start: t, end: t + restMs, comboId: next.id });
      events.push({ type: 'next', at: t + Math.min(1500, restMs / 2), round: r + 1, comboId: next.id });
      t += restMs;
    }
  });
  events.push({ type: 'done', at: t });
  events.sort((a, b) => a.at - b.at);
  return { total: t, segments, events };
}

export function buildPlan(config: SessionConfig, pool: PlanCombo[], seed = Date.now()): Plan {
  const rand = mulberry32(seed);
  if (config.mode === 'drill') return buildDrillPlan(config, pool, rand);
  const segments: Segment[] = [];
  const events: SessionEvent[] = [];
  const roundMs = Math.max(5, config.roundSec) * 1000;
  const restMs = Math.max(0, config.restSec) * 1000;
  const freeMs = Math.min(Math.max(0, config.freestyleSec) * 1000, roundMs);
  const minGap = Math.max(0.5, Math.min(config.minGap, config.maxGap)) * 1000;
  const maxGap = Math.max(minGap, config.maxGap * 1000);

  let t = 0;
  if (config.prepSec > 0) {
    segments.push({ kind: 'prep', round: 1, start: 0, end: config.prepSec * 1000 });
    t = config.prepSec * 1000;
  }

  let seq = 0;
  let lastPick = -1;
  const pick = () => {
    if (config.order === 'sequential') return seq++ % pool.length;
    if (pool.length === 1) return 0;
    let i = Math.floor(rand() * pool.length);
    if (i === lastPick) i = (i + 1 + Math.floor(rand() * (pool.length - 1))) % pool.length; // avoid repeats
    lastPick = i;
    return i;
  };

  let index = 0;
  for (let r = 1; r <= Math.max(1, config.rounds); r++) {
    const start = t;
    const end = t + roundMs;
    segments.push({ kind: 'round', round: r, start, end });
    events.push({ type: 'round-start', at: start, round: r });

    const calloutEnd = end - freeMs - 1500;
    let c = start + 1500;
    while (pool.length > 0 && c < calloutEnd) {
      const combo = pool[pick()];
      events.push({ type: 'callout', at: c, round: r, comboId: combo.id, index: index++ });
      c += combo.items.length * MS_PER_STRIKE + minGap + rand() * (maxGap - minGap);
    }
    if (freeMs > 0 && freeMs < roundMs) events.push({ type: 'freestyle', at: end - freeMs, round: r });
    if (roundMs >= 20000) events.push({ type: 'warning', at: end - WARNING_SEC * 1000, round: r });
    events.push({ type: 'round-end', at: end, round: r });
    t = end;

    if (r < config.rounds && restMs > 0) {
      segments.push({ kind: 'rest', round: r, start: t, end: t + restMs });
      t += restMs;
    }
  }
  events.push({ type: 'done', at: t });
  events.sort((a, b) => a.at - b.at);
  return { total: t, segments, events };
}

export interface SessionState {
  done: boolean;
  segment: Segment | null;
  remaining: number; // ms left in segment
  elapsed: number; // ms into segment
}

export function stateAt(plan: Plan, t: number): SessionState {
  if (t >= plan.total) return { done: true, segment: null, remaining: 0, elapsed: 0 };
  const seg = plan.segments.find((s) => t >= s.start && t < s.end) ?? plan.segments[plan.segments.length - 1];
  return { done: false, segment: seg, remaining: seg.end - t, elapsed: t - seg.start };
}

/** Events with t0 < at <= t1. */
export const eventsBetween = (plan: Plan, t0: number, t1: number) => plan.events.filter((e) => e.at > t0 && e.at <= t1);

export const formatClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
