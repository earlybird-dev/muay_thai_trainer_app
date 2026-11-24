/**
 * Cloud sync for signed-in users. The app stays local-first: localStorage is what the UI reads.
 * Syncing = pull everything for the user, merge with local data, push what the server is missing.
 *
 *  - Combos: newest change wins per combo (local `updatedAt` / tombstone vs server `updated_at`).
 *    Deletions are pushed as `deleted = true` rows so they reach other devices.
 *  - History: union by session id (sessions are never edited, only added, deleted or cleared). Deleted
 *    ids are kept as a synced list that is merged across devices, so a deleted session stays deleted.
 *  - Progress + settings (learned, videos, synced settings): one blob, newest wins.
 */
import { demoAddedAt } from './demoData';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Combo } from '../data/combos';
import { toLevel, type Level } from '../data/techniques';
import { DEFAULT_SETTINGS, parsePlan, parseWorkout, pickSyncedSettings, type AppData, type DocCollection, type SessionLog, type SyncedSettings } from './storage';

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
  workout_id?: string | null;
  plan_id?: string | null;
  mode?: 'rounds' | 'drill';
}

export interface StateRow {
  user_id?: string;
  learned: string[];
  videos: Record<string, string>;
  settings: Partial<SyncedSettings>;
  updated_at: string;
}

/** Workouts and plans are stored as JSON documents. */
export interface DocRow {
  user_id?: string;
  id: string;
  data: unknown;
  deleted: boolean;
  updated_at: string;
}

export interface RemoteData {
  combos: ComboRow[];
  sessions: SessionRow[];
  state: StateRow | null;
  workouts?: DocRow[];
  plans?: DocRow[];
}

export interface PushPlan {
  combos: ComboRow[];
  sessions: SessionRow[];
  /** Ids of sessions the account still has but the user deleted. */
  sessionDeletes: string[];
  state: StateRow | null;
  workouts: DocRow[];
  plans: DocRow[];
}

const DOCS: { coll: DocCollection; parse: (v: unknown) => { id: string; updatedAt?: string } | null }[] = [
  { coll: 'workouts', parse: parseWorkout },
  { coll: 'plans', parse: parsePlan },
];

export const HISTORY_LIMIT = 500;
/** How many deleted session ids to remember (newest kept). */
const DELETED_LIMIT = 2000;
const EPOCH = '1970-01-01T00:00:00.000Z';
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** Delete one session from the history and remember its id, so sync removes it everywhere. */
export const deleteSession = (d: AppData, id: string): AppData => ({
  ...d,
  history: d.history.filter((s) => s.id !== id),
  settings: { ...d.settings, deletedSessions: [...d.settings.deletedSessions.filter((x) => x !== id), id].slice(-DELETED_LIMIT) },
});

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

  // Workouts and plans: same idea, keyed on their whole content.
  const docTombstones = { workouts: { ...next.docTombstones.workouts }, plans: { ...next.docTombstones.plans } };
  const docs: Partial<Pick<AppData, DocCollection>> = {};
  let docsChanged = false;
  for (const { coll } of DOCS) {
    const docKey = (d: { updatedAt?: string }) => JSON.stringify({ ...d, updatedAt: undefined });
    const was = new Map((prev[coll] as { id: string; updatedAt?: string }[]).map((d) => [d.id, d]));
    const list = (next[coll] as { id: string; updatedAt?: string }[]).map((d) => {
      const old = was.get(d.id);
      if (docTombstones[coll][d.id]) {
        delete docTombstones[coll][d.id];
        docsChanged = true;
      }
      if (old && docKey(old) === docKey(d)) return d.updatedAt || !old.updatedAt ? d : { ...d, updatedAt: old.updatedAt };
      docsChanged = true;
      return { ...d, updatedAt: now };
    });
    const ids = new Set(list.map((d) => d.id));
    for (const d of prev[coll]) if (!ids.has(d.id)) ((docTombstones[coll][d.id] = now), (docsChanged = true));
    (docs as Record<string, unknown>)[coll] = list;
  }

  const stateChanged = stateKey(prev) !== stateKey(next);
  if (!combosChanged && !stateChanged && !docsChanged) return next;
  return {
    ...next,
    combos,
    tombstones,
    ...(docsChanged ? { ...docs, docTombstones } : {}),
    stateUpdatedAt: stateChanged ? now : next.stateUpdatedAt,
  };
}

