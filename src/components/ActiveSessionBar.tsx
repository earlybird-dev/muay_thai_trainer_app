import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { loadActiveSession, onActiveSessionChange } from '../lib/activeSession';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** "Session in progress" bar on every page while a session is waiting to be resumed. */
export default function ActiveSessionBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState(loadActiveSession);
  useEffect(() => onActiveSessionChange(() => setSession(loadActiveSession())), []);
  // Re-check on navigation too (e.g. after it expired).
  useEffect(() => setSession(loadActiveSession()), [pathname]);

  if (!session || pathname.startsWith('/train/session')) return null;
  const drill = session.launch.config.mode === 'drill';
  return (
    <div className="active-session-bar" role="status">
      <span className="asb-dot" aria-hidden />
      <span className="asb-text">
        <b>Session in progress</b>
        <span className="muted small">
          {drill ? 'Combo drill' : 'Rounds'} · paused at {clock(session.elapsed)}
        </span>
      </span>
      <button className="btn small" onClick={() => navigate('/train/session', { state: { endNow: true } })}>
        End
      </button>
      <button className="btn primary small" onClick={() => navigate('/train/session')}>
        <Icon name="play" size={14} />
        Resume
      </button>
    </div>
  );
}
