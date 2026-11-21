import { useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { newId } from '../data/combos';
import {
  WEEKDAYS,
  addDays,
  completedDays,
  dateKey,
  dayStatus,
  parseDay,
  planEnd,
  planStats,
  planWeeks,
  workoutSummary,
  type TrainPlan,
} from '../lib/plans';
import { ensureNotificationPermission } from '../lib/reminders';
import { useStore } from '../lib/store';
import { useStartWorkout } from '../lib/useStartWorkout';
import { useDialog } from '../components/Dialog';

export default function Plans() {
  return (
    <Routes>
      <Route index element={<PlanList />} />
      <Route path="new" element={<PlanForm />} />
      <Route path=":id" element={<PlanDetail />} />
      <Route path=":id/edit" element={<PlanForm />} />
      <Route path="*" element={<Navigate to="/plans" replace />} />
    </Routes>
  );
}

const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  parseDay(key).toLocaleDateString(undefined, opts);

function PlanList() {
  const { data } = useStore();
  const today = dateKey(new Date());
  const active = data.plans.filter((p) => !p.archived);
  const archived = data.plans.filter((p) => p.archived);

  const card = (p: TrainPlan) => {
    const s = planStats(p, data.history, today);
    const w = data.workouts.find((x) => x.id === p.workoutId);
    return (
      <li key={p.id}>
        <Link to={`/plans/${p.id}`} className="card plan-card">
          <div className="plan-card-head">
            <b>{p.name}</b>
            <span className="muted small">
              {s.finished ? 'Finished' : s.dayNumber ? `Day ${s.dayNumber} of ${p.days}` : `Starts ${fmtDay(p.start)}`}
            </span>
          </div>
          <span className="muted small">
            {w?.name ?? 'Workout deleted'} · {WEEKDAYS.filter((d) => p.weekdays.includes(d.id)).map((d) => d.short).join(' ')}
          </span>
          <div className="progress slim" aria-label={`${s.percent}% complete`}>
            <div className="progress-bar" style={{ width: `${s.percent}%` }} />
          </div>
          <span className="small">
            {s.done}/{s.trainingDays} sessions · {s.percent}%{s.streak > 1 ? ` · 🔥 ${s.streak} in a row` : ''}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Plans</h1>
        <Link to="/plans/new" className="btn primary">
          + New plan
        </Link>
      </div>
      <p className="muted">
        A plan repeats one of your saved workouts on the days you choose, for as long as you choose (e.g. 30 days, Mon/Wed/Fri).
      </p>
      {data.workouts.length === 0 && (
        <p className="card small">
          First save a workout: set it up on the <Link to="/train">Train</Link> page and tap <b>Save as workout</b>.
        </p>
      )}
      {active.length === 0 ? <p className="muted">No active plans yet.</p> : <ul className="list">{active.map(card)}</ul>}
      {archived.length > 0 && (
        <section className="section">
          <h2>Archived</h2>
          <ul className="list">{archived.map(card)}</ul>
        </section>
      )}
    </div>
  );
}

const LENGTHS = [7, 14, 21, 30, 60, 90];

function PlanForm() {
  const { id } = useParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const existing = id ? data.plans.find((p) => p.id === id) : undefined;
  const today = dateKey(new Date());

  const [name, setName] = useState(existing?.name ?? '30-day plan');
  const [workoutId, setWorkoutId] = useState(existing?.workoutId ?? data.workouts[0]?.id ?? '');
  const [days, setDays] = useState(existing?.days ?? 30);
  const [start, setStart] = useState(existing?.start ?? today);
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? [1, 3, 5]);
  const [reminderOn, setReminderOn] = useState(existing?.reminder.enabled ?? false);
  const [time, setTime] = useState(existing?.reminder.time ?? '18:00');
  const [note, setNote] = useState<string | null>(null);

  if (id && !existing) return <Navigate to="/plans" replace />;
  if (data.workouts.length === 0)
    return (
      <div className="page">
        <Link to="/plans" className="back">
          ← Plans
        </Link>
        <h1>New plan</h1>
        <p className="card">
          A plan needs a saved workout. Set one up on the <Link to="/train">Train</Link> page and tap <b>Save as workout</b>, then come back.
        </p>
      </div>
    );

  const trainingCount = Array.from({ length: days }, (_, i) => addDays(start, i)).filter((k) => weekdays.includes(parseDay(k).getDay())).length;
  const valid = !!workoutId && weekdays.length > 0 && days >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(start);

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  const toggleReminder = async (on: boolean) => {
    setReminderOn(on);
    setNote(null);
    if (on) {
      const ok = await ensureNotificationPermission();
      if (!ok) setNote('Notifications are blocked for this site, so you will only see the reminder inside the app.');
    }
  };

  const save = () => {
    const plan: TrainPlan = {
      id: existing?.id ?? newId().replace('c-', 'p-'),
      name: name.trim() || '30-day plan',
      workoutId,
      start,
      days,
      weekdays,
      reminder: { enabled: reminderOn, time },
      marks: existing?.marks ?? {},
      ...(existing?.archived ? { archived: true } : {}),
    };
    update((d) => ({ ...d, plans: existing ? d.plans.map((p) => (p.id === plan.id ? plan : p)) : [plan, ...d.plans] }));
    navigate(`/plans/${plan.id}`, { replace: true });
  };

  return (
    <div className="page">
      <Link to={existing ? `/plans/${existing.id}` : '/plans'} className="back">
        ← {existing ? existing.name : 'Plans'}
      </Link>
      <h1>{existing ? 'Edit plan' : 'New plan'}</h1>

      <section className="card">
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Workout</span>
          <select className="input" value={workoutId} onChange={(e) => setWorkoutId(e.target.value)}>
            {data.workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {data.workouts.find((w) => w.id === workoutId) && (
            <span className="muted small">{workoutSummary(data.workouts.find((w) => w.id === workoutId)!)}</span>
          )}
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Length</span>
            <select className="input" value={LENGTHS.includes(days) ? days : 'custom'} onChange={(e) => e.target.value !== 'custom' && setDays(Number(e.target.value))}>
              {LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          <label className="field">
            <span>Days (custom)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={366}
              value={days}
              onChange={(e) => setDays(Math.min(366, Math.max(1, Math.round(Number(e.target.value) || 1))))}
            />
          </label>
          <label className="field">
            <span>Start date</span>
            <input className="input" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span>Training days</span>
          <div className="weekday-picker" role="group" aria-label="Training days">
            {WEEKDAYS.map((d) => (
              <button
                key={d.id}
                className={`weekday ${weekdays.includes(d.id) ? 'on' : ''}`}
                aria-pressed={weekdays.includes(d.id)}
                onClick={() => toggleDay(d.id)}
              >
                {d.short}
              </button>
            ))}
          </div>
          <span className="muted small">
            {trainingCount} training session{trainingCount === 1 ? '' : 's'} from {fmtDay(start)} to {fmtDay(addDays(start, days - 1))}
          </span>
        </div>
        <label className="check">
          <input type="checkbox" checked={reminderOn} onChange={(e) => void toggleReminder(e.target.checked)} />
          Daily reminder on training days
        </label>
        {reminderOn && (
          <label className="field reminder-time">
            <span>Reminder time</span>
            <input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
            <span className="muted small">
              Reminders appear while the app is open or running in the background. Phones may not deliver them once the app has been fully closed.
            </span>
          </label>
        )}
        {note && <p className="small error-text">{note}</p>}
      </section>

      <div className="row actions">
        <button className="btn primary" onClick={save} disabled={!valid}>
          {existing ? 'Save plan' : 'Create plan'}
        </button>
        <Link to={existing ? `/plans/${existing.id}` : '/plans'} className="btn">
          Cancel
        </Link>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  missed: 'Missed',
  today: 'Today',
  upcoming: 'Training day',
  rest: 'Rest day',
  bonus: 'Extra session',
};

function PlanDetail() {
  const { id = '' } = useParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const startWorkout = useStartWorkout();
  const dialog = useDialog();
  const plan = data.plans.find((p) => p.id === id);
  const today = dateKey(new Date());
  const done = useMemo(() => (plan ? completedDays(plan, data.history) : new Set<string>()), [plan, data.history]);
  if (!plan) return <Navigate to="/plans" replace />;

  const s = planStats(plan, data.history, today);
  const w = data.workouts.find((x) => x.id === plan.workoutId);
  const todayStatus = dayStatus(plan, today, today, done);
  const fromHistory = completedDays({ ...plan, marks: {} }, data.history);

  const setPlan = (fn: (p: TrainPlan) => TrainPlan) => update((d) => ({ ...d, plans: d.plans.map((p) => (p.id === plan.id ? fn(p) : p)) }));

  const toggleMark = (k: string) => {
    if (k > today || fromHistory.has(k)) return; // can't tick the future; history ticks are automatic
    setPlan((p) => {
      const marks = { ...p.marks };
      if (marks[k]) delete marks[k];
      else marks[k] = 'done';
      return { ...p, marks };
    });
  };

  const remove = async () => {
    if (
      !(await dialog.confirm({
        title: `Delete “${plan.name}”?`,
        message: 'The plan and its calendar are removed. Your training history is kept.',
        confirmLabel: 'Delete plan',
        danger: true,
      }))
    )
      return;
    update((d) => ({ ...d, plans: d.plans.filter((p) => p.id !== plan.id) }));
    navigate('/plans', { replace: true });
  };

  return (
    <div className="page">
      <Link to="/plans" className="back">
        ← Plans
      </Link>
      <h1>{plan.name}</h1>
      <p className="muted">
        {w ? (
          <>
            <b>{w.name}</b> · {workoutSummary(w)}
          </>
        ) : (
          'The workout for this plan was deleted. Edit the plan to choose another one.'
        )}
      </p>

      <div className="stat-row">
        <div className="stat card">
          <b>{s.percent}%</b>
          <span>
            {s.done}/{s.trainingDays} done
          </span>
        </div>
        <div className="stat card">
          <b>{s.streak}</b>
          <span>in a row</span>
        </div>
        <div className="stat card">
          <b>{s.finished ? '✓' : s.dayNumber ?? '–'}</b>
          <span>{s.finished ? 'finished' : s.dayNumber ? `day of ${plan.days}` : `starts ${fmtDay(plan.start)}`}</span>
        </div>
        <div className="stat card">
          <b>{s.missed}</b>
          <span>missed</span>
        </div>
      </div>

      {w && (todayStatus === 'today' || todayStatus === 'rest' || todayStatus === 'done' || todayStatus === 'bonus') && (
        <div className="row">
          {todayStatus === 'done' ? (
            <span className="today-done">✓ Today's session is done</span>
          ) : (
            <button className="btn primary big" onClick={() => startWorkout(w, plan.id) || void dialog.alert({ title: 'No combos to call', message: 'This workout has no combos left. Edit it and pick some combos.' })}>
              {todayStatus === 'today' ? "Start today's workout" : 'Train anyway (extra session)'}
            </button>
          )}
        </div>
      )}

      <section className="card calendar-card">
        <div className="calendar" role="grid" aria-label="Plan calendar">
          {WEEKDAYS.map((d) => (
            <div key={d.id} className="cal-head" role="columnheader">
              {d.short}
            </div>
          ))}
          {planWeeks(plan).flat().map((k, i) => {
            if (!k) return <div key={`pad-${i}`} className="cal-cell pad" />;
            const st = dayStatus(plan, k, today, done);
            const manual = !!plan.marks[k];
            const clickable = k <= today && !fromHistory.has(k) && st !== 'rest';
            const date = parseDay(k);
            return (
              <button
                key={k}
                role="gridcell"
                className={`cal-cell ${st} ${k === today ? 'is-today' : ''}`}
                onClick={() => clickable && toggleMark(k)}
                disabled={!clickable}
                title={`${fmtDay(k, { weekday: 'long', month: 'long', day: 'numeric' })}: ${STATUS_LABEL[st] ?? ''}${manual ? ' (ticked by you)' : ''}`}
              >
                {date.getDate() === 1 || k === plan.start ? fmtDay(k) : date.getDate()}
                {(st === 'done' || st === 'bonus') && <span className="cal-mark">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="cal-legend small">
          <span className="lg done">Done</span>
          <span className="lg missed">Missed</span>
          <span className="lg today">Today</span>
          <span className="lg upcoming">Training</span>
          <span className="lg rest">Rest</span>
        </div>
        <p className="muted small">
          Sessions you finish from this plan or this workout tick the day automatically. Tap a past training day to tick or untick it by hand.
        </p>
      </section>

      <p className="muted small">
        {fmtDay(plan.start, { weekday: 'short', month: 'short', day: 'numeric' })} → {fmtDay(planEnd(plan), { weekday: 'short', month: 'short', day: 'numeric' })}
        {plan.reminder.enabled ? ` · reminder at ${plan.reminder.time}` : ''}
      </p>

      <div className="row actions">
        <Link className="btn" to={`/plans/${plan.id}/edit`}>
          Edit plan
        </Link>
        <button className="btn" onClick={() => setPlan((p) => ({ ...p, archived: !p.archived }))}>
          {plan.archived ? 'Unarchive' : 'Archive'}
        </button>
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}
