import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { chainPhases } from '../components/Figure';
import FigureView from '../components/FigureView';
import { calloutDisplay, type Combo } from '../data/combos';
import { TECH_BY_ID } from '../data/techniques';
import { beep, bell, clap, comboSpeech, preloadVoice, requestWakeLock, speak, stopSpeech, unlockAudio } from '../lib/audio';
import { PHRASES, countPhrase, fixedPhrases, roundPhrase } from '../data/phrases';
import { DEFAULT_CONFIG, MIN_PREP_SEC, withLimits, buildPlan, eventsBetween, formatClock, stateAt, type SessionConfig } from '../lib/sessionEngine';
import { useStore } from '../lib/store';
import { newId } from '../data/combos';
import { poolBase, resolvePool, workoutSummary, type PoolKind, type Workout } from '../lib/plans';
import { useStartWorkout, type LaunchState } from '../lib/useStartWorkout';
import type { FinishedSummary } from '../components/FinishedCard';
import TodayCard from '../components/TodayCard';
import MusicToggle from '../components/MusicToggle';
import { FavButton, practiceLabel, usePractice } from '../components/ComboMeta';
import { useDialog } from '../components/Dialog';
import { primeTrainingMusic, setMusicScene } from '../lib/music';

type PoolMode = PoolKind;

const PACES = [
  { id: 'relaxed', label: 'Relaxed', min: 4.5, max: 7 },
  { id: 'steady', label: 'Steady', min: 2.5, max: 4.5 },
  { id: 'fast', label: 'Fast', min: 1.2, max: 2.5 },
];

export default function Train() {
  return (
    <Routes>
      <Route index element={<Setup />} />
      <Route path="session" element={<Session />} />
      <Route path="*" element={<Navigate to="/train" replace />} />
    </Routes>
  );
}

/** − value + control for a time in seconds. Hold a button to keep changing. */
function TimeStepper({ label, value, step, min, max, onChange }: { label: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void }) {
  const ref = useRef({ value, onChange });
  ref.current = { value, onChange };
  const timers = useRef<number[]>([]);
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => stop, []);
  /** One step; false when already at the limit. */
  const nudge = (dir: 1 | -1): boolean => {
    const { value: v, onChange: on } = ref.current;
    // Snap onto the step grid, then move one step.
    const next = Math.min(max, Math.max(min, dir > 0 ? Math.floor(v / step) * step + step : Math.ceil(v / step) * step - step));
    if (next === v) return false;
    ref.current.value = next;
    on(next);
    return true;
  };
  const press = (dir: 1 | -1) => {
    stop();
    nudge(dir);
    const repeat = () => {
      timers.current = nudge(dir) ? [window.setTimeout(repeat, 90)] : [];
    };
    timers.current = [window.setTimeout(repeat, 450)];
  };
  const btn = (dir: 1 | -1) => (
    <button
      type="button"
      className="btn icon"
      aria-label={`${dir > 0 ? 'More' : 'Less'} ${label.toLowerCase()}`}
      disabled={dir > 0 ? value >= max : value <= min}
      onPointerDown={(e) => {
        if (e.button === 0) press(dir);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          nudge(dir);
        }
      }}
    >
      {dir > 0 ? '+' : '−'}
    </button>
  );
  return (
    <div className="stepper">
      {btn(-1)}
      <b className="stepper-time">{value === 0 ? 'Off' : value < 60 ? `${value}s` : formatClock(value * 1000)}</b>
      {btn(1)}
    </div>
  );
}

const SMART_POOLS: { id: PoolKind; icon: string; name: string; hint: string }[] = [
  { id: 'essentials', icon: '★', name: 'Essentials', hint: 'The core combos to drill every session' },
  { id: 'favorites', icon: '♥', name: 'Favourites', hint: 'Combos you’ve starred' },
  { id: 'due', icon: '⏱', name: 'Due for practice', hint: 'Not drilled in the last week' },
];
const LIBRARY_POOLS: { id: Exclude<PoolKind, 'pick'>; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'beginner', name: 'Beginner' },
  { id: 'intermediate', name: 'Intermediate' },
  { id: 'advanced', name: 'Advanced' },
  { id: 'mine', name: 'My combos' },
];

const EMPTY_POOL: Partial<Record<PoolKind, string>> = {
  mine: 'You have no combos of your own yet.',
  favorites: 'No favourites yet — tap ♡ on a combo (here or on the Combos page) to add it.',
  due: 'Nothing due — you’ve drilled all your essentials, favourites and own combos in the last week. 👊',
};

