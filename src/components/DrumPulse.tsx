import { useEffect, useRef } from 'react';
import { BEAT_BANDS, BeatTracker } from '../lib/beat';
import { musicLevel } from '../lib/music';

/** The canvas is bigger than the circle by this much, to leave room for shockwaves around it. */
const BLEED = 1.36;
const NONE = BEAT_BANDS.map(() => 0);

/**
 * Makes the countdown circle beat like a drum: each drum hit in the music thumps it and sends a
 * shockwave out. Draws nothing without music.
 */
export default function DrumPulse({ active }: { /** Reacts to the music (not while paused). */ active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(active);
  live.current = active;

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    const circle = el?.parentElement;
    if (!el || !g || !circle) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const beats = new BeatTracker();
    /** Drum hits waiting for the sound to reach the ears (Bluetooth headphones lag behind). */
    const pending: { at: number; strength: number }[] = [];
    let shocks: { age: number; strength: number }[] = [];
    let thump = 0;
    let last = performance.now();
    let frame = 0;
    let phase = { color: '', at: -Infinity };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const music = live.current && !still.matches ? musicLevel() : null;
      const { hit } = beats.update(music?.bands ?? NONE, now);
      if (music && hit) pending.push({ at: now + music.latencyMs, strength: hit });
      if (!music) pending.length = 0;
      while (pending.length && pending[0].at <= now) {
        const { strength } = pending.shift()!;
        shocks.push({ age: 0, strength });
        thump = Math.max(thump, strength);
      }
      thump *= Math.exp(-dt * 9);
      shocks = shocks.filter((s) => (s.age += dt) < 0.7);
      circle.style.setProperty('--thump', thump.toFixed(3));

      if (now - phase.at > 500) phase = { color: getComputedStyle(el).getPropertyValue('--phase').trim(), at: now };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = Math.round(el.clientWidth * dpr);
      if (!size) return;
      if (el.width !== size) el.width = el.height = size;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, size, size);
      const edge = size / 2 / BLEED; // the circle's radius in pixels
      g.setTransform(edge, 0, 0, edge, size / 2, size / 2);
      g.strokeStyle = phase.color;
      for (const s of shocks) {
        const t = s.age / 0.7;
        g.globalAlpha = (1 - t) ** 2 * 0.55 * s.strength;
        g.lineWidth = 0.042 * (1 - t) + 0.007;
        g.beginPath();
        g.arc(0, 0, 1 + t * (BLEED - 1.02), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      circle.style.removeProperty('--thump');
    };
  }, []);

  return <canvas ref={canvas} className="drum-pulse" aria-hidden="true" />;
}
