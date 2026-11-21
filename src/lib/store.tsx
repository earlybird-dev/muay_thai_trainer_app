import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { PRESET_COMBOS, type Combo } from '../data/combos';
import { loadData, saveData, type AppData } from './storage';

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replace: (d: AppData) => void;
  allCombos: Combo[];
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);

  useEffect(() => saveData(data), [data]);

  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', data.settings.theme);
  }, [data.settings.theme]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);
  const replace = useCallback((d: AppData) => setData(d), []);
  const allCombos = [...data.combos, ...PRESET_COMBOS];

  return <Ctx.Provider value={{ data, update, replace, allCombos }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
