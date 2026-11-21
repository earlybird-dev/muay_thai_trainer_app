import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { notify, remindersDue, takeUnshown } from '../lib/reminders';
import { useStore } from '../lib/store';
import type { TrainPlan } from '../lib/plans';

/** Checks plan reminders every minute while the app is running; shows a notification + an in-app banner. */
export default function ReminderBanner() {
  const { data, dataRef } = useStore();
  const [due, setDue] = useState<TrainPlan[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const d = dataRef.current;
      const list = remindersDue(d.plans, d.history, now);
      setDue(list);
      for (const p of takeUnshown(list, now)) {
        const w = d.workouts.find((x) => x.id === p.workoutId);
        void notify('Time to train 🥊', `${p.name}: ${w?.name ?? 'your workout'} is on today.`);
      }
    };
    check();
    const t = window.setInterval(check, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dataRef]);

  // Re-evaluate right away when history changes (e.g. the session just got done).
  useEffect(() => setDue((prev) => prev.filter((p) => remindersDue(data.plans, data.history, new Date()).some((x) => x.id === p.id))), [data.plans, data.history]);

  const key = due.map((p) => p.id).join(',');
  if (!due.length || dismissed === key || pathname.startsWith('/train')) return null;
  return (
    <div className="reminder-banner" role="status">
      <span>
        🥊 Time to train: <b>{due.map((p) => p.name).join(', ')}</b>
      </span>
      <Link to="/train" className="btn small primary">
        Go
      </Link>
      <button className="link-btn" onClick={() => setDismissed(key)} aria-label="Dismiss reminder">
        ✕
      </button>
    </div>
  );
}
