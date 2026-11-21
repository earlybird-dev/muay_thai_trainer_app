/**
 * 2D side-view skeleton, solved facing right with the lead side nearest the viewer. Facing right shows
 * the fighter's right side, so this frame is a southpaw; the renderers flip it for orthodox (lead = left).
 *
 * Angles are in degrees, measured from "pointing straight down", positive = rotating toward the
 * direction the fighter faces. So 90 = pointing forward, 180 = pointing up, -90 = pointing back.
 *  - torso: lean from upright (positive = lean forward)
 *  - shoulders: absolute (plus half the torso lean); elbows relative to the upper arm
 *  - hips: absolute; knees relative to the thigh (negative = shin folds back)
 *  - x: horizontal shift of the hips (steps, weight transfer)
 *  - facing: 1 = facing right, -1 = back turned (used for spins); drawn as a horizontal squash
 */
export interface Pose {
  x: number;
  torso: number;
  leadShoulder: number;
  leadElbow: number;
  rearShoulder: number;
  rearElbow: number;
  leadHip: number;
  leadKnee: number;
  rearHip: number;
  rearKnee: number;
  facing: number;
  /** 0..1: an extended rear leg pushes straight forward (rear teep) instead of swinging across (roundhouse). 3D only. */
  rearPush: number;
  /**
   * Roundhouse turn, -1..1: the hips turn over and the standing foot pivots (heel toward the target).
   * Positive = rear-leg kick (lead foot pivots), negative = lead-leg kick (rear foot pivots).
   */
  turn: number;
}

export type PartialPose = Partial<Pose>;

export const GUARD: Pose = {
  x: 0,
  torso: 5,
  leadShoulder: 40,
  leadElbow: 120,
  rearShoulder: 25,
  rearElbow: 140,
  leadHip: 18,
  leadKnee: -12,
  rearHip: -22,
  rearKnee: -8,
  facing: 1,
  rearPush: 0,
  turn: 0,
};

export const LIMB = {
  torso: 60,
  neck: 8,
  head: 12,
  upperArm: 30,
  forearm: 28,
  thigh: 42,
  shin: 42,
  foot: 12,
};

export interface Point {
  x: number;
  y: number;
}

export interface Skeleton {
  hip: Point;
  shoulder: Point;
  head: Point;
  lead: { elbow: Point; hand: Point; knee: Point; ankle: Point; toe: Point };
  rear: { elbow: Point; hand: Point; knee: Point; ankle: Point; toe: Point };
}

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (a: number, len: number): Point => ({ x: Math.sin(rad(a)) * len, y: Math.cos(rad(a)) * len });
const add = (p: Point, q: Point): Point => ({ x: p.x + q.x, y: p.y + q.y });

/** Forward kinematics. Hip is placed so the lowest foot rests on y = 0. */
export function solve(p: Pose): Skeleton {
  const hip0 = { x: p.x, y: 0 };
  const shoulder = add(hip0, { x: Math.sin(rad(p.torso)) * LIMB.torso, y: -Math.cos(rad(p.torso)) * LIMB.torso });
  const neckLen = LIMB.neck + LIMB.head;
  const head = add(shoulder, { x: Math.sin(rad(p.torso)) * neckLen, y: -Math.cos(rad(p.torso)) * neckLen });

  const arm = (s: number, e: number) => {
    const ua = s + p.torso * 0.5; // arms follow half the torso lean, which reads naturally
    const elbow = add(shoulder, dir(ua, LIMB.upperArm));
    const hand = add(elbow, dir(ua + e, LIMB.forearm));
    return { elbow, hand };
  };
  const leg = (h: number, k: number) => {
    const knee = add(hip0, dir(h, LIMB.thigh));
    const ankle = add(knee, dir(h + k, LIMB.shin));
    const toe = add(ankle, dir(h + k + 90, LIMB.foot));
    return { knee, ankle, toe };
  };

  const la = arm(p.leadShoulder, p.leadElbow);
  const ra = arm(p.rearShoulder, p.rearElbow);
  const ll = leg(p.leadHip, p.leadKnee);
  const rl = leg(p.rearHip, p.rearKnee);

  const lowest = Math.max(ll.ankle.y, rl.ankle.y, ll.toe.y, rl.toe.y);
  const shift = (pt: Point): Point => ({ x: pt.x, y: pt.y - lowest });
  const mapAll = <T extends Record<string, Point>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shift(v)])) as T;

  return {
    hip: shift(hip0),
    shoulder: shift(shoulder),
    head: shift(head),
    lead: { ...mapAll(la), ...mapAll(ll) },
    rear: { ...mapAll(ra), ...mapAll(rl) },
  };
}

export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = ease(Math.min(1, Math.max(0, t)));
  const out = {} as Pose;
  (Object.keys(a) as (keyof Pose)[]).forEach((key) => {
    out[key] = a[key] + (b[key] - a[key]) * k;
  });
  return out;
}

export const withGuard = (p: PartialPose): Pose => ({ ...GUARD, ...p });
