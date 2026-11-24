import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Combo } from '../data/combos';
import { unlockAudio } from './audio';
import { primeTrainingMusic } from './music';
import { resolvePool, type Workout } from './plans';
import type { Technique } from '../data/techniques';
import { DEFAULT_CONFIG, PRACTICE_SEC, withLimits, type SessionConfig } from './sessionEngine';
import { useStore } from './store';

/** What the session screen needs to run. */
export interface LaunchState {
  config: SessionConfig;
  pool: Combo[];
  workoutId?: string;
  planId?: string;
  /** Practising one technique from its Learn page (to link back to it afterwards). */
  techniqueId?: string;
}

/** Drill one technique on its own for a few minutes, at your usual pace. */
export function practiceLaunch(t: Technique, last: Partial<SessionConfig> | null): LaunchState {
  return {
    config: withLimits({
      ...DEFAULT_CONFIG,
      ...(last?.minGap !== undefined && last?.maxGap !== undefined ? { minGap: last.minGap, maxGap: last.maxGap } : {}),
      mode: 'drill',
      drillSec: PRACTICE_SEC,
      drillCount: 1,
    }),
    pool: [{ id: `tech-${t.id}`, name: t.name, items: [t.id], level: t.level, style: 'numbers' }],
    techniqueId: t.id,
  };
}

/** Start that drill of a technique. Must run from a tap (audio unlock). */
export function useStartPractice() {
  const navigate = useNavigate();
  const { data } = useStore();
  return useCallback(
    (t: Technique) => {
      unlockAudio();
      primeTrainingMusic();
      navigate('/train/session', { state: practiceLaunch(t, data.lastSession) });
    },
    [navigate, data.lastSession],
  );
}

/** Start a saved workout right away (optionally as part of a plan). Must run from a tap (audio unlock). */
export function useStartWorkout() {
  const navigate = useNavigate();
  const { allCombos, data } = useStore();
  return useCallback(
    (w: Workout, planId?: string): boolean => {
      const pool = resolvePool(w.pool, allCombos, data.combos, { favorites: data.settings.favorites, history: data.history });
      if (!pool.length) return false;
      unlockAudio();
      primeTrainingMusic();
      const state: LaunchState = { config: withLimits(w.config), pool, workoutId: w.id, ...(planId ? { planId } : {}) };
      navigate('/train/session', { state });
      return true;
    },
    [navigate, allCombos, data.combos, data.settings.favorites, data.history],
  );
}
