import { Link } from 'react-router-dom';
import { formatClock } from '../lib/sessionEngine';
import { useStore } from '../lib/store';
import { streakDays } from '../lib/stats';

export default function History() {
  const { data, update } = useStore();
  const h = data.history;
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = h.filter((x) => new Date(x.date).getTime() >= weekAgo);
  const rounds = h.reduce((s, x) => s + x.completedRounds, 0);

  const clear = () => {
    if (confirm('Delete all training history? This cannot be undone (export a backup in Settings first if you want one).'))
      update((d) => ({ ...d, history: [] }));
  };

  return (
    <div className="page">
      <h1>History</h1>
      <div className="stat-row">
        <div className="stat card">
          <b>{streakDays(h)}</b>
          <span>day streak</span>
        </div>
        <div className="stat card">
          <b>{thisWeek.length}</b>
          <span>sessions this week</span>
        </div>
        <div className="stat card">
          <b>{rounds}</b>
          <span>rounds total</span>
        </div>
      </div>

      {h.length === 0 ? (
        <p className="muted">
          No sessions yet. <Link to="/train">Start your first session</Link>.
        </p>
      ) : (
        <>
          <ul className="list">
            {h.map((s) => (
              <li key={s.id} className="card history-row">
                <div>
                  <b>
                    {new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </b>{' '}
                  <span className="muted">{new Date(s.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="small">
                  {s.completedRounds}/{s.rounds} rounds × {formatClock(s.roundSec * 1000)} · {s.callouts} combos called · {formatClock(s.durationSec * 1000)} total
                </div>
                {s.combos.length > 0 && <div className="muted small">{s.combos.slice(0, 6).join(', ')}{s.combos.length > 6 ? '…' : ''}</div>}
              </li>
            ))}
          </ul>
          <button className="btn danger small" onClick={clear}>
            Clear history
          </button>
        </>
      )}
    </div>
  );
}
