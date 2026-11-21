import { useEffect, useMemo, useRef, useState } from 'react';
import { GUARD, LIMB, lerpPose, solve, withGuard, type PartialPose, type Point, type Pose } from '../lib/pose';
import type { Phase } from '../data/techniques';

interface Props {
  /** Animated sequence. Each phase is a pose reached from the previous one. */
  phases?: Phase[];
  /** Static pose (used when no phases, or when paused at a step). */
  pose?: PartialPose;
  playing?: boolean;
  speed?: number;
  mirror?: boolean;
  /** When paused, show the end pose of this phase index. */
  step?: number;
  /** Hold time at the end of each loop, ms. */
  hold?: number;
  loop?: boolean;
  onPhase?: (index: number) => void;
  className?: string;
  label?: string;
}

interface Key {
  pose: Pose;
  start: number;
  end: number;
}

function buildTimeline(phases: Phase[], speed: number, hold: number) {
  const keys: Key[] = [];
  let t = 0;
  for (const ph of phases) {
    const d = ph.ms / speed;
    keys.push({ pose: withGuard(ph.pose), start: t, end: t + d });
    t += d;
  }
  return { keys, total: t + hold / speed };
}

function poseAt(keys: Key[], t: number): { pose: Pose; index: number } {
  let from = GUARD;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k.end) {
      const local = (t - k.start) / Math.max(1, k.end - k.start);
      return { pose: lerpPose(from, k.pose, local), index: i };
    }
    from = k.pose;
  }
  return { pose: from, index: keys.length - 1 };
}

export default function Figure({
  phases,
  pose,
  playing = true,
  speed = 1,
  mirror = false,
  step,
  hold = 600,
  loop = true,
  onPhase,
  className,
  label,
}: Props) {
  const timeline = useMemo(() => (phases ? buildTimeline(phases, speed, hold) : null), [phases, speed, hold]);
  const [current, setCurrent] = useState<Pose>(() => withGuard(pose ?? {}));
  const phaseRef = useRef(-1);
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  // Paused / static rendering
  useEffect(() => {
    if (playing && timeline) return;
    if (phases && step !== undefined && step >= 0 && phases[step]) {
      setCurrent(withGuard(phases[step].pose));
    } else {
      setCurrent(withGuard(pose ?? {}));
    }
  }, [playing, timeline, phases, step, pose]);

  // Animation loop
  useEffect(() => {
    if (!playing || !timeline || timeline.keys.length === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      let t = now - t0;
      if (loop) t = t % timeline.total;
      else t = Math.min(t, timeline.total);
      const { pose: p, index } = poseAt(timeline.keys, t);
      setCurrent(p);
      if (index !== phaseRef.current) {
        phaseRef.current = index;
        onPhaseRef.current?.(index);
      }
      if (loop || t < timeline.total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeline, loop]);

  const s = solve(current);
  const line = (a: Point, b: Point) => `M${a.x},${a.y} L${b.x},${b.y}`;
  const limb = (a: Point, b: Point, c: Point) => `M${a.x},${a.y} L${b.x},${b.y} L${c.x},${c.y}`;
  const f = current.facing;

  return (
    <svg
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
