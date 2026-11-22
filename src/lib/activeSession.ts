import type { LaunchState } from './useStartWorkout';

/**
 * The session currently being trained, kept on this device so a refresh, a swipe back or
 * switching tabs doesn't lose it. The plan is rebuilt from the same seed, so the combo
 * order is identical, and the clock picks up where it left off.
 */
export interface ActiveSession {
  /** History entry key of the session screen, so a refresh of that same entry resumes it. */
  key: string;
  launch: LaunchState;
  seed: number;
  /** Session clock in ms when last saved. */
  elapsed: number;
  callouts: number;
  used: string[];
  savedAt: number;
}

const STORAGE_KEY = 'mt-active-session';
/** Older than this and it's not "the session I was just doing" any more. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActiveSession;
    if (!s?.launch?.config || !Array.isArray(s.launch.pool) || Date.now() - s.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveActiveSession(s: Omit<ActiveSession, 'savedAt'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked: the session still runs, it just can't be resumed */
  }
  notify();
}

export function clearActiveSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

// Same-tab listeners (the storage event only fires in other tabs).
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
export function onActiveSessionChange(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && fn();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}
