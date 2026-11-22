import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
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
  planWeekColumns,
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
          <Icon name="plus" />
          New plan
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

/** − 30 days + — hold a button to keep changing. */
function DayStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef({ value, onChange });
  ref.current = { value, onChange };
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const nudge = (dir: 1 | -1) => {
    const next = Math.min(366, Math.max(1, ref.current.value + dir));
    if (next === ref.current.value) return false;
    ref.current.value = next;
    ref.current.onChange(next);
    return true;
  };
  const press = (dir: 1 | -1) => {
    stop();
    nudge(dir);
    const repeat = () => {
      timer.current = nudge(dir) ? window.setTimeout(repeat, 70) : null;
    };
    timer.current = window.setTimeout(repeat, 450);
  };
  const btn = (dir: 1 | -1) => (
    <button
      type="button"
      className="btn icon"
      aria-label={dir > 0 ? 'Longer plan' : 'Shorter plan'}
      disabled={dir > 0 ? value >= 366 : value <= 1}
      onPointerDown={(e) => e.button === 0 && press(dir)}
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
      <b className="stepper-time">
        {value} day{value === 1 ? '' : 's'}
      </b>
      {btn(1)}
    </div>
  );
}

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
          <div className="field">
            <span>Length</span>
            <DayStepper value={days} onChange={setDays} />
          </div>
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
          <Icon name={existing ? 'save' : 'plus'} />
          {existing ? 'Save plan' : 'Create plan'}
        </button>
        <Link to={existing ? `/plans/${existing.id}` : '/plans'} className="btn">
          Cancel
        </Link>
      </div>
    </div>
  );
}

/** Weeks shown in the plan calendar: half a year, or a quarter on phones so squares stay tappable. */
function useCalendarWeeks() {
  const query = '(max-width: 600px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow ? 13 : 26;
}

const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  missed: 'Missed',
  today: 'Today',
  upcoming: 'Training day',
  rest: 'Rest day',
  bonus: 'Extra session',
  moved: 'Made up on another day',
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
  const calWeeks = useCalendarWeeks();
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

      <div className="hd-tiles plan-tiles">
        <div className="hd-tile hd-hero card">
          <span className="hd-label">Progress</span>
          <b className="hd-value">{s.percent}%</b>
          <div className="pt-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent} aria-label="Plan progress">
            <span style={{ width: `${s.percent}%` }} />
          </div>
          <span className="hd-sub">
            {s.done} of {s.trainingDays} sessions done{s.remaining > 0 && !s.finished ? ` · ${s.remaining} to go` : ''}
          </span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">Streak</span>
          <b className="hd-value">
            {s.streak} <small>session{s.streak === 1 ? '' : 's'}</small>
          </b>
          <span className="hd-sub">{s.streak > 0 ? '🔥 in a row' : 'Train to start one'}</span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">{s.finished ? 'Finished' : 'Day'}</span>
          <b className="hd-value">
            {s.finished ? '✓' : s.dayNumber ?? '–'} {!s.finished && s.dayNumber ? <small>/ {plan.days}</small> : null}
          </b>
          <span className="hd-sub">{s.finished ? 'Plan complete' : s.dayNumber ? `${plan.days - s.dayNumber} day${plan.days - s.dayNumber === 1 ? '' : 's'} left` : `Starts ${fmtDay(plan.start)}`}</span>
        </div>
        <div className={`hd-tile card ${s.missed > 0 ? 'pt-missed' : ''}`}>
          <span className="hd-label">Missed</span>
          <b className="hd-value">{s.missed}</b>
          <span className="hd-sub">{s.missed > 0 ? 'Make it up any day' : '✓ None so far'}</span>
        </div>
      </div>

      {w ? (
        <div className="plan-start">
          <button
            className="btn primary big start-btn"
            onClick={() => startWorkout(w, plan.id) || void dialog.alert({ title: 'No combos to call', message: 'This workout has no combos left. Edit it and pick some combos.' })}
          >
            <Icon name="play" />
            Start session
          </button>
          <span className="muted small">
            {todayStatus === 'done' || todayStatus === 'bonus'
              ? "✓ Today's session is done — another one counts as extra"
              : todayStatus === 'today'
                ? `Today is a training day · ${w.name}`
                : s.dayNumber !== null
                  ? `Not a planned day, but it counts toward this week · ${w.name}`
                  : s.finished
                    ? `Plan finished · ${w.name}`
                    : `Plan starts ${fmtDay(plan.start)} · ${w.name}`}
          </span>
        </div>
      ) : (
        <p className="muted small">This plan's workout was deleted. Edit the plan to pick another one.</p>
      )}

      <section className="card calendar-card">
        {(() => {
          const cols = planWeekColumns(plan, calWeeks);
          return (
            <div
              className="plan-heat"
              style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 1fr))` }}
              role="grid"
              aria-label="Plan calendar"
            >
              {['', 'Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
                <span key={`d${i}`} className="heat-day" aria-hidden>
                  {d}
                </span>
              ))}
              {cols.map((col) => {
                // Label the week that contains the 1st of a month.
                const firstOfMonth = col.find((k) => k.endsWith('-01'));
                return [
                  <span key={`m${col[0]}`} className="heat-month" aria-hidden>
                    {firstOfMonth ? fmtDay(firstOfMonth, { month: 'short' }) : ''}
                  </span>,
                  ...col.map((k) => {
                    const st = dayStatus(plan, k, today, done);
                    const inPlan = st !== 'before' && st !== 'after';
                    const manual = !!plan.marks[k];
                    // Any past day (or today) in the plan can be ticked — train whichever days suit you.
                    const clickable = inPlan && k <= today && !fromHistory.has(k);
                    const tip = `${fmtDay(k, { weekday: 'short', month: 'short', day: 'numeric' })} · ${inPlan ? (STATUS_LABEL[st] ?? '') : 'Outside this plan'}${manual ? ' (ticked)' : ''}`;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="gridcell"
                        className={`ph-cell ${st} ${k === today ? 'is-today' : ''}`}
                        onClick={() => clickable && toggleMark(k)}
                        disabled={!clickable}
                        data-tip={tip}
                        aria-label={tip}
                      >
                        {Number(k.slice(8))}
                      </button>
                    );
                  }),
                ];
              })}
            </div>
          );
        })()}
        <div className="cal-side">
        <div className="cal-legend small">
          <span className="lg done">Done</span>
          <span className="lg missed">Missed</span>
          <span className="lg today">Today</span>
          <span className="lg upcoming">Training</span>
          <span className="lg rest">Rest</span>
          <span className="lg moved">Moved</span>
        </div>
        <p className="muted small">
          Train on any day — it counts toward that week's {plan.weekdays.length} session{plan.weekdays.length === 1 ? '' : 's'}, and a planned day you
          swap shows as Moved instead of Missed. Sessions from this plan or workout tick the day automatically; tap any past day to tick or untick it.
        </p>
        </div>
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
