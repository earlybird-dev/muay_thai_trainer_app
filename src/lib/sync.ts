/**
 * Cloud sync for signed-in users. The app stays local-first: localStorage is what the UI reads.
 * Syncing = pull everything for the user, merge with local data, push what the server is missing.
 *
 *  - Combos: newest change wins per combo (local `updatedAt` / tombstone vs server `updated_at`).
 *    Deletions are pushed as `deleted = true` rows so they reach other devices.
 *  - History: union by session id (sessions are never edited, only added or cleared).
 *  - Progress + settings (learned, videos, synced settings): one blob, newest wins.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Combo } from '../data/combos';
import { toLevel, type Level } from '../data/techniques';
import { DEFAULT_SETTINGS, pickSyncedSettings, type AppData, type SessionLog, type SyncedSettings } from './storage';

export interface ComboRow {
  user_id?: string;
  id: string;
  name: string;
  items: string[];
  level: Level;
  style: 'numbers' | 'names';
  deleted: boolean;
  updated_at: string;
}

export interface SessionRow {
  user_id?: string;
  id: string;
  date: string;
  rounds: number;
  completed_rounds: number;
  round_sec: number;
  rest_sec: number;
  callouts: number;
  combos: string[];
  duration_sec: number;
}

export interface StateRow {
  user_id?: string;
  learned: string[];
  videos: Record<string, string>;
  settings: Partial<SyncedSettings>;
  updated_at: string;
}

export interface RemoteData {
  combos: ComboRow[];
  sessions: SessionRow[];
  state: StateRow | null;
}

export interface PushPlan {
  combos: ComboRow[];
  sessions: SessionRow[];
  state: StateRow | null;
}

export const HISTORY_LIMIT = 500;
const EPOCH = '1970-01-01T00:00:00.000Z';
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

// ---------- local change stamping ----------

const comboKey = (c: Combo) => JSON.stringify([c.name, c.items, c.level, c.style]);
const stateKey = (d: AppData) => JSON.stringify([[...d.learned].sort(), d.videos, pickSyncedSettings(d.settings)]);

/**
 * Called on every local change: stamps changed combos with `updatedAt`, records deletions as
 * tombstones, and bumps `stateUpdatedAt` when progress/settings change.
 */
export function stampChanges(prev: AppData, next: AppData, now = new Date().toISOString()): AppData {
  const before = new Map(prev.combos.map((c) => [c.id, c]));
  const tombstones = { ...next.tombstones };
  let combosChanged = false;

  const combos = next.combos.map((c) => {
    const old = before.get(c.id);
    if (tombstones[c.id]) {
      delete tombstones[c.id];
      combosChanged = true;
    }
    if (old && comboKey(old) === comboKey(c)) return c.updatedAt || !old.updatedAt ? c : { ...c, updatedAt: old.updatedAt };
    combosChanged = true;
    return { ...c, updatedAt: now };
  });
  const after = new Set(combos.map((c) => c.id));
  for (const c of prev.combos)
    if (!after.has(c.id)) {
      tombstones[c.id] = now;
      combosChanged = true;
    }

  const stateChanged = stateKey(prev) !== stateKey(next);
  if (!combosChanged && !stateChanged) return next;
  return {
    ...next,
    combos,
    tombstones,
    stateUpdatedAt: stateChanged ? now : next.stateUpdatedAt,
  };
}

// ---------- row mapping ----------

export const comboToRow = (c: Combo, deleted = false, at?: string): ComboRow => ({
  id: c.id,
  name: c.name,
  items: c.items,
  level: c.level,
  style: c.style,
  deleted,
  updated_at: at ?? c.updatedAt ?? new Date().toISOString(),
});

export const rowToCombo = (r: ComboRow): Combo => ({
  id: r.id,
  name: r.name,
  items: r.items ?? [],
  level: toLevel(r.level),
  style: r.style === 'names' ? 'names' : 'numbers',
  updatedAt: r.updated_at,
});

export const sessionToRow = (s: SessionLog): SessionRow => ({
  id: s.id,
  date: s.date,
  rounds: s.rounds,
  completed_rounds: s.completedRounds,
  round_sec: s.roundSec,
  rest_sec: s.restSec,
  callouts: s.callouts,
  combos: s.combos,
  duration_sec: s.durationSec,
});

export const rowToSession = (r: SessionRow): SessionLog => ({
  id: r.id,
  date: new Date(r.date).toISOString(),
  rounds: r.rounds,
  completedRounds: r.completed_rounds,
  roundSec: r.round_sec,
  restSec: r.rest_sec,
  callouts: r.callouts,
  combos: r.combos ?? [],
  durationSec: r.duration_sec,
});

// ---------- merge ----------

