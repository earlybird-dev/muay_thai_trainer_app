import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildPlan, eventsBetween, stateAt, type SessionConfig } from './sessionEngine';
import { DEFAULT_SETTINGS, emptyData, parseData, serializeData } from './storage';
import { streakDays } from './stats';
import { calloutTokens, PRESET_COMBOS } from '../data/combos';
import { TECHNIQUES, TECH_BY_ID, youtubeId } from '../data/techniques';
import { solve, withGuard } from './pose';

const pool = [
  { id: 'a', items: ['jab', 'cross'] },
  { id: 'b', items: ['jab', 'cross', 'rear-kick'] },
];
const cfg: SessionConfig = { ...DEFAULT_CONFIG, mode: 'rounds', rounds: 2, roundSec: 30, restSec: 10, prepSec: 5 };

describe('sessionEngine', () => {
  const plan = buildPlan(cfg, pool, 42);

  it('lays out prep, rounds and rests back to back', () => {
    expect(plan.segments.map((s) => s.kind)).toEqual(['prep', 'round', 'rest', 'round']);
    expect(plan.total).toBe(5000 + 30000 + 10000 + 30000);
    for (let i = 1; i < plan.segments.length; i++) expect(plan.segments[i].start).toBe(plan.segments[i - 1].end);
  });

  it('only calls combos inside rounds, never in rest', () => {
    const callouts = plan.events.filter((e) => e.type === 'callout');
    expect(callouts.length).toBeGreaterThan(4);
    for (const c of callouts) expect(stateAt(plan, c.at).segment?.kind).toBe('round');
  });

  it('emits bells, the 10s warning and done', () => {
    const types = plan.events.map((e) => e.type);
    expect(types.filter((t) => t === 'round-start')).toHaveLength(2);
    expect(types.filter((t) => t === 'round-end')).toHaveLength(2);
    expect(types.filter((t) => t === 'warning')).toHaveLength(2);
    expect(types[types.length - 1]).toBe('done');
  });

  it('is deterministic for a seed and reports state over time', () => {
    expect(buildPlan(cfg, pool, 42)).toEqual(plan);
    expect(stateAt(plan, 1000).segment?.kind).toBe('prep');
    expect(stateAt(plan, 6000).remaining).toBe(29000);
    expect(stateAt(plan, 36000).segment?.kind).toBe('rest');
    expect(stateAt(plan, plan.total).done).toBe(true);
  });

  it('eventsBetween covers every event exactly once across ticks', () => {
    let seen = 0;
    for (let t = 0; t < plan.total + 1000; t += 137) seen += eventsBetween(plan, t, t + 137).length;
    expect(seen).toBe(plan.events.length);
  });

  it('keeps the freestyle window clear of callouts', () => {
    const p = buildPlan({ ...cfg, freestyleSec: 10 }, pool, 1);
    const round1 = p.segments.find((s) => s.kind === 'round')!;
    const late = p.events.filter((e) => e.type === 'callout' && e.at > round1.end - 10000 && e.at < round1.end);
    expect(late).toHaveLength(0);
    expect(p.events.some((e) => e.type === 'freestyle')).toBe(true);
  });

  it('sequential order cycles through the pool', () => {
    const p = buildPlan({ ...cfg, order: 'sequential' }, pool, 1);
    const ids = p.events.flatMap((e) => (e.type === 'callout' ? [e.comboId] : []));
    expect(ids.slice(0, 4)).toEqual(['a', 'b', 'a', 'b']);
  });
});

describe('storage', () => {
  it('round-trips export/import', () => {
    const d = emptyData();
    d.combos.push({ id: 'x', name: 'Mine', items: ['jab', 'teep'], level: 'beginner', style: 'names' });
    d.learned.push('jab');
    d.videos.jab = 'https://youtu.be/abc';
    expect(parseData(JSON.parse(serializeData(d)))).toEqual(d);
  });

  it('rejects junk and drops malformed combos', () => {
    expect(() => parseData('nope')).toThrow();
    const out = parseData({ combos: [{ id: 1 }, { id: 'ok', name: 'Ok', items: ['jab'] }] });
    expect(out.combos.map((c) => c.id)).toEqual(['ok']);
    expect(out.settings.stance).toBe('orthodox');
  });
});

