import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { to3D, type V3 } from '../lib/pose3d';
import { useAnimatedPose } from '../lib/useAnimatedPose';
import { buildHead, disposeTree, shade } from '../lib/fighterHead';
import { DEFAULT_FIGHTER, type FighterLook } from '../data/fighters';
import type { FigureProps } from './Figure';

export type CameraView = 'side' | 'angle' | 'front';

export interface Figure3DProps extends FigureProps {
  view?: CameraView;
  /** Allow drag-to-rotate / pinch-zoom. */
  interactive?: boolean;
  /** Called if WebGL is unavailable so the caller can fall back to 2D. */
  onUnsupported?: () => void;
  look?: FighterLook;
}

interface Mats {
  skin: THREE.MeshStandardMaterial;
  skinRear: THREE.MeshStandardMaterial;
  shorts: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  wrap: THREE.MeshStandardMaterial;
}

const TARGET = new THREE.Vector3(14, 84, 0);
const VIEWS: Record<CameraView, [number, number, number]> = {
  side: [14, 110, 370],
  angle: [265, 140, 265],
  front: [370, 110, 0],
};

const css = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

type Seg = { mesh: THREE.Mesh; r: number };

interface Rig {
  segs: Record<string, Seg>;
  joints: Record<string, THREE.Mesh>;
  /** Container the per-fighter head is built into; positioned every frame. */
  headRoot: THREE.Group;
  waistband: THREE.Mesh;
  gloves: { lead: THREE.Mesh; rear: THREE.Mesh };
  body: THREE.Group;
  mats: Mats;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function place(seg: Seg, a: V3, b: V3) {
  tmpA.set(a.x, a.y, a.z);
  tmpB.set(b.x, b.y, b.z);
  const len = Math.max(0.001, tmpA.distanceTo(tmpB));
  seg.mesh.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
  seg.mesh.scale.set(seg.r, len, seg.r);
  seg.mesh.quaternion.setFromUnitVectors(UP, tmpB.sub(tmpA).normalize());
}
const at = (m: THREE.Object3D, p: V3) => m.position.set(p.x, p.y, p.z);

export default function Figure3D({
  mirror = false,
  className,
  label,
  view = 'angle',
  interactive = true,
  onUnsupported,
  look = DEFAULT_FIGHTER,
  ...anim
}: Figure3DProps) {
  const pose = useAnimatedPose(anim);
  const hostRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const camRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls | null } | null>(null);
  const [hint, setHint] = useState(interactive);

  // ---- one-time scene setup ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onUnsupported?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
    camera.position.set(...VIEWS[view]);
    camera.lookAt(TARGET);

