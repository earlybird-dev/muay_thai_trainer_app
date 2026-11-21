/**
 * Original preset fighters for the 3D (and 2D) illustrations.
 * These are made-up characters, not likenesses of real athletes.
 */

export type HairStyle = 'bald' | 'buzz' | 'short' | 'topknot' | 'mohawk';
export type Beard = 'none' | 'stubble' | 'goatee';

export interface FighterLook {
  id: string;
  name: string;
  tagline: string;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  beard: Beard;
  /** Heavier brows give a sterner expression. */
  brows: 'soft' | 'heavy';
  shorts: string;
  shortsTrim: string;
  gloves: string;
  wraps: string;
  /** Mongkol (headband) colour, or null for none. */
  mongkol: string | null;
}

export const FIGHTERS: FighterLook[] = [
  {
    id: 'technician',
    name: 'The Technician',
    tagline: 'Patient, precise, never wastes a strike.',
    skin: '#c68a5e',
    hair: 'short',
    hairColor: '#1b1410',
    beard: 'none',
    brows: 'soft',
    shorts: '#c1121f',
    shortsTrim: '#f8f1e5',
    gloves: '#d62839',
    wraps: '#f1ede6',
    mongkol: '#d62839',
  },
  {
    id: 'iron-shin',
    name: 'Iron Shin',
    tagline: 'Kicks like a baseball bat, checks everything.',
    skin: '#a86b45',
    hair: 'buzz',
    hairColor: '#120d0a',
    beard: 'stubble',
    brows: 'heavy',
    shorts: '#1d4ed8',
    shortsTrim: '#facc15',
    gloves: '#1e40af',
    wraps: '#f1ede6',
    mongkol: '#1d4ed8',
  },
  {
    id: 'clinch-king',
    name: 'Clinch King',
    tagline: 'Grabs the neck, never lets go.',
    skin: '#7a4a2c',
    hair: 'bald',
    hairColor: '#0b0806',
    beard: 'goatee',
    brows: 'heavy',
    shorts: '#d4a017',
    shortsTrim: '#111111',
    gloves: '#18181b',
    wraps: '#f1ede6',
    mongkol: '#d4a017',
  },
  {
    id: 'elbow-artist',
    name: 'Elbow Artist',
    tagline: 'Up close, every angle is an elbow.',
    skin: '#e0ac86',
    hair: 'mohawk',
    hairColor: '#3b2416',
    beard: 'none',
    brows: 'heavy',
    shorts: '#18181b',
    shortsTrim: '#dc2626',
    gloves: '#f4f4f5',
    wraps: '#18181b',
    mongkol: null,
  },
  {
    id: 'teep-master',
    name: 'Teep Master',
    tagline: 'Keeps you at the end of a long front kick.',
    skin: '#d39b72',
    hair: 'topknot',
    hairColor: '#0f0b09',
    beard: 'none',
    brows: 'soft',
    shorts: '#7c3aed',
    shortsTrim: '#fbcfe8',
    gloves: '#db2777',
    wraps: '#f1ede6',
    mongkol: '#7c3aed',
  },
  {
    id: 'southpaw-ghost',
    name: 'Southpaw Ghost',
    tagline: 'Slips everything, counters from nowhere.',
    skin: '#f1c7a5',
    hair: 'short',
    hairColor: '#c99a4b',
    beard: 'stubble',
    brows: 'soft',
    shorts: '#15803d',
    shortsTrim: '#f8f1e5',
    gloves: '#16a34a',
    wraps: '#f1ede6',
    mongkol: null,
  },
];

export const FIGHTER_BY_ID: Record<string, FighterLook> = Object.fromEntries(FIGHTERS.map((f) => [f.id, f]));
export const DEFAULT_FIGHTER = FIGHTERS[0];
export const fighterById = (id: string | undefined) => (id && FIGHTER_BY_ID[id]) || DEFAULT_FIGHTER;