describe('combos & techniques', () => {
  it('builds number and name callouts', () => {
    expect(calloutTokens(['jab', 'cross', 'rear-kick'], 'numbers')).toEqual(['1', '2', 'Kick']);
    expect(calloutTokens(['jab', 'cross', 'rear-kick'], 'names')).toEqual(['Jab', 'Cross', 'Kick']);
  });

  it('every preset references real techniques', () => {
    for (const c of PRESET_COMBOS) for (const i of c.items) expect(TECH_BY_ID[i], `${c.id}:${i}`).toBeDefined();
  });

  it('every technique pose keeps a foot on the ground and the head up', () => {
    for (const t of TECHNIQUES)
      for (const ph of t.phases) {
        const s = solve(withGuard(ph.pose));
        const lowest = Math.max(s.lead.ankle.y, s.rear.ankle.y, s.lead.toe.y, s.rear.toe.y);
        expect(Math.abs(lowest), `${t.id}/${ph.label}`).toBeLessThan(1e-9);
        expect(s.head.y, `${t.id}/${ph.label}`).toBeLessThan(-80);
        expect(s.head.y - 12, `${t.id}/${ph.label} fits in viewBox`).toBeGreaterThan(-180);
      }
  });

  it('parses YouTube links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtube.com/shorts/abc123')).toBe('abc123');
    expect(youtubeId('https://vimeo.com/1')).toBeNull();
  });
});

describe('streak', () => {
  it('counts consecutive days', () => {
    const today = new Date(2026, 10, 21, 18);
    const d = (offset: number) => ({ date: new Date(2026, 10, 21 - offset, 9).toISOString() });
    expect(streakDays([d(0), d(1), d(2), d(4)], today)).toBe(3);
    expect(streakDays([d(1), d(2)], today)).toBe(2);
    expect(streakDays([d(3)], today)).toBe(0);
  });
});

import { to3D, SHOULDER_Z } from './pose3d';

describe('3D pose mapping', () => {
  const at = (id: string, label: string) => to3D(withGuard(TECH_BY_ID[id].phases.find((p) => p.label.startsWith(label))!.pose));
  const guard = to3D(withGuard({}));

  it('keeps every joint at or above the floor in every phase', () => {
    for (const t of TECHNIQUES)
      for (const ph of t.phases) {
        const k = to3D(withGuard(ph.pose));
        for (const side of [k.lead, k.rear]) for (const p of Object.values(side)) expect(p.y, `${t.id}/${ph.label}`).toBeGreaterThan(-1e-6);
      }
  });

  it('straight punches travel to the centre line and turn the shoulders', () => {
    const jab = at('jab', 'Extend');
    expect(Math.abs(jab.lead.hand.z)).toBeLessThan(Math.abs(guard.lead.hand.z));
    const cross = at('cross', 'Pivot');
    expect(cross.rear.shoulder.x).toBeGreaterThan(cross.lead.shoulder.x); // rear shoulder rotated forward
  });

  it('hooks flare the elbow outward', () => {
    const hook = at('lead-hook', 'Turn');
    expect(hook.lead.elbow.z).toBeGreaterThan(SHOULDER_Z + 5);
    // forearm runs across the body (roughly level), not straight up
    expect(Math.abs(hook.lead.hand.y - hook.lead.elbow.y)).toBeLessThan(8);
    expect(hook.lead.hand.z).toBeLessThan(hook.lead.elbow.z - 15);
  });

  it('keeps the guard and uppercut forearms upright', () => {
    expect(guard.lead.hand.y - guard.lead.elbow.y).toBeGreaterThan(20);
    const upper = at('lead-uppercut', 'Drive');
    expect(upper.lead.hand.y - upper.lead.elbow.y).toBeGreaterThan(15);
  });

  it('keeps every forearm the right length', () => {
    for (const t of TECHNIQUES)
      for (const ph of t.phases) {
        const k = to3D(withGuard(ph.pose));
        for (const sd of [k.lead, k.rear]) {
          const d = Math.hypot(sd.hand.x - sd.elbow.x, sd.hand.y - sd.elbow.y, sd.hand.z - sd.elbow.z);
          expect(d, `${t.id}/${ph.label}`).toBeCloseTo(28, 3);
        }
      }
  });

  it('the roundhouse swings the rear shin across the body, the straight knee does not', () => {
    const kick = at('rear-kick', 'Swing');
    expect(kick.rear.ankle.z).toBeGreaterThan(guard.rear.ankle.z + 15);
    const knee = at('knee', 'Hips');
    expect(Math.abs(knee.rear.ankle.z - guard.rear.ankle.z)).toBeLessThan(3);
  });

  it('the rear teep pushes straight forward instead of swinging across', () => {
    const teep = at('rear-teep', 'Drive');
    expect(Math.abs(teep.rear.ankle.z - guard.rear.ankle.z)).toBeLessThan(3);
    expect(teep.rear.ankle.x).toBeGreaterThan(guard.rear.ankle.x + 40); // foot well out in front
    expect(teep.yaw).toBeCloseTo(guard.yaw);
  });

  it('a half spin puts the lead side on the far side', () => {
    const spun = to3D(withGuard({ facing: -1 }));
    expect(spun.lead.shoulder.z).toBeLessThan(0);
    expect(spun.pelvis.x).toBeCloseTo(guard.pelvis.x);
  });
});

