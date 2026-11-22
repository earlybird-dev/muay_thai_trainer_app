import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { formatClock } from '../lib/sessionEngine';
import { useStore } from '../lib/store';
import { streakDays } from '../lib/stats';
import { useDialog } from '../components/Dialog';

export default function History() {
  const dialog = useDialog();
  const { data, update } = useStore();
  const { account, clearRemoteHistory } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const h = data.history;
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = h.filter((x) => new Date(x.date).getTime() >= weekAgo);
  const rounds = h.reduce((s, x) => s + x.completedRounds, 0);

  const clear = async () => {
    const where = account ? ' from this device and your account' : '';
    if (
      !(await dialog.confirm({
        title: 'Clear all history?',
        message: `This deletes every logged session${where}. It cannot be undone — export a backup in Settings first if you want one.`,
        confirmLabel: 'Delete history',
        danger: true,
      }))
    )
      return;
    if (account) {
      try {
        await clearRemoteHistory();
      } catch (e) {
        setError(`Could not reach your account, history was not deleted: ${(e as Error).message}`);
        return;
      }
    }
    setError(null);
    // Remember when, so other signed-in devices drop these sessions too instead of uploading them again.
    update((d) => ({ ...d, history: [], settings: { ...d.settings, historyClearedAt: new Date().toISOString() } }));
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
                  {s.mode === 'drill' ? <span className="tag">Drill</span> : null} {s.completedRounds}/{s.rounds} {s.mode === 'drill' ? 'combos' : 'rounds'} × {formatClock(s.roundSec * 1000)} · {s.callouts} {s.mode === 'drill' ? 'reps' : 'combos called'} · {formatClock(s.durationSec * 1000)} total
                </div>
                {s.combos.length > 0 && <div className="muted small">{s.combos.slice(0, 6).join(', ')}{s.combos.length > 6 ? '…' : ''}</div>}
              </li>
            ))}
          </ul>
          <div className="row actions history-actions">
            <button className="btn danger small" onClick={() => void clear()}>
              Clear history
            </button>
          </div>
          {error && <p className="small error-text">{error}</p>}
        </>
      )}
    </div>
  );
}
