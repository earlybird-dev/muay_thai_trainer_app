import type { Combo } from '../data/combos';
import { toLevel } from '../data/techniques';
import { DEFAULT_CONFIG, type SessionConfig } from './sessionEngine';
import type { TrainPlan, Workout } from './plans';

export interface Settings {
  stance: 'orthodox' | 'southpaw';
  voice: boolean;
  voiceURI: string | null;
  rate: number;
  volume: number;
  sounds: boolean;
  theme: 'system' | 'dark' | 'light';
  figure: '2d' | '3d';
  /** Preset fighter id (see data/fighters.ts). */
  fighter: string;
  /** Background music (calm while browsing, fight music while training). Per device. */
  music: boolean;
  musicVolume: number;
  /** Favourite combo ids (starred). */
  favorites: string[];
  /** Training music: a track id from TRAINING_TRACKS in lib/music.ts, or 'shuffle' for all of them. */
  trainingTrack: string;
}

export interface SessionLog {
  id: string;
  date: string; // ISO
  /** Training mode; older entries have none and were rounds. */
  mode?: 'rounds' | 'drill';
  rounds: number;
  completedRounds: number;
  roundSec: number;
  restSec: number;
  callouts: number;
  combos: string[]; // combo names used
  durationSec: number;
  /** Saved workout / plan this session was started from, if any. */
  workoutId?: string;
  planId?: string;
}

/** Synced document collections besides combos. */
export type DocCollection = 'workouts' | 'plans';

export interface AppData {
  version: 1;
  combos: Combo[]; // user combos only (presets live in code)
  learned: string[]; // technique ids
  videos: Record<string, string>; // technique id -> user video URL
  history: SessionLog[];
  settings: Settings;
  lastSession: Partial<SessionConfig> | null;
  /** Saved training sessions. */
  workouts: Workout[];
  /** Training plans (weekly schedules of a workout). */
  plans: TrainPlan[];
  // ---- cloud sync bookkeeping ----
  /** Deleted combo id -> ISO time, kept until the deletion has synced. */
  tombstones: Record<string, string>;
  /** Same, for workouts and plans. */
  docTombstones: Record<DocCollection, Record<string, string>>;
  /** When learned/videos/synced settings last changed locally. */
  stateUpdatedAt: string | null;
  /** Account whose data is on this device (null = guest / never signed in). */
  syncedUserId: string | null;
  lastSyncAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  stance: 'orthodox',
  voice: true,
  voiceURI: null,
  rate: 1.25,
  volume: 1,
  sounds: true,
  theme: 'system',
  figure: '3d',
  fighter: 'technician',
  music: true,
  musicVolume: 0.4,
  trainingTrack: 'shuffle',
  favorites: [],
};

export const emptyData = (): AppData => ({
  version: 1,
  combos: [],
  learned: [],
  videos: {},
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  lastSession: null,
  workouts: [],
  plans: [],
  tombstones: {},
  docTombstones: { workouts: {}, plans: {} },
  stateUpdatedAt: null,
  syncedUserId: null,
  lastSyncAt: null,
});

/** Settings that follow the account across devices (voice choice is device-specific). */
export const SYNCED_SETTING_KEYS = ['stance', 'voice', 'rate', 'volume', 'sounds', 'theme', 'figure', 'fighter', 'favorites'] as const;
export type SyncedSettings = Pick<Settings, (typeof SYNCED_SETTING_KEYS)[number]>;
export const pickSyncedSettings = (s: Settings): SyncedSettings =>
  Object.fromEntries(SYNCED_SETTING_KEYS.map((k) => [k, s[k]])) as SyncedSettings;

