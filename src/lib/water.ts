/**
 * A small water surface: columns on springs that pull on their neighbours, plus drops that fly off
 * and fall back in. Heights are in units of the pool's radius, up is positive.
 */
const COLUMNS = 56;
const STEP = 1 / 120;
const TENSION = 46;
const DAMPING = 2.4;
const SPREAD = 900;
const GRAVITY = 5.2;
const MAX_DROPS = 40;

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export class Water {
  readonly height = new Float32Array(COLUMNS);
  private readonly speed = new Float32Array(COLUMNS);
  readonly drops: Drop[] = [];
  private carry = 0;

  constructor(private readonly rand: () => number = Math.random) {}

  /** Surface height at x (−1 … 1). */
  at(x: number): number {
    const p = Math.min(COLUMNS - 1, Math.max(0, ((x + 1) / 2) * (COLUMNS - 1)));
    const i = Math.floor(p);
    const j = Math.min(COLUMNS - 1, i + 1);
    return this.height[i] + (this.height[j] - this.height[i]) * (p - i);
  }

  /** Push the surface up around x, like a drum skin kicking it from below. */
  push(x: number, width: number, power: number) {
    for (let i = 0; i < COLUMNS; i++) {
      const d = ((i / (COLUMNS - 1)) * 2 - 1 - x) / width;
      this.speed[i] += power * Math.exp(-d * d);
    }
  }

  /** A drum hit: the middle jumps, the sides answer, and drops fly up. `halfWidth` is the surface's. */
  hit(strength: number, halfWidth = 1) {
    const x = (this.rand() - 0.5) * 0.5 * halfWidth;
    this.push(x, 0.32, 3.1 * strength);
    this.push(x - 0.65, 0.22, -1.3 * strength);
    this.push(x + 0.65, 0.22, -1.3 * strength);
    const n = Math.round(2 + strength * 6);
    for (let k = 0; k < n && this.drops.length < MAX_DROPS; k++) {
      const dx = x + (this.rand() - 0.5) * 0.7 * halfWidth;
      this.drops.push({
        x: dx,
        y: this.at(dx),
        vx: (this.rand() - 0.5) * 0.9,
        vy: (1.2 + this.rand() * 1.5) * Math.sqrt(strength),
        r: 0.025 + this.rand() * 0.035,
      });
    }
  }

  /** Move on by `dt` seconds. */
  step(dt: number) {
    // Never simulate more than a moment after a stall (e.g. the tab was in the background).
    this.carry = Math.min(this.carry + dt, 0.1);
    while (this.carry >= STEP) {
      this.carry -= STEP;
      const { height: h, speed: v } = this;
      for (let i = 0; i < COLUMNS; i++) {
        const left = h[i > 0 ? i - 1 : 0];
        const right = h[i < COLUMNS - 1 ? i + 1 : COLUMNS - 1];
        v[i] += (-TENSION * h[i] - DAMPING * v[i] + SPREAD * (left + right - 2 * h[i])) * STEP;
      }
      for (let i = 0; i < COLUMNS; i++) h[i] = Math.max(-0.5, Math.min(0.5, h[i] + v[i] * STEP));
      for (let k = this.drops.length - 1; k >= 0; k--) {
        const d = this.drops[k];
        d.vy -= GRAVITY * STEP;
        d.x += d.vx * STEP;
        d.y += d.vy * STEP;
        if (d.vy < 0 && d.y <= this.at(d.x)) {
          this.push(d.x, 0.07, -d.r * 6); // a little plop
          this.drops.splice(k, 1);
        }
      }
    }
  }

  /** The biggest wave right now. */
  energy(): number {
    let m = 0;
    for (const y of this.height) m = Math.max(m, Math.abs(y));
    return m;
  }
}
