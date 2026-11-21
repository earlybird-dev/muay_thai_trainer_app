import { TECH_BY_ID, type Level } from './techniques';

export type CalloutStyle = 'numbers' | 'names';

export interface Combo {
  id: string;
  name: string;
  items: string[]; // technique ids
  level: Level;
  style: CalloutStyle;
  preset?: boolean;
  /** ISO time of the last local change; used to resolve sync conflicts (newest wins). */
  updatedAt?: string;
}

const p = (id: string, name: string, items: string[], level: Level = 'beginner'): Combo => ({
  id: `preset-${id}`,
  name,
  items,
  level,
  style: 'numbers',
  preset: true,
});

export const PRESET_COMBOS: Combo[] = [
  p('1-2', 'Jab Cross', ['jab', 'cross']),
  p('1-1-2', 'Double Jab Cross', ['jab', 'jab', 'cross']),
  p('1-2-3', 'Jab Cross Hook', ['jab', 'cross', 'lead-hook']),
  p('1-2-kick', 'Jab Cross Kick', ['jab', 'cross', 'rear-kick']),
  p('1-2-3-kick', 'Classic Four', ['jab', 'cross', 'lead-hook', 'rear-kick']),
  p('jab-teep', 'Jab Teep', ['jab', 'teep']),
  p('teep-kick', 'Teep Kick', ['teep', 'rear-kick']),
  p('1-2-knee', 'Jab Cross Knee', ['jab', 'cross', 'knee']),
  p('1-2-low', 'Jab Cross Low Kick', ['jab', 'cross', 'low-kick']),
  p('check-kick', 'Check & Return Kick', ['check', 'rear-kick']),
  p('parry-2', 'Parry Cross', ['parry', 'cross']),
  p('3-2-3', 'Hook Cross Hook', ['lead-hook', 'cross', 'lead-hook']),
  p('5-4-kick', 'Uppercut Hook Kick', ['lead-uppercut', 'rear-hook', 'rear-kick'], 'intermediate'),
  p('1-2-elbow', 'Jab Cross Elbow', ['jab', 'cross', 'elbow'], 'intermediate'),
  p('2-3-switch', 'Cross Hook Switch Kick', ['cross', 'lead-hook', 'switch-kick'], 'intermediate'),
  p('1-2-head', 'Jab Cross Head Kick', ['jab', 'cross', 'head-kick'], 'intermediate'),
  p('lean-2-kick', 'Lean Back Counter', ['lean-back', 'cross', 'rear-kick'], 'intermediate'),
  p('clinch', 'Clinch Knees', ['clinch', 'knee', 'elbow'], 'intermediate'),
];

/** Tokens to show/say for a combo, e.g. ["1", "2", "Kick"] or ["Jab", "Cross", "Kick"]. */
export function calloutTokens(items: string[], style: CalloutStyle): string[] {
  return items.map((id) => {
    const t = TECH_BY_ID[id];
    if (!t) return '?';
    return style === 'numbers' && t.code ? t.code : t.call;
  });
}

export const calloutDisplay = (items: string[], style: CalloutStyle) => calloutTokens(items, style).join(' · ');
export const calloutSpeech = (items: string[], style: CalloutStyle) => calloutTokens(items, style).join(', ');

export const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
