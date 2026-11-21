import type { Combo } from '../data/combos';
import type { SessionConfig } from './sessionEngine';

export interface Settings {
  stance: 'orthodox' | 'southpaw';
  voice: boolean;
  voiceURI: string | null;
  rate: number;
  volume: number;
  sounds: boolean;
  theme: 'system' | 'dark' | 'light';
}

export interface SessionLog {
  id: string;
  date: string; // ISO
  rounds: number;
  completedRounds: number;
  roundSec: number;
  restSec: number;
  callouts: number;
  combos: string[]; // combo names used
  durationSec: number;
}

export interface AppData {
  version: 1;
  combos: Combo[]; // user combos only (presets live in code)
  learned: string[]; // technique ids
  videos: Record<string, string>; // technique id -> user video URL
  history: SessionLog[];
  settings: Settings;
  lastSession: Partial<SessionConfig> | null;
}

export const DEFAULT_SETTINGS: Settings = {
  stance: 'orthodox',
  voice: true,
  voiceURI: null,
  rate: 1.05,
  volume: 1,
  sounds: true,
  theme: 'system',
};

export const emptyData = (): AppData => ({
  version: 1,
  combos: [],
  learned: [],
  videos: {},
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  lastSession: null,
});

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
        level: c.level === 'intermediate' ? ('intermediate' as const) : ('beginner' as const),
        style: c.style === 'names' ? ('names' as const) : ('numbers' as const),
      }))
    : base.combos;
  const learned = Array.isArray(raw.learned) ? raw.learned.filter((x): x is string => typeof x === 'string') : base.learned;
  const videos = isObj(raw.videos)
    ? Object.fromEntries(Object.entries(raw.videos).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : base.videos;
  const history = Array.isArray(raw.history) ? (raw.history.filter((h) => isObj(h) && typeof h.date === 'string') as SessionLog[]) : base.history;
  const settings = { ...DEFAULT_SETTINGS, ...(isObj(raw.settings) ? (raw.settings as Partial<Settings>) : {}) };
  const lastSession = isObj(raw.lastSession) ? (raw.lastSession as Partial<SessionConfig>) : null;
  return { version: 1, combos, learned, videos, history, settings, lastSession };
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
