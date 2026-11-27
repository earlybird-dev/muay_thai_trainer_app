import { useEffect, useRef, useState } from 'react';
import { musicLevel, nowPlaying } from '../lib/music';

/** Space between two points of the running line, in CSS pixels. */
const STEP_PX = 5;
/** Frames between two points, so the line runs at a readable speed. */
const EVERY = 3;

/** Name of the training track playing now; null while none is (music off, held, or still loading). */
export function useNowPlaying(): string | null {
  const [name, setName] = useState<string | null>(() => nowPlaying());
  // The track changes rarely (shuffle hands over at the end of one), so a slow check is enough.
  useEffect(() => {
    const id = window.setInterval(() => setName(nowPlaying()), 700);
    return () => window.clearInterval(id);
  }, []);
  return name;
}

/** "♪ Ring Walk": the track that's playing. */
export function NowPlayingName({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span className="now-playing-name" title={`Now playing: ${name}`}>
      <span aria-hidden="true">♪ </span>
      <span className="sr-only">Now playing: </span>
      {name}
    </span>
  );
}

/**
 * A line across the screen that runs with the music: how loud it is, newest on the right, so drum hits
 * show as peaks that travel left. Flat while nothing plays.
 */
export function MusicWave({ playing }: { playing: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(playing);
  live.current = playing;

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let line: number[] = [];
    /** Loudest level heard lately, so quiet and loud tracks both fill the height. */
    let peak = 1e-4;
    let loudest = 0;
    let tick = 0;
    let frame = 0;
    let color = { value: '', at: -Infinity };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const music = live.current && !still.matches ? musicLevel() : null;
      const level = music ? Math.sqrt(music.bands.reduce((s, b) => s + b * b, 0)) : 0;
      peak = Math.max(level, peak * 0.997, 1e-4);
      // Each point keeps the loudest moment since the last one, so drum hits aren't skipped.
      loudest = Math.max(loudest, level / peak);
      if (tick++ % EVERY) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      if (!w || !h) return;
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      const points = Math.max(2, Math.ceil(el.clientWidth / STEP_PX) + 1);
      line.push(Math.min(1, loudest));
      loudest = 0;
      if (line.length > points) line = line.slice(-points);
      if (line.length < 2) return;

      if (now - color.at > 500) color = { value: getComputedStyle(el).color, at: now };
      g.clearRect(0, 0, w, h);
      const lw = 2 * dpr;
      const pts = line.map((v, i) => ({
        x: w - (line.length - 1 - i) * STEP_PX * dpr,
        y: h - lw - v ** 1.4 * (h - 2 * lw),
      }));

      // A soft wash under the line, then the line itself.
      g.beginPath();
      g.moveTo(pts[0].x, h);
      for (const p of pts) g.lineTo(p.x, p.y);
      g.lineTo(w, h);
      g.closePath();
      const wash = g.createLinearGradient(0, 0, 0, h);
      wash.addColorStop(0, color.value);
      wash.addColorStop(1, 'transparent');
      g.globalAlpha = 0.16;
      g.fillStyle = wash;
      g.fill();
      g.globalAlpha = 1;

      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        g.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      // Fade the old end of the line out on the left.
      const fade = g.createLinearGradient(0, 0, w, 0);
      fade.addColorStop(0, 'transparent');
      fade.addColorStop(0.25, color.value);
      g.strokeStyle = fade;
      g.lineWidth = lw;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.stroke();

      // A dot where the line is being drawn.
      const end = pts[pts.length - 1];
      g.beginPath();
      g.arc(end.x - 2.5 * dpr, end.y, 2.5 * dpr, 0, Math.PI * 2);
      g.fillStyle = color.value;
      g.fill();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvas} className="music-wave" aria-hidden="true" />;
}
