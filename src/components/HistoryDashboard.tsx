import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SessionLog } from '../lib/storage';
import { activityGrid, bestStreak, streakDays, topCombos, weeklyTotals } from '../lib/stats';

const fmtDay = (key: string, o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, o);
};

/** "2 h 05 m" / "45 m" */
const fmtDuration = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m` : `${m} m`;
};

/** Weeks in the activity calendar: half a year, or a quarter on phones so the squares stay readable. */
function useHeatWeeks() {
  const query = '(max-width: 600px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow ? 13 : 26;
}
const LEVEL_LABEL = ['No training', 'Under 10 min', '10–20 min', '20–35 min', '35 min or more'];

/** Headline numbers, an activity calendar, minutes per week and the most-drilled combos. */
export default function HistoryDashboard({ history }: { history: SessionLog[] }) {
  const HEAT_WEEKS = useHeatWeeks();
  const stats = useMemo(() => {
    const totalSec = history.reduce((s, x) => s + Math.max(0, x.durationSec), 0);
    const weeks = weeklyTotals(history, 8);
    const thisWeek = weeks[weeks.length - 1];
    const lastWeek = weeks[weeks.length - 2];
    return {
      sessions: history.length,
      totalSec,
      streak: streakDays(history),
      best: bestStreak(history),
      weeks,
      thisWeek,
      lastWeek,
      grid: activityGrid(history, HEAT_WEEKS),
      top: topCombos(history, 6),
    };
  }, [history, HEAT_WEEKS]);

  const delta = stats.thisWeek.sessions - stats.lastWeek.sessions;
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.minutes));
  const maxTop = Math.max(1, ...stats.top.map((t) => t.sessions));
  const activeDays = stats.grid.flat().filter((d) => d.seconds > 0).length;

  return (
    <div className="hd">
      {/* ---- Headline cards ---- */}
      <div className="hd-tiles">
        <div className="hd-tile hd-hero card">
          <div className="hd-hero-head">
            <span className="hd-label">Time trained</span>
            <Link to="/history/sessions" className="btn small" aria-label="View all sessions">
              View all
            </Link>
          </div>
          <b className="hd-value">{fmtDuration(stats.totalSec)}</b>
          <span className="hd-sub">
            {stats.sessions} session{stats.sessions === 1 ? '' : 's'} in total
          </span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">Current streak</span>
          <b className="hd-value">
            {stats.streak} <small>day{stats.streak === 1 ? '' : 's'}</small>
          </b>
          <span className="hd-sub">{stats.streak > 0 ? '🔥 Keep it going' : 'Train today to start one'}</span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">Best streak</span>
          <b className="hd-value">
            {stats.best} <small>day{stats.best === 1 ? '' : 's'}</small>
          </b>
          <span className="hd-sub">{stats.best > 0 && stats.best === stats.streak ? '🏆 You’re on it now' : 'Your longest run'}</span>
        </div>
        <div className="hd-tile card">
          <span className="hd-label">This week</span>
          <b className="hd-value">
            {stats.thisWeek.sessions} <small>session{stats.thisWeek.sessions === 1 ? '' : 's'}</small>
          </b>
          <span className="hd-sub">
            {delta === 0 ? '= same as last week' : delta > 0 ? `▲ ${delta} more than last week` : `▼ ${-delta} fewer than last week`}
            {' · '}
            {stats.thisWeek.minutes} min
          </span>
        </div>
      </div>

      {/* ---- Activity calendar ---- */}
      <section className="card hd-card">
        <div className="hd-card-head">
          <h2>Activity</h2>
          <span className="muted small">
            {activeDays} training day{activeDays === 1 ? '' : 's'} in the last {HEAT_WEEKS} weeks
          </span>
        </div>
        {/* One grid, filled column by column: weekday labels, then one column per week. */}
        <div
          className="heat"
          style={{ gridTemplateColumns: `auto repeat(${HEAT_WEEKS}, minmax(0, 1fr))` }}
          role="group"
          aria-label={`Training activity, last ${HEAT_WEEKS} weeks: ${activeDays} days with training`}
        >
          {['', 'Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
            <span key={`d${i}`} className="heat-day" aria-hidden>
              {d}
            </span>
          ))}
          {stats.grid.map((col, w) => {
            const first = col[0];
            const month = (i: number) => stats.grid[i][0].key.slice(5, 7);
            // Label a column where a new month starts; the very first column only if its month runs on a while.
            const showMonth =
              w === 0 ? [1, 2, 3].every((i) => i >= stats.grid.length || month(i) === month(0)) : month(w) !== month(w - 1);
            return [
              <span key={`m${first.key}`} className="heat-month" aria-hidden>
                {showMonth ? fmtDay(first.key, { month: 'short' }) : ''}
              </span>,
              ...col.map((d) => {
                const tip = `${fmtDay(d.key, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.seconds ? fmtDuration(d.seconds) : 'rest'}`;
                // A day with training opens that day's sessions.
                return d.seconds > 0 ? (
                  <Link
                    key={d.key}
                    to={`/history/sessions?day=${d.key}`}
                    className={`heat-cell lv${d.level}`}
                    data-tip={tip}
                    aria-label={`${tip}. Show this day's sessions`}
                  />
                ) : (
                  <span key={d.key} className={`heat-cell lv0 ${d.future ? 'future' : ''}`} data-tip={d.future ? undefined : tip} />
                );
              }),
            ];
          })}
        </div>
        <div className="heat-legend small muted" aria-hidden>
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heat-cell lv${l}`} title={LEVEL_LABEL[l]} />
          ))}
          More
        </div>
      </section>

      <div className="hd-pair">
        {/* ---- Minutes per week ---- */}
        <section className="card hd-card">
          <div className="hd-card-head">
            <h2>Minutes per week</h2>
            <span className="muted small">last 8 weeks</span>
          </div>
          <div className="wk-chart" role="list" aria-label="Minutes trained per week">
            {stats.weeks.map((w, i) => {
              const current = i === stats.weeks.length - 1;
              const isMax = w.minutes === maxWeek && w.minutes > 0;
              return (
                <div
                  key={w.start}
                  className={`wk-col ${current ? 'current' : ''}`}
                  role="listitem"
                  tabIndex={0}
                  data-tip={`Week of ${fmtDay(w.start)} · ${w.minutes} min · ${w.sessions} session${w.sessions === 1 ? '' : 's'}`}
                  aria-label={`Week of ${fmtDay(w.start)}: ${w.minutes} minutes, ${w.sessions} sessions`}
                >
                  <span className="wk-val">{current || isMax ? w.minutes : ''}</span>
                  <span className="wk-bar" style={{ height: `${(w.minutes / maxWeek) * 100}%` }} />
                  <span className="wk-label">{current ? 'This wk' : fmtDay(w.start)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- Most-drilled combos ---- */}
        <section className="card hd-card">
          <div className="hd-card-head">
            <h2>Most drilled</h2>
            <span className="muted small">sessions per combo</span>
          </div>
          {stats.top.length === 0 ? (
            <p className="muted small">Train a few sessions to see your favourite combos here.</p>
          ) : (
            <ol className="top-list">
              {stats.top.map((t, i) => (
                <li key={t.name} data-tip={`${t.name}: drilled in ${t.sessions} session${t.sessions === 1 ? '' : 's'}`}>
                  <span className="top-rank">{i + 1}</span>
                  <span className="top-name">{t.name}</span>
                  <span className="top-track">
                    <span className="top-bar" style={{ width: `${(t.sessions / maxTop) * 100}%` }} />
                  </span>
                  <b className="top-num">{t.sessions}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
