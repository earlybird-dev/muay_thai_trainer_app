/**
 * Finds drum hits in music. A drum is a sudden rise across several frequency bands at once; a held bass
 * note or a chord is not. Each band is compared with its own loudest, so a track's volume doesn't matter.
 */

/** Frequency bands to feed in, low to high (Hz): kick, low drums, snare body, snare/claps, cymbals. */
export const BEAT_BANDS: readonly [number, number][] = [
  [40, 110],
  [110, 250],
  [250, 1500],
  [1500, 5000],
  [5000, 12000],
];
/** Quieter than this is silence, not music. */
const FLOOR = 0.004;
/** Hits closer together than this are one hit. */
const MIN_GAP_MS = 180;
/** A hit is louder than the same band this long ago. */
const LOOK_BACK_MS = [30, 80] as const;
const RISE = 0.4;

export interface Beat {
  /** Strength of a drum hit starting now (0.2–1; kicks are strongest), or 0. */
  hit: number;
  /** Bass level, 0–1, relative to the track's own loudest; rises fast, falls slowly. */
  bass: number;
}

export class BeatTracker {
  private last = NaN;
  private lastHit = -Infinity;
  private bass = 0;
  /** Usual amount of rise, to stand out from. */
  private usual = 0;
  /** Punch of the hardest recent hit. */
  private hardest = 0;
  private readonly peak = BEAT_BANDS.map(() => 0);
  private history: { at: number; level: number[] }[] = [];

  /** Feed each band's level (any linear scale) at a time in ms. Works at any frame rate. */
  update(bands: readonly number[], nowMs: number): Beat {
    const dt = Number.isNaN(this.last) ? 16 : Math.min(200, Math.max(0, nowMs - this.last));
    this.last = nowMs;
    const ease = (ms: number) => 1 - Math.exp(-dt / ms);
    const fade = Math.exp(-dt / 6000);
    this.hardest *= fade;
    bands.forEach((v, i) => (this.peak[i] = Math.max(v, this.peak[i] * fade)));
    if (Math.max(...this.peak) < FLOOR) {
      this.history = [];
      return { hit: 0, bass: (this.bass *= Math.exp(-dt / 200)) };
    }
    // Roughly how loud each band sounds, whatever the track's volume.
    const level = bands.map((v, i) => (this.peak[i] > FLOOR / 20 ? Math.log1p((20 * v) / this.peak[i]) : 0));
    const loud = bands[0] / Math.max(this.peak[0], FLOOR);
    this.bass += (loud - this.bass) * ease(loud > this.bass ? 25 : 200);

    // How much louder than a moment ago, averaged over the bands.
    let before = this.history.filter((h) => nowMs - h.at >= LOOK_BACK_MS[0]);
    if (!before.length) before = this.history.slice(-1);
    const rises = level.map((v, i) => Math.max(0, v - Math.max(...before.map((h) => h.level[i]))));
    const rise = before.length ? rises.reduce((a, b) => a + b, 0) / rises.length : 0;
    this.history.push({ at: nowMs, level });
    this.history = this.history.filter((h) => nowMs - h.at <= LOOK_BACK_MS[1]);
    this.usual += (rise - this.usual) * ease(830);

    if (rise < RISE || rise < this.usual * 2.2 || nowMs - this.lastHit < MIN_GAP_MS) return { hit: 0, bass: this.bass };
    this.lastHit = nowMs;
    // The deep bands carry the punch: kick, then low drums, then the rest.
    const punch = 0.5 * rises[0] + 0.25 * rises[1] + 0.12 * rises[2];
    // Against this track's own hardest recent hits, so soft mixes splash too.
    return { hit: 0.2 + 0.8 * Math.min(1, punch / (this.hardest = Math.max(punch, this.hardest, 0.25))), bass: this.bass };
  }
}
