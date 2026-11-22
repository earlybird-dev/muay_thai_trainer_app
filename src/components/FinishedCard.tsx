import { Link } from 'react-router-dom';
import Icon from './Icon';

/** What a session hands to History when it ends. */
export interface FinishedSummary {
  early: boolean;
  drill: boolean;
  completed: number;
  blocks: number;
  callouts: number;
  seconds: number;
  planId?: string;
}

/** "Session complete" summary shown at the top of History right after a session. */
export default function FinishedCard({ s, onClose }: { s: FinishedSummary; onClose: () => void }) {
  const unit = s.drill ? (s.completed === 1 ? 'combo drilled' : 'combos drilled') : s.completed === 1 ? 'round' : 'rounds';
  const calls = s.drill ? (s.callouts === 1 ? 'rep' : 'reps') : s.callouts === 1 ? 'combo called' : 'combos called';
  const mins = Math.floor(s.seconds / 60);
  const secs = String(s.seconds % 60).padStart(2, '0');
  return (
    <section className="card finished-card" aria-live="polite">
      <div className="finished-head">
        <span className="finished-badge" aria-hidden>
          {s.early ? '■' : '✓'}
        </span>
        <div>
          <h2>{s.early ? 'Session ended' : 'Session complete — great work!'}</h2>
          <p className="muted small">
            {s.completed}/{s.blocks} {unit} · {s.callouts} {calls} · {mins}:{secs}
          </p>
        </div>
        <button type="button" className="finished-close" aria-label="Dismiss" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="row">
        {s.planId ? (
          <Link className="btn primary" to={`/plans/${s.planId}`}>
            <Icon name="back" />
            Back to plan
          </Link>
        ) : null}
        <Link className={`btn ${s.planId ? '' : 'primary'}`} to="/train">
          <Icon name="play" />
          Train again
        </Link>
      </div>
    </section>
  );
}