function Setup() {
  const { data, update, allCombos } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const techParam = params.get('technique');
  const comboParam = params.get('combo');
  const tech = techParam ? TECH_BY_ID[techParam] : undefined;
  const editParam = params.get('edit');
  const startWorkout = useStartWorkout();
  const dialog = useDialog();

  const saved = { ...DEFAULT_CONFIG, ...(data.lastSession ?? {}) };
  const editing0 = editParam ? data.workouts.find((w) => w.id === editParam) : undefined;
  // Coming from one technique or one combo: drill just that, once.
  const [cfg, setCfg] = useState<SessionConfig>(() =>
    withLimits(
      editing0
        ? editing0.config
        : tech
          ? { ...saved, rounds: 1, freestyleSec: 0, drillCount: 1 }
          : comboParam
            ? { ...saved, drillCount: 1 }
            : saved,
    ),
  );
  const [poolMode, setPoolMode] = useState<PoolMode>(() =>
    editing0 ? editing0.pool.kind : comboParam ? 'pick' : saved.comboIds.length ? 'pick' : (saved.poolKind ?? 'essentials'),
  );
  const [pickQuery, setPickQuery] = useState('');
  /** Choose…: list only the picked combos (in the order they were picked). */
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(editing0 ? editing0.pool.comboIds : comboParam ? [comboParam] : saved.comboIds),
  );
  /** Combos unticked from a level/all/mine pool. */
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(editing0 ? (editing0.pool.excluded ?? []) : comboParam ? [] : (saved.excludedIds ?? [])),
  );
  /** The saved workout currently loaded for editing, if any. */
  const [editingId, setEditingId] = useState<string | null>(editing0?.id ?? null);
  const editing = editingId ? data.workouts.find((w) => w.id === editingId) : undefined;
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const currentWorkout = (id: string, name: string): Workout => ({
    id,
    name,
    config: sessionConfig(),
    pool: {
      kind: poolMode,
      comboIds: poolMode === 'pick' ? [...picked] : [],
      ...(poolMode !== 'pick' && excluded.size ? { excluded: [...excluded] } : {}),
    },
  });
  const saveAsNew = async () => {
    const name = await dialog.prompt({
      title: 'Name this workout',
      message: 'Saved workouts can be started in one tap and added to a plan.',
      defaultValue: editing ? `${editing.name} (copy)` : drill ? 'Combo drill' : 'Rounds',
      confirmLabel: 'Save workout',
    });
    if (!name) return;
    const w = currentWorkout(newId().replace('c-', 'w-'), name);
    update((d) => ({ ...d, workouts: [w, ...d.workouts] }));
    setEditingId(w.id);
    setSavedMsg(`Saved "${name}". You can add it to a plan on the Plans page.`);
  };
  const saveChanges = () => {
    if (!editing) return;
    const w = currentWorkout(editing.id, editing.name);
    update((d) => ({ ...d, workouts: d.workouts.map((x) => (x.id === w.id ? w : x)) }));
    setSavedMsg(`Updated "${editing.name}".`);
  };
  const loadWorkout = (w: Workout) => {
    setCfg(withLimits(w.config));
    setPoolMode(w.pool.kind);
    setPicked(new Set(w.pool.comboIds));
    setExcluded(new Set(w.pool.excluded ?? []));
    setEditingId(w.id);
    setSavedMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const deleteWorkout = async (w: Workout) => {
    const usedBy = data.plans.filter((p) => p.workoutId === w.id && !p.archived);
    const extra = usedBy.length ? ` It is used by ${usedBy.length} plan${usedBy.length === 1 ? '' : 's'}, which won't be able to start it.` : '';
    if (
      !(await dialog.confirm({
        title: `Delete “${w.name}”?`,
        message: `The saved workout is removed. Your training history is kept.${extra}`,
        confirmLabel: 'Delete workout',
        danger: true,
      }))
    )
      return;
    update((d) => ({ ...d, workouts: d.workouts.filter((x) => x.id !== w.id) }));
    if (editingId === w.id) setEditingId(null);
  };

  const set = <K extends keyof SessionConfig>(k: K, v: SessionConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const practice = usePractice();
  const poolCtx = useMemo(() => ({ favorites: data.settings.favorites, history: data.history }), [data.settings.favorites, data.history]);
  const pool: Combo[] = useMemo(() => {
    if (tech) return [{ id: `tech-${tech.id}`, name: tech.name, items: [tech.id], level: tech.level, style: 'numbers' }];
    // "pick" keeps the order the combos were picked in (a fixed, ordered list).
    return resolvePool({ kind: poolMode, comboIds: [...picked], excluded: [...excluded] }, allCombos, data.combos, poolCtx);
  }, [tech, poolMode, picked, excluded, allCombos, data.combos, poolCtx]);
  /** The combos listed with tick boxes: the level/all/mine pool, or every combo when choosing. */
  const listed = useMemo(
    () => (poolMode === 'pick' ? allCombos : poolBase(poolMode, allCombos, data.combos, poolCtx)),
    [poolMode, allCombos, data.combos, poolCtx],
  );
  const poolCount = (kind: PoolKind) => (kind === 'pick' ? picked.size : poolBase(kind, allCombos, data.combos, poolCtx).length);
  const isTicked = (id: string) => (poolMode === 'pick' ? picked.has(id) : !excluded.has(id));
  const sessionConfig = (): SessionConfig => ({
    ...cfg,
    comboIds: poolMode === 'pick' ? [...picked] : [],
    excludedIds: poolMode === 'pick' ? [] : [...excluded],
    poolKind: poolMode,
  });

  const pace = PACES.find((p) => p.min === cfg.minGap && p.max === cfg.maxGap)?.id;
  const drill = cfg.mode === 'drill';
  const totalSec = drill
    ? cfg.prepSec + cfg.drillCount * cfg.drillSec + (cfg.drillCount - 1) * cfg.drillRestSec
    : cfg.prepSec + cfg.rounds * cfg.roundSec + (cfg.rounds - 1) * cfg.restSec;

  const start = () => {
    unlockAudio();
    primeTrainingMusic();
    const config = sessionConfig();
    // One-off drills (a single technique or combo) shouldn't overwrite your usual settings.
    if (!tech && !comboParam) update((d) => ({ ...d, lastSession: config }));
    const state: LaunchState = { config, pool, ...(editing ? { workoutId: editing.id } : {}) };
    navigate('/train/session', { state });
  };

  const toggle = (set: (f: (s: Set<string>) => Set<string>) => void, id: string) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const togglePick = (id: string) => toggle(poolMode === 'pick' ? setPicked : setExcluded, id);

  // Every word must appear in the combo's name, callout, technique names or level.
  const shownPicks = useMemo(() => {
    const words = pickQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const base = poolMode === 'pick' && selectedOnly ? pool : listed;
    if (!words.length) return base;
    return base.filter((c) => {
      const hay = [c.name, calloutDisplay(c.items, c.style), ...c.items.map((i) => TECH_BY_ID[i]?.name ?? i), c.level, c.preset ? '' : 'mine my']
        .join(' ')
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [pickQuery, listed, poolMode, selectedOnly, pool]);

  /** Tick or untick every combo currently shown (respects the search). */
  const tickShown = (on: boolean) => {
    const ids = shownPicks.map((c) => c.id);
    if (poolMode === 'pick')
      setPicked((s) => {
        const n = new Set(s);
        for (const id of ids) on ? n.add(id) : n.delete(id);
        return n;
      });
    else
      setExcluded((s) => {
        const n = new Set(s);
        for (const id of ids) on ? n.delete(id) : n.add(id);
        return n;
      });
  };

  return (
    <div className="page">
      <h1>Train</h1>
      {tech ? (
        <p className="lead">
          Drilling <strong>{tech.name}</strong> on its own. <Link to="/train">Train combos instead</Link>
        </p>
      ) : (
        <p className="muted">Combos are called out by voice and shown big on screen — prop your phone up and go.</p>
      )}

      {!tech && <TodayCard />}

      {!tech && data.workouts.length > 0 && (
        <section className="section">
          <h2>Saved workouts</h2>
          <ul className="list">
            {data.workouts.map((w) => (
              <li key={w.id} className={`card workout-row ${editingId === w.id ? 'is-editing' : ''}`}>
                <div className="workout-main">
                  <b>{w.name}</b>
                  <span className="muted small">{workoutSummary(w)}</span>
                </div>
                <div className="combo-actions">
                  <button
                    className="btn small primary"
                    onClick={() => {
                      if (!startWorkout(w))
                        void dialog.alert({ title: 'No combos to call', message: 'This workout has no combos left. Edit it and pick some combos.' });
                    }}
                  >
                    <Icon name="play" size={14} />
                    Start
                  </button>
                  <button className="btn small" onClick={() => loadWorkout(w)}>
                    Edit
                  </button>
                  <button className="btn small danger" onClick={() => deleteWorkout(w)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <p className="editing-banner">
          Editing <b>{editing.name}</b> — change the settings below, then <b>Save changes</b>.{' '}
          <button className="link-btn" onClick={() => setEditingId(null)}>
            Stop editing
          </button>
        </p>
      )}

      <section className="card">
        <div className="seg mode-switch" role="group" aria-label="Training mode">
          <button className={`seg-btn ${drill ? 'on' : ''}`} onClick={() => set('mode', 'drill')}>
            Combo drill
          </button>
          <button className={`seg-btn ${!drill ? 'on' : ''}`} onClick={() => set('mode', 'rounds')}>
            Rounds
          </button>
        </div>
        <p className="muted small">
          {drill
            ? 'One combo at a time: it is announced once, then you drill it for the set time (reps are counted on screen), then you rest while the next combo is announced, and so on.'
            : 'Classic rounds: combos from the pool are called at random for the whole round.'}
        </p>
        <div className="form-grid">
          {drill ? (
            <>
              <div className="field">
                <span>Time per combo</span>
                <TimeStepper label="Time per combo" value={cfg.drillSec} step={5} min={10} max={600} onChange={(v) => set('drillSec', v)} />
              </div>
              <div className="field">
                <span>Rest between combos</span>
                <TimeStepper label="Rest between combos" value={cfg.drillRestSec} step={5} min={0} max={300} onChange={(v) => set('drillRestSec', v)} />
              </div>
              <label className="field">
                <span>Number of combos</span>
                <div className="stepper">
                  <button className="btn icon" onClick={() => set('drillCount', Math.max(1, cfg.drillCount - 1))} aria-label="Fewer combos">
                    −
                  </button>
                  <b>{cfg.drillCount}</b>
                  <button className="btn icon" onClick={() => set('drillCount', Math.min(50, cfg.drillCount + 1))} aria-label="More combos">
                    +
                  </button>
                </div>
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>Rounds</span>
                <div className="stepper">
                  <button className="btn icon" onClick={() => set('rounds', Math.max(1, cfg.rounds - 1))} aria-label="Fewer rounds">
                    −
                  </button>
                  <b>{cfg.rounds}</b>
                  <button className="btn icon" onClick={() => set('rounds', Math.min(12, cfg.rounds + 1))} aria-label="More rounds">
                    +
                  </button>
                </div>
              </label>
              <div className="field">
                <span>Round length</span>
                <TimeStepper label="Round length" value={cfg.roundSec} step={15} min={30} max={600} onChange={(v) => set('roundSec', v)} />
              </div>
              <div className="field">
                <span>Rest</span>
                <TimeStepper label="Rest" value={cfg.restSec} step={5} min={5} max={300} onChange={(v) => set('restSec', v)} />
              </div>
            </>
          )}
          <div className="field">
            <span>Get-ready countdown</span>
            <TimeStepper label="Get-ready countdown" value={cfg.prepSec} step={1} min={MIN_PREP_SEC} max={30} onChange={(v) => set('prepSec', v)} />
          </div>
        </div>
        <div className="setup-line">
          <div className="field">
            <span>{drill ? 'Rep pace (rest between reps)' : 'Callout pace'}</span>
            <div className="seg">
              {PACES.map((p) => (
                <button key={p.id} className={`seg-btn ${pace === p.id ? 'on' : ''}`} onClick={() => setCfg((c) => ({ ...c, minGap: p.min, maxGap: p.max }))}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Order</span>
            <div className="seg">
              <button className={`seg-btn ${cfg.order === 'random' ? 'on' : ''}`} onClick={() => set('order', 'random')}>
                Random
              </button>
              <button className={`seg-btn ${cfg.order === 'sequential' ? 'on' : ''}`} onClick={() => set('order', 'sequential')}>
                In order
              </button>
            </div>
          </div>
          <div className="field">
            <span>Total time</span>
            <div className="seg total-time">
              <b>{formatClock(totalSec * 1000)}</b>
            </div>
          </div>
        </div>
        {!drill && (
          <label className="check">
            <input type="checkbox" checked={cfg.freestyleSec > 0} onChange={(e) => set('freestyleSec', e.target.checked ? 30 : 0)} />
            Freestyle burst: last 30s of each round, no callouts — go all out
          </label>
        )}
        {drill && pool.length > 0 && cfg.drillCount > pool.length && (
          <p className="muted small">The pool has {pool.length} combo{pool.length === 1 ? '' : 's'}, so some will come round again.</p>
        )}
      </section>

      {!tech && (
        <section className="card">
          <h2>{drill ? 'Combos to drill' : 'Combos to call'}</h2>
          <div className="pool-picker">
            <div className="pool-cards" role="group" aria-label="Suggested combo pools">
              {SMART_POOLS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pool-card pool-${p.id} ${poolMode === p.id ? 'on' : ''}`}
                  aria-pressed={poolMode === p.id}
                  onClick={() => setPoolMode(p.id)}
                >
                  <span className="pool-icon" aria-hidden>
                    {p.icon}
                  </span>
                  <span className="pool-text">
                    <b>{p.name}</b>
                    <small>{p.hint}</small>
                  </span>
                  <span className="pool-count">{poolCount(p.id)}</span>
                </button>
              ))}
            </div>
            <div className="pool-library">
              <span className="pool-label">Library</span>
              <div className="pool-chips" role="group" aria-label="Combo library">
                {LIBRARY_POOLS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`pool-chip ${poolMode === p.id ? 'on' : ''}`}
                    aria-pressed={poolMode === p.id}
                    onClick={() => setPoolMode(p.id)}
                  >
                    {p.name} <span className="pool-chip-count">{poolCount(p.id)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`pool-chip pool-choose ${poolMode === 'pick' ? 'on' : ''}`}
                  aria-pressed={poolMode === 'pick'}
                  onClick={() => setPoolMode('pick')}
                >
                  ✎ Choose… {poolMode === 'pick' || picked.size ? <span className="pool-chip-count">{picked.size}</span> : null}
                </button>
              </div>
            </div>
          </div>
          <div className="pick-search">
            <input
              type="search"
              className="input"
              placeholder="Search combos — name, strike, level…"
              aria-label="Search combos"
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
            />
            <span className="muted small">
              {pool.length} of {listed.length} ticked{pickQuery.trim() ? ` · ${shownPicks.length} match` : ''}
            </span>
            <span className="pick-bulk">
              {poolMode === 'pick' && (
                <button
                  type="button"
                  className={`btn small ${selectedOnly ? 'on' : ''}`}
                  aria-pressed={selectedOnly}
                  onClick={() => setSelectedOnly((v) => !v)}
                >
                  {selectedOnly ? 'Show all' : `Show selected (${picked.size})`}
                </button>
              )}
              <button type="button" className="btn small" onClick={() => tickShown(true)} disabled={!shownPicks.length}>
                Tick all
              </button>
              <button type="button" className="btn small" onClick={() => tickShown(false)} disabled={!shownPicks.length}>
                Untick all
              </button>
            </span>
          </div>
          {listed.length === 0 ? (
            <p className="muted small">{EMPTY_POOL[poolMode] ?? 'No combos here.'}</p>
          ) : shownPicks.length === 0 ? (
            <p className="muted small">
              {poolMode === 'pick' && selectedOnly && !pickQuery.trim() ? 'Nothing selected yet.' : `No combos match “${pickQuery.trim()}”.`}
            </p>
          ) : (
            <ul className="pick-list">
              {shownPicks.map((c) => (
                <li key={c.id} className="pick-row">
                  <label className="check">
                    <input type="checkbox" checked={isTicked(c.id)} onChange={() => togglePick(c.id)} />
                    <span>
                      <b>{c.name}</b>
                      {c.essential && (
                        <span className="essential-tag" title="Essential combo">
                          ★
                        </span>
                      )}{' '}
                      <span className="muted">{calloutDisplay(c.items, c.style)}</span>
                      {(() => {
                        const l = practiceLabel(practice.get(c.name.toLowerCase()));
                        return <span className={`practice ${l.due ? 'due' : ''}`}>{l.text}</span>;
                      })()}
                    </span>
                  </label>
                  <FavButton id={c.id} name={c.name} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {savedMsg && <p className="small saved-msg">{savedMsg}</p>}
      <div className="row actions sticky-actions">
        <button className="btn primary big start-btn" onClick={start} disabled={pool.length === 0}>
          <Icon name="play" />
          Start session
        </button>
        {!tech &&
          (editing ? (
            <>
              <button className="btn big" onClick={saveChanges} disabled={pool.length === 0}>
                <Icon name="save" />
                Save changes
              </button>
              <button className="btn big" onClick={saveAsNew} disabled={pool.length === 0}>
                <Icon name="copy" />
                Save as new
              </button>
            </>
          ) : (
            <button className="btn big" onClick={saveAsNew} disabled={pool.length === 0}>
              <Icon name="save" />
              Save as workout
            </button>
          ))}
      </div>
    </div>
  );
}

function Session() {
  const location = useLocation();
  const launch = location.state as LaunchState | null;
  if (!launch) return <Navigate to="/train" replace />;
  return <SessionRunner config={launch.config} pool={launch.pool} workoutId={launch.workoutId} planId={launch.planId} />;
}

function SessionRunner({ config, pool, workoutId, planId }: LaunchState) {
  const dialog = useDialog();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const settings = data.settings;
  const plan = useMemo(() => buildPlan(config, pool), [config, pool]);
  const byId = useMemo(() => Object.fromEntries(pool.map((c) => [c.id, c])), [pool]);
  const drill = config.mode === 'drill';
  const blocks = drill ? plan.segments.filter((s) => s.kind === 'round').length : config.rounds;

  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [current, setCurrent] = useState<{ combo: Combo; index: number; rep?: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [finished, setFinished] = useState<{ completed: number; callouts: number; early: boolean } | null>(null);
  // New array per callout restarts the animation; stable between clock ticks so it can play through.
  const currentPhases = useMemo(
    () => (current ? chainPhases(current.combo.items.map((i) => TECH_BY_ID[i]?.phases ?? [])) : undefined),
    [current],
  );

  const clock = useRef({ base: performance.now(), offset: 0 });
  const lastT = useRef(0);
  const callouts = useRef(0);
  const used = useRef(new Set<string>());
  const logged = useRef(false);

  const say = (text: string | string[]) => {
    if (settings.voice) speak(text, { voiceURI: settings.voiceURI, rate: settings.rate, volume: settings.volume });
  };
  const sayRef = useRef(say);
  sayRef.current = say;

  // Get the recorded coach clips for this session ready (no-op without clips).
  useEffect(() => {
    void preloadVoice([...fixedPhrases(), ...pool.map((c) => c.name)]); // strike calls are in fixedPhrases
  }, [pool]);

  const completedRef = useRef(false);
  const log = (completed: number, early: boolean, elapsed: number) => {
    if (logged.current) return;
    logged.current = true;
    setFinished({ completed, callouts: callouts.current, early });
    if (completed === 0 && callouts.current === 0) return;
    update((d) => ({
      ...d,
      history: [
        {
          id: `s-${Date.now().toString(36)}`,
          date: new Date().toISOString(),
          mode: config.mode,
          rounds: blocks,
          completedRounds: completed,
          roundSec: drill ? config.drillSec : config.roundSec,
          restSec: drill ? config.drillRestSec : config.restSec,
          callouts: callouts.current,
          combos: [...used.current],
          durationSec: Math.round(elapsed / 1000),
          ...(workoutId ? { workoutId } : {}),
          ...(planId ? { planId } : {}),
        },
        ...d.history,
      ].slice(0, 500),
    }));
  };
  const logRef = useRef(log);
  logRef.current = log;

  // Wake lock + "get ready"
  useEffect(() => {
    let lock: { release: () => void } | null = null;
    void requestWakeLock().then((l) => (lock = l));
    // Drill mode announces the first combo during prep instead.
    if (config.prepSec > 0 && config.mode !== 'drill') sayRef.current(PHRASES.getReady);
    return () => {
      lock?.release();
      // Let "Great work. Session complete." finish as we move on to History.
      if (!completedRef.current) stopSpeech();
    };
  }, [config.prepSec, config.mode]);

  // Main clock
  useEffect(() => {
    if (paused || finished) return;
    clock.current.base = performance.now();
    const id = window.setInterval(() => {
      const now = clock.current.offset + (performance.now() - clock.current.base);
      const evs = eventsBetween(plan, lastT.current, now);
      lastT.current = now;
      setT(now);

      const lastCallout = [...evs].reverse().find((e) => e.type === 'callout');
      for (const e of evs) {
        switch (e.type) {
          case 'round-start':
            if (settings.sounds) bell(1, settings.volume);
            setBanner(drill ? null : `Round ${e.round}`);
            setCurrent(null);
            // Drill: the first rep is called straight away, no extra announcement.
            if (!drill) window.setTimeout(() => sayRef.current([roundPhrase(e.round), PHRASES.fight]), 700);
            break;
          case 'round-end':
            setCount(null);
            if (settings.sounds) bell(drill ? 2 : 3, settings.volume);
            setCurrent(null);
            setBanner(e.round < blocks ? 'Rest' : 'Time!');
            // Drill rests are announced by the "next" event instead.
            if (!drill && e.round < blocks) window.setTimeout(() => sayRef.current(PHRASES.restBreathe), 1100);
            break;
          case 'next': {
            // Drill mode only speaks to announce each combo; reps are shown, not read out.
            const combo = byId[e.comboId];
            if (!combo) break;
            const seg = stateAt(plan, e.at).segment;
            const lead = seg?.kind === 'prep' ? PHRASES.firstUp : seg?.kind === 'rest' ? PHRASES.restNext : PHRASES.next;
            sayRef.current([lead, ...comboSpeech(combo.name, combo.items)]);
            break;
          }
          case 'count':
            // 3, 2, 1 into the combo; n = 0 is "Go!" as it starts (the bell rings with it).
            setCount(e.n > 0 ? e.n : null);
            if (settings.voice) sayRef.current(e.n > 0 ? countPhrase(e.n) : PHRASES.go);
            else if (settings.sounds && e.n > 0) beep(settings.volume);
            break;
          case 'warning':
            if (settings.sounds) clap(settings.volume);
            break;
          case 'freestyle':
            setCurrent(null);
            setBanner('Freestyle!');
            sayRef.current(PHRASES.freestyle);
            break;
          case 'callout':
            if (e !== lastCallout) break; // after a throttled tab, only call the latest one
            {
              const combo = byId[e.comboId];
              if (!combo) break;
              callouts.current++;
              used.current.add(combo.name);
              setBanner(null);
              setCurrent({ combo, index: e.index, rep: e.rep });
              // Combos are called by name (the strikes are on screen).
              if (!drill) sayRef.current(comboSpeech(combo.name, combo.items));
            }
            break;
          case 'done':
            if (settings.sounds && drill) bell(3, settings.volume);
            sayRef.current(PHRASES.done);
            logRef.current(blocks, false, plan.total);
            break;
        }
      }
    }, 100);
    return () => {
      clock.current.offset += performance.now() - clock.current.base;
      window.clearInterval(id);
    };
  }, [paused, finished, plan, byId, blocks, drill, settings.sounds, settings.voice, settings.volume]);

  const state = stateAt(plan, t);
  const seg = state.segment;
  const kind = finished ? 'done' : seg?.kind ?? 'done';
  const segProgress = seg ? state.elapsed / (seg.end - seg.start) : 1;
  const nextRound = seg?.kind === 'rest' ? seg.round + 1 : null;
  // Drill: the combo for this block (during work) or the one coming up (during prep/rest).
  const blockCombo = drill && seg?.comboId ? byId[seg.comboId] : undefined;
  const blockPhases = useMemo(
    () => (blockCombo ? chainPhases(blockCombo.items.map((i) => TECH_BY_ID[i]?.phases ?? [])) : undefined),
    [blockCombo],
  );

  // Fight music while working, backed off during prep/rest, silent when paused, calm when done.
  useEffect(() => {
    setMusicScene(finished ? 'calm' : paused ? 'off' : kind === 'round' ? 'fight' : kind === 'done' ? 'calm' : 'fight-rest');
  }, [finished, paused, kind]);

  const end = async () => {
    if (!finished) {
      // Hold the clock while the question is up.
      const wasPaused = paused;
      setPaused(true);
      const ok = await dialog.confirm({
        title: 'End the session?',
        message: "What you've done so far is saved to your history.",
        confirmLabel: 'End session',
        cancelLabel: 'Keep going',
        danger: true,
      });
      if (!ok) {
        setPaused(wasPaused);
        return;
      }
      const now = lastT.current;
      const completed = plan.segments.filter((s) => s.kind === 'round' && s.end <= now).length;
      logRef.current(completed, true, now);
    }
    stopSpeech();
    goToHistory(true);
  };

  // A finished session goes straight to History, with a summary card on top.
  function goToHistory(early: boolean) {
    const summary: FinishedSummary = {
      early,
      drill,
      completed: plan.segments.filter((sg) => sg.kind === 'round' && sg.end <= lastT.current).length,
      blocks,
      callouts: callouts.current,
      seconds: Math.round(Math.min(lastT.current, plan.total) / 1000),
      planId,
    };
    navigate('/history', { replace: true, state: { finished: summary } });
  }
  useEffect(() => {
    if (finished && !finished.early) {
      completedRef.current = true;
      goToHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (finished) {
    return (
      <div className="session done">
        <div className="session-inner">
          <div className="big-label">{finished.early ? 'Session ended' : 'Session complete'}</div>
          <div className="stat-row">
            <div className="stat">
              <b>{finished.completed}</b>
              <span>{drill ? (finished.completed === 1 ? 'combo drilled' : 'combos drilled') : finished.completed === 1 ? 'round' : 'rounds'}</span>
            </div>
            <div className="stat">
              <b>{finished.callouts}</b>
              <span>{drill ? (finished.callouts === 1 ? 'rep called' : 'reps called') : finished.callouts === 1 ? 'combo called' : 'combos called'}</span>
            </div>
          </div>
          <div className="row center">
            {planId ? (
              <button className="btn primary big" onClick={() => navigate(`/plans/${planId}`)}>
                <Icon name="back" />
                Back to plan
              </button>
            ) : (
              <button className="btn primary big" onClick={() => navigate('/train')}>
                <Icon name="back" />
                Back to setup
              </button>
            )}
            <Link className="btn big" to="/history">
              <Icon name="history" />
              History
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`session kind-${kind} ${paused ? 'is-paused' : ''}`}>
      <div className="session-bar" style={{ width: `${segProgress * 100}%` }} />
      <div className="session-inner">
        <div className="session-top">
          <span className="pill">
            {kind === 'prep'
              ? 'Get ready'
              : kind === 'rest'
                ? 'Rest'
                : `${drill ? 'Combo' : 'Round'} ${seg?.round ?? blocks} / ${blocks}`}
          </span>
          {paused && <span className="pill warn">Paused</span>}
        </div>

        <div key={kind !== 'round' && count ? `count-${count}` : 'clock'} className={`clock ${kind !== 'round' && count ? 'counting' : ''}`} aria-live="off">
          {formatClock(state.remaining)}
        </div>

        <div className="callout-area" aria-live="assertive">
          {drill && blockCombo ? (
            kind === 'round' ? (
              <>
                <div key={current?.index ?? 'start'} className={`callout ${current ? 'pop' : ''}`}>
                  {calloutDisplay(blockCombo.items, blockCombo.style)}
                </div>
                <div className="callout-sub">
                  {blockCombo.name}
                  {current?.rep ? <span className="rep-count"> · Rep {current.rep}</span> : null}
                </div>
                <FigureView
                  phases={current ? currentPhases : blockPhases}
                  playing={!!current}
                  loop={false}
                  mirror={settings.stance === 'southpaw'}
                  className="session-figure"
                  interactive={false}
                />
              </>
            ) : (
              <>
                <div className="next-label">{kind === 'prep' ? 'First up' : `Next up · ${nextRound} / ${blocks}`}</div>
                <div className="callout next">{calloutDisplay(blockCombo.items, blockCombo.style)}</div>
                <div className="callout-sub">{blockCombo.items.map((i) => TECH_BY_ID[i]?.name).join(' → ')}</div>
                <FigureView
                  phases={blockPhases}
                  speed={0.7}
                  mirror={settings.stance === 'southpaw'}
                  className="session-figure"
                  interactive={false}
                />
              </>
            )
          ) : kind === 'round' && current ? (
            <>
              <div key={current.index} className="callout pop">
                {calloutDisplay(current.combo.items, current.combo.style)}
              </div>
              <div className="callout-sub">{current.combo.items.map((i) => TECH_BY_ID[i]?.name).join(' → ')}</div>
              <FigureView
                phases={currentPhases}
                loop={false}
                mirror={settings.stance === 'southpaw'}
                className="session-figure"
                interactive={false}
              />
            </>
          ) : (
            <div className="callout dim">
              {kind === 'prep' ? 'Get in your stance' : kind === 'rest' ? `Round ${nextRound} next` : banner ?? 'Move. Stay sharp.'}
            </div>
          )}
        </div>

        <div className="row center session-controls">
          <button className="btn big primary" onClick={() => setPaused((p) => !p)}>
            <Icon name={paused ? 'play' : 'pause'} />
            {paused ? 'Resume' : 'Pause'}
          </button>
          <MusicToggle className="big" />
          <button className="btn big" onClick={end}>
            <Icon name="stop" />
            End
          </button>
        </div>
      </div>
    </div>
  );
}
