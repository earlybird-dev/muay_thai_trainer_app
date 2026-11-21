import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { chainPhases } from '../components/Figure';
import FigureView from '../components/FigureView';
import { calloutDisplay, calloutSpeech, type Combo } from '../data/combos';
import { TECH_BY_ID } from '../data/techniques';
import { bell, clap, requestWakeLock, speak, stopSpeech, unlockAudio } from '../lib/audio';
import { DEFAULT_CONFIG, buildPlan, eventsBetween, formatClock, stateAt, type SessionConfig } from '../lib/sessionEngine';
import { useStore } from '../lib/store';

type PoolMode = 'all' | 'beginner' | 'intermediate' | 'advanced' | 'mine' | 'pick';

interface LaunchState {
  config: SessionConfig;
  pool: Combo[];
}

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

function Setup() {
  const { data, update, allCombos } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const techParam = params.get('technique');
  const comboParam = params.get('combo');
  const tech = techParam ? TECH_BY_ID[techParam] : undefined;

  const saved = { ...DEFAULT_CONFIG, ...(data.lastSession ?? {}) };
  const [cfg, setCfg] = useState<SessionConfig>(() => (tech ? { ...saved, rounds: 1, freestyleSec: 0 } : saved));
  const [mode, setMode] = useState<PoolMode>(() => (comboParam ? 'pick' : saved.comboIds.length ? 'pick' : 'all'));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(comboParam ? [comboParam] : saved.comboIds));

  const set = <K extends keyof SessionConfig>(k: K, v: SessionConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const pool: Combo[] = useMemo(() => {
    if (tech) return [{ id: `tech-${tech.id}`, name: tech.name, items: [tech.id], level: tech.level, style: 'numbers' }];
    switch (mode) {
      case 'all':
        return allCombos;
      case 'beginner':
      case 'intermediate':
      case 'advanced':
        return allCombos.filter((c) => c.level === mode);
      case 'mine':
        return data.combos;
      case 'pick':
        return allCombos.filter((c) => picked.has(c.id));
    }
  }, [tech, mode, picked, allCombos, data.combos]);

  const pace = PACES.find((p) => p.min === cfg.minGap && p.max === cfg.maxGap)?.id;
  const totalSec = cfg.prepSec + cfg.rounds * cfg.roundSec + (cfg.rounds - 1) * cfg.restSec;

  const start = () => {
    unlockAudio();
    const config = { ...cfg, comboIds: mode === 'pick' ? [...picked] : [] };
    if (!tech) update((d) => ({ ...d, lastSession: config }));
    const state: LaunchState = { config, pool };
    navigate('/train/session', { state });
  };

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="page">
      <h1>Train</h1>
      {tech ? (
        <p className="lead">
          Drilling <strong>{tech.name}</strong> on its own. <Link to="/train">Train combos instead</Link>
        </p>
      ) : (
        <p className="muted">Set up your rounds. Combos are called out by voice and shown big on screen — prop your phone up and go.</p>
      )}

      <section className="card">
        <h2>Rounds</h2>
        <div className="form-grid">
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
          <label className="field">
            <span>Round length</span>
            <select className="input" value={cfg.roundSec} onChange={(e) => set('roundSec', Number(e.target.value))}>
              {[30, 60, 90, 120, 150, 180, 240, 300].map((s) => (
                <option key={s} value={s}>
                  {formatClock(s * 1000)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rest</span>
            <select className="input" value={cfg.restSec} onChange={(e) => set('restSec', Number(e.target.value))}>
              {[10, 20, 30, 45, 60, 90, 120].map((s) => (
                <option key={s} value={s}>
                  {formatClock(s * 1000)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Get-ready countdown</span>
            <select className="input" value={cfg.prepSec} onChange={(e) => set('prepSec', Number(e.target.value))}>
              {[3, 5, 10, 15].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <span>Callout pace</span>
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
        <label className="check">
          <input type="checkbox" checked={cfg.freestyleSec > 0} onChange={(e) => set('freestyleSec', e.target.checked ? 30 : 0)} />
          Freestyle burst: last 30s of each round, no callouts — go all out
        </label>
        <p className="muted small">Total time: {formatClock(totalSec * 1000)}</p>
      </section>

      {!tech && (
        <section className="card">
          <h2>Combos to call</h2>
          <div className="seg wrap">
            {(
              [
                ['all', 'All'],
                ['beginner', 'Beginner'],
                ['intermediate', 'Intermediate'],
                ['advanced', 'Advanced'],
                ['mine', 'My combos'],
                ['pick', 'Choose…'],
              ] as [PoolMode, string][]
            ).map(([m, label]) => (
              <button key={m} className={`seg-btn ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'pick' && (
            <ul className="pick-list">
              {allCombos.map((c) => (
                <li key={c.id}>
                  <label className="check">
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => togglePick(c.id)} />
                    <span>
                      <b>{c.name}</b> <span className="muted">{calloutDisplay(c.items, c.style)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">{pool.length} combo{pool.length === 1 ? '' : 's'} in the pool.</p>
        </section>
      )}

      <div className="row actions sticky-actions">
        <button className="btn primary big" onClick={start} disabled={pool.length === 0}>
          Start session
        </button>
      </div>
    </div>
  );
}

function Session() {
  const location = useLocation();
  const launch = location.state as LaunchState | null;
  if (!launch) return <Navigate to="/train" replace />;
  return <SessionRunner config={launch.config} pool={launch.pool} />;
}

function SessionRunner({ config, pool }: LaunchState) {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const settings = data.settings;
  const plan = useMemo(() => buildPlan(config, pool), [config, pool]);
  const byId = useMemo(() => Object.fromEntries(pool.map((c) => [c.id, c])), [pool]);

  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [current, setCurrent] = useState<{ combo: Combo; index: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
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

  const say = (text: string) => {
    if (settings.voice) speak(text, { voiceURI: settings.voiceURI, rate: settings.rate, volume: settings.volume });
  };
  const sayRef = useRef(say);
  sayRef.current = say;

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
          rounds: config.rounds,
          completedRounds: completed,
          roundSec: config.roundSec,
          restSec: config.restSec,
          callouts: callouts.current,
          combos: [...used.current],
          durationSec: Math.round(elapsed / 1000),
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
    if (config.prepSec > 0) sayRef.current('Get ready');
    return () => {
      lock?.release();
      stopSpeech();
    };
  }, [config.prepSec]);

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
            setBanner(`Round ${e.round}`);
            setCurrent(null);
            window.setTimeout(() => sayRef.current(`Round ${e.round}. Fight!`), 700);
            break;
          case 'round-end':
            if (settings.sounds) bell(3, settings.volume);
            setCurrent(null);
            setBanner(e.round < config.rounds ? 'Rest' : 'Time!');
            if (e.round < config.rounds) window.setTimeout(() => sayRef.current('Rest. Breathe.'), 1100);
            break;
          case 'warning':
            if (settings.sounds) clap(settings.volume);
            break;
          case 'freestyle':
            setCurrent(null);
            setBanner('Freestyle!');
            sayRef.current('Freestyle! Everything you have!');
            break;
          case 'callout':
            if (e !== lastCallout) break; // after a throttled tab, only call the latest one
            {
              const combo = byId[e.comboId];
              if (!combo) break;
              callouts.current++;
              used.current.add(combo.name);
              setBanner(null);
              setCurrent({ combo, index: e.index });
              sayRef.current(calloutSpeech(combo.items, combo.style));
            }
            break;
          case 'done':
            sayRef.current('Great work. Session complete.');
            logRef.current(config.rounds, false, plan.total);
            break;
        }
      }
    }, 100);
    return () => {
      clock.current.offset += performance.now() - clock.current.base;
      window.clearInterval(id);
    };
  }, [paused, finished, plan, byId, config.rounds, settings.sounds, settings.volume]);

  const state = stateAt(plan, t);
  const seg = state.segment;
  const kind = finished ? 'done' : seg?.kind ?? 'done';
  const segProgress = seg ? state.elapsed / (seg.end - seg.start) : 1;
  const nextRound = seg?.kind === 'rest' ? seg.round + 1 : null;

  const end = () => {
    if (!finished && !confirm('End the session now?')) return;
    if (!finished) {
      const completed = plan.segments.filter((s) => s.kind === 'round' && s.end <= t).length;
      logRef.current(completed, true, t);
    }
    stopSpeech();
    navigate('/train');
  };

  if (finished) {
    return (
      <div className="session done">
        <div className="session-inner">
          <div className="big-label">{finished.early ? 'Session ended' : 'Session complete'}</div>
          <div className="stat-row">
            <div className="stat">
              <b>{finished.completed}</b>
              <span>rounds</span>
            </div>
            <div className="stat">
              <b>{finished.callouts}</b>
              <span>combos called</span>
            </div>
          </div>
          <div className="row center">
            <button className="btn primary big" onClick={() => navigate('/train')}>
              Back to setup
            </button>
            <Link className="btn big" to="/history">
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
            {kind === 'prep' ? 'Get ready' : kind === 'rest' ? 'Rest' : `Round ${seg?.round ?? config.rounds} / ${config.rounds}`}
          </span>
          {paused && <span className="pill warn">Paused</span>}
        </div>

        <div className="clock" aria-live="off">
          {formatClock(state.remaining)}
        </div>

        <div className="callout-area" aria-live="assertive">
          {kind === 'round' && current ? (
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
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn big" onClick={end}>
            End
          </button>
        </div>
      </div>
    </div>
  );
}
