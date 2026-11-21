import { createContext, useCallback, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { PRESET_COMBOS, type Combo } from '../data/combos';
import { loadData, saveData, type AppData } from './storage';
import { stampChanges } from './sync';

interface Store {
  data: AppData;
  /** A local change made by the user (stamped for sync). */
  update: (fn: (d: AppData) => AppData) => void;
  /** Replace all data (import / reset); also stamped, so it syncs. */
  replace: (d: AppData) => void;
  /** Apply data that came from the server (not stamped, doesn't trigger another sync). */
  applySync: (fn: (d: AppData) => AppData) => void;
  /** Increments on every user change; the sync engine watches it. */
  version: number;
  /** Latest data without waiting for a re-render (for async sync code). */
  dataRef: MutableRefObject<AppData>;
  versionRef: MutableRefObject<number>;
  allCombos: Combo[];
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);
  const [version, setVersion] = useState(0);
  const dataRef = useRef(data);
  const versionRef = useRef(0);
  dataRef.current = data;

  useEffect(() => saveData(data), [data]);

  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', data.settings.theme);
  }, [data.settings.theme]);

  const bump = () => {
    versionRef.current += 1;
    setVersion(versionRef.current);
  };

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => {
      const next = stampChanges(d, fn(d));
      dataRef.current = next;
      return next;
    });
    bump();
  }, []);

  const replace = useCallback((nd: AppData) => {
    setData((d) => {
      // Keep sync bookkeeping for the signed-in account; stamp so the change is pushed.
      const next = stampChanges(d, { ...nd, syncedUserId: d.syncedUserId, lastSyncAt: d.lastSyncAt });
      dataRef.current = next;
      return next;
    });
    bump();
  }, []);

  const applySync = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => {
      const next = fn(d);
      dataRef.current = next;
      return next;
    });
  }, []);

  const allCombos = [...data.combos, ...PRESET_COMBOS];

  return (
    <Ctx.Provider value={{ data, update, replace, applySync, version, dataRef, versionRef, allCombos }}>{children}</Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
