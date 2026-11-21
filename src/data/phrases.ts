/**
 * Everything the coach voice says, apart from combo names. Shared by the app and by
 * scripts/generate-voice.ts, which records one clip per phrase (plus every preset combo name).
 */
import { TECHNIQUES } from './techniques';

export const PHRASES = {
  getReady: 'Get ready',
  firstUp: 'First up',
  restNext: 'Rest. Next',
  next: 'Next',
  fight: 'Fight!',
  restBreathe: 'Rest. Breathe.',
  freestyle: 'Freestyle! Everything you have!',
  done: 'Great work. Session complete.',
  test: 'One, two, kick!',
} as const;

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three'];
/** "3, 2, 1" countdown words. */
export const countPhrase = (n: number) => COUNT_WORDS[n] ?? String(n);

export const MAX_ROUNDS = 20;
export const roundPhrase = (n: number) => `Round ${n}`;

/** Each strike's callout ("Jab", "Rear teep", …), so any combo can be called strike by strike. */
export const strikeCalls = (): string[] => [...new Set(TECHNIQUES.filter((t) => t.strike).map((t) => t.call))];

/** Every fixed phrase, for recording. */
export function fixedPhrases(): string[] {
  return [
    ...Object.values(PHRASES),
    ...strikeCalls(),
    ...[1, 2, 3].map(countPhrase),
    ...Array.from({ length: MAX_ROUNDS }, (_, i) => roundPhrase(i + 1)),
  ];
}

/** Clip lookup key: case and punctuation don't matter. */
export const clipKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
