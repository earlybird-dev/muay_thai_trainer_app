import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';
import { useStore } from './store';
import { clearAccountData, deleteRemoteHistory, fetchRemote, mergeAll, pushRemote } from './sync';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface Account {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

interface AuthCtx {
  enabled: boolean;
  ready: boolean;
  account: Account | null;
  status: SyncStatus;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Delete history in the cloud too (when signed in). Throws if it fails. */
  clearRemoteHistory: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const toAccount = (u: User): Account => ({
  id: u.id,
  email: u.email ?? null,
  name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? null,
  avatar: (u.user_metadata?.avatar_url as string) ?? (u.user_metadata?.picture as string) ?? null,
});

const SYNC_DEBOUNCE_MS = 1500;

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { applySync, dataRef, versionRef, version } = store;
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const accountRef = useRef<Account | null>(null);
  accountRef.current = account;
  const inFlight = useRef(false);
  const again = useRef(false);

  const sync = useCallback(async () => {
    const acc = accountRef.current;
    if (!supabase || !acc) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    inFlight.current = true;
    setStatus('syncing');
    try {
      do {
        again.current = false;
        const startVersion = versionRef.current;
        const remote = await fetchRemote(supabase);
        const { data: merged, push } = mergeAll(dataRef.current, remote);
        await pushRemote(supabase, acc.id, push);
        if (versionRef.current !== startVersion) {
          again.current = true; // the user changed something meanwhile; merge again from fresh data
          continue;
        }
        applySync(() => ({ ...merged, syncedUserId: acc.id, lastSyncAt: new Date().toISOString() }));
      } while (again.current);
      setError(null);
      setStatus('synced');
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e);
      setError(msg);
      setStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      inFlight.current = false;
    }
  }, [applySync, dataRef, versionRef]);

  // Only offer sign-in once Google is actually enabled for the project.
  const [googleReady, setGoogleReady] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && setGoogleReady(!!j?.external?.google))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Session handling
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const onUser = (u: User | null) => {
      const acc = u ? toAccount(u) : null;
      if (acc) {
        // Another account's data is on this device: clear it before merging this account in.
        const owner = dataRef.current.syncedUserId;
        if (owner && owner !== acc.id) applySync(clearAccountData);
        applySync((d) => ({ ...d, syncedUserId: acc.id }));
      }
      setAccount((prev) => (prev?.id === acc?.id ? prev : acc));
      setReady(true);
    };
    void sb.auth.getSession().then(({ data }) => onUser(data.session?.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      onUser(session?.user ?? null);
      // Tidy the OAuth ?code=… out of the address bar after sign-in.
      const url = new URL(window.location.href);
      if (url.searchParams.has('code')) {
        url.searchParams.delete('code');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [applySync, dataRef]);

  // Sync on sign-in, then shortly after every local change
  useEffect(() => {
    if (account) void sync();
  }, [account, sync]);

  useEffect(() => {
    if (!account || version === 0) return;
    const t = window.setTimeout(() => void sync(), SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [version, account, sync]);

  // ...and when coming back online or back to the app
  useEffect(() => {
    if (!account) return;
    const onOnline = () => void sync();
    const onVisible = () => document.visibilityState === 'visible' && void sync();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [account, sync]);

  const signIn = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (err) setError(err.message);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await sync().catch(() => {}); // push anything pending first
    await supabase.auth.signOut();
    applySync(clearAccountData); // the data stays in the account, not on this device
    setStatus('idle');
    setError(null);
  }, [applySync, sync]);

  const clearRemoteHistory = useCallback(async () => {
    const acc = accountRef.current;
    if (!supabase || !acc) return;
    await deleteRemoteHistory(supabase, acc.id);
  }, []);

  return (
    <Ctx.Provider
      value={{ enabled: !!supabase && (googleReady || !!account), ready, account, status, error, signIn, signOut, syncNow: sync, clearRemoteHistory }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside provider');
  return a;
}
