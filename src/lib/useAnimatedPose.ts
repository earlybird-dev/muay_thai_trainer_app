import { useEffect, useMemo, useRef, useState } from 'react';
import { GUARD, lerpPose, withGuard, type PartialPose, type Pose } from './pose';
import type { Phase } from '../data/techniques';

export interface AnimationProps {
  /** Animated sequence. Each phase is a pose reached from the previous one. */
  phases?: Phase[];
  /** Static pose (used when no phases, or when paused at a step). */
  pose?: PartialPose;
  playing?: boolean;
  speed?: number;
  /** When paused, show the end pose of this phase index. */
  step?: number;
  /** Hold time at the end of each loop, ms. */
  hold?: number;
  loop?: boolean;
  onPhase?: (index: number) => void;
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

/** Drives a pose over time from a list of phases (or returns a static pose). */
export function useAnimatedPose({
  phases,
  pose,
  playing = true,
  speed = 1,
  step,
  hold = 600,
  loop = true,
  onPhase,
}: AnimationProps): Pose {
  const timeline = useMemo(() => (phases ? buildTimeline(phases, speed, hold) : null), [phases, speed, hold]);
  const [current, setCurrent] = useState<Pose>(() => withGuard(pose ?? {}));
  const phaseRef = useRef(-1);
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  // Paused / static
  useEffect(() => {
    if (playing && timeline) return;
    if (phases && step !== undefined && step >= 0 && phases[step]) setCurrent(withGuard(phases[step].pose));
    else setCurrent(withGuard(pose ?? {}));
  }, [playing, timeline, phases, step, pose]);

  // Animation loop
  useEffect(() => {
    if (!playing || !timeline || timeline.keys.length === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      let t = now - t0;
      t = loop ? t % timeline.total : Math.min(t, timeline.total);
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

  return current;
}
