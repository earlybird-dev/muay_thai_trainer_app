import { TECH_BY_ID, type Level } from './techniques';

export type CalloutStyle = 'numbers' | 'names';

export interface Combo {
  id: string;
  name: string;
  items: string[]; // technique ids
  level: Level;
  style: CalloutStyle;
  preset?: boolean;
  /** A core combo coaches drill every session (starter combos only). */
  essential?: boolean;
  /** ISO time of the last local change; used to resolve sync conflicts (newest wins). */
  updatedAt?: string;
}

/** Shorthand used to write the starter combos below. */
const SHORT: Record<string, string> = {
  J: 'jab',
  C: 'cross',
  LH: 'lead-hook',
  RH: 'rear-hook',
  LU: 'lead-uppercut',
  RU: 'rear-uppercut',
  T: 'teep',
  RT: 'rear-teep',
  K: 'rear-kick',
  HK: 'head-kick',
  LK: 'low-kick',
  SK: 'switch-kick',
  KN: 'knee',
  DK: 'diagonal-knee',
  E: 'elbow',
  UE: 'up-elbow',
  SE: 'spin-elbow',
  CH: 'check',
  P: 'parry',
  B: 'block',
  LB: 'lean-back',
  CL: 'clinch',
};

const p = (id: string, name: string, items: string[] | string, level: Level = 'beginner'): Combo => ({
  id: `preset-${id}`,
  name,
  items: typeof items === 'string' ? items.split(' ').map((s) => SHORT[s] ?? s) : items,
  level,
  style: 'numbers',
  preset: true,
});

const I = 'intermediate';
const A = 'advanced';