import { FIGHTERS, fighterById, DEFAULT_FIGHTER } from '../data/fighters';

describe('fighters', () => {
  it('have unique ids and valid colours', () => {
    expect(new Set(FIGHTERS.map((f) => f.id)).size).toBe(FIGHTERS.length);
    const hex = /^#[0-9a-f]{6}$/i;
    for (const f of FIGHTERS)
      for (const c of [f.skin, f.hairColor, f.shorts, f.shortsTrim, f.gloves, f.wraps, f.mongkol ?? '#000000']) expect(c, f.id).toMatch(hex);
  });

  it('falls back to the default fighter for unknown ids', () => {
    expect(fighterById('nope')).toBe(DEFAULT_FIGHTER);
    expect(fighterById('clinch-king').name).toBe('Clinch King');
  });
});

import { clearAccountData, mergeAll, stampChanges, type ComboRow, type RemoteData } from './sync';
import type { Combo } from '../data/combos';

describe('cloud sync', () => {
  const T1 = '2026-11-20T10:00:00.000Z';
  const T2 = '2026-11-21T10:00:00.000Z';
  const combo = (id: string, name: string, updatedAt?: string): Combo => ({ id, name, items: ['jab', 'cross'], level: 'beginner', style: 'numbers', ...(updatedAt ? { updatedAt } : {}) });
  const row = (id: string, name: string, updated_at: string, deleted = false): ComboRow => ({ id, name, items: ['jab'], level: 'beginner', style: 'numbers', deleted, updated_at });
  const empty: RemoteData = { combos: [], sessions: [], state: null };
  const withCombos = (combos: Combo[], extra: Partial<ReturnType<typeof emptyData>> = {}) => ({ ...emptyData(), combos, ...extra });

  it('stamps new and edited combos, tombstones deleted ones, and ignores no-op updates', () => {
    const a = withCombos([combo('a', 'A', T1), combo('b', 'B', T1)]);
    const edited = stampChanges(a, { ...a, combos: [{ ...a.combos[0], name: 'A2' }] }, T2);
    expect(edited.combos[0].updatedAt).toBe(T2);
    expect(edited.tombstones).toEqual({ b: T2 });
    expect(stampChanges(a, { ...a }, T2)).toEqual(a);
  });

  it('bumps the progress timestamp for synced settings but not for the device voice', () => {
    const a = emptyData();
    expect(stampChanges(a, { ...a, settings: { ...a.settings, voiceURI: 'x' } }, T2).stateUpdatedAt).toBeNull();
    expect(stampChanges(a, { ...a, settings: { ...a.settings, stance: 'southpaw' } }, T2).stateUpdatedAt).toBe(T2);
    expect(stampChanges(a, { ...a, learned: ['jab'] }, T2).stateUpdatedAt).toBe(T2);
  });

  it('uploads guest data on first sign-in', () => {
    const local = withCombos([combo('a', 'A')], {
      history: [{ id: 's1', date: T1, rounds: 3, completedRounds: 3, roundSec: 180, restSec: 60, callouts: 20, combos: ['A'], durationSec: 600 }],
      learned: ['jab'],
    });
    const { data, push } = mergeAll(local, empty, T2);
    expect(push.combos.map((r) => [r.id, r.deleted])).toEqual([['a', false]]);
    expect(push.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(push.state?.learned).toEqual(['jab']);
    expect(data.combos[0].updatedAt).toBe(T2);
  });

  it('newest edit wins in both directions', () => {
    const remoteNewer = mergeAll(withCombos([combo('a', 'Local', T1)]), { ...empty, combos: [row('a', 'Remote', T2)] });
    expect(remoteNewer.data.combos[0].name).toBe('Remote');
    expect(remoteNewer.push.combos).toEqual([]);

    const localNewer = mergeAll(withCombos([combo('a', 'Local', T2)]), { ...empty, combos: [row('a', 'Remote', T1)] });
    expect(localNewer.data.combos[0].name).toBe('Local');
    expect(localNewer.push.combos[0]).toMatchObject({ id: 'a', name: 'Local', deleted: false, updated_at: T2 });
  });

  it('syncs deletions both ways', () => {
    const localDelete = mergeAll(withCombos([], { tombstones: { a: T2 } }), { ...empty, combos: [row('a', 'A', T1)] });
    expect(localDelete.data.combos).toEqual([]);
    expect(localDelete.push.combos[0]).toMatchObject({ id: 'a', deleted: true, updated_at: T2 });
    expect(localDelete.data.tombstones).toEqual({});

    const remoteDelete = mergeAll(withCombos([combo('a', 'A', T1)]), { ...empty, combos: [row('a', 'A', T2, true)] });
    expect(remoteDelete.data.combos).toEqual([]);
    expect(remoteDelete.push.combos).toEqual([]);
  });

  it('merges history from both sides without duplicates, newest first', () => {
    const s = (id: string, date: string) => ({ id, date, rounds: 1, completedRounds: 1, roundSec: 60, restSec: 10, callouts: 1, combos: [], durationSec: 70 });
    const local = { ...emptyData(), history: [s('l', T1), s('both', T1)] };
    const remote: RemoteData = {
      ...empty,
      sessions: [
        { id: 'r', date: T2, rounds: 1, completed_rounds: 1, round_sec: 60, rest_sec: 10, callouts: 1, combos: [], duration_sec: 70 },
        { id: 'both', date: T1, rounds: 1, completed_rounds: 1, round_sec: 60, rest_sec: 10, callouts: 1, combos: [], duration_sec: 70 },
      ],
    };
    const { data, push } = mergeAll(local, remote);
    expect(data.history.map((x) => x.id)).toEqual(['r', 'l', 'both']);
    expect(push.sessions.map((x) => x.id)).toEqual(['l']);
  });

  it('applies newer progress from the account but keeps this device’s voice', () => {
    const local = { ...emptyData(), learned: ['jab'], stateUpdatedAt: T1, settings: { ...emptyData().settings, voiceURI: 'my-voice' } };
    const { data, push } = mergeAll(local, { ...empty, state: { learned: ['teep'], videos: {}, settings: { stance: 'southpaw', fighter: 'clinch-king' }, updated_at: T2 } });
    expect(data.learned).toEqual(['teep']);
    expect(data.settings.stance).toBe('southpaw');
    expect(data.settings.fighter).toBe('clinch-king');
    expect(data.settings.voiceURI).toBe('my-voice');
    expect(push.state).toBeNull();
  });

  it('signing out removes account data but keeps device preferences', () => {
    const d = { ...withCombos([combo('a', 'A')]), learned: ['jab'], syncedUserId: 'u1', settings: { ...emptyData().settings, theme: 'dark' as const } };
    const out = clearAccountData(d);
    expect(out.combos).toEqual([]);
    expect(out.learned).toEqual([]);
    expect(out.syncedUserId).toBeNull();
    expect(out.settings.theme).toBe('dark');
  });
});

describe('starter combo library', () => {
  it('has 106 combos across all three levels with unique ids and names', () => {
    expect(PRESET_COMBOS).toHaveLength(106);
    const count = (l: string) => PRESET_COMBOS.filter((c) => c.level === l).length;
    expect([count('beginner'), count('intermediate'), count('advanced')]).toEqual([37, 37, 32]);
    expect(new Set(PRESET_COMBOS.map((c) => c.id)).size).toBe(PRESET_COMBOS.length);
    expect(new Set(PRESET_COMBOS.map((c) => c.name.toLowerCase())).size).toBe(PRESET_COMBOS.length);
    expect(new Set(PRESET_COMBOS.map((c) => c.items.join(','))).size).toBe(PRESET_COMBOS.length);
  });

  it('only uses techniques that can be combo strikes', () => {
    for (const c of PRESET_COMBOS) for (const i of c.items) expect(TECH_BY_ID[i]?.strike, `${c.id}:${i}`).toBe(true);
  });

  it('keeps the original starter ids so saved selections still work', () => {
    for (const id of ['1-2', '1-1-2', '1-2-3-kick', 'clinch', 'lean-2-kick']) expect(PRESET_COMBOS.some((c) => c.id === `preset-${id}`)).toBe(true);
  });
});

import { drillOrder, mulberry32 } from './sessionEngine';

describe('combo drill mode', () => {
  const pool3 = [
    { id: 'a', items: ['jab', 'cross'] },
    { id: 'b', items: ['jab', 'cross', 'rear-kick'] },
    { id: 'c', items: ['teep'] },
  ];
  const drill: SessionConfig = { ...DEFAULT_CONFIG, mode: 'drill', drillSec: 30, drillRestSec: 10, drillCount: 3, prepSec: 5, order: 'sequential' };
  const plan = buildPlan(drill, pool3, 7);

  it('alternates work and rest blocks, with no rest after the last combo', () => {
    expect(plan.segments.map((s) => `${s.kind}:${s.comboId}`)).toEqual(['prep:a', 'round:a', 'rest:b', 'round:b', 'rest:c', 'round:c']);
    expect(plan.total).toBe(5000 + 3 * 30000 + 2 * 10000);
  });

  it('calls only the block’s own combo, repeatedly, inside the block', () => {
    for (const seg of plan.segments.filter((s) => s.kind === 'round')) {
      const calls = plan.events.filter((e) => e.type === 'callout' && e.at >= seg.start && e.at < seg.end);
      expect(calls.length).toBeGreaterThanOrEqual(5);
      for (const e of calls) expect(e.type === 'callout' && e.comboId).toBe(seg.comboId);
      expect(calls.map((e) => (e.type === 'callout' ? e.rep : 0))).toEqual(calls.map((_, i) => i + 1));
    }
    expect(plan.events.some((e) => e.type === 'callout' && stateAt(plan, e.at).segment?.kind !== 'round')).toBe(false);
  });

  it('announces each combo once: the first during prep, the rest during each rest', () => {
    const nexts = plan.events.filter((e) => e.type === 'next');
    expect(nexts.map((e) => (e.type === 'next' ? e.comboId : ''))).toEqual(['a', 'b', 'c']);
    expect(nexts.map((e) => stateAt(plan, e.at).segment?.kind)).toEqual(['prep', 'rest', 'rest']);
  });

  it('counts down 3, 2, 1 over the last seconds of every combo block', () => {
    for (const seg of plan.segments.filter((x) => x.kind === 'round')) {
      const counts = plan.events.filter((e) => e.type === 'count' && e.at > seg.start && e.at < seg.end);
      expect(counts.map((e) => (e.type === 'count' ? e.n : 0))).toEqual([3, 2, 1]);
      expect(counts.map((e) => seg.end - e.at)).toEqual([3000, 2000, 1000]);
    }
    expect(plan.events.some((e) => e.type === 'count' && stateAt(plan, e.at).segment?.kind !== 'round')).toBe(false);
  });

  it('with no prep or rest, announces each combo as its block starts', () => {
    const p = buildPlan({ ...drill, prepSec: 0, drillRestSec: 0 }, pool3, 7);
    const nexts = p.events.filter((e) => e.type === 'next');
    const starts = p.segments.filter((s) => s.kind === 'round');
    expect(nexts.map((e) => e.at)).toEqual(starts.map((s) => s.start));
    expect(nexts.map((e) => (e.type === 'next' ? e.comboId : ''))).toEqual(['a', 'b', 'c']);
  });

  it('random order uses every combo before repeating and never repeats back-to-back', () => {
    const order = drillOrder({ ...drill, order: 'random', drillCount: 9 }, pool3, mulberry32(3)).map((c) => c.id);
    expect(order).toHaveLength(9);
    for (let i = 0; i < 9; i += 3) expect(new Set(order.slice(i, i + 3)).size).toBe(3);
    for (let i = 1; i < 9; i++) expect(order[i]).not.toBe(order[i - 1]);
  });

  it('a single combo drills for one block with no rest', () => {
    const one = buildPlan({ ...drill, drillCount: 1 }, [pool3[1]], 1);
    expect(one.segments.map((s) => s.kind)).toEqual(['prep', 'round']);
    expect(one.events.filter((e) => e.type === 'next')).toHaveLength(1);
  });
});

import { addDays, completedDays, dayStatus, dueToday, planStats, planWeeks, resolvePool, workoutSummary, type TrainPlan, type Workout } from './plans';
import { mergeDocs } from './sync';
import { parsePlan, parseWorkout, type SessionLog } from './storage';

describe('training plans', () => {
  // 2026-11-02 is a Monday
  const plan: TrainPlan = {
    id: 'p1', name: '30 days', workoutId: 'w1', start: '2026-11-02', days: 30,
    weekdays: [1, 3, 5], reminder: { enabled: false, time: '18:00' }, marks: {},
  };
  const session = (day: string, extra: Partial<SessionLog> = {}): SessionLog => ({
    id: `s-${day}`, date: new Date(`${day}T10:00:00`).toISOString(), rounds: 1, completedRounds: 1,
    roundSec: 30, restSec: 10, callouts: 5, combos: [], durationSec: 60, workoutId: 'w1', ...extra,
  });

  it('marks training, rest, done, missed and upcoming days', () => {
    const history = [session('2026-11-02'), session('2026-11-07')]; // Mon done, Sat bonus
    const done = completedDays(plan, history);
    const today = '2026-11-06'; // Friday
    expect(dayStatus(plan, '2026-11-02', today, done)).toBe('done');
    expect(dayStatus(plan, '2026-11-03', today, done)).toBe('rest');
    expect(dayStatus(plan, '2026-11-04', today, done)).toBe('missed');
    expect(dayStatus(plan, '2026-11-06', today, done)).toBe('today');
    expect(dayStatus(plan, '2026-11-07', today, done)).toBe('bonus');
    expect(dayStatus(plan, '2026-11-09', today, done)).toBe('upcoming');
    expect(dayStatus(plan, '2026-11-01', today, done)).toBe('before');
    expect(dayStatus(plan, addDays(plan.start, 30), today, done)).toBe('after');
  });

  it('counts progress and a streak that a pending today does not break', () => {
    const history = ['2026-11-02', '2026-11-04', '2026-11-06'].map((d) => session(d));
    const s = planStats(plan, history, '2026-11-09'); // Monday, not trained yet
    expect(s.trainingDays).toBe(13); // Mon/Wed/Fri across 30 days from a Monday
    expect(s.done).toBe(3);
    expect(s.missed).toBe(0);
    expect(s.streak).toBe(3);
    expect(s.dayNumber).toBe(8);
    expect(planStats(plan, history, '2026-11-12').streak).toBe(0); // missed Mon 9 & Wed 11
  });

  it('counts manual ticks and sessions started from the plan, ignores empty sessions', () => {
    const p = { ...plan, marks: { '2026-11-04': 'done' as const } };
    const done = completedDays(p, [session('2026-11-02', { workoutId: undefined, planId: 'p1' }), session('2026-11-06', { completedRounds: 0 })]);
    expect([...done].sort()).toEqual(['2026-11-02', '2026-11-04']);
  });

  it('lists what is due today', () => {
    expect(dueToday([plan], [], '2026-11-04').map((x) => x.status)).toEqual(['today']);
    expect(dueToday([plan], [], '2026-11-03')).toEqual([]);
    expect(dueToday([{ ...plan, archived: true }], [], '2026-11-04')).toEqual([]);
  });

  it('lays the plan out in Monday-first weeks', () => {
    const weeks = planWeeks({ ...plan, start: '2026-11-04', days: 10 }); // starts on a Wednesday
    expect(weeks[0]).toEqual([null, null, '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(10);
  });

  it('resolves workout pools and describes workouts', () => {
    const w: Workout = { id: 'w1', name: 'Kicks', config: { ...DEFAULT_CONFIG, mode: 'drill', drillCount: 4, drillSec: 30, drillRestSec: 15, prepSec: 5 }, pool: { kind: 'pick', comboIds: ['preset-teep-kick', 'preset-1-2'] } };
    expect(resolvePool(w.pool, PRESET_COMBOS, []).map((c) => c.id)).toEqual(['preset-teep-kick', 'preset-1-2']);
    expect(resolvePool({ kind: 'advanced', comboIds: [] }, PRESET_COMBOS, [])).toHaveLength(32);
    // Unticked combos are left out of a level pool, and survive a save/load round trip.
    const adv = resolvePool({ kind: 'advanced', comboIds: [] }, PRESET_COMBOS, []);
    const out = [adv[0].id, adv[1].id];
    expect(resolvePool({ kind: 'advanced', comboIds: [], excluded: out }, PRESET_COMBOS, []).map((c) => c.id)).not.toContain(out[0]);
    expect(resolvePool({ kind: 'advanced', comboIds: [], excluded: out }, PRESET_COMBOS, [])).toHaveLength(30);
    expect(parseWorkout({ id: 'w', name: 'x', config: {}, pool: { kind: 'advanced', comboIds: [], excluded: out } })?.pool.excluded).toEqual(out);
    expect(workoutSummary(w)).toBe('Drill · 4 combos × 30s, 15s rest · 2 picked combos · 2:50');
  });

  it('validates stored workouts and plans', () => {
    expect(parseWorkout({ id: 'w', name: 'x', config: { mode: 'drill' }, pool: { kind: 'nope' } })?.pool.kind).toBe('all');
    expect(parsePlan({ id: 'p', workoutId: 'w', start: 'bad' })).toBeNull();
    const p = parsePlan({ id: 'p', workoutId: 'w', start: '2026-11-02', days: 9999, weekdays: [1, 1, 9], marks: { '2026-11-02': 'done', x: 'done' } });
    expect(p).toMatchObject({ days: 366, weekdays: [1], marks: { '2026-11-02': 'done' } });
  });

  it('syncs workouts/plans newest-wins, including deletions', () => {
    const T1 = '2026-11-20T10:00:00.000Z';
    const T2 = '2026-11-21T10:00:00.000Z';
    const local = [{ ...plan, name: 'local', updatedAt: T2 }];
    const remoteOlder = [{ id: 'p1', data: { ...plan, name: 'remote' }, deleted: false, updated_at: T1 }];
    const a = mergeDocs(local, {}, remoteOlder, parsePlan, T2);
    expect(a.list[0].name).toBe('local');
    expect(a.push).toHaveLength(1);

    const b = mergeDocs([{ ...plan, updatedAt: T1 }], {}, [{ id: 'p1', data: plan, deleted: true, updated_at: T2 }], parsePlan, T2);
    expect(b.list).toEqual([]);

    const c = mergeDocs([], { p1: T2 }, [{ id: 'p1', data: plan, deleted: false, updated_at: T1 }], parsePlan, T2);
    expect(c.push[0]).toMatchObject({ id: 'p1', deleted: true });
  });

  it('stamps workout/plan edits and deletions for sync', () => {
    const base = { ...emptyData(), plans: [{ ...plan, updatedAt: '2026-01-01T00:00:00.000Z' }] };
    const edited = stampChanges(base, { ...base, plans: [{ ...base.plans[0], name: 'renamed' }] }, '2026-11-21T00:00:00.000Z');
    expect(edited.plans[0].updatedAt).toBe('2026-11-21T00:00:00.000Z');
    const removed = stampChanges(base, { ...base, plans: [] }, '2026-11-21T00:00:00.000Z');
    expect(removed.docTombstones.plans).toEqual({ p1: '2026-11-21T00:00:00.000Z' });
  });
});

import { remindersDue } from './reminders';

describe('plan reminders', () => {
  const p: TrainPlan = {
    id: 'r1', name: 'Kicks', workoutId: 'w1', start: '2026-11-02', days: 30,
    weekdays: [1, 3, 5], reminder: { enabled: true, time: '18:00' }, marks: {},
  };
  const at = (day: string, hm: string) => new Date(`${day}T${hm}:00`);

  it('fires after the reminder time on an unfinished training day only', () => {
    expect(remindersDue([p], [], at('2026-11-04', '17:59'))).toEqual([]);
    expect(remindersDue([p], [], at('2026-11-04', '18:00')).map((x) => x.id)).toEqual(['r1']);
    expect(remindersDue([p], [], at('2026-11-05', '19:00'))).toEqual([]); // rest day
    expect(remindersDue([{ ...p, reminder: { enabled: false, time: '18:00' } }], [], at('2026-11-04', '19:00'))).toEqual([]);
    const doneToday = [{ id: 's', date: at('2026-11-04', '07:00').toISOString(), rounds: 1, completedRounds: 1, roundSec: 30, restSec: 10, callouts: 3, combos: [], durationSec: 40, planId: 'r1' }];
    expect(remindersDue([p], doneToday, at('2026-11-04', '19:00'))).toEqual([]);
  });
});

describe('music', () => {
  it('maps pentatonic degrees across octaves', async () => {
    const { degreeFreq } = await import('./music');
    expect(degreeFreq(0, 200)).toBeCloseTo(200);
    expect(degreeFreq(5, 200)).toBeCloseTo(400);
    expect(degreeFreq(-5, 200)).toBeCloseTo(100);
    expect(degreeFreq(3, 200)).toBeCloseTo(200 * Math.pow(2, 7 / 12));
  });
  it('defaults music on at a moderate volume', () => {
    expect(DEFAULT_SETTINGS.music).toBe(true);
    expect(DEFAULT_SETTINGS.musicVolume).toBeGreaterThan(0);
  });
});

describe('voice', () => {
  const v = (name: string, lang = 'en-US') => ({ name, lang, voiceURI: name, default: false, localService: true }) as SpeechSynthesisVoice;
  it('prefers natural voices over robotic defaults', async () => {
    const { bestVoice, isNaturalVoice } = await import('./audio');
    const list = [v('Microsoft David - English (United States)'), v('Google UK English Male', 'en-GB'), v('Microsoft Ava Online (Natural) - English (United States)'), v('Google français', 'fr-FR')];
    expect(bestVoice(list)?.name).toMatch(/Ava Online \(Natural\)/);
    expect(isNaturalVoice(list[0])).toBe(false);
    expect(isNaturalVoice(list[1])).toBe(true);
    expect(bestVoice([v('Google français', 'fr-FR')])).toBeUndefined();
  });
  it('keys clips by words only and covers every fixed phrase', async () => {
    const { clipKey, fixedPhrases, countPhrase } = await import('../data/phrases');
    expect(clipKey('Rest. Next')).toBe('rest next');
    expect(clipKey('One, two, kick!')).toBe('one two kick');
    expect(countPhrase(3)).toBe('Three');
    const all = fixedPhrases().map(clipKey);
    expect(all).toContain('round 12');
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('voice speed', () => {
  it('time-stretches without changing pitch', async () => {
    const { wsola, audibleRange } = await import('./timeStretch');
    const sr = 8000;
    const f = 200; // Hz
    const input = new Float32Array(sr); // 1 s tone
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * f * i) / sr) * 0.5;
    const { out } = wsola(input, 1.25, sr);
    expect(out.length).toBe(Math.round(sr / 1.25));
    // Same pitch: count zero crossings in the steady middle part.
    const crossings = (d: Float32Array, a: number, b: number) => {
      let n = 0;
      for (let i = a + 1; i < b; i++) if (d[i - 1] < 0 !== d[i] < 0) n++;
      return n / ((b - a) / sr);
    };
    expect(crossings(out, 800, 5600)).toBeGreaterThan(2 * f * 0.95);
    expect(crossings(out, 800, 5600)).toBeLessThan(2 * f * 1.05);
    // Silence trimming keeps a little padding.
    const padded = new Float32Array(sr * 2);
    padded.set(input, sr / 2);
    const [a, b] = audibleRange(padded, sr);
    expect(a).toBeGreaterThan(sr / 2 - 0.05 * sr);
    expect(b).toBeLessThan(sr / 2 + sr + 0.05 * sr);
  });
  it('moves the old default speech rate to 1.25', () => {
    const d = parseData({ settings: { rate: 1.05 } });
    expect(d.settings.rate).toBe(1.25);
    expect(parseData({ settings: { rate: 0.9 } }).settings.rate).toBe(0.9);
  });
});

describe('essentials, favourites and practice', () => {
  it('marks a core set of starter combos as essential', async () => {
    const { ESSENTIAL_IDS, PRESET_COMBOS: P } = await import('../data/combos');
    const ess = P.filter((c) => c.essential);
    expect(ess.map((c) => c.id).sort()).toEqual([...ESSENTIAL_IDS].sort()); // every id exists
    expect(ess.length).toBeGreaterThanOrEqual(10);
  });

  it('counts sessions per combo and finds what is due', async () => {
    const { practiceStats, daysSince } = await import('./stats');
    const { dueCombos, resolvePool } = await import('./plans');
    const now = new Date('2026-06-15T12:00:00');
    const h = (daysAgo: number, combos: string[]) => ({ date: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), combos }) as SessionLog;
    const history = [h(1, ['Jab Cross', 'Jab Cross Kick']), h(10, ['Jab Cross', 'Classic Four']), h(3, ['jab cross'])];
    const stats = practiceStats(history);
    expect(stats.get('jab cross')?.sessions).toBe(3);
    expect(daysSince(stats.get('jab cross'), now)).toBe(1);
    expect(daysSince(stats.get('classic four'), now)).toBe(10);
    expect(daysSince(undefined, now)).toBe(Infinity);

    const fav = PRESET_COMBOS.find((c) => c.level === 'advanced')!;
    const due = dueCombos(PRESET_COMBOS, [], { favorites: [fav.id], history, now }).map((c) => c.name);
    expect(due).toContain(fav.name); // favourite, never drilled
    expect(due).toContain('Classic Four'); // essential, 10 days ago
    expect(due).not.toContain('Jab Cross'); // drilled yesterday
    expect(due.indexOf('Classic Four')).toBeGreaterThan(due.indexOf(fav.name)); // never-drilled first
    expect(resolvePool({ kind: 'favorites', comboIds: [] }, PRESET_COMBOS, [], { favorites: [fav.id], history: [] })).toEqual([fav]);
  });

  it('keeps favourites as a clean list of ids', () => {
    expect(parseData({ settings: { favorites: ['a', 3, 'b'] } }).settings.favorites).toEqual(['a', 'b']);
    expect(parseData({}).settings.favorites).toEqual([]);
  });
});

describe('own combos', () => {
  it('are not part of level pools, only All and My combos', async () => {
    const { resolvePool } = await import('./plans');
    const own: Combo = { id: 'c-x', name: 'My Thing', items: ['jab'], level: 'beginner', style: 'numbers' };
    const all = [...PRESET_COMBOS, own];
    expect(resolvePool({ kind: 'beginner', comboIds: [] }, all, [own]).map((c) => c.id)).not.toContain('c-x');
    expect(resolvePool({ kind: 'all', comboIds: [] }, all, [own]).map((c) => c.id)).toContain('c-x');
    expect(resolvePool({ kind: 'mine', comboIds: [] }, all, [own])).toEqual([own]);
  });
});

describe('tightening strike clips', () => {
  it('shortens a long pause inside a word but keeps short stops', async () => {
    const { pauseCuts, spliceRanges } = await import('./timeStretch');
    const sr = 8000;
    const tone = (sec: number) => Array.from({ length: Math.round(sec * sr) }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / sr) * 0.5);
    const gap = (sec: number) => Array.from({ length: Math.round(sec * sr) }, () => 0);
    const long = new Float32Array([...tone(0.3), ...gap(0.2), ...tone(0.3)]);
    const out = spliceRanges(long, pauseCuts(long, sr), sr);
    expect(out.length / sr).toBeGreaterThan(0.6 + 0.07);
    expect(out.length / sr).toBeLessThan(0.6 + 0.11); // 200 ms pause → ~90 ms
    const short = new Float32Array([...tone(0.3), ...gap(0.06), ...tone(0.3)]);
    expect(pauseCuts(short, sr)).toHaveLength(1); // untouched
  });
});
