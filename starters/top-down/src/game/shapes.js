// Small helpers shared by the other files: building one mesh from several coloured parts,
// and picking colours that stay readable in any palette.
// Nothing to change here for most games. Add your own shape helpers at the bottom.

import * as THREE from 'three';

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const col = new THREE.Color();
const arr = (v, d) => (Array.isArray(v) ? v : v === undefined ? d : [v, v, v]);

// Merge simple shapes into ONE geometry with a colour per part (use it with `vertexColors: true`).
// One geometry = one draw call, and it can be instanced. Faces come out flat-shaded (a low-poly look).
//   mergeParts([{ geo: new THREE.SphereGeometry(0.5, 8, 6), color: look.danger, at: [0, 0.5, 0], scale: [1, 0.7, 1] }, ...])
export function mergeParts(parts) {
  const pos = [];
  const nor = [];
  const rgb = [];
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    m.compose(p.fromArray(arr(part.at, [0, 0, 0])), q.setFromEuler(e.fromArray(arr(part.rot, [0, 0, 0]))), s.fromArray(arr(part.scale, [1, 1, 1])));
    g.applyMatrix4(m);
    g.computeVertexNormals();
    col.set(part.color);
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      rgb.push(col.r, col.g, col.b);
    }
    g.dispose();
    part.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  return out;
}

// A colour that is sure to stand out from a background: if `c` is too close to `bg` in brightness,
// it is pushed lighter (on dark backgrounds) or darker (on pale ones). Palettes change; this keeps
// shots, markers and pickups readable in all of them.
export function apart(look, c, bg, min = 0.14) {
  const lb = look.luminance(bg);
  let out = c;
  for (let i = 0; i < 6 && Math.abs(look.luminance(out) - lb) < min; i++) out = look.shade(out, lb < 0.35 ? 0.18 : -0.18);
  return out;
}

// Shortest way round from angle a to angle b (radians), moved by at most `max`.
export function turnToward(a, b, max) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-max, Math.min(max, d));
}

// An instanced mesh that starts empty; call place() for each copy, then done().
export function instanced(scene, geo, mat, max, { shadow = false, receive = false, colors = false } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0;
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  mesh.frustumCulled = false; // copies are spread out; the default bounds would hide them wrongly
  scene.add(mesh);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const C = new THREE.Color();
  if (colors) mesh.setColorAt(0, C.setScalar(1)); // make the colour buffer now, so no shader rebuild mid-game
  mesh.place = (x, y, z, { yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx, color = null, bright = 1 } = {}) => {
    if (mesh.count >= max) return -1;
    const i = mesh.count++;
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(pitch, yaw, roll, 'YXZ')), S.set(sx, sy, sz));
    mesh.setMatrixAt(i, M);
    if (color !== null || bright !== 1 || mesh.instanceColor) mesh.setColorAt(i, color !== null ? C.set(color).multiplyScalar(bright) : C.setScalar(bright));
    return i;
  };
  mesh.begin = () => { mesh.count = 0; };
  mesh.done = () => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return mesh;
}
