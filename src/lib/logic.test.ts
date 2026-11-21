import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildPlan, eventsBetween, stateAt, type SessionConfig } from './sessionEngine';
import { emptyData, parseData, serializeData } from './storage';
import { streakDays } from './stats';
import { calloutTokens, PRESET_COMBOS } from '../data/combos';
import { TECHNIQUES, TECH_BY_ID, youtubeId } from '../data/techniques';
import { solve, withGuard } from './pose';

const pool = [
  { id: 'a', items: ['jab', 'cross'] },
  { id: 'b', items: ['jab', 'cross', 'rear-kick'] },
];
const cfg: SessionConfig = { ...DEFAULT_CONFIG, rounds: 2, roundSec: 30, restSec: 10, prepSec: 5 };

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