// The first 18 ids are kept stable: saved training selections refer to them.
const ALL_PRESETS: Combo[] = [
  // ---------- Beginner (42): fundamentals, short punch/kick chains, simple counters ----------
  p('1-2', 'Jab Cross', 'J C'),
  p('1-1-2', 'Double Jab Cross', 'J J C'),
  p('1-2-3', 'Jab Cross Hook', 'J C LH'),
  p('1-2-kick', 'Jab Cross Kick', 'J C K'),
  p('1-2-3-kick', 'Classic Four', 'J C LH K'),
  p('jab-teep', 'Jab Teep', 'J T'),
  p('teep-kick', 'Teep Kick', 'T K'),
  p('1-2-knee', 'Jab Cross Knee', 'J C KN'),
  p('1-2-low', 'Jab Cross Low Kick', 'J C LK'),
  p('check-kick', 'Check & Return Kick', 'CH K'),
  p('parry-2', 'Parry Cross', 'P C'),
  p('3-2-3', 'Hook Cross Hook', 'LH C LH'),
  p('b-1-2-1', 'Jab Cross Jab', 'J C J'),
  p('b-1-6', 'Jab Rear Uppercut', 'J RU'),
  p('b-1-3', 'Jab Hook', 'J LH'),
  p('b-2-3', 'Cross Hook', 'C LH'),
  p('b-1-2-5', 'Jab Cross Uppercut', 'J C LU'),
  p('b-1-2-3-2', 'Four-Punch Combo', 'J C LH C'),
  p('b-1-low', 'Jab Low Kick', 'J LK'),
  p('b-teep-1-2', 'Teep Jab Cross', 'T J C'),
  p('b-teep-teep', 'Double Teep', 'T T'),
  p('b-1-1-kick', 'Jab Jab Kick', 'J J K'),
  p('b-3-kick', 'Hook Kick', 'LH K'),
  p('b-2-knee', 'Cross Knee', 'C KN'),
  p('b-1-knee', 'Jab Knee', 'J KN'),
  p('b-low-2', 'Low Kick Cross', 'LK C'),
  p('b-1-2-teep', 'Jab Cross Teep', 'J C T'),
  p('b-check-2', 'Check Cross', 'CH C'),
  p('b-block-kick', 'Block & Return Kick', 'B K'),
  p('b-parry-1-2', 'Parry Jab Cross', 'P J C'),
  p('b-1-elbow', 'Jab Elbow', 'J E'),
  p('b-2-3-kick', 'Cross Hook Kick', 'C LH K'),
  p('b-1-2-knee-knee', 'Jab Cross Double Knee', 'J C KN KN'),
  p('b-teep-low', 'Teep Low Kick', 'T LK'),
  p('b-kick-2', 'Kick Return Cross', 'K C'),
  p('b-1-rear-teep', 'Jab Rear Teep', 'J RT'),
  p('b-1-2-rear-teep', 'Jab Cross Rear Teep', 'J C RT'),
  p('b-1-kick', 'Jab Kick', 'J K'),
  p('b-3-low', 'Hook Low Kick', 'LH LK'),
  p('b-1-1-teep', 'Double Jab Teep', 'J J T'),
  p('b-1-2-3-low', 'Jab Cross Hook Low Kick', 'J C LH LK'),
  p('b-1-2-3-knee', 'Jab Cross Hook Knee', 'J C LH KN'),

  // ---------- Intermediate (40): head/switch kicks, elbows, diagonal knees, defend-and-counter ----------
  p('5-4-kick', 'Uppercut Hook Kick', 'LU RH K', I),
  p('1-2-elbow', 'Jab Cross Elbow', 'J C E', I),
  p('2-3-switch', 'Cross Hook Switch Kick', 'C LH SK', I),
  p('1-2-head', 'Jab Cross Head Kick', 'J C HK', I),
  p('lean-2-kick', 'Lean Back Counter', 'LB C K', I),
  p('clinch', 'Clinch Knees', 'CL KN E', I),
  p('i-1-2-3-head', 'Jab Cross Hook Head Kick', 'J C LH HK', I),
  p('i-1-2-switch', 'Jab Cross Switch Kick', 'J C SK', I),
  p('i-1-switch', 'Jab Switch Kick', 'J SK', I),
  p('i-teep-switch', 'Teep Switch Kick', 'T SK', I),
  p('i-low-1-head', 'Low, Jab, High', 'LK J HK', I),
  p('i-1-2-dknee', 'Jab Cross Diagonal Knee', 'J C DK', I),
  p('i-3-dknee', 'Hook Diagonal Knee', 'LH DK', I),
  p('i-3-upelbow', 'Hook Up-Elbow', 'LH UE', I),
  p('i-1-2-3-elbow', 'Three Punches & Elbow', 'J C LH E', I),
  p('i-5-2-3', 'Uppercut Cross Hook', 'LU C LH', I),
  p('i-6-3-2', 'Rear Uppercut Hook Cross', 'RU LH C', I),
  p('i-1-6-3-kick', 'Jab Uppercut Hook Kick', 'J RU LH K', I),
  p('i-check-1-2-kick', 'Check & Counter', 'CH J C K', I),
  p('i-parry-2-3-kick', 'Parry Cross Hook Kick', 'P C LH K', I),
  p('i-block-3-kick', 'Cover, Hook, Kick', 'B LH K', I),
  p('i-lean-2-3', 'Lean Back Cross Hook', 'LB C LH', I),
  p('i-lean-teep', 'Lean Back Teep', 'LB T', I),
  p('i-clinch-dknee', 'Clinch Diagonal Knees', 'CL DK DK', I),
  p('i-clinch-3knee', 'Clinch Triple Knee', 'CL KN KN KN', I),
  p('i-1-2-low-head', 'Jab Cross Low-High', 'J C LK HK', I),
  p('i-teep-1-2-head', 'Teep Jab Cross Head Kick', 'T J C HK', I),
  p('i-1-1-2-switch', 'Double Jab Cross Switch Kick', 'J J C SK', I),
  p('i-2-3-2-knee', 'Cross Hook Cross Knee', 'C LH C KN', I),
  p('i-1-2-elbow-knee', 'Jab Cross Elbow Knee', 'J C E KN', I),
  p('i-3-6-3', 'Hook Uppercut Hook', 'LH RU LH', I),
  p('i-4-3-kick', 'Rear Hook Lead Hook Kick', 'RH LH K', I),
  p('i-1-2-1-low', 'Jab Cross Jab Low Kick', 'J C J LK', I),
  p('i-switch-2-3', 'Switch Kick Cross Hook', 'SK C LH', I),
  p('i-1-head', 'Jab Head Kick', 'J HK', I),
  p('i-double-teep', 'Teep Rear Teep', 'T RT', I),
  p('i-rear-teep-1-2-kick', 'Rear Teep Jab Cross Kick', 'RT J C K', I),
  p('i-1-1-switch', 'Double Jab Switch Kick', 'J J SK', I),
  p('i-check-switch', 'Check Switch Kick', 'CH SK', I),
  p('i-1-switch-2-3-low', 'Jab Switch Kick Cross Hook Low Kick', 'J SK C LH LK', I),

  // ---------- Advanced (32): long chains, spinning elbows, clinch work, layered counters ----------
  p('a-1-2-3-2-head', 'Five-Strike Head Kick', 'J C LH C HK', A),
  p('a-1-2-spin', 'Jab Cross Spinning Elbow', 'J C SE', A),
  p('a-3-spin', 'Hook Spinning Elbow', 'LH SE', A),
  p('a-low-spin', 'Low Kick Spinning Elbow', 'LK SE', A),
  p('a-check-head', 'Check Head Kick', 'CH HK', A),
  p('a-lean-2-3-head', 'Lean Back Cross Hook Head Kick', 'LB C LH HK', A),
  p('a-parry-2-elbow-knee', 'Parry Cross Elbow Knee', 'P C E KN', A),
  p('a-block-3-upelbow-knee', 'Cover Hook Up-Elbow Knee', 'B LH UE KN', A),
  p('a-1-2-switch-2-head', 'Switch Kick Into Head Kick', 'J C SK C HK', A),
  p('a-teep-1-2-3-kick', 'Teep Into Classic Four', 'T J C LH K', A),
  p('a-5-6-3-2', 'Uppercut Storm', 'LU RU LH C', A),
  p('a-1-6-3-2-low', 'Jab Uppercut Hook Cross Low Kick', 'J RU LH C LK', A),
  p('a-clinch-dknee-elbow', 'Clinch Diagonal Knees & Elbow', 'CL DK DK E', A),
  p('a-clinch-knee-spin', 'Clinch Break Spinning Elbow', 'CL KN KN SE', A),
  p('a-1-2-knee-elbow-upelbow', 'Close-Range Chain', 'J C KN E UE', A),
  p('a-3-2-3-kick-teep', 'Hook Cross Hook Kick Teep', 'LH C LH K T', A),
  p('a-1-1-2-3-head', 'Double Jab Into Head Kick', 'J J C LH HK', A),
  p('a-switch-2-3-dknee', 'Switch Kick Cross Hook Diagonal Knee', 'SK C LH DK', A),
  p('a-low-low-head', 'Low, Low, High', 'LK LK HK', A),
  p('a-check-2-3-elbow', 'Check Cross Hook Elbow', 'CH C LH E', A),
  p('a-lean-teep-switch', 'Lean Back Teep Switch Kick', 'LB T SK', A),
  p('a-1-6', 'All Six Punches', 'J C LH RH LU RU', A),
  p('a-2-3-upelbow-elbow', 'Elbow Chain', 'C LH UE E', A),
  p('a-teep-switch-2-head', 'Teep Switch Kick Cross Head Kick', 'T SK C HK', A),
  p('a-parry-1-2-3-spin', 'Parry Combo Spinning Elbow', 'P J C LH SE', A),
  p('a-block-2-dknee-elbow', 'Cover Cross Diagonal Knee Elbow', 'B C DK E', A),
  p('a-1-2-low-2-head', 'Low-Kick Setup Head Kick', 'J C LK C HK', A),
  p('a-clinch-triple', 'Clinch Knee Barrage', 'CL KN DK KN E', A),
  p('a-6-3-spin', 'Uppercut Hook Spinning Elbow', 'RU LH SE', A),
  p('a-1-2-3-low-switch', 'Punches Low Kick Switch Kick', 'J C LH LK SK', A),
  p('a-1-2-3-rear-teep-head', 'Punches Rear Teep Head Kick', 'J C LH RT HK', A),
  p('a-parry-2-rear-teep-switch', 'Parry Cross Rear Teep Switch Kick', 'P C RT SK', A),
];

