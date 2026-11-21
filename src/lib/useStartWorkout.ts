import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Combo } from '../data/combos';
import { unlockAudio } from './audio';
import { primeTrainingMusic } from './music';
import { resolvePool, type Workout } from './plans';
import type { SessionConfig } from './sessionEngine';
import { useStore } from './store';

/** What the session screen needs to run. */
export interface LaunchState {
  config: SessionConfig;
  pool: Combo[];
  workoutId?: string;
  planId?: string;
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
      const state: LaunchState = { config: w.config, pool, workoutId: w.id, ...(planId ? { planId } : {}) };
      navigate('/train/session', { state });
      return true;
    },
    [navigate, allCombos, data.combos, data.settings.favorites, data.history],
  );
}