    let controls: OrbitControls | null = null;
    if (interactive) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(TARGET);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 160;
      controls.maxDistance = 520;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.addEventListener('start', () => setHint(false));
      controls.update();
    }
    camRef.current = { camera, controls };

    // Lights
    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x2a2730, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(140, 260, 180);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 50, far: 700 });
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb37a, 0.9);
    rim.position.set(-200, 120, -160);
    scene.add(rim);

    // Ring floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(130, 64),
      new THREE.MeshStandardMaterial({ color: css('--surface-2', '#2a2a30'), roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(124, 130, 64),
      new THREE.MeshStandardMaterial({ color: css('--accent', '#e63946'), roughness: 0.6 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    scene.add(ring);

    // Materials
    // Materials (colours are set from the fighter look in a separate effect)
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.55 });
    const skinRear = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const shorts = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    const trim = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    const glove = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 });
    const wrap = new THREE.MeshStandardMaterial({ roughness: 0.8 });

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    const sph = new THREE.SphereGeometry(1, 24, 16);
    const body = new THREE.Group();
    scene.add(body);

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      body.add(m);
      return m;
    };
    const seg = (r: number, mat: THREE.Material): Seg => ({ mesh: mk(cyl, mat), r });
    const joint = (r: number, mat: THREE.Material) => {
      const m = mk(sph, mat);
      m.scale.setScalar(r);
      return m;
    };

    const segs: Record<string, Seg> = {
      torso: seg(15, skin),
      shoulders: seg(7.5, skin),
      neck: seg(4.5, skin),
      hips: seg(11, shorts),
      leadThigh: seg(8, shorts),
      rearThigh: seg(8, shorts),
      leadShin: seg(5.6, skin),
      rearShin: seg(5.6, skinRear),
      leadFoot: seg(3.4, wrap),
      rearFoot: seg(3.4, wrap),
      leadUpper: seg(5.4, skin),
      rearUpper: seg(5.4, skinRear),
      leadFore: seg(4.4, wrap),
      rearFore: seg(4.4, wrap),
    };
    const joints: Record<string, THREE.Mesh> = {
      pelvis: joint(12.5, shorts),
      chest: joint(15.5, skin),
      leadShoulder: joint(7.5, skin),
      rearShoulder: joint(7.5, skin),
      leadElbow: joint(5.4, skin),
      rearElbow: joint(5.4, skinRear),
      leadHip: joint(11, shorts),
      rearHip: joint(11, shorts),
      leadKnee: joint(6.2, skin),
      rearKnee: joint(6.2, skinRear),
      leadAnkle: joint(4.2, wrap),
      rearAnkle: joint(4.2, wrap),
      leadToe: joint(3.4, wrap),
      rearToe: joint(3.4, wrap),
    };
    const headRoot = new THREE.Group();
    body.add(headRoot);
    const waistband = mk(new THREE.TorusGeometry(15.2, 2.4, 10, 36), trim);
    waistband.rotation.x = Math.PI / 2;
    const gloves = { lead: joint(8, glove), rear: joint(8, glove) };
    rigRef.current = { segs, joints, headRoot, waistband, gloves, body, mats: { skin, skinRear, shorts, trim, glove, wrap } };
    // Resize
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    renderer.setAnimationLoop(() => {
      controls?.update();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls?.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      rigRef.current = null;
      camRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // ---- camera presets (always from the fighter's lead side, so the jab hand is nearest) ----
  useEffect(() => {
    const c = camRef.current;
    if (!c) return;
    const [x, y, z] = VIEWS[view];
    c.camera.position.set(x, y, mirror ? z : -z);
    c.camera.lookAt(TARGET);
    c.controls?.target.copy(TARGET);
    c.controls?.update();
  }, [view, mirror]);

  // ---- fighter look (colours + head). Declared before the pose effect so the head exists first. ----
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const { mats } = rig;
    mats.skin.color.set(look.skin);
    mats.skinRear.color.copy(shade(look.skin, 0.88));
    mats.shorts.color.set(look.shorts);
    mats.trim.color.set(look.shortsTrim);
    mats.glove.color.set(look.gloves);
    mats.wrap.color.set(look.wraps);
    const head = buildHead(look);
    rig.headRoot.add(head);
    return () => {
      rig.headRoot.remove(head);
      disposeTree(head);
    };
  }, [look, interactive]);

  // ---- pose update ----
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const k = to3D(pose);
    const { segs, joints } = rig;
    // to3D puts the lead side at +z. Facing +x with y up, +z is the fighter's RIGHT side, so the
    // unflipped skeleton is a southpaw. Orthodox (lead = left) flips z.
    rig.body.scale.z = mirror ? 1 : -1;

    place(segs.torso, k.pelvis, k.chest);
    place(segs.shoulders, k.lead.shoulder, k.rear.shoulder);
    place(segs.neck, k.chest, k.head);
    place(segs.hips, k.lead.hip, k.rear.hip);
    for (const side of ['lead', 'rear'] as const) {
      const s = k[side];
      place(segs[`${side}Thigh`], s.hip, s.knee);
      place(segs[`${side}Shin`], s.knee, s.ankle);
      place(segs[`${side}Foot`], s.ankle, s.toe);
      place(segs[`${side}Upper`], s.shoulder, s.elbow);
      place(segs[`${side}Fore`], s.elbow, s.hand);
      at(joints[`${side}Shoulder`], s.shoulder);
      at(joints[`${side}Elbow`], s.elbow);
      at(joints[`${side}Hip`], s.hip);
      at(joints[`${side}Knee`], s.knee);
      at(joints[`${side}Ankle`], s.ankle);
      at(joints[`${side}Toe`], s.toe);
      at(rig.gloves[side], s.hand);
    }
    at(joints.pelvis, k.pelvis);
    at(joints.chest, { x: k.chest.x * 0.85 + k.pelvis.x * 0.15, y: k.chest.y * 0.85 + k.pelvis.y * 0.15, z: 0 });
    at(rig.waistband, { x: k.pelvis.x, y: k.pelvis.y + 7, z: k.pelvis.z });
    // Head turns with spins and tilts with half the torso lean (forward lean = nod forward)
    at(rig.headRoot, k.head);
    rig.headRoot.rotation.set(0, k.yaw, (-pose.torso * Math.PI) / 360);
  }, [pose, mirror]);

  return (
    <div ref={hostRef} className={`figure3d ${className ?? ''}`} role="img" aria-label={label ?? 'Animated 3D fighter demonstrating the technique'}>
      {interactive && hint && <span className="figure3d-hint">Drag to rotate</span>}
    </div>
  );
}
