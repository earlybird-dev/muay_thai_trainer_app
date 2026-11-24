import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import FinishedCard, { type FinishedSummary } from '../components/FinishedCard';
import { useAuth } from '../lib/auth';
import { formatClock } from '../lib/sessionEngine';
import { useStore } from '../lib/store';
import HistoryDashboard from '../components/HistoryDashboard';
import Icon from '../components/Icon';
import type { SessionLog } from '../lib/storage';
import { dateKey, parseDay } from '../lib/plans';
import { SESSION_TYPES, filterSessions, learnedStrike, sessionTimeRange, sessionTimes, sessionType } from '../lib/stats';
import { deleteSession } from '../lib/sync';
import { useDialog } from '../components/Dialog';

export default function History() {
  const { data } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [finished, setFinished] = useState<FinishedSummary | null>(() => (location.state as { finished?: FinishedSummary } | null)?.finished ?? null);
  const h = data.history;
  const last = h[0];

  return (
    <div className="page">
      <h1>History</h1>
      {finished && (
        <FinishedCard
          s={finished}
          onClose={() => {
            setFinished(null);
            navigate('.', { replace: true, state: null });
          }}
        />
      )}
      {h.length === 0 ? (
        <p className="muted">
          No sessions yet. <Link to="/train">Start your first session</Link> — your charts will appear here.
        </p>
      ) : (
        <>
          <HistoryDashboard history={h} />
          <Link to="/history/sessions" className="card all-sessions">
            <span className="all-sessions-text">
              <b>
                View all {h.length} session{h.length === 1 ? '' : 's'}
              </b>
              <span className="muted small">
                Last: {new Date(last.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                {formatClock(last.durationSec * 1000)}
              </span>
            </span>
            <span className="all-sessions-arrow" aria-hidden>
              →
            </span>
          </Link>
        </>
      )}
    </div>
  );
}

const PERIODS = [7, 30, 90];

export function HistoryLog() {
  const dialog = useDialog();
  const { data, update } = useStore();
  const { account } = useAuth();
  const h = data.history;

  // Filters live in the address, so Back and links (e.g. from the activity calendar) keep them.
  const [params, setParams] = useSearchParams();
  const dayParam = params.get('day') ?? '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : '';
  const period = PERIODS.find((n) => String(n) === params.get('days')) ?? null;
  const type = SESSION_TYPES.find((t) => t.id === params.get('type'))?.id ?? null;
  const workoutId = params.get('workout') ?? '';
  const filtering = !!(day || period || type || workoutId);
  const shown = filtering ? filterSessions(h, { day, days: period, type, workoutId }) : h;
  const set = (changes: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  // Only offer workouts that some session was started from.
  const usedWorkouts = data.workouts.filter((w) => w.id === workoutId || h.some((s) => s.workoutId === w.id));
  const today = dateKey(new Date());

  const remove = async (s: SessionLog) => {
    const when = `${new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${sessionTimeRange(s)}`;
    const ok = await dialog.confirm({
      title: 'Delete this session?',
      message: `${when} · ${formatClock(s.durationSec * 1000)}. It is removed from your history, streaks and plan progress${account ? ' on all your devices' : ''}. It cannot be undone.`,
      confirmLabel: 'Delete session',
      danger: true,
    });
    if (ok) update((d) => deleteSession(d, s.id));
  };

  return (
    <div className="page">
      <Link to="/history" className="back">
        ← History
      </Link>
      <h1>All sessions</h1>
      {h.length > 0 && (
        <div className="history-filters" role="group" aria-label="Filter sessions">
          <select
            className="input"
            aria-label="When"
            value={day ? 'day' : period ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              // "Pick a day" starts on the latest training day.
              if (v === 'day') set({ day: dateKey(new Date(h[0].date)), days: '' });
              else set({ day: '', days: v });
            }}
          >
            <option value="">Any time</option>
            {PERIODS.map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
            <option value="day">Pick a day…</option>
          </select>
          {day && (
            <input className="input" type="date" aria-label="Day" value={day} max={today} onChange={(e) => e.target.value && set({ day: e.target.value })} />
          )}
          <select className="input" aria-label="Type" value={type ?? ''} onChange={(e) => set({ type: e.target.value })}>
            <option value="">All types</option>
            {SESSION_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {usedWorkouts.length > 0 && (
            <select className="input" aria-label="Workout" value={workoutId} onChange={(e) => set({ workout: e.target.value })}>
              <option value="">All workouts</option>
              {usedWorkouts.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="history-count">
        <p className="muted small" role="status">
          {filtering ? `${shown.length} of ${h.length}` : h.length} session{h.length === 1 ? '' : 's'}
          {day ? ` · ${parseDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}` : ', newest first.'}
        </p>
        {filtering && (
          <button type="button" className="btn small" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </button>
        )}
      </div>

      {h.length === 0 ? (
        <p className="muted">
          No sessions yet. <Link to="/train">Start your first session</Link>.
        </p>
      ) : shown.length === 0 ? (
        <p className="muted">{day && !type && !workoutId ? 'No sessions on this day.' : 'No sessions match these filters.'}</p>
      ) : (
        <>
          <ul className="list">
            {shown.map((s) => (
              <li key={s.id} className="card history-row">
                <button
                  type="button"
                  className="history-delete"
                  aria-label={`Delete session from ${new Date(s.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                  title="Delete session"
                  onClick={() => void remove(s)}
                >
                  <Icon name="trash" size={18} />
                </button>
                <div>
                  <b>
                    {new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </b>{' '}
                  <span
                    className="muted session-times"
                    title={sessionTimes(s).exact ? 'Start – finish' : 'Start – finish. This start is estimated from the time trained, without pauses.'}
                  >
                    {sessionTimeRange(s)}
                  </span>
                </div>
                <div className="small">
                  <span className={`tag session-type ${sessionType(s)}`}>{SESSION_TYPES.find((t) => t.id === sessionType(s))!.chip}</span>{' '}
                  {learnedStrike(s) ? (
                    <>
                      <Link to={`/learn/${learnedStrike(s)!.id}`} className="session-strike">
                        {learnedStrike(s)!.name}
                      </Link>{' '}
                      · {s.callouts} rep{s.callouts === 1 ? '' : 's'} · {formatClock(s.durationSec * 1000)} total{s.completedRounds < s.rounds ? ' · ended early' : ''}
                    </>
                  ) : (
                    <>
                      {s.completedRounds}/{s.rounds} {s.mode === 'drill' ? 'combos' : 'rounds'} × {formatClock(s.roundSec * 1000)} · {s.callouts} {s.mode === 'drill' ? 'reps' : 'combos called'} · {formatClock(s.durationSec * 1000)} total
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
