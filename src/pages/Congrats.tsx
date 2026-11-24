import { useMemo } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Icon from '../components/Icon';
import type { FinishedSummary } from '../components/FinishedCard';
import { TECH_BY_ID } from '../data/techniques';
import { dateKey, planStats } from '../lib/plans';
import { streakDays } from '../lib/stats';
import { useStore } from '../lib/store';

const CHEERS = [
  'Great work — that’s another one in the bank.',
  'Strong session. Your combos are getting sharper.',
  'Done and dusted. Rest up, hydrate, come back hungry.',
  'That’s how fighters are made — one session at a time.',
  'Nice work. Consistency beats intensity.',
];

const CONFETTI_COLORS = ['#e63946', '#f0713f', '#f4a261', '#f5b83d', '#52b788', '#4ea8de'];

/** Celebration page shown when a session runs to the end. */
export default function Congrats() {
  const location = useLocation();
  const s = (location.state as { finished?: FinishedSummary } | null)?.finished;
  const { data } = useStore();

  // Confetti pieces and the cheer line are picked once per visit.
  const confetti = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 2.4 + Math.random() * 1.8,
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: i % 3 === 0,
      })),
    [],
  );
  const cheer = useMemo(() => CHEERS[Math.floor(Math.random() * CHEERS.length)], []);

  if (!s) return <Navigate to="/train" replace />;

  const today = dateKey(new Date());
  const streak = streakDays(data.history);
  const plan = s.planId ? data.plans.find((p) => p.id === s.planId) : undefined;
  const tech = s.techniqueId ? TECH_BY_ID[s.techniqueId] : undefined;
  const ps = plan ? planStats(plan, data.history, today) : null;
  const mins = Math.floor(s.seconds / 60);
  const secs = String(s.seconds % 60).padStart(2, '0');

  return (
    <div className="page congrats">
      <div className="confetti" aria-hidden>
        {confetti.map((c, i) => (
          <span
            key={i}
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.round ? c.size : c.size * 0.45,
              background: c.color,
              borderRadius: c.round ? '50%' : 2,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              transform: `rotate(${c.rotate}deg)`,
            }}
          />
        ))}
      </div>

      <section className="congrats-hero" aria-live="polite">
        <div className="congrats-trophy" aria-hidden>
          🏆
        </div>
        <h1>Session complete!</h1>
        <p className="congrats-cheer">{cheer}</p>
      </section>

      <div className="hd-tiles congrats-tiles">
        <div className="hd-tile hd-hero card">
          <span className="hd-label">Time trained</span>
          <b className="hd-value">
            {mins}:{secs}
          </b>
          <span className="hd-sub">minutes : seconds</span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">{s.drill ? 'Combos' : 'Rounds'}</span>
          <b className="hd-value">
            {s.completed}
            <small> / {s.blocks}</small>
          </b>
          <span className="hd-sub">{s.drill ? 'drilled' : 'completed'}</span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">{s.drill ? 'Reps' : 'Callouts'}</span>
          <b className="hd-value">{s.callouts}</b>
          <span className="hd-sub">{s.drill ? 'reps counted' : 'combos called'}</span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">Streak</span>
          <b className="hd-value">
            {streak} <small>day{streak === 1 ? '' : 's'}</small>
          </b>
          <span className="hd-sub">{streak > 1 ? '🔥 Keep it going' : 'Back tomorrow?'}</span>
        </div>
      </div>

      {plan && ps && (
        <Link to={`/plans/${plan.id}`} className="card congrats-plan">
          <span className="hd-label">{plan.name}</span>
          <span className="pt-bar" aria-hidden>
            <span style={{ width: `${ps.percent}%` }} />
          </span>
          <span className="muted small">
            {ps.done} of {ps.trainingDays} sessions done · {ps.percent}%
            {ps.dayNumber ? ` · Day ${ps.dayNumber} of ${plan.days}` : ''}
          </span>
        </Link>
      )}

      <div className="row congrats-actions">
        {plan ? (
          <Link className="btn primary big" to={`/plans/${plan.id}`}>
            <Icon name="back" />
            Back to plan
          </Link>
        ) : tech ? (
          <Link className="btn primary big" to={`/learn/${tech.id}`}>
            <Icon name="back" />
            Back to {tech.name.replace(/ [(].*/, '')}
          </Link>
        ) : (
          <Link className="btn primary big" to="/train">
            <Icon name="play" />
            Train again
          </Link>
        )}
        <Link className="btn big" to="/history">
          <Icon name="history" />
          See history
        </Link>
      </div>
    </div>
  );
}
