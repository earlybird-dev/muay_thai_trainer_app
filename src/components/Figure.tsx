import type { CSSProperties } from 'react';
import { LIMB, solve, type Point } from '../lib/pose';
import { useAnimatedPose, type AnimationProps } from '../lib/useAnimatedPose';
import type { Phase } from '../data/techniques';
import type { FighterLook } from '../data/fighters';

export interface FigureProps extends AnimationProps {
  mirror?: boolean;
  className?: string;
  label?: string;
  /** Fighter colours (gloves, shorts, mongkol); 2D uses the theme defaults if omitted. */
  look?: FighterLook;
}

/** 2D side-view fighter (SVG). */
export default function Figure({ mirror = false, className, label, look, ...anim }: FigureProps) {
  const current = useAnimatedPose(anim);
  const s = solve(current);
  const line = (a: Point, b: Point) => `M${a.x},${a.y} L${b.x},${b.y}`;
  const limb = (a: Point, b: Point, c: Point) => `M${a.x},${a.y} L${b.x},${b.y} L${c.x},${c.y}`;
  const f = current.facing;
  const colors = look
    ? ({
        '--fig-glove': look.gloves,
        '--fig-glove-rear': look.gloves,
        '--fig-shorts': look.shorts,
        '--accent': look.mongkol ?? 'transparent',
      } as CSSProperties)
    : undefined;

  return (
    <svg
      style={colors}
      className={`figure ${className ?? ''}`}
      viewBox="-90 -180 200 190"
      role="img"
      aria-label={label ?? 'Animated fighter demonstrating the technique'}
    >
      <line x1={-90} y1={0} x2={110} y2={0} className="fig-ground" />
      <g transform={mirror ? 'translate(20,0) scale(-1,1) translate(-20,0)' : undefined}>
        <g transform={`translate(${s.hip.x},0) scale(${Math.abs(f) < 0.15 ? 0.15 * Math.sign(f || 1) : f},1) translate(${-s.hip.x},0)`}>
          {/* rear side (far from viewer) */}
          <path d={limb(s.hip, s.rear.knee, s.rear.ankle)} className="fig-limb fig-rear fig-leg" />
          <path d={line(s.rear.ankle, s.rear.toe)} className="fig-limb fig-rear fig-foot" />
          <path d={limb(s.shoulder, s.rear.elbow, s.rear.hand)} className="fig-limb fig-rear fig-arm" />
          <circle cx={s.rear.hand.x} cy={s.rear.hand.y} r={7.5} className="fig-glove fig-glove-rear" />

          {/* body */}
          <path d={line(s.hip, s.shoulder)} className="fig-limb fig-torso" />
          <circle cx={s.head.x} cy={s.head.y} r={LIMB.head} className="fig-head" />
          <path
            d={`M${s.head.x - 3},${s.head.y - 6} q${8},${-6} ${13},${4}`}
            className="fig-band"
            transform={`rotate(${current.torso * 0.5} ${s.head.x} ${s.head.y})`}
          />
          <circle cx={s.hip.x} cy={s.hip.y} r={6} className="fig-shorts" />

          {/* lead side (near viewer) */}
          <path d={limb(s.hip, s.lead.knee, s.lead.ankle)} className="fig-limb fig-lead fig-leg" />
          <path d={line(s.lead.ankle, s.lead.toe)} className="fig-limb fig-lead fig-foot" />
          <path d={limb(s.shoulder, s.lead.elbow, s.lead.hand)} className="fig-limb fig-lead fig-arm" />
          <circle cx={s.lead.hand.x} cy={s.lead.hand.y} r={7.5} className="fig-glove" />
        </g>
      </g>
    </svg>
  );
}

/** Concatenate several techniques' phases into one sequence (for combo previews). */
export function chainPhases(list: Phase[][]): Phase[] {
  const out: Phase[] = [];
  list.forEach((phases, i) => {
    const last = i === list.length - 1;
    phases.forEach((ph, j) => {
      const isReturn = j === phases.length - 1 && Object.keys(ph.pose).length === 0;
      // Between strikes, shorten the return-to-guard so combos flow.
      out.push(isReturn && !last ? { ...ph, ms: ph.ms * 0.55 } : ph);
    });
  });
  return out;
}
