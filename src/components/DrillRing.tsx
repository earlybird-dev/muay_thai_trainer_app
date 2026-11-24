import { useId, type ReactNode } from 'react';

const R = 45;
const C = 2 * Math.PI * R;
/** Past this many combos the slices are too thin to tell apart, so the ring is drawn unbroken. */
const MAX_SLICES = 40;

/**
 * Drill progress as a running circle: one slice per combo, filled clockwise as the combos are
 * drilled. Whatever is passed as children (the clock) sits in the middle.
 */
export default function DrillRing({
  total,
  completed,
  progress,
  label,
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
  children: ReactNode;
}) {
  const maskId = `drill-ring-${useId().replace(/:/g, '')}`;
  const sliced = total > 1 && total <= MAX_SLICES;
  const slice = C / Math.max(1, total);
  const gap = sliced ? Math.min(2.2, slice * 0.28) : 0;
  // Each slice is inset by half a gap on both sides.
  const dash = sliced ? `${slice - gap} ${gap}` : undefined;
  const done = Math.min(1, Math.max(0, progress / Math.max(1, total)));
  const angle = done * 2 * Math.PI - Math.PI / 2;
  const circle = { cx: 50, cy: 50, r: R, fill: 'none' } as const;

  return (
    <div className="drill-ring">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${completed} of ${total} combos done`}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <circle {...circle} stroke="#fff" strokeWidth="9" strokeDasharray={`${done * C} ${C}`} transform="rotate(-90 50 50)" />
          </mask>
        </defs>
        <g transform="rotate(-90 50 50)" strokeWidth="5">
          <circle {...circle} className="ring-track" strokeDasharray={dash} strokeDashoffset={-gap / 2} />
          {completed < total && (
            <circle
              {...circle}
              className="ring-current"
              strokeDasharray={`${slice - gap} ${C}`}
              strokeDashoffset={-(completed * slice + gap / 2)}
            />
          )}
        </g>
        <g mask={`url(#${maskId})`}>
          <circle {...circle} className="ring-done" strokeWidth="5" strokeDasharray={dash} strokeDashoffset={-gap / 2} transform="rotate(-90 50 50)" />
        </g>
        {done > 0 && done < 1 && <circle className="ring-dot" cx={50 + R * Math.cos(angle)} cy={50 + R * Math.sin(angle)} r="3.6" />}
      </svg>
      <div className="drill-ring-center">
        {children}
        {label && <span className="drill-left">{label}</span>}
      </div>
    </div>
  );
}
