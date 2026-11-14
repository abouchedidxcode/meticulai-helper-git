// The country round the yard (Timberfall's): broadleaf trees built here (bark-textured limbs and
// leaf-cluster cards cut from ambientCG's CC0 LeafSet004) and grass tufts (ambientCG's CC0 blades)
// scattered over the fields, all instanced, the leaves and grass swaying. Nothing here is physical:
// it's outside the yard, where the structure's pieces don't reach.

import { hash, instanceIndex, positionLocal, sin, texture, time, vec3, mix } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './view.ts';

// biome-ignore lint: TSL nodes
type N = any;

const rng = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

/** Is this spot clear for scatter: not the yard. */
function clear(x: number, y: number, margin = 0): boolean {
  if (Math.abs(x) < 9 + margin && Math.abs(y) < 7.5 + margin) return false;
  return Math.hypot(x, y) < 150;
}

/** A tapered limb along `pts` (radius r0 → r1), bark UVs in metres. */
function limb(pts: THREE.Vector3[], r0: number, r1: number, radial = 7): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = Math.max(2, pts.length * 3);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const len = curve.getLength();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push((k / radial) * Math.max(1, r0 * 6), (t * len) / 1.2);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** One tree: its bark and its leaf cards (normals pointing out of the crown, so it shades as a mass). */
function tree(seed: number): { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry; height: number } {
  const r = rng(seed);
  const H = 7 + r() * 4;
  const barks: THREE.BufferGeometry[] = [];
  const cards: THREE.BufferGeometry[] = [];
  const lean = new THREE.Vector3((r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 0);
  const trunk = [0, 0.3, 0.6, 1].map((t) => new THREE.Vector3(lean.x * t * t + (r() - 0.5) * 0.15, lean.y * t * t + (r() - 0.5) * 0.15, t * H * 0.62));
  barks.push(limb([new THREE.Vector3(0, 0, -0.3), ...trunk], 0.32 + r() * 0.08, 0.14, 9));
  const crown = new THREE.Vector3(lean.x, lean.y, H * 0.68);
  const tips: THREE.Vector3[] = [];
  const limbs = 6 + Math.floor(r() * 3);
  for (let k = 0; k < limbs; k++) {
    const a = (k / limbs) * Math.PI * 2 + r() * 0.6;
    const at = trunk[1].clone().lerp(trunk[3], 0.25 + r() * 0.7);
    const out = 2 + r() * 1.8;
    const up = 1.2 + r() * 2.2;
    const mid = at.clone().add(new THREE.Vector3(Math.cos(a) * out * 0.5, Math.sin(a) * out * 0.5, up * 0.6));
    const end = at.clone().add(new THREE.Vector3(Math.cos(a) * out, Math.sin(a) * out, up));
    barks.push(limb([at, mid, end], 0.11, 0.035, 6));
    tips.push(mid, end);
    // Twigs off the end
    for (let j = 0; j < 2; j++) {
      const b = a + (r() - 0.5) * 1.6;
      const twig = end.clone().add(new THREE.Vector3(Math.cos(b) * 0.9, Math.sin(b) * 0.9, 0.4 + r() * 0.6));
      barks.push(limb([end, twig], 0.035, 0.015, 4));
      tips.push(twig);
    }
  }
  tips.push(trunk[3].clone().add(new THREE.Vector3(0, 0, 0.8)));
  // Leaf cards round every tip and through the crown
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const base = new THREE.PlaneGeometry(1, 1);
  base.translate(0, 0.35, 0);
  for (let i = 0; i < 95; i++) {
    const tip = tips[Math.floor(r() * tips.length)];
    const p = tip.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, (r() - 0.5) * 1.6, (r() - 0.5) * 1.2));
    const s = 1.5 + r() * 1.1;
    q.setFromEuler(new THREE.Euler(Math.PI / 2 + (r() - 0.5) * 0.9, (r() - 0.5) * 0.9, r() * Math.PI * 2, 'ZXY'));
    m.compose(p, q, new THREE.Vector3(s, s, s));
    const card = base.clone().applyMatrix4(m);
    // Normals: out from the crown's middle, a bit up
    const n = card.getAttribute('normal');
    const ps = card.getAttribute('position');
    for (let v = 0; v < n.count; v++) {
      const d = new THREE.Vector3(ps.getX(v), ps.getY(v), ps.getZ(v)).sub(crown);
      d.z = d.z * 1.4 + 1.2;
      d.normalize();
      n.setXYZ(v, d.x, d.y, d.z);
    }
    cards.push(card);
  }
  return { bark: mergeGeometries(barks)!, leaves: mergeGeometries(cards)!, height: H };
}

