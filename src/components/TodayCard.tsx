import { Link } from 'react-router-dom';
import { addDays, dateKey, dueToday, isTrainingDay, planEnd, planStats, parseDay } from '../lib/plans';
import { useStore } from '../lib/store';
import { useStartWorkout } from '../lib/useStartWorkout';
import { useDialog } from './Dialog';

const dayName = (key: string) => parseDay(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** "Today" summary for active plans: start today's workout, see it's done, or see the next session. */
export default function TodayCard({ compact = false }: { compact?: boolean }) {
  const { data } = useStore();
  const startWorkout = useStartWorkout();
  const dialog = useDialog();
  const today = dateKey(new Date());
  const active = data.plans.filter((p) => !p.archived && today >= p.start && today <= planEnd(p));
  if (!active.length) return null;

  const due = dueToday(active, data.history, today);
  const resting = active.filter((p) => !due.some((d) => d.plan.id === p.id));

  return (
    <section className={`card today-card ${compact ? 'compact' : ''}`}>
      <div className="today-head">
        <h2>Today</h2>
        <Link to="/plans" className="small">
          Plans →
        </Link>
      </div>
      {due.map(({ plan, status }) => {
        const w = data.workouts.find((x) => x.id === plan.workoutId);
        const s = planStats(plan, data.history, today);
        return (
          <div key={plan.id} className={`today-item ${status}`}>
            <div className="today-text">
              <span className="muted small">
                {plan.name} · Day {s.dayNumber} of {plan.days}
                {s.streak > 1 ? ` · 🔥 ${s.streak}` : ''}
              </span>
              <b>{w ? w.name : 'Workout was deleted'}</b>
            </div>
            {status === 'done' ? (
              <span className="today-done">✓ Done</span>
            ) : w ? (
              <button className="btn primary" onClick={() => startWorkout(w, plan.id) || void dialog.alert({ title: 'No combos to call', message: 'This workout has no combos left. Edit it and pick some combos.' })}>
                Start
              </button>
            ) : (
              <Link className="btn" to={`/plans/${plan.id}`}>
                Fix plan
              </Link>
            )}
          </div>
        );
      })}
      {resting.map((plan) => {
        let next: string | null = null;
        for (let k = addDays(today, 1); k <= planEnd(plan); k = addDays(k, 1))
          if (isTrainingDay(plan, k)) {
            next = k;
            break;
          }
        return (
          <div key={plan.id} className="today-item rest">
            <div className="today-text">
              <span className="muted small">{plan.name}</span>
              <b>Rest day</b>
            </div>
            <span className="muted small">{next ? `Next: ${dayName(next)}` : 'Last session done'}</span>
          </div>
        );
      })}
    </section>
  );
}