/** Merge local data with the server copy. Returns the new local data and what to send up. */
export function mergeAll(local: AppData, remote: RemoteData, now = new Date().toISOString()): { data: AppData; push: PushPlan } {
  const push: PushPlan = { combos: [], sessions: [], state: null };

  // Combos
  const localById = new Map(local.combos.map((c) => [c.id, c]));
  const remoteById = new Map(remote.combos.map((r) => [r.id, r]));
  const ids = new Set([...localById.keys(), ...Object.keys(local.tombstones), ...remoteById.keys()]);
  const merged = new Map<string, Combo>();
  for (const id of ids) {
    const L = localById.get(id);
    const T = local.tombstones[id];
    const R = remoteById.get(id);
    const localAt = L ? L.updatedAt ?? EPOCH : T ?? null;

    if (!R) {
      if (L) {
        const at = L.updatedAt ?? now;
        merged.set(id, { ...L, updatedAt: at });
        push.combos.push(comboToRow(L, false, at));
      }
      continue; // a tombstone the server never saw: nothing to do
    }
    if (localAt === null || time(R.updated_at) >= time(localAt)) {
      if (!R.deleted) merged.set(id, rowToCombo(R)); // server wins
    } else if (L) {
      merged.set(id, L);
      push.combos.push(comboToRow(L));
    } else if (T) {
      if (!R.deleted) push.combos.push({ ...R, user_id: undefined, deleted: true, updated_at: T });
    }
  }
  // Keep the user's ordering for combos that survive; new ones from the server go first.
  const order = [...remote.combos].sort((a, b) => time(b.updated_at) - time(a.updated_at)).map((r) => r.id);
  const combos = [
    ...order.filter((id) => merged.has(id) && !localById.has(id)).map((id) => merged.get(id)!),
    ...local.combos.filter((c) => merged.has(c.id)).map((c) => merged.get(c.id)!),
  ];

  // History
  const remoteSessionIds = new Set(remote.sessions.map((s) => s.id));
  for (const s of local.history) if (!remoteSessionIds.has(s.id)) push.sessions.push(sessionToRow(s));
  const seen = new Set<string>();
  const history = [...local.history, ...remote.sessions.map(rowToSession)]
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .sort((a, b) => time(b.date) - time(a.date))
    .slice(0, HISTORY_LIMIT);

  // Progress + settings
  let { learned, videos, settings, stateUpdatedAt } = local;
  const R = remote.state;
  const localStateRow = (): StateRow => ({
    learned: local.learned,
    videos: local.videos,
    settings: pickSyncedSettings(local.settings),
    updated_at: local.stateUpdatedAt ?? now,
  });
  if (!R) {
    push.state = localStateRow();
    stateUpdatedAt = push.state.updated_at;
  } else if (!local.stateUpdatedAt || time(R.updated_at) >= time(local.stateUpdatedAt)) {
    learned = R.learned ?? [];
    videos = R.videos ?? {};
    settings = { ...DEFAULT_SETTINGS, ...local.settings, ...(R.settings ?? {}), voiceURI: local.settings.voiceURI };
    stateUpdatedAt = R.updated_at;
  } else {
    push.state = localStateRow();
  }

  return {
    data: { ...local, combos, tombstones: {}, history, learned, videos, settings, stateUpdatedAt },
    push,
  };
}

/** Remove everything that belongs to an account, keeping device preferences. */
export const clearAccountData = (d: AppData): AppData => ({
  ...d,
  combos: [],
  history: [],
  learned: [],
  videos: {},
  tombstones: {},
  stateUpdatedAt: null,
  syncedUserId: null,
  lastSyncAt: null,
});

// ---------- network ----------

export async function fetchRemote(sb: SupabaseClient): Promise<RemoteData> {
  const [combos, sessions, state] = await Promise.all([
    sb.from('combos').select('id,name,items,level,style,deleted,updated_at'),
    sb
      .from('sessions')
      .select('id,date,rounds,completed_rounds,round_sec,rest_sec,callouts,combos,duration_sec')
      .order('date', { ascending: false })
      .limit(HISTORY_LIMIT),
    sb.from('user_state').select('learned,videos,settings,updated_at').maybeSingle(),
  ]);
  for (const r of [combos, sessions, state]) if (r.error) throw r.error;
  return {
    combos: (combos.data ?? []) as ComboRow[],
    sessions: (sessions.data ?? []) as SessionRow[],
    state: (state.data as StateRow | null) ?? null,
  };
}

export async function pushRemote(sb: SupabaseClient, userId: string, plan: PushPlan) {
  const jobs = [];
  if (plan.combos.length)
    jobs.push(sb.from('combos').upsert(plan.combos.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,id' }));
  if (plan.sessions.length)
    jobs.push(sb.from('sessions').upsert(plan.sessions.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,id', ignoreDuplicates: true }));
  if (plan.state) jobs.push(sb.from('user_state').upsert({ ...plan.state, user_id: userId }, { onConflict: 'user_id' }));
  const results = await Promise.all(jobs);
  for (const r of results) if (r.error) throw r.error;
}

export async function deleteRemoteHistory(sb: SupabaseClient, userId: string) {
  const { error } = await sb.from('sessions').delete().eq('user_id', userId);
  if (error) throw error;
}
