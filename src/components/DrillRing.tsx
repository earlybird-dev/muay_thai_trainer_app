import type { ReactNode } from 'react';
import DrumPulse from './DrumPulse';

const R = 45.6;
const C = 2 * Math.PI * R;
const WIDTH = 4.2;
/** Space between two slices, along the ring. */
const GAP = 1.9;
/** Past this many combos the slices are too thin to tell apart, so the ring is drawn unbroken. */
const MAX_SLICES = 40;
/** Steps of colour in an unbroken ring. */
const STEPS = 72;

/** A point on the ring, `at` turns clockwise from the top. */
const point = (at: number) => {
  const a = at * 2 * Math.PI;
  return { x: 50 + R * Math.sin(a), y: 50 - R * Math.cos(a) };
};
const arc = (from: number, to: number) => {
  const a = point(from);
  const b = point(Math.max(to, from + 0.0002));
  return `M${a.x.toFixed(3)} ${a.y.toFixed(3)}A${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`;
};
/** The ring's colour `at` turns round it: the phase's colour, from deep to bright. */
const heat = (at: number) =>
  at < 0.5
    ? `color-mix(in srgb, var(--ring-2) ${(at * 200).toFixed(0)}%, var(--ring-1))`
    : `color-mix(in srgb, var(--ring-3) ${((at - 0.5) * 200).toFixed(0)}%, var(--ring-2))`;

/**
 * Drill progress as a running circle: one slice per combo, lit clockwise as the combos are drilled.
 * Whatever is passed as children (the clock) sits in the middle. The circle beats to the drums in the
 * music.
 */
export default function DrillRing({
  total,
  completed,
  progress,
  label,
  active,
  children,
}: {
  /** Combos in the session. */
  total: number;
  /** Combos fully done. */
  completed: number;
  /** Same, counting the part of the current combo already done (e.g. 3.4). */
  progress: number;
  /** Under the clock, e.g. "8 left". */
  label: string;
  /** Whether the circle beats to the music (not while paused). */
  active: boolean;
  children: ReactNode;
}) {
  const sliced = total > 1 && total <= MAX_SLICES;
  const pieces = sliced ? total : STEPS;
  // Rounded ends stick out by half the ring's width, so slices are drawn that much shorter. Thin ones
  // end up as dots.
  const inset = sliced ? Math.min(0.46 / pieces, (GAP + WIDTH) / 2 / C) : 0;
  const done = Math.min(1, Math.max(0, progress / Math.max(1, total)));
  const head = point(done);
  const currentFrom = completed / Math.max(1, total);

  const lit = Array.from({ length: pieces }, (_, i) => {
    const from = i / pieces + inset;
    // A little overlap hides the seams of an unbroken ring.
    const end = (i + 1) / pieces - inset + (sliced ? 0 : 0.002);
    const to = Math.min(end, done);
    return done > i / pieces && to > from ? { d: arc(from, to), stroke: heat((i + 0.5) / pieces) } : null;
  }).filter((x) => x !== null);

  return (
    <div className="drill-ring">
      <DrumPulse active={active} />
      <svg viewBox="0 0 100 100" role="img" aria-label={`${completed} of ${total} combos done`} fill="none" strokeLinecap={sliced ? 'round' : 'butt'}>
        <g className="ring-track" strokeWidth={WIDTH}>
          {sliced ? (
            Array.from({ length: total }, (_, i) => (
              <path key={i} className={i === completed ? 'now' : undefined} d={arc(i / total + inset, (i + 1) / total - inset)} />
            ))
          ) : (
            <circle cx="50" cy="50" r={R} />
          )}
        </g>
        {/* The glow is the same arcs, wider and faint: cheaper to draw every frame than a blur. */}
        <g strokeWidth={WIDTH * 2.1} opacity="0.2">
          {lit.map((p) => (
            <path key={p.d} {...p} />
          ))}
        </g>
        <g strokeWidth={WIDTH}>
          {lit.map((p) => (
            <path key={p.d} {...p} />
          ))}
        </g>
        {done > 0 && done < 1 && (
          <g>
            <circle cx={head.x} cy={head.y} r="5.2" fill={heat(Math.max(done, currentFrom))} opacity="0.35" />
            <circle className="ring-head" cx={head.x} cy={head.y} r="3" stroke={heat(done)} />
          </g>
        )}
      </svg>
      <div className="drill-ring-center">
        {children}
        {label && <span className="drill-left">{label}</span>}
      </div>
    </div>
  );
}