const KEY = 'muay-thai-trainer.v1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate and normalise unknown JSON into AppData. Throws on clearly invalid input. */
export function parseData(raw: unknown): AppData {
  if (!isObj(raw)) throw new Error('Not a Muay Thai Trainer backup file.');
  const base = emptyData();
  const combos = Array.isArray(raw.combos)
    ? raw.combos.filter(
        (c): c is Combo =>
          isObj(c) && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.items) && c.items.every((i) => typeof i === 'string'),
      ).map((c) => ({
        id: c.id,
        name: c.name,
        items: c.items,
        level: toLevel(c.level),
        style: c.style === 'names' ? ('names' as const) : ('numbers' as const),
        ...(typeof c.updatedAt === 'string' ? { updatedAt: c.updatedAt } : {}),
      }))
    : base.combos;
  const learned = Array.isArray(raw.learned) ? raw.learned.filter((x): x is string => typeof x === 'string') : base.learned;
  const videos = isObj(raw.videos)
    ? Object.fromEntries(Object.entries(raw.videos).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : base.videos;
  const history = Array.isArray(raw.history) ? (raw.history.filter((h) => isObj(h) && typeof h.date === 'string') as SessionLog[]) : base.history;
  const settings = { ...DEFAULT_SETTINGS, ...(isObj(raw.settings) ? (raw.settings as Partial<Settings>) : {}) };
  // 1.05 was the old default speech rate; move it to the new, brisker default.
  if (settings.rate === 1.05) settings.rate = DEFAULT_SETTINGS.rate;
  settings.favorites = Array.isArray(settings.favorites) ? settings.favorites.filter((x): x is string => typeof x === 'string') : [];
  const lastSession = isObj(raw.lastSession) ? (raw.lastSession as Partial<SessionConfig>) : null;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const strMap = (v: unknown): Record<string, string> =>
    isObj(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
  const tombstones = strMap(raw.tombstones);
  const dt = isObj(raw.docTombstones) ? raw.docTombstones : {};
  return {
    version: 1,
    combos,
    learned,
    videos,
    history,
    settings,
    lastSession,
    workouts: Array.isArray(raw.workouts) ? raw.workouts.map(parseWorkout).filter((w): w is Workout => !!w) : [],
    plans: Array.isArray(raw.plans) ? raw.plans.map(parsePlan).filter((p): p is TrainPlan => !!p) : [],
    tombstones,
    docTombstones: { workouts: strMap(dt.workouts), plans: strMap(dt.plans) },
    stateUpdatedAt: str(raw.stateUpdatedAt),
    syncedUserId: str(raw.syncedUserId),
    lastSyncAt: str(raw.lastSyncAt),
  };
}

const POOL_KINDS = ['all', 'beginner', 'intermediate', 'advanced', 'mine', 'essentials', 'favorites', 'due', 'pick'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a workout from storage, a backup file or the server. */
export function parseWorkout(v: unknown): Workout | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !isObj(v.config)) return null;
  const pool = isObj(v.pool) ? v.pool : {};
  return {
    id: v.id,
    name: v.name,
    config: { ...DEFAULT_CONFIG, ...(v.config as Partial<SessionConfig>) },
    pool: {
      kind: (POOL_KINDS.includes(pool.kind as string) ? pool.kind : 'all') as Workout['pool']['kind'],
      comboIds: Array.isArray(pool.comboIds) ? pool.comboIds.filter((x): x is string => typeof x === 'string') : [],
      ...(Array.isArray(pool.excluded) && pool.excluded.length
        ? { excluded: pool.excluded.filter((x): x is string => typeof x === 'string') }
        : {}),
    },
    ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
  };
}

/** Validate a plan from storage, a backup file or the server. */
export function parsePlan(v: unknown): TrainPlan | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.workoutId !== 'string' || typeof v.start !== 'string' || !DAY.test(v.start)) return null;
  const reminder = isObj(v.reminder) ? v.reminder : {};
  const marks = isObj(v.marks) ? v.marks : {};
  return {
    id: v.id,
    name: typeof v.name === 'string' ? v.name : 'Training plan',
    workoutId: v.workoutId,
    start: v.start,
    days: Math.min(366, Math.max(1, Math.round(Number(v.days) || 30))),
    weekdays: Array.isArray(v.weekdays) ? [...new Set(v.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))] : [1, 3, 5],
    reminder: {
      enabled: reminder.enabled === true,
      time: typeof reminder.time === 'string' && /^\d{2}:\d{2}$/.test(reminder.time) ? reminder.time : '18:00',
    },
    marks: Object.fromEntries(Object.entries(marks).filter(([k, m]) => DAY.test(k) && m === 'done')) as Record<string, 'done'>,
    ...(v.archived === true ? { archived: true } : {}),
    ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
  };
}

export const serializeData = (d: AppData) => JSON.stringify(d, null, 2);

export function loadData(): AppData {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return emptyData();
    return parseData(JSON.parse(s));
  } catch {
    return emptyData();
  }
}

export function saveData(d: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked — app keeps working in memory */
  }
}

export function downloadBackup(d: AppData) {
  const blob = new Blob([serializeData(d)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `muay-thai-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