/** The core set most gyms drill every session: fundamentals, mixed levels, range control and a counter. */
export const ESSENTIAL_IDS = [
  'preset-1-2',
  'preset-1-2-3',
  'preset-1-2-kick',
  'preset-1-2-3-kick',
  'preset-jab-teep',
  'preset-teep-kick',
  'preset-1-2-low',
  'preset-b-1-low',
  'preset-1-2-knee',
  'preset-b-2-3-kick',
  'preset-check-kick',
  'preset-parry-2',
  // more punching, kicking and close range
  'preset-1-1-2',
  'preset-b-1-2-3-2',
  'preset-b-1-kick',
  'preset-b-3-low',
  'preset-b-1-1-teep',
  'preset-b-1-2-3-low',
  'preset-b-1-2-3-knee',
  'preset-1-2-elbow',
  // switch kicks
  'preset-i-1-switch',
  'preset-i-1-2-switch',
  'preset-2-3-switch',
  'preset-i-1-1-switch',
  'preset-i-switch-2-3',
  'preset-i-check-switch',
  'preset-i-1-switch-2-3-low',
];

export const PRESET_COMBOS: Combo[] = ALL_PRESETS.map((c) => (ESSENTIAL_IDS.includes(c.id) ? { ...c, essential: true } : c));

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

/** Combos whose name, callout, strikes or level hold every word of the search ("1-2", "switch kick", "advanced"). */
export function searchCombos(combos: Combo[], query: string): Combo[] {
  const words = query.toLowerCase().split(/[\s·,-]+/).filter(Boolean);
  if (!words.length) return combos;
  return combos.filter((c) => {
    const hay = [
      c.name,
      calloutDisplay(c.items, 'numbers'),
      calloutDisplay(c.items, 'names'),
      ...c.items.map((i) => TECH_BY_ID[i]?.name ?? i),
      c.level,
      c.essential ? 'essential' : '',
      c.preset ? '' : 'mine my',
    ]
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