/** Newest-wins merge for a document collection (workouts / plans). */
export function mergeDocs<T extends { id: string; updatedAt?: string }>(
  local: T[],
  tombs: Record<string, string>,
  remote: DocRow[],
  parse: (v: unknown) => T | null,
  now: string,
): { list: T[]; push: DocRow[] } {
  const push: DocRow[] = [];
  const localById = new Map(local.map((d) => [d.id, d]));
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const merged = new Map<string, T>();
  for (const id of new Set([...localById.keys(), ...Object.keys(tombs), ...remoteById.keys()])) {
    const L = localById.get(id);
    const T = tombs[id];
    const R = remoteById.get(id);
    const toRow = (d: T, at: string): DocRow => ({ id, data: { ...d, updatedAt: at }, deleted: false, updated_at: at });
    if (!R) {
      if (L) {
        const at = L.updatedAt ?? now;
        merged.set(id, { ...L, updatedAt: at });
        push.push(toRow(L, at));
      }
      continue;
    }
    const localAt = L ? L.updatedAt ?? EPOCH : T ?? null;
    if (localAt === null || time(R.updated_at) >= time(localAt)) {
      const d = R.deleted ? null : parse(R.data);
      if (d) merged.set(id, { ...d, updatedAt: R.updated_at });
    } else if (L) {
      merged.set(id, L);
      push.push(toRow(L, L.updatedAt ?? now));
    } else if (T && !R.deleted) {
      push.push({ id, data: R.data, deleted: true, updated_at: T });
    }
  }
  const list = [
    ...remote.filter((r) => merged.has(r.id) && !localById.has(r.id)).map((r) => merged.get(r.id)!),
    ...local.filter((d) => merged.has(d.id)).map((d) => merged.get(d.id)!),
  ];
  return { list, push };
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
  mode: s.mode ?? 'rounds',
  workout_id: s.workoutId ?? null,
  plan_id: s.planId ?? null,
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
  mode: r.mode === 'drill' ? 'drill' : 'rounds',
  ...(r.workout_id ? { workoutId: r.workout_id } : {}),
  ...(r.plan_id ? { planId: r.plan_id } : {}),
});

// ---------- merge ----------

