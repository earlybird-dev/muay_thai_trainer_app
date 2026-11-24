import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildPlan, eventsBetween, stateAt, type SessionConfig } from './sessionEngine';
import { DEFAULT_SETTINGS, emptyData, parseData, serializeData } from './storage';
import { filterSessions, learnedStrike, sessionId, sessionTimeRange, sessionTimes, sessionType, streakDays } from './stats';
import { calloutTokens, PRESET_COMBOS } from '../data/combos';
import { STRIKES, TECHNIQUES, TECH_BY_ID, youtubeId } from '../data/techniques';
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
    expect(kick.rear.ankle.z).toBeGreaterThan(guard.rear.ankle.z + 12); // shin sweeps past the centre line
    const knee = at('knee', 'Hips');
    expect(Math.abs(knee.rear.ankle.z - guard.rear.ankle.z)).toBeLessThan(3);
  });

  it('roundhouse kicks turn the hips over and pivot the standing foot', () => {
    const kick = at('rear-kick', 'Swing');
    expect(kick.rear.hip.x).toBeGreaterThan(kick.lead.hip.x + 10); // rear hip turned forward
    expect(kick.rear.shoulder.x).toBeGreaterThan(kick.lead.shoulder.x); // shoulders follow
    // Lead (standing) foot: toes turned out to the lead side, heel toward the target.
    expect(kick.lead.toe.z - kick.lead.ankle.z).toBeGreaterThan(9);
    expect(kick.lead.toe.x).toBeLessThan(kick.lead.ankle.x);
    // Switch kick mirrors it: the lead hip comes forward and the rear foot pivots the other way.
    const sw = at('switch-kick', 'Swing');
    expect(sw.lead.hip.x).toBeGreaterThan(sw.rear.hip.x + 10);
    expect(sw.rear.toe.z - sw.rear.ankle.z).toBeLessThan(-9);
    expect(sw.lead.ankle.z).toBeLessThan(0); // lead shin sweeps across toward the rear side
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

import { practiceLaunch } from './useStartWorkout';
import { BeatTracker } from './beat';
import { clearAccountData, deleteSession, mergeAll, stampChanges, type ComboRow, type RemoteData } from './sync';
import { demoAddedAt } from './demoData';
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

  it('a "Clear history" on one device removes old sessions on every device', () => {
    const s = (id: string, date: string) => ({ id, date, rounds: 1, completedRounds: 1, roundSec: 60, restSec: 10, callouts: 1, combos: [], durationSec: 70 });
    const row = (id: string, date: string) => ({ id, date, rounds: 1, completed_rounds: 1, round_sec: 60, rest_sec: 10, callouts: 1, combos: [], duration_sec: 70 });
    const cleared = '2026-11-10T12:00:00.000Z';
    const before = '2026-11-09T08:00:00.000Z';
    const after = '2026-11-11T08:00:00.000Z';
    // Another device still has an old session and a new one; the account says history was cleared.
    const other = { ...emptyData(), history: [s('old', before), s('new', after)] };
    const remote: RemoteData = { ...empty, sessions: [row('old2', before)], state: { learned: [], videos: {}, settings: { historyClearedAt: cleared }, updated_at: cleared } };
    const { data, push } = mergeAll(other, remote);
    expect(data.history.map((x) => x.id)).toEqual(['new']); // old ones dropped locally…
    expect(push.sessions.map((x) => x.id)).toEqual(['new']); // …and not uploaded again
    // The device that cleared ignores any old session that was uploaded before the clear reached it.
    const mine = { ...emptyData(), settings: { ...emptyData().settings, historyClearedAt: cleared } };
    expect(mergeAll(mine, { ...empty, sessions: [row('old', before), row('new', after)] }).data.history.map((x) => x.id)).toEqual(['new']);
  });

  describe('deleting one session', () => {
    const s = (id: string) => ({ id, date: '2026-11-20T08:00:00.000Z', rounds: 1, completedRounds: 1, roundSec: 60, restSec: 10, callouts: 1, combos: [], durationSec: 70 });
    const row = (id: string) => ({ id, date: '2026-11-20T08:00:00.000Z', rounds: 1, completed_rounds: 1, round_sec: 60, rest_sec: 10, callouts: 1, combos: [], duration_sec: 70 });
    const state = (deletedSessions: string[] | undefined, updated_at: string) => ({
      learned: ['jab'],
      videos: {},
      settings: { stance: 'southpaw' as const, ...(deletedSessions ? { deletedSessions } : {}) },
      updated_at,
    });

    it('removes only that session and asks the account to drop it', () => {
      const d = deleteSession({ ...emptyData(), history: [s('a'), s('b')] }, 'a');
      expect(d.history.map((x) => x.id)).toEqual(['b']);
      const { data, push } = mergeAll(d, { ...empty, sessions: [row('a'), row('b')] });
      expect(data.history.map((x) => x.id)).toEqual(['b']);
      expect(push.sessionDeletes).toEqual(['a']);
      expect(push.state?.settings.deletedSessions).toEqual(['a']);
    });

    it('stays deleted on a device that still has it, and is not uploaded again', () => {
      const other = { ...emptyData(), history: [s('a'), s('b')] };
      const { data, push } = mergeAll(other, { ...empty, sessions: [row('b')], state: state(['a'], T1) });
      expect(data.history.map((x) => x.id)).toEqual(['b']);
      expect(data.settings.deletedSessions).toEqual(['a']);
      expect(push.sessions).toEqual([]);
    });

    it('survives when the account has newer settings from another device', () => {
      const d = { ...deleteSession({ ...emptyData(), history: [s('a')] }, 'a'), stateUpdatedAt: T1 };
      const { data, push } = mergeAll(d, { ...empty, sessions: [row('a')], state: state(undefined, T2) });
      expect(data.settings.stance).toBe('southpaw'); // the newer settings still win…
      expect(data.settings.deletedSessions).toEqual(['a']); // …without forgetting the delete
      expect(push.sessionDeletes).toEqual(['a']);
      expect(push.state).toMatchObject({ learned: ['jab'], settings: { stance: 'southpaw', deletedSessions: ['a'] }, updated_at: T2 });
    });

    it('merges deletes made on two devices', () => {
      const d = { ...deleteSession({ ...emptyData(), history: [s('a'), s('b'), s('c')] }, 'a'), stateUpdatedAt: T2 };
      const { data, push } = mergeAll(d, { ...empty, sessions: [row('a'), row('c')], state: state(['b'], T1) });
      expect(data.history.map((x) => x.id)).toEqual(['c']);
      expect([...(push.state?.settings.deletedSessions ?? [])].sort()).toEqual(['a', 'b']);
    });

    it('settles: nothing more to send once the account knows', () => {
      const d = { ...emptyData(), stateUpdatedAt: T1, settings: { ...emptyData().settings, deletedSessions: ['a'] } };
      const { push } = mergeAll(d, { ...empty, state: state(['a'], T1) });
      expect(push.state).toBeNull();
      expect(push.sessionDeletes).toEqual([]);
    });

    it('does not carry over to another account', () => {
      const d = deleteSession({ ...emptyData(), history: [s('a')] }, 'a');
      expect(clearAccountData(d).settings.deletedSessions).toEqual([]);
    });
  });

  it('sample sessions survive a clear made before they were added, but not a later one', () => {
    const s = (id: string, date: string) => ({ id, date, rounds: 1, completedRounds: 1, roundSec: 60, restSec: 10, callouts: 1, combos: [], durationSec: 70 });
    const day = '2026-10-01T08:00:00.000Z'; // back-dated sample session
    const addedAt = Date.parse('2026-11-22T11:00:00.000Z');
    const sample = s(`demo-${addedAt.toString(36)}-s-2026-10-01`, day);
    const withClear = (cleared: string) => ({ ...emptyData(), history: [sample], settings: { ...emptyData().settings, historyClearedAt: cleared } });
    // Cleared at 10:00, sample added at 11:00: it stays, and is uploaded.
    const earlier = mergeAll(withClear('2026-11-22T10:00:00.000Z'), empty);
    expect(earlier.data.history.map((x) => x.id)).toEqual([sample.id]);
    expect(earlier.push.sessions.map((x) => x.id)).toEqual([sample.id]);
    // Cleared at 12:00, after it was added: it goes, and isn't uploaded again.
    const later = mergeAll(withClear('2026-11-22T12:00:00.000Z'), empty);
    expect(later.data.history).toEqual([]);
    expect(later.push.sessions).toEqual([]);
    // A real session with a made-up "demo-" id but no add time is treated like any other.
    expect(demoAddedAt('demo-s-2026-10-01')).toBeNaN();
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

import { drillOrder, drillProgress, mulberry32 } from './sessionEngine';

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

  it('counts 3, 2, 1, Go into each combo block, never over the announcement', () => {
    const counts = (r: number) => plan.events.filter((e) => e.type === 'count' && e.round === r);
    for (const seg of plan.segments.filter((x) => x.kind === 'round')) {
      const cs = counts(seg.round);
      // "Go" exactly as the block starts; the numbers before it, one second apart.
      expect(cs.at(-1)).toMatchObject({ n: 0, at: seg.start });
      for (const e of cs.slice(0, -1)) expect(e.type === 'count' && seg.start - e.at).toBe((e as { n: number }).n * 1000);
      // Nothing counted during the work itself.
      expect(cs.every((e) => e.at <= seg.start)).toBe(true);
    }
    // 5 s get-ready: "3" would land 2 s in, over the "First up" announcement, so it's skipped.
    expect(counts(1).map((e) => (e.type === 'count' ? e.n : -1))).toEqual([2, 1, 0]);
    // 10 s rests: the full 3, 2, 1, Go.
    expect(counts(2).map((e) => (e.type === 'count' ? e.n : -1))).toEqual([3, 2, 1, 0]);
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
    const history = [session('2026-11-02'), session('2026-11-07')]; // Mon done, Sat also counts
    const done = completedDays(plan, history);
    const today = '2026-11-06'; // Friday
    expect(dayStatus(plan, '2026-11-02', today, done)).toBe('done');
    expect(dayStatus(plan, '2026-11-03', today, done)).toBe('rest');
    expect(dayStatus(plan, '2026-11-04', today, done)).toBe('missed');
    expect(dayStatus(plan, '2026-11-06', today, done)).toBe('today');
    expect(dayStatus(plan, '2026-11-07', today, done)).toBe('done'); // any day counts toward the week
    expect(dayStatus(plan, '2026-11-09', today, done)).toBe('upcoming');
    expect(dayStatus(plan, '2026-11-01', today, done)).toBe('before');
    expect(dayStatus(plan, addDays(plan.start, 30), today, done)).toBe('after');
  });

  it('lets you train any day: a swapped day is moved, not missed, and extras are bonus', () => {
    // Mon/Wed/Fri plan. Trained Mon, Tue (instead of Wed), Fri, Sat.
    const history = ['2026-11-02', '2026-11-03', '2026-11-06', '2026-11-07'].map((d) => session(d));
    const done = completedDays(plan, history);
    const today = '2026-11-08';
    expect(dayStatus(plan, '2026-11-03', today, done)).toBe('done'); // Tuesday counts
    expect(dayStatus(plan, '2026-11-04', today, done)).toBe('moved'); // Wednesday made up
    expect(dayStatus(plan, '2026-11-07', today, done)).toBe('bonus'); // 4th session in a 3-session week
    const st = planStats(plan, history, today);
    expect(st.done).toBe(3);
    expect(st.missed).toBe(0);
    expect(st.streak).toBe(4);
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

  it('shows whole calendar months around the plan', async () => {
    const { planMonths } = await import('./plans');
    const months = planMonths({ ...plan, start: '2026-11-22', days: 30 }); // Nov 22 → Dec 21
    expect(months.map((m) => m.key)).toEqual(['2026-11-01', '2026-12-01']);
    expect(months[0].weeks.flat().filter(Boolean)).toHaveLength(30); // all of November
    expect(months[1].weeks.flat().filter(Boolean)).toHaveLength(31); // all of December
    expect(months[0].weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]); // Nov 1 2026 is a Sunday
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
  it('join the pool for the level you gave them', async () => {
    const { resolvePool } = await import('./plans');
    const own: Combo = { id: 'c-x', name: 'My Thing', items: ['jab'], level: 'intermediate', style: 'numbers' };
    const all = [...PRESET_COMBOS, own];
    expect(resolvePool({ kind: 'intermediate', comboIds: [] }, all, [own]).map((c) => c.id)).toContain('c-x');
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

describe('technique videos', () => {
  it('every technique has a suggested YouTube video', async () => {
    const { TECHNIQUES } = await import('../data/techniques');
    for (const t of TECHNIQUES) expect(t.videoId, t.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(new Set(TECHNIQUES.map((t) => t.videoId)).size).toBe(TECHNIQUES.length);
  });
});

describe('seo', () => {
  it('gives every indexed page a unique title, description and trailing-slash canonical URL', async () => {
    const { indexedPaths, pageMeta, canonicalUrl, fullTitle } = await import('./seo');
    const paths = indexedPaths();
    const titles = paths.map((p) => fullTitle(pageMeta(p)));
    expect(new Set(titles).size).toBe(paths.length);
    for (const p of paths) {
      const m = pageMeta(p);
      expect(m.description.length).toBeGreaterThan(50);
      expect(fullTitle(m).length).toBeLessThan(110);
    }
    expect(pageMeta('/learn/jab').title).toMatch(/Jab/);
    expect(canonicalUrl('/learn/jab')).toBe('https://muaythaitrainer.app/learn/jab/');
    expect(canonicalUrl('/')).toBe('https://muaythaitrainer.app/');
  });
});

describe('training music', () => {
  it('gives downloaded tracks clean names from their file names', async () => {
    const { trackNameFromFile, TRAINING_TRACKS } = await import('./music');
    expect(trackNameFromFile('gr0za-racing-racing-speed-brass-music-610347.mp3')).toBe('Racing Speed Brass Music');
    expect(trackNameFromFile('gr0za-rap-rap-beat-610255.mp3')).toBe('Rap Beat');
    expect(trackNameFromFile('echoes_of_lumen-trap-beat-heavy-bass-586976.mp3')).toBe('Trap Beat Heavy Bass');
    expect(trackNameFromFile('alex-morgan-dark-trap-lazy-beat-instrumental-587390.mp3')).toBe('Dark Trap Lazy Beat');
    const names = TRAINING_TRACKS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length); // no two the same
    expect(TRAINING_TRACKS).toHaveLength(10);
  });
});

describe('history dashboard', () => {
  const at = (d: string, min = 20, combos: string[] = []) => ({ date: new Date(`${d}T18:00:00`).toISOString(), durationSec: min * 60, combos }) as SessionLog;
  it('computes best streak, daily levels, weekly totals and top combos', async () => {
    const { bestStreak, activityGrid, weeklyTotals, topCombos } = await import('./stats');
    const h = [at('2026-11-02', 5, ['Jab Cross']), at('2026-11-03', 15, ['Jab Cross', 'Teep Kick']), at('2026-11-04', 40, ['Jab Cross']), at('2026-11-10', 25), at('2026-11-10', 10)];
    expect(bestStreak(h)).toBe(3);
    const today = new Date('2026-11-12T12:00:00');
    const grid = activityGrid(h, 3, today);
    expect(grid).toHaveLength(3);
    expect(grid[0][0].key).toBe('2026-10-26'); // a Monday, 2 weeks before this one
    const lvl = Object.fromEntries(grid.flat().map((d) => [d.key, d.level]));
    expect([lvl['2026-11-02'], lvl['2026-11-03'], lvl['2026-11-04'], lvl['2026-11-10']]).toEqual([1, 2, 4, 4]); // Nov 10: 35 min
    expect(grid.flat().find((d) => d.key === '2026-11-13')?.future).toBe(true);
    const weeks = weeklyTotals(h, 2, today);
    expect(weeks).toEqual([
      { start: '2026-11-02', minutes: 60, sessions: 3 },
      { start: '2026-11-09', minutes: 35, sessions: 2 },
    ]);
    expect(topCombos(h)).toEqual([
      { name: 'Jab Cross', sessions: 3 },
      { name: 'Teep Kick', sessions: 1 },
    ]);
  });
});

describe('plan week columns', () => {
  it('shows 26 weeks from the start month, longer if the plan needs it', async () => {
    const { planWeekColumns } = await import('./plans');
    const base = { id: 'p', name: 'x', workoutId: 'w', start: '2026-11-22', days: 30, weekdays: [2, 4, 6], reminder: { enabled: false, time: '18:00' }, marks: {} };
    const cols = planWeekColumns(base);
    expect(cols).toHaveLength(26);
    expect(cols[0][0]).toBe('2026-10-26'); // Monday before Nov 1 (a Sunday)
    expect(cols.every((c) => c.length === 7)).toBe(true);
    expect(planWeekColumns(base, 13)).toHaveLength(13);
    const long = planWeekColumns({ ...base, days: 365 }); // a year-long plan grows past 26 weeks
    expect(long[long.length - 1][6] >= '2027-11-21').toBe(true);
  });
});

describe('session filters', () => {
  // Local times, so "a day" means the user's day.
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();
  const today = new Date(2026, 10, 24, 12);
  const list = [
    { id: 'late', date: at(2026, 11, 24, 23), mode: 'drill' as const, rounds: 12, roundSec: 35, combos: ['Jab Cross'], workoutId: 'w1' },
    { id: 'early', date: at(2026, 11, 24, 0), mode: 'rounds' as const, rounds: 3, roundSec: 180, combos: ['Teep Kick'] },
    { id: 'edge', date: at(2026, 11, 18, 0), mode: 'drill' as const, rounds: 12, roundSec: 35, combos: ['Jab Teep'], workoutId: 'w2' },
    { id: 'old', date: at(2026, 11, 17, 23), rounds: 3, roundSec: 180, combos: ['Classic Four'] },
  ];
  const ids = (f: Parameters<typeof filterSessions>[1]) => filterSessions(list, f, today).map((s) => s.id);

  it('keeps everything when nothing is set', () => expect(ids({})).toEqual(['late', 'early', 'edge', 'old']));
  it('picks one local day, start to end', () => expect(ids({ day: '2026-11-24' })).toEqual(['late', 'early']));
  it('a day wins over a period', () => expect(ids({ day: '2026-11-17', days: 7 })).toEqual(['old']));
  it('counts today in the last N days', () => expect(ids({ days: 7 })).toEqual(['late', 'early', 'edge']));
  it('treats old entries without a mode as rounds', () => {
    expect(ids({ type: 'rounds' })).toEqual(['early', 'old']);
    expect(ids({ type: 'drill' })).toEqual(['late', 'edge']);
  });
  it('filters by workout', () => expect(ids({ workoutId: 'w1' })).toEqual(['late']));
  it('combines filters', () => expect(ids({ days: 7, type: 'drill', workoutId: 'w2' })).toEqual(['edge']));
});

describe('Strike drill', () => {
  it('drills just that strike for exactly three minutes, for every strike', () => {
    for (const t of STRIKES) {
      const { config, pool, techniqueId } = practiceLaunch(t, null);
      const plan = buildPlan(config, pool, 1);
      const work = plan.segments.filter((s) => s.kind === 'round');
      expect(work).toHaveLength(1);
      expect(work[0].end - work[0].start).toBe(180_000);
      expect(plan.segments.map((s) => s.kind)).toEqual(['prep', 'round']);
      expect(pool[0].items).toEqual([t.id]);
      expect(techniqueId).toBe(t.id);
    }
  });
  it('keeps your usual pace but not the rest of your last setup', () => {
    const { config } = practiceLaunch(STRIKES[0], { mode: 'rounds', drillSec: 30, drillCount: 40, minGap: 1, maxGap: 2 });
    expect(config).toMatchObject({ mode: 'drill', drillSec: 180, drillCount: 1, minGap: 1, maxGap: 2 });
  });
});

describe('drill progress ring', () => {
  const cfg = { ...DEFAULT_CONFIG, mode: 'drill' as const, drillSec: 30, drillRestSec: 10, drillCount: 3, prepSec: 10 };
  const pool = [{ id: 'a', items: ['jab'] }, { id: 'b', items: ['cross'] }];
  const plan = buildPlan(cfg, pool, 1);
  const at = (sec: number) => drillProgress(plan, sec * 1000);

  it('starts empty during get-ready', () => expect(at(5)).toEqual({ total: 3, completed: 0, progress: 0, label: '3 to go' }));
  it('fills through the current combo', () => {
    expect(at(10)).toEqual({ total: 3, completed: 0, progress: 0, label: '2 left' });
    expect(at(25)).toEqual({ total: 3, completed: 0, progress: 0.5, label: '2 left' });
  });
  it('holds still during the rest', () => {
    expect(at(40)).toEqual({ total: 3, completed: 1, progress: 1, label: '2 to go' });
    expect(at(49)).toEqual({ total: 3, completed: 1, progress: 1, label: '2 to go' });
  });
  it('says when it is the last one, and ends full', () => {
    expect(at(90 + 15).label).toBe('Last combo');
    expect(at(plan.total / 1000)).toEqual({ total: 3, completed: 3, progress: 3, label: '' });
  });
  it('never runs backwards', () => {
    let last = 0;
    for (let ms = 0; ms <= plan.total; ms += 250) {
      const p = drillProgress(plan, ms).progress;
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
  it('shows no count for a single combo', () => {
    const one = buildPlan({ ...cfg, drillCount: 1 }, pool, 1);
    expect(drillProgress(one, 20_000).label).toBe('');
  });
});

describe('session start and finish', () => {
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();
  const log = (id: string, end: number, durationSec: number) => ({ id, date: new Date(end).toISOString(), durationSec });

  it('keeps the real start, pauses included', () => {
    const start = at(24, 17, 40);
    const end = at(24, 18, 11);
    const t = sessionTimes(log(sessionId(start, end), end, 1330)); // 22 min trained over 31 min
    expect(t).toEqual({ start: new Date(start), end: new Date(end), exact: true });
  });
  it('estimates the start of older sessions, and says so', () => {
    const end = at(24, 18, 11);
    const t = sessionTimes(log('s-abc123', end, 1320));
    expect(t.start.getTime()).toBe(at(24, 17, 49));
    expect(t.exact).toBe(false);
    expect(sessionTimeRange(log('s-abc123', end, 1320)).startsWith('~')).toBe(true);
  });
  it('ignores an impossible start', () => {
    const end = at(24, 18, 0);
    expect(sessionTimes(log(sessionId(end + 60_000, end), end, 600)).exact).toBe(false); // after the finish
    expect(sessionTimes(log(sessionId(end - 60_000, end), end, 600)).exact).toBe(false); // too short for the time trained
    expect(sessionTimes(log(sessionId(at(20, 18, 0), end), end, 600)).exact).toBe(false); // days earlier
  });
  it('names the day before when it ran past midnight', () => {
    const end = at(25, 0, 0);
    const range = sessionTimeRange(log(sessionId(at(24, 23, 57), end), end, 160));
    const tue = new Date(at(24, 23, 57)).toLocaleDateString(undefined, { weekday: 'short' });
    expect(range.startsWith(`${tue} `)).toBe(true);
  });
  it('leaves sample sessions alone', () => {
    const end = at(24, 18, 0);
    expect(sessionTimes(log('demo-mwrpzce1-s-2026-11-24', end, 600)).exact).toBe(false);
  });
});

describe('Learn sessions in history', () => {
  // What a strike drill is logged as.
  const logOf = (t: (typeof STRIKES)[number]) => {
    const { config, pool } = practiceLaunch(t, null);
    return { mode: config.mode, rounds: config.drillCount, roundSec: config.drillSec, combos: [pool[0].name] };
  };

  it('still recognises the older one-minute drills', () => {
    expect(sessionType({ ...logOf(STRIKES[0]), roundSec: 60 })).toBe('learn');
  });
  it('recognises the drill of every strike', () => {
    for (const t of STRIKES) {
      expect(learnedStrike(logOf(t))?.id).toBe(t.id);
      expect(sessionType(logOf(t))).toBe('learn');
    }
  });
  it('leaves other sessions as they are', () => {
    const jab = logOf(STRIKES[0]);
    expect(sessionType({ ...jab, rounds: 12 })).toBe('drill'); // a full drill
    expect(sessionType({ ...jab, roundSec: 30 })).toBe('drill'); // another length
    expect(sessionType({ ...jab, combos: ['Jab Cross'] })).toBe('drill'); // a combo
    expect(sessionType({ ...jab, combos: [] })).toBe('drill');
    expect(sessionType({ ...jab, workoutId: 'w1' })).toBe('drill'); // from a saved workout
    expect(sessionType({ ...jab, mode: 'rounds' as const })).toBe('rounds');
  });
  it('has its own filter, apart from Combo drill', () => {
    const list = [
      { id: 'learn', date: new Date().toISOString(), ...logOf(STRIKES[0]) },
      { id: 'drill', date: new Date().toISOString(), mode: 'drill' as const, rounds: 12, roundSec: 35, combos: ['Jab Cross'] },
    ];
    expect(filterSessions(list, { type: 'learn' }).map((s) => s.id)).toEqual(['learn']);
    expect(filterSessions(list, { type: 'drill' }).map((s) => s.id)).toEqual(['drill']);
  });
});

describe('drum hits from the music', () => {
  type Sound = (ms: number) => number[];
  /** A drum at `bpm`: a sharp rise in the given bands, then a fall, over a steady held note. */
  const drum = (bpm: number, loud: number, shape = [1, 0.6, 0.4, 0.3, 0.2]): Sound => (ms) => {
    const since = ms % (60_000 / bpm);
    return shape.map((s) => loud * (0.05 + s * Math.exp(-since / 80)));
  };
  const run = (sound: Sound, seconds: number, fps = 60) => {
    const b = new BeatTracker();
    const hits: { ms: number; strength: number }[] = [];
    for (let k = 0; k < seconds * fps; k++) {
      const ms = (k * 1000) / fps;
      const { hit } = b.update(sound(ms), ms);
      if (hit) hits.push({ ms, strength: hit });
    }
    return hits;
  };

  it('finds each hit once, at any tempo', () => {
    for (const bpm of [80, 120, 160]) expect(Math.abs(run(drum(bpm, 0.5), 30).length - bpm / 2)).toBeLessThanOrEqual(2);
  });
  it('lands on the hit', () => {
    for (const { ms } of run(drum(120, 0.5), 20)) expect(Math.min(ms % 500, 500 - (ms % 500))).toBeLessThan(40);
  });
  it('works the same for quiet and loud tracks', () => {
    const at = (loud: number) => run(drum(120, loud), 20).map((h) => h.ms);
    expect(at(0.05)).toEqual(at(0.9));
  });
  it('keeps up on a slow phone', () => expect(Math.abs(run(drum(120, 0.5), 30, 24).length - 60)).toBeLessThanOrEqual(2));
  it('ignores silence, a held note and a wobbling bass note', () => {
    expect(run(() => [0, 0, 0, 0, 0], 10)).toEqual([]);
    expect(run(() => [0.5, 0.4, 0.2, 0.1, 0.1], 10).length).toBeLessThanOrEqual(1);
    expect(run((ms) => [0.4 + 0.15 * Math.sin(ms / 12), 0.2, 0.1, 0.05, 0.05], 10).length).toBeLessThanOrEqual(1);
  });
  it('hits harder on a kick than on a cymbal of the same song, however soft the song', () => {
    const avg = (h: { strength: number }[]) => h.reduce((a, x) => a + x.strength, 0) / h.length;
    for (const loud of [0.05, 0.9]) {
      const kick = drum(120, loud, [1, 0.8, 0.4, 0.2, 0.1]);
      const cymbal = drum(120, loud, [0, 0, 0.1, 1, 1]);
      const hits = run((ms) => kick(ms).map((v, i) => v + cymbal(ms + 250)[i]), 20); // a cymbal between kicks
      const onKick = hits.filter(({ ms }) => Math.min(ms % 500, 500 - (ms % 500)) < 60);
      const between = hits.filter(({ ms }) => Math.abs((ms % 500) - 250) < 60);
      expect(onKick.length).toBeGreaterThan(30);
      expect(between.length).toBeGreaterThan(30);
      expect(avg(onKick)).toBeGreaterThan(0.7);
      expect(avg(between)).toBeLessThan(0.45);
    }
  });
});
