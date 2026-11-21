import { useEffect, useState } from 'react';
import { useAuth, type SyncStatus } from '../lib/auth';
import { useStore } from '../lib/store';
import { useDialog } from './Dialog';

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: 'Not synced yet',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline — changes will sync when you are back online',
  error: 'Sync failed',
};

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Avatar({ src, name, size = 36 }: { src: string | null; name: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return src && !broken ? (
    <img className="avatar" src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size }} aria-hidden>
      {initial}
    </span>
  );
}

/** Sign in with Google / account + sync status, for the Settings page. */
export default function AccountCard() {
  const dialog = useDialog();
  const { enabled, ready, account, status, error, signIn, signOut, syncNow } = useAuth();
  const { data } = useStore();
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000); // keep "x min ago" fresh
    return () => window.clearInterval(t);
  }, []);

  if (!enabled) return null;

  return (
    <section className="card account-card">
      <h2>Account</h2>
      {!ready ? (
        <p className="muted small">Checking sign-in…</p>
      ) : !account ? (
        <>
          <p className="muted small">
            Sign in to back up your combos, training history and progress, and pick them up on any device. Without an account
            everything stays on this device only.
          </p>
          <button
            className="btn google-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await signIn();
              setBusy(false);
            }}
          >
            <GoogleMark /> Sign in with Google
          </button>
        </>
      ) : (
        <>
          <div className="account-row">
            <Avatar src={account.avatar} name={account.name ?? account.email} size={44} />
            <div className="account-who">
              <b>{account.name ?? 'Signed in'}</b>
              {account.email && <span className="muted small">{account.email}</span>}
            </div>
          </div>
          <p className={`sync-line sync-${status}`} aria-live="polite">
            <span className="sync-dot" aria-hidden />
            {STATUS_TEXT[status]}
            {status === 'synced' && ` · ${timeAgo(data.lastSyncAt)}`}
          </p>
          <div className="row">
            <button className="btn" onClick={() => void syncNow()} disabled={status === 'syncing'}>
              Sync now
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                if (
                  !(await dialog.confirm({
                    title: 'Sign out?',
                    message: 'Your data stays in your account, and is removed from this device.',
                    confirmLabel: 'Sign out',
                    danger: true,
                  }))
                )
                  return;
                setBusy(true);
                await signOut();
                setBusy(false);
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
      {error && <p className="small error-text">{error}</p>}
    </section>
  );
}
