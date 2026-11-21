import * as THREE from 'three';
import type { FighterLook } from '../data/fighters';

export const HEAD_R = 11.5;

/** Darken/lighten a hex colour by a factor (0.8 = 20% darker). */
export function shade(hex: string, f: number): THREE.Color {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(f);
}

/**
 * Build a stylised head for a fighter. Origin = head centre; the face looks down +x, up is +y,
 * the fighter's lead side is +z. Everything returned is owned by the group (dispose with it).
 */
export function buildHead(look: FighterLook): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number], rot?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.55 });
  const skinDark = new THREE.MeshStandardMaterial({ color: shade(look.skin, 0.78), roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f1ea, roughness: 0.3 });
  const hair = new THREE.MeshStandardMaterial({ color: look.hairColor, roughness: 0.85 });
  const lip = new THREE.MeshStandardMaterial({ color: shade(look.skin, 0.62), roughness: 0.5 });

  // Skull (slightly taller than wide) and jaw
  add(new THREE.SphereGeometry(HEAD_R, 32, 24), skin, [0, 0, 0], [1, 1.06, 0.94]);
  add(new THREE.SphereGeometry(HEAD_R * 0.72, 24, 16), skin, [2.6, -4.6, 0], [1, 0.8, 1.05]);

  // Ears
  for (const z of [1, -1]) add(new THREE.SphereGeometry(1, 12, 10), skinDark, [-0.5, 0.5, z * HEAD_R * 0.93], [1.6, 3, 1]);

  // Eyes (white + iris), facing +x
  const eyeGeo = new THREE.SphereGeometry(1, 14, 10);
  for (const z of [1, -1]) {
    add(eyeGeo, white, [9.6, 2.2, z * 3.9], [1.1, 1.3, 1.8]);
    add(eyeGeo, dark, [10.55, 2.1, z * 3.9], [0.5, 1.05, 1.05]);
  }

  // Brows
  const heavy = look.brows === 'heavy';
  const browGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const z of [1, -1])
    add(browGeo, hair, [10.1, heavy ? 4.9 : 5.3, z * 4.1], [1.6, heavy ? 1.5 : 0.9, 4.6], [z * (heavy ? -0.22 : 0.08), 0, 0]);

  // Nose and mouth
  add(new THREE.SphereGeometry(1, 14, 10), skinDark, [11.4, -0.6, 0], [1.7, 2.3, 1.55]);
  add(new THREE.BoxGeometry(1, 1, 1), lip, [10.3, -5.3, 0], [0.9, 0.85, 4.4]);

  // Hair. Caps are spheres cut at the hairline and tipped back so the forehead shows.
  const cap = (r: number, theta: number, tilt: number) =>
    add(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, theta), hair, [-0.6, 0.6, 0], [1, 1.06, 0.95], [0, 0, tilt]);
  switch (look.hair) {
    case 'buzz':
      cap(HEAD_R + 0.25, Math.PI * 0.42, 0.42);
      break;
    case 'short':
      cap(HEAD_R + 1.1, Math.PI * 0.46, 0.36);
      break;
    case 'topknot':
      cap(HEAD_R + 0.6, Math.PI * 0.47, 0.4);
      add(new THREE.SphereGeometry(3.6, 16, 12), hair, [-5.5, 11.8, 0]);
      break;
    case 'mohawk':
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.15 + i * 0.16); // from front-top over to the back
        add(new THREE.BoxGeometry(5, 6, 2.6), hair, [Math.cos(a) * (HEAD_R + 1.6), Math.sin(a) * (HEAD_R + 1.6) + 0.5, 0], undefined, [0, 0, a - Math.PI / 2]);
      }
      break;
    case 'bald':
      break;
  }

  // Facial hair
  if (look.beard === 'stubble') {
    const stubble = new THREE.MeshStandardMaterial({ color: look.hairColor, roughness: 1, transparent: true, opacity: 0.35 });
    // front half of a sphere, lower band only (phi π/2..3π/2 faces +x)
    add(new THREE.SphereGeometry(HEAD_R * 0.74, 24, 12, Math.PI / 2, Math.PI, Math.PI * 0.45, Math.PI * 0.4), stubble, [2.7, -4.6, 0], [1.02, 0.82, 1.08]);
  } else if (look.beard === 'goatee') {
    add(new THREE.BoxGeometry(1, 1, 1), hair, [9.6, -8.4, 0], [2.4, 3.6, 3.6]);
    for (const z of [1, -1]) add(new THREE.BoxGeometry(1, 1, 1), hair, [10.4, -5.6, z * 2.9], [1, 3.6, 1]);
  }

  // Mongkol: headband ring with a tail at the back
  if (look.mongkol) {
    const band = new THREE.MeshStandardMaterial({ color: look.mongkol, roughness: 0.45 });
    add(new THREE.TorusGeometry(HEAD_R + 0.4, 1.7, 10, 36), band, [-0.4, 4.2, 0], [1, 1, 0.95], [Math.PI / 2, 0, 0.2]);
    add(new THREE.CylinderGeometry(1.3, 0.7, 13, 10), band, [-15.5, 1, 0], undefined, [0, 0, -1.15]);
  }

  return g;
}

/** Dispose every geometry/material under an object. */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
    }
  });
}
