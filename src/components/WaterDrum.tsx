import { useEffect, useRef } from 'react';
import { BEAT_BANDS, BeatTracker } from '../lib/beat';
import { musicLevel } from '../lib/music';
import { Water } from '../lib/water';

/** The canvas is bigger than the circle by this much, to leave room for shockwaves around it. */
const BLEED = 1.36;
const NONE = BEAT_BANDS.map(() => 0);
/** Inner radius of the progress ring, as a share of the circle's. */
const POOL = 0.83;

/**
 * Water in a drum: fills the countdown circle to `level` and reacts to the drums in the music. Each hit
 * thumps the circle, sends a shockwave out and splashes the water. Without music it just laps gently.
 */
export default function WaterDrum({ level, active }: { /** 1 = full, 0 = empty. */ level: number; /** Reacts to the music. */ active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ level, active });
  live.current = { level, active };

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    const circle = el?.parentElement;
    if (!el || !g || !circle) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const water = new Water();
    const beats = new BeatTracker();
    /** Drum hits waiting for the sound to reach the ears (Bluetooth headphones lag behind). */
    const pending: { at: number; strength: number }[] = [];
    let shocks: { age: number; strength: number }[] = [];
    let shown = live.current.level;
    let thump = 0;
    let bass = 0;
    let last = performance.now();
    let frame = 0;
    let colors = { water: '', phase: '', at: -Infinity };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const calm = still.matches;

      // Listen
      const music = live.current.active && !calm ? musicLevel() : null;
      const beat = beats.update(music?.bands ?? NONE, now);
      bass = music ? beat.bass : bass * Math.exp(-dt * 4);
      if (music && beat.hit) pending.push({ at: now + music.latencyMs, strength: beat.hit });
      if (!music) pending.length = 0;

      // Move. The level glides, so a new combo refills the drum instead of snapping.
      shown += (live.current.level - shown) * (1 - Math.exp(-dt * 5));
      const fill = 0.07 + 0.71 * Math.max(0, Math.min(1, shown));
      const top = fill * 2 - 1; // surface, −1 (bottom) … 1 (top)
      const half = Math.sqrt(Math.max(0, 1 - top * top));
      while (pending.length && pending[0].at <= now) {
        const { strength } = pending.shift()!;
        water.hit(strength, Math.max(0.35, half));
        shocks.push({ age: 0, strength });
        thump = Math.max(thump, strength);
      }
      thump *= Math.exp(-dt * 9);
      if (!calm) water.step(dt);
      shocks = shocks.filter((s) => (s.age += dt) < 0.7);
      circle.style.setProperty('--thump', calm ? '0' : thump.toFixed(3));

      // Paint
      if (now - colors.at > 500) {
        const css = getComputedStyle(el);
        colors = { water: css.getPropertyValue('--info').trim(), phase: css.getPropertyValue('--phase').trim(), at: now };
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(el.clientWidth * dpr);
      if (!size) return;
      if (el.width !== size) el.width = el.height = size;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, size, size);
      const edge = size / 2 / BLEED; // the circle's radius in pixels
      const r = edge * POOL;
      g.setTransform(r, 0, 0, -r, size / 2, size / 2); // pool units, y up

      for (const s of shocks) {
        const t = s.age / 0.7;
        g.globalAlpha = (1 - t) ** 2 * 0.55 * s.strength;
        g.strokeStyle = colors.phase;
        g.lineWidth = 0.05 * (1 - t) + 0.008;
        g.beginPath();
        g.arc(0, 0, (1 + t * (BLEED - 1.02)) / POOL, 0, Math.PI * 2);
        g.stroke();
      }

      g.save();
      g.beginPath();
      g.arc(0, 0, 1, 0, Math.PI * 2);
      g.clip();
      const t = now / 1000;
      const lap = calm ? 0 : 0.012 + bass * 0.03;
      const wave = (x: number, phase: number) => top + Math.sin(x * 4.2 + t * 1.7 + phase) * lap + Math.sin(x * 7.5 - t * 2.3 + phase) * lap * 0.5;
      const pool = (surface: (x: number) => number) => {
        g.beginPath();
        g.moveTo(-1.1, -1.1);
        for (let x = -1.1; x <= 1.101; x += 0.05) g.lineTo(x, surface(x));
        g.lineTo(1.1, -1.1);
        g.closePath();
      };
      g.fillStyle = colors.water;
      // Back wave, body, then a bright line along the surface.
      g.globalAlpha = 0.16;
      pool((x) => wave(x, 2.1) + water.at(-x) * 0.6 + 0.03);
      g.fill();
      g.globalAlpha = 0.34 + bass * 0.12;
      pool((x) => wave(x, 0) + water.at(x));
      g.fill();
      g.globalAlpha = 0.85;
      g.strokeStyle = colors.water;
      g.lineWidth = 0.018;
      g.beginPath();
      for (let x = -1.1; x <= 1.101; x += 0.05) g.lineTo(x, wave(x, 0) + water.at(x));
      g.stroke();
      for (const d of water.drops) {
        g.beginPath();
        g.arc(d.x, top + d.y, d.r, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      circle.style.removeProperty('--thump');
    };
  }, []);

  return <canvas ref={canvas} className="water-drum" aria-hidden="true" />;
}
