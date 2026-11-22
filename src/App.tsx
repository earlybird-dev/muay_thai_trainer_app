import { useEffect } from 'react';
import ActiveSessionBar from './components/ActiveSessionBar';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useStore } from './lib/store';
import { applyHead } from './lib/seo';
import { ensureAudioContext } from './lib/audio';
import { configureMusic, refreshMusic, setMusicScene } from './lib/music';
import MusicToggle from './components/MusicToggle';
import { Avatar } from './components/AccountCard';
import Learn from './pages/Learn';
import TechniqueDetail from './pages/TechniqueDetail';
import Combos from './pages/Combos';
import ComboEditor from './pages/ComboEditor';
import Train from './pages/Train';
import History, { HistoryLog } from './pages/History';
import Settings from './pages/Settings';
import Plans from './pages/Plans';
import ReminderBanner from './components/ReminderBanner';

const NAV = [
  { to: '/learn', label: 'Learn', icon: 'M4 5h7v14H4zM13 5h7v14h-7z' },
  { to: '/combos', label: 'Combos', icon: 'M5 12h4m2 0h2m2 0h4M7 8l-2 4 2 4M17 8l2 4-2 4' },
  { to: '/train', label: 'Train', icon: 'M12 3v3M12 13l3-3M5 13a7 7 0 1 0 14 0 7 7 0 0 0-14 0' },
  { to: '/plans', label: 'Plans', icon: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4M9 14l2 2 4-4' },
  { to: '/history', label: 'History', icon: 'M4 19V9m5 10V5m5 14v-7m5 7v-4' },
  { to: '/settings', label: 'Settings', icon: 'M4 7h10m4 0h2M4 17h4m4 0h8M16 5v4M10 15v4' },
];

function AccountBadge() {
  const { enabled, ready, account, status } = useAuth();
  if (!enabled || !ready) return null;
  if (!account)
    return (
      <Link to="/settings" className="topbar-signin">
        Sign in
      </Link>
    );
  const label = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing' : status === 'offline' ? 'Offline' : status === 'error' ? 'Sync problem' : 'Signed in';
  return (
    <Link to="/settings" className={`topbar-account sync-${status}`} title={`${account.email ?? 'Account'} · ${label}`} aria-label={`Account: ${label}`}>
      <Avatar src={account.avatar} name={account.name ?? account.email} size={30} />
      <span className="sync-dot" aria-hidden />
    </Link>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const inSession = pathname.startsWith('/train/session');
  const { data } = useStore();
  const { music, musicVolume, trainingTrack } = data.settings;

  // Background music: calm everywhere except the session screen, which sets its own scene.
  // Page title, description and social tags for search engines and link previews.
  useEffect(() => applyHead(pathname), [pathname]);
  // Open each new page at the top (Back/Forward keep the browser's own scroll position).
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);
  useEffect(() => configureMusic({ enabled: music, volume: musicVolume, trainingTrack }), [music, musicVolume, trainingTrack]);
  useEffect(() => {
    if (!inSession) setMusicScene('calm');
  }, [inSession]);
  // Browsers only allow audio after a user gesture, so start on the first tap/click/key.
  useEffect(() => {
    const start = () => {
      if (ensureAudioContext()) refreshMusic();
    };
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('keydown', start, true);
    return () => {
      window.removeEventListener('pointerdown', start, true);
      window.removeEventListener('keydown', start, true);
    };
  }, []);

  return (
    <div className={`app ${inSession ? 'app-session' : ''}`}>
      {!inSession && (
        <header className="topbar">
          <span className="brand">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <circle cx="12" cy="12" r="9" fill="none" stroke="var(--accent)" strokeWidth="2.2" />
              <path d="M8.5 16c0-3 1.2-5.5 3.5-7.5 2.3 2 3.5 4.5 3.5 7.5" fill="none" stroke="var(--accent-2)" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className="brand-name">Muay Thai Trainer</span>
          </span>
          <div className="topbar-right">
            <MusicToggle />
            <AccountBadge />
          </div>
        </header>
      )}
      {!inSession && <ReminderBanner />}
      <main className="content">
        <ActiveSessionBar />
        <Routes>
          <Route path="/" element={<Navigate to="/learn" replace />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:id" element={<TechniqueDetail />} />
          <Route path="/combos" element={<Combos />} />
          <Route path="/combos/new" element={<ComboEditor />} />
          <Route path="/combos/:id" element={<ComboEditor />} />
          <Route path="/train/*" element={<Train />} />
          <Route path="/plans/*" element={<Plans />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/sessions" element={<HistoryLog />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/learn" replace />} />
        </Routes>
      </main>
      {!inSession && (
        <nav className="tabbar" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path d={n.icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
