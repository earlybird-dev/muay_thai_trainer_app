/**
 * Lift the 2D side-view skeleton into 3D.
 *
 * The 2D poses only describe the sagittal plane (forward/back, up/down). For the 3D view we add
 * the third axis with a few rules that match how the techniques really look:
 *  - each side sits at its own depth (lead side at +z)
 *  - extended hands travel toward the centre line (straight punches)
 *  - raised, bent arms flare the elbow outward (hooks, elbows, the guard)
 *  - shoulders turn with whichever hand is punching
 *  - an extended rear leg swings across the body and turns the hips over (roundhouse kicks)
 *  - `facing` spins the whole body around the vertical axis (spinning elbow)
 *
 * Coordinates: x = forward, y = up (ground at 0), z = toward the fighter's lead side.
 * With x forward and y up, +z is the fighter's right, so this frame is a southpaw; Figure3D flips z
 * for orthodox.
 */
import { LIMB, solve, type Point, type Pose } from './pose';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Side3 {
  shoulder: V3;
  elbow: V3;
  hand: V3;
  hip: V3;
  knee: V3;
  ankle: V3;
  toe: V3;
}

export interface Skeleton3D {
  /** Body rotation around the vertical axis, radians (0 = facing +x). */
  yaw: number;
  pelvis: V3;
  chest: V3;
  head: V3;
  lead: Side3;
  rear: Side3;
}

export const SHOULDER_Z = 12;
export const HIP_Z = 7.5;

const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const v = (p: Point, z: number, dx = 0): V3 => ({ x: p.x + dx, y: -p.y, z });

export function to3D(p: Pose): Skeleton3D {
  const s = solve(p);
  const reach = LIMB.upperArm + LIMB.forearm;

  // How far forward each hand is (0 = at the shoulder, 1 = fully extended).
  const fwd = (hand: Point) => clamp01((hand.x - s.shoulder.x) / reach);
  const fLead = fwd(s.lead.hand);
  const fRear = fwd(s.rear.hand);

  // Shoulder turn: positive = rear shoulder rotates forward (cross, rear hook).
  const yaw = rad(32 * (fRear - fLead));
  const shoulderDx = SHOULDER_Z * Math.sin(yaw);
  const shoulderZ = SHOULDER_Z * Math.cos(yaw);

  const arm = (sign: 1 | -1, absShoulder: number, elbowRel: number, elbow: Point, hand: Point, f: number) => {
    const dx = sign === 1 ? -shoulderDx : shoulderDx;
    const sideZ = sign * shoulderZ;
    // "Hookness": upper arm raised to roughly horizontal and elbow bent. The side view draws that
    // forearm pointing up; in reality it points across the body (hooks, horizontal elbows, clinch).
    // A low upper arm (guard, uppercut) or a vertical one (up-elbow) is left alone.
    const hookLift = clamp01((absShoulder - 55) / 30) * clamp01((140 - absShoulder) / 25);
    const h = Math.abs(Math.sin(rad(elbowRel))) * hookLift;

    const e = v(elbow, sign * (shoulderZ + 10 * h), dx);
    const straightZ = sign * shoulderZ * (1 - 0.85 * f);

    // Rotate the forearm's upward component into the sideways direction by h.
    const fx = hand.x - elbow.x;
    const fy = elbow.y - hand.y; // up is positive
    let hx = fx;
    let hy = fy * (1 - h);
    let hz = (straightZ - e.z) * (1 - h) - sign * Math.max(0, fy) * h;
    const len = Math.hypot(hx, hy, hz) || 1;
    const scale = LIMB.forearm / len;
    hx *= scale;
    hy *= scale;
    hz *= scale;
    return {
      shoulder: v(s.shoulder, sideZ, dx),
      elbow: e,
      hand: { x: e.x + hx, y: e.y + hy, z: e.z + hz },
    };
  };

  const torsoArm = p.torso * 0.5; // matches pose.ts: arms follow half the torso lean
  const leadArm = arm(1, p.leadShoulder + torsoArm, p.leadElbow, s.lead.elbow, s.lead.hand, fLead);
  const rearArm = arm(-1, p.rearShoulder + torsoArm, p.rearElbow, s.rear.elbow, s.rear.hand, fRear);

  // Roundhouse: an extended, raised rear leg swings across the body and the hips turn over.
  const cross = Math.pow(clamp01(Math.sin(rad(p.rearHip))), 2) * clamp01(Math.cos(rad(p.rearKnee)));
  const hipTurn = rad(45 * cross);
  const hipDx = HIP_Z * Math.sin(hipTurn);
  const hipZ = HIP_Z * Math.cos(hipTurn);

  const leadLeg = {
    hip: v(s.hip, hipZ, -hipDx),
    knee: v(s.lead.knee, HIP_Z),
    ankle: v(s.lead.ankle, HIP_Z),
    toe: v(s.lead.toe, HIP_Z),
  };
  const rearLeg = {
    hip: v(s.hip, -hipZ, hipDx),
    knee: v(s.rear.knee, -HIP_Z + 10 * cross, hipDx),
    ankle: v(s.rear.ankle, -HIP_Z + 24 * cross, hipDx),
    toe: v(s.rear.toe, -HIP_Z + 28 * cross, hipDx),
  };

  const phi = Math.acos(Math.max(-1, Math.min(1, p.facing)));
  const sk: Skeleton3D = {
    yaw: phi,
    pelvis: v(s.hip, 0),
    chest: v(s.shoulder, 0),
    head: v(s.head, 0),
    lead: { ...leadArm, ...leadLeg },
    rear: { ...rearArm, ...rearLeg },
  };

  // Spin around the vertical axis through the hips (facing 1 → 0°, -1 → 180°).
  if (phi > 1e-4) {
    const cx = sk.pelvis.x;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const rot = (q: V3): V3 => ({ x: cx + (q.x - cx) * c + q.z * sn, y: q.y, z: -(q.x - cx) * sn + q.z * c });
    const rotSide = (sd: Side3): Side3 =>
      Object.fromEntries(Object.entries(sd).map(([k, q]) => [k, rot(q as V3)])) as unknown as Side3;
    return { yaw: phi, pelvis: rot(sk.pelvis), chest: rot(sk.chest), head: rot(sk.head), lead: rotSide(sk.lead), rear: rotSide(sk.rear) };
  }
  return sk;
}
