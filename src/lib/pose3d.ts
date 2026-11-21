/**
 * Lift the 2D side-view skeleton into 3D.
 *
 * The 2D poses only describe the sagittal plane (forward/back, up/down). For the 3D view we add
 * the third axis with a few rules that match how the techniques really look:
 *  - each side sits at its own depth (lead side at +z)
 *  - extended hands travel toward the centre line (straight punches)
 *  - raised, bent arms flare the elbow outward (hooks, elbows, the guard)
 *  - shoulders turn with whichever hand is punching
 *  - roundhouse kicks (`turn`): the body turns over around the standing foot, which pivots so the
 *    heel faces the target, and the kicking shin sweeps across to the centre line
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

  // ---- Roundhouse kicks: hip turnover + pivot on the standing foot ----
  // `turn` > 0: rear-leg kick, the lead foot is the standing foot; < 0: lead-leg kick (switch kick).
  const turn = Math.max(-1.2, Math.min(1.2, p.turn ?? 0));
  const rearKick = turn > 0;
  const amount = Math.abs(turn);
  const ext = (hip: number, knee: number) => Math.pow(clamp01(Math.sin(rad(hip))), 2) * clamp01(Math.cos(rad(knee)));
  const kickExt = amount * (rearKick ? ext(p.rearHip, p.rearKnee) : ext(p.leadHip, p.leadKnee));

  const leadLeg: Pick<Side3, 'hip' | 'knee' | 'ankle' | 'toe'> = {
    hip: v(s.hip, HIP_Z),
    knee: v(s.lead.knee, HIP_Z),
    ankle: v(s.lead.ankle, HIP_Z),
    toe: v(s.lead.toe, HIP_Z),
  };
  const rearLeg: Pick<Side3, 'hip' | 'knee' | 'ankle' | 'toe'> = {
    hip: v(s.hip, -HIP_Z),
    knee: v(s.rear.knee, -HIP_Z),
    ankle: v(s.rear.ankle, -HIP_Z),
    toe: v(s.rear.toe, -HIP_Z),
  };
  const pelvis = v(s.hip, 0);
  const chest = v(s.shoulder, 0);
  const head = v(s.head, 0);
  let lArm = leadArm;
  let rArm = rearArm;
  let headTurn = 0;

  if (amount > 1e-3) {
    const stand = rearKick ? leadLeg : rearLeg;
    const kick = rearKick ? rearLeg : leadLeg;
    // Turn around the spine (vertical axis): positive brings the rear side forward. The hips turn over
    // fully; the shoulders a little less. The lean away from the target stays as drawn in 2D.
    const spin = (q: V3, about: V3, deg: number): V3 => {
      const a = rad(deg);
      const dx = q.x - about.x;
      const dz = q.z - about.z;
      return { x: about.x + dx * Math.cos(a) - dz * Math.sin(a), y: q.y, z: about.z + dx * Math.sin(a) + dz * Math.cos(a) };
    };
    const hipDeg = 80 * turn;
    const shoulderDeg = 60 * turn;
    const kickHip0 = kick.hip;
    stand.hip = spin(stand.hip, pelvis, hipDeg);
    kick.hip = spin(kick.hip, pelvis, hipDeg);
    lArm = { shoulder: spin(lArm.shoulder, chest, shoulderDeg), elbow: spin(lArm.elbow, chest, shoulderDeg), hand: spin(lArm.hand, chest, shoulderDeg) };
    rArm = { shoulder: spin(rArm.shoulder, chest, shoulderDeg), elbow: spin(rArm.elbow, chest, shoulderDeg), hand: spin(rArm.hand, chest, shoulderDeg) };
    // Standing knee follows the hip a little (knee points out over the pivoting foot).
    stand.knee = { ...stand.knee, z: stand.knee.z + (stand.hip.z - HIP_Z * (rearKick ? 1 : -1)) * 0.5 };

    // The kicking leg keeps its line toward the target from the turned hip, and its shin sweeps
    // across to just past the centre line.
    const shift = { x: kick.hip.x - kickHip0.x, z: kick.hip.z - kickHip0.z };
    const targetZ = rearKick ? 8 : -8;
    const along = (q: V3, f: number): V3 => {
      const z = q.z + shift.z;
      return { x: q.x + shift.x, y: q.y, z: z + (targetZ - z) * f * clamp01(kickExt * 1.4) };
    };
    kick.knee = along(kick.knee, 0.45);
    kick.ankle = along(kick.ankle, 0.85);
    kick.toe = along(kick.toe, 0.95);

    // Standing foot pivots on the ball: toes turn out (further than the hips), heel toward the target.
    const theta = rad(110 * Math.min(1, amount)) * (rearKick ? 1 : -1);
    const fx = stand.toe.x - stand.ankle.x;
    stand.toe = { x: stand.ankle.x + fx * Math.cos(theta), y: stand.toe.y, z: stand.ankle.z + fx * Math.sin(theta) };

    headTurn = rad(hipDeg) * 0.35; // eyes stay mostly on the target
  }

  const phi = Math.acos(Math.max(-1, Math.min(1, p.facing)));
  const sk: Skeleton3D = {
    yaw: phi - headTurn,
    pelvis,
    chest,
    head,
    lead: { ...lArm, ...leadLeg },
    rear: { ...rArm, ...rearLeg },
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