/** Merge local data with the server copy. Returns the new local data and what to send up. */
export function mergeAll(local: AppData, remote: RemoteData, now = new Date().toISOString()): { data: AppData; push: PushPlan } {
  const push: PushPlan = { combos: [], sessions: [], sessionDeletes: [], state: null, workouts: [], plans: [] };

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

  // History. A "Clear history" on any device (newest clear wins) drops older sessions everywhere, and
  // stops this device from uploading them again.
  const clears = [local.settings.historyClearedAt, (remote.state?.settings as { historyClearedAt?: string | null } | undefined)?.historyClearedAt]
    .filter((x): x is string => typeof x === 'string')
    .map(time);
  const clearedAt = clears.length ? Math.max(...clears) : -Infinity;
  // Sample sessions (see demoData.ts) are back-dated on purpose: a clear made before they were added
  // doesn't drop them, but a later "Clear history" does, on every device.
  // Sessions deleted one by one, on this device or any other, are gone for good.
  const remoteDeletedRaw = (remote.state?.settings as { deletedSessions?: unknown } | undefined)?.deletedSessions;
  const remoteDeleted = Array.isArray(remoteDeletedRaw) ? remoteDeletedRaw.filter((x): x is string => typeof x === 'string') : [];
  const deletedSessions = [...new Set([...remoteDeleted, ...local.settings.deletedSessions])].slice(-DELETED_LIMIT);
  const deleted = new Set(deletedSessions);
  const kept = (s: SessionLog) => !deleted.has(s.id) && (time(s.date) > clearedAt || demoAddedAt(s.id) > clearedAt);
  push.sessionDeletes = remote.sessions.map((s) => s.id).filter((id) => deleted.has(id));
  const remoteSessionIds = new Set(remote.sessions.map((s) => s.id));
  for (const s of local.history) if (kept(s) && !remoteSessionIds.has(s.id)) push.sessions.push(sessionToRow(s));
  const seen = new Set<string>();
  const history = [...local.history, ...remote.sessions.map(rowToSession)]
    .filter(kept)
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .sort((a, b) => time(b.date) - time(a.date))
    .slice(0, HISTORY_LIMIT);

  // Progress + settings
  let { learned, videos, settings, stateUpdatedAt } = local;
  const R = remote.state;
  const localStateRow = (): StateRow => ({
    learned: local.learned,
    videos: local.videos,
    settings: { ...pickSyncedSettings(local.settings), deletedSessions },
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
    // The account's settings win, but it must still learn about sessions deleted here.
    const known = new Set(remoteDeleted);
    if (deletedSessions.some((id) => !known.has(id)))
      push.state = { learned, videos, settings: { ...(R.settings ?? {}), deletedSessions }, updated_at: R.updated_at };
  } else {
    push.state = localStateRow();
  }
  settings = { ...settings, deletedSessions };

  // Workouts + plans
  const workouts = mergeDocs(local.workouts, local.docTombstones.workouts, remote.workouts ?? [], parseWorkout, now);
  const plans = mergeDocs(local.plans, local.docTombstones.plans, remote.plans ?? [], parsePlan, now);
  push.workouts = workouts.push;
  push.plans = plans.push;

  return {
    data: {
      ...local,
      combos,
      tombstones: {},
      history,
      learned,
      videos,
      settings,
      stateUpdatedAt,
      workouts: workouts.list,
      plans: plans.list,
      docTombstones: { workouts: {}, plans: {} },
    },
    push,
  };
}

/** Remove everything that belongs to an account, keeping device preferences. */
export const clearAccountData = (d: AppData): AppData => ({
  ...d,
  settings: { ...d.settings, deletedSessions: [] },
  combos: [],
  history: [],
  learned: [],
  videos: {},
  workouts: [],
  plans: [],
  tombstones: {},
  docTombstones: { workouts: {}, plans: {} },
  stateUpdatedAt: null,
  syncedUserId: null,
  lastSyncAt: null,
});

// ---------- network ----------

export async function fetchRemote(sb: SupabaseClient): Promise<RemoteData> {
  const [combos, sessions, state, workouts, plans] = await Promise.all([
    sb.from('combos').select('id,name,items,level,style,deleted,updated_at'),
    sb
      .from('sessions')
      .select('id,date,mode,rounds,completed_rounds,round_sec,rest_sec,callouts,combos,duration_sec,workout_id,plan_id')
      .order('date', { ascending: false })
      .limit(HISTORY_LIMIT),
    sb.from('user_state').select('learned,videos,settings,updated_at').maybeSingle(),
    sb.from('workouts').select('id,data,deleted,updated_at'),
    sb.from('plans').select('id,data,deleted,updated_at'),
  ]);
  for (const r of [combos, sessions, state, workouts, plans]) if (r.error) throw r.error;
  return {
    combos: (combos.data ?? []) as ComboRow[],
    sessions: (sessions.data ?? []) as SessionRow[],
    state: (state.data as StateRow | null) ?? null,
    workouts: (workouts.data ?? []) as DocRow[],
    plans: (plans.data ?? []) as DocRow[],
  };
}

export async function pushRemote(sb: SupabaseClient, userId: string, plan: PushPlan) {
  const jobs = [];
  if (plan.combos.length)
    jobs.push(sb.from('combos').upsert(plan.combos.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,id' }));
  if (plan.sessions.length)
    jobs.push(sb.from('sessions').upsert(plan.sessions.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,id', ignoreDuplicates: true }));
  for (let i = 0; i < plan.sessionDeletes.length; i += 100)
    jobs.push(sb.from('sessions').delete().eq('user_id', userId).in('id', plan.sessionDeletes.slice(i, i + 100)));
  if (plan.state) jobs.push(sb.from('user_state').upsert({ ...plan.state, user_id: userId }, { onConflict: 'user_id' }));
  for (const coll of ['workouts', 'plans'] as const)
    if (plan[coll].length) jobs.push(sb.from(coll).upsert(plan[coll].map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,id' }));
  const results = await Promise.all(jobs);
  for (const r of results) if (r.error) throw r.error;
}

export async function deleteRemoteHistory(sb: SupabaseClient, userId: string) {
  const { error } = await sb.from('sessions').delete().eq('user_id', userId);
  if (error) throw error;
}