const tl = new THREE.TextureLoader();
const tex = async (url: string, srgb = true) => {
  const t = await tl.loadAsync(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
};

/** Gentle wind (TSL): sway a vertex by its height above the instance's base. */
function sway(amount: number, speed: number): N {
  const phase: N = hash(instanceIndex).mul(6.28);
  const h: N = positionLocal.z.max(0);
  const s: N = sin(time.mul(speed).add(phase).add(positionLocal.x.mul(0.7))).mul(amount).mul(h);
  const s2: N = sin(time.mul(speed * 1.7).add(phase.mul(1.3)).add(positionLocal.y.mul(0.9))).mul(amount * 0.6).mul(h);
  return positionLocal.add(vec3(s, s2, 0));
}

export async function buildNature(scene: THREE.Scene): Promise<void> {
  const [bark, barkN, leaf] = await Promise.all([tex('textures/bark_brown_02_diff.webp'), tex('textures/bark_brown_02_nor.webp', false), tex('textures/leaf_cluster.webp')]);
  // ---- Trees: three shapes, instanced
  const r = rng(91);
  const spots: [number, number, number, number][] = [];
  // (Beyond where the camera can go: it orbits at most 30 m out, and a trunk in front of it fills the frame)
  for (let k = 0; k < 400 && spots.length < 90; k++) {
    const a = r() * Math.PI * 2;
    const d = 34 + r() * 66;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.9;
    if (!clear(x, y, 4)) continue;
    if (spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 5)) continue;
    spots.push([x, y, 0.75 + r() * 0.55, r() * Math.PI * 2]);
  }
  spots.push([-24, 26, 1.1, 0.4], [28, 22, 1.2, 2], [33, -12, 0.95, 4], [-34, -6, 1, 1], [6, 34, 1.15, 5]);
  const barkMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  barkMat.colorNode = texture(bark).rgb.mul(vec3(0.9, 0.85, 0.8)) as THREE.Node<'vec3'>;
  barkMat.normalMap = barkN;
  const leafMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.5 });
  const tint: N = mix(vec3(0.78, 0.92, 0.62), vec3(1.05, 1.0, 0.68), hash(instanceIndex.add(17)));
  leafMat.colorNode = texture(leaf).rgb.mul(tint) as THREE.Node<'vec3'>;
  leafMat.opacityNode = texture(leaf).a as THREE.Node<'float'>;
  leafMat.positionNode = sway(0.006, 1.3) as THREE.Node<'vec3'>;
  // Light through the leaves: their backs glow a little when the sun is behind them
  leafMat.emissiveNode = texture(leaf).rgb.mul(0.05) as THREE.Node<'vec3'>;
  const shapes = [tree(3), tree(17), tree(29)];
  shapes.forEach((shape, k) => {
    const mine = spots.filter((_, i) => i % 3 === k);
    const b = new THREE.InstancedMesh(shape.bark, barkMat, mine.length);
    const l = new THREE.InstancedMesh(shape.leaves, leafMat, mine.length);
    mine.forEach(([x, y, s, a], i) => {
      const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, terrainHeight(x, y)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a), new THREE.Vector3(s, s, s));
      b.setMatrixAt(i, mtx);
      l.setMatrixAt(i, mtx);
    });
    for (const m of [b, l]) {
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
  });

  // ---- Tufts over the fields: three crossed cards of grass blades each (art-build/grass.py)
  {
    const tuft = await tex('textures/grass_tuft.webp');
    const cards: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const q = new THREE.PlaneGeometry(1, 0.5);
      q.rotateX(Math.PI / 2);
      q.translate(0, 0, 0.25);
      q.rotateZ((k * Math.PI) / 3);
      // Lit like the ground under it: normals up
      const n = q.getAttribute('normal');
      for (let v = 0; v < n.count; v++) n.setXYZ(v, 0, 0, 1);
      cards.push(q);
    }
    const geo = mergeGeometries(cards)!;
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 });
    const h: N = hash(instanceIndex.add(3));
    mat.colorNode = texture(tuft).rgb.mul(mix(vec3(1.0, 1.05, 0.7), vec3(1.4, 1.25, 0.8), h)) as THREE.Node<'vec3'>;
    mat.opacityNode = texture(tuft).a as THREE.Node<'float'>;
    mat.positionNode = sway(0.12, 2.1) as THREE.Node<'vec3'>;
    const list: THREE.Matrix4[] = [];
    for (let k = 0; k < 60000 && list.length < 9000; k++) {
      const a = r() * Math.PI * 2;
      const d = 6 + r() ** 1.6 * 60;
      const x = Math.cos(a) * d * 1.3;
      const y = Math.sin(a) * d;
      if (!clear(x, y, -0.5)) continue;
      const s = 0.55 + r() * 0.65;
      list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, terrainHeight(x, y) - 0.02), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r() * 6.28), new THREE.Vector3(s, s, s * (0.7 + r() * 0.6))));
    }
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.receiveShadow = true;
    scene.add(im);
  }
}
