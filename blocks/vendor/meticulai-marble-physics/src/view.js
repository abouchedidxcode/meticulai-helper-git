// Optional three.js helpers: a mesh for any collider (box, cyl, lathe, helix) that matches what the physics
// collides with, and a sync call for moving (kinematic) ones. The physics itself never imports three.
import * as THREE from 'three';

/** Sets an Object3D's matrix from a collider's rotation (row-major 3x3) and centre. */
export function syncMesh(obj, col) {
  const R = col.R, c = col.c;
  obj.matrixAutoUpdate = false;
  obj.matrix.set(R[0], R[1], R[2], c[0], R[3], R[4], R[5], c[1], R[6], R[7], R[8], c[2], 0, 0, 0, 1);
  obj.matrixWorldNeedsUpdate = true;
  obj.visible = col.enabled !== false;
}

// Same curves as the physics (helixOff / helixBank in physics.js).
function helixOff(col, rel) {
  if (!col.rise) return 0;
  const u = rel / (col.a1 - col.a0);
  return col.ease ? col.rise * u * u * (3 - 2 * u) : col.rise * u;
}
function helixBank(col, rel) {
  if (!col.blend) return 1;
  const span = col.a1 - col.a0;
  const a = Math.max(0, Math.min(1, rel / col.blend)), b = Math.max(0, Math.min(1, (span - rel) / col.blend));
  return a * a * (3 - 2 * a) * b * b * (3 - 2 * b);
}

/**
 * Geometry for a lathe or helix shell: the profile offset by +-shell (both faces the marble can touch), swept over
 * the collider's angular range. In the collider's local space (use syncMesh to place it).
 */
export function shellGeometry(col, { segments = 0 } = {}) {
  const p = col.profile;
  const np = p.length / 2;
  const a0 = col.a0 ?? 0, a1 = col.a1 ?? Math.PI * 2;
  const span = a1 - a0;
  const seg = segments || Math.max(12, Math.ceil((span / (Math.PI * 2)) * 72));
  // 2D normals of the profile (per point, averaged over its two segments).
  const nr = new Float32Array(np), ny = new Float32Array(np);
  for (let i = 0; i < np; i++) {
    const a = Math.max(0, i - 1), b = Math.min(np - 1, i + 1);
    const er = p[b * 2] - p[a * 2], ey = p[b * 2 + 1] - p[a * 2 + 1];
    const l = Math.hypot(er, ey) || 1;
    nr[i] = -ey / l;
    ny[i] = er / l;
  }
  const pos = [];
  const idx = [];
  const sides = col.shell > 0 ? [col.shell, -col.shell] : [0];
  for (let s = 0; s < sides.length; s++) {
    const d = sides[s];
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const rel = (span * j) / seg;
      const phi = a0 + rel;
      const cx = Math.cos(phi), sz = Math.sin(phi);
      const off = col.shape === 3 ? helixOff(col, rel) : 0;
      const w = col.lift ? helixBank(col, rel) : 0;
      for (let i = 0; i < np; i++) {
        const r = p[i * 2] + nr[i] * d;
        const y = p[i * 2 + 1] + ny[i] * d + off + (col.lift ? col.lift[i] * w : 0);
        pos.push(cx * r, y, sz * r);
      }
    }
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < np - 1; i++) {
        const a = base + j * np + i, b = a + np;
        if (s === 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A geometry for any collider, in its local space. */
export function colliderGeometry(col) {
  if (col.shape === 0) return new THREE.BoxGeometry(col.hx * 2, col.hy * 2, col.hz * 2);
  if (col.shape === 1) return new THREE.CylinderGeometry(col.radius, col.radius, col.hh * 2, 24);
  return shellGeometry(col);
}

/**
 * A mesh for a collider, placed. Lathe and helix shells are drawn double-sided. Call syncMesh(mesh, col) every
 * frame for colliders with `motion` (after world.setTime / stepWorld).
 * @param {object} col
 * @param {THREE.Material} material
 */
export function colliderMesh(col, material) {
  const mat = col.shape >= 2 && material.side !== THREE.DoubleSide ? material.clone() : material;
  if (col.shape >= 2) mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(colliderGeometry(col), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  syncMesh(mesh, col);
  return mesh;
}
