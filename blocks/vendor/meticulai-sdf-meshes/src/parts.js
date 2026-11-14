// Parts lists: a model written as a list of primitives that each know their own bounding box.
// The mesher fills the grid by visiting each part only inside its box (much faster than
// evaluating every part at every grid point), which is what lets a whole character with
// dozens of muscles and limbs mesh in about a second.
//
// A part is { prim, op: 'add' | 'sub', k } where prim has sdf(x, y, z) and aabb [min, max].
// 'add' smooth-unions with blend radius k; 'sub' smooth-subtracts with radius k. Order matters:
// a 'sub' only carves what was added before it.
//
// No imports. Round cone and ellipsoid are Inigo Quilez's formulas (MIT). From Orbitball by Meticulai.

import { smin, smax } from './sdf.js';

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{ sdf: (x: number, y: number, z: number) => number, aabb: [Vec3, Vec3], kind: string }} Prim */
/** @typedef {{ prim: Prim, op?: 'add' | 'sub', k?: number, [extra: string]: any }} Part */

const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Orthonormal basis from a primary axis and a hint vector. Returns [x, y, z] axes where y = axis.
 * Use it to tilt ellipsoids, boxes and cylinders along a limb.
 * @param {Vec3} axis @param {Vec3} [hint]
 */
export function basisFromAxis(axis, hint = [0, 0, 1]) {
  const y = norm(axis);
  let h = norm(hint);
  if (Math.abs(h[0] * y[0] + h[1] * y[1] + h[2] * y[2]) > 0.95) h = [1, 0, 0];
  const x = norm(cross(y, h));
  const z = norm(cross(x, y));
  return [x, y, z];
}

/** Tapered capsule from a (radius ra) to b (radius rb). Exact (Inigo Quilez, sdRoundCone). */
export function roundConePart(a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  return {
    kind: 'cone', a, b, ra, rb,
    aabb: [
      [Math.min(a[0] - ra, b[0] - rb), Math.min(a[1] - ra, b[1] - rb), Math.min(a[2] - ra, b[2] - rb)],
      [Math.max(a[0] + ra, b[0] + rb), Math.max(a[1] + ra, b[1] + rb), Math.max(a[2] + ra, b[2] + rb)],
    ],
    /** parameter along the segment, 0 at a, 1 at b (unclamped): handy for skin weights */
    t(x, y, z) { return ((x - a[0]) * bax + (y - a[1]) * bay + (z - a[2]) * baz) * il2; },
    sdf(x, y, z) {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const yy = px * bax + py * bay + pz * baz;
      const z_ = yy - l2;
      const qx = px * l2 - bax * yy, qy = py * l2 - bay * yy, qz = pz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = z_ * z_ * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(z_) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
    },
  };
}

/** Ellipsoid: centre c, radii r = [rx, ry, rz] along the basis axes (default world axes). Approximate (Inigo Quilez). */
export function ellipsoidPart(c, r, basis = null) {
  const B = basis || IDENTITY;
  const m = Math.max(r[0], r[1], r[2]);
  return {
    kind: 'ellipsoid', c, r,
    aabb: [[c[0] - m, c[1] - m, c[2] - m], [c[0] + m, c[1] + m, c[2] + m]],
    sdf(x, y, z) {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const lx = px * B[0][0] + py * B[0][1] + pz * B[0][2];
      const ly = px * B[1][0] + py * B[1][1] + pz * B[1][2];
      const lz = px * B[2][0] + py * B[2][1] + pz * B[2][2];
      const ax = lx / r[0], ay = ly / r[1], az = lz / r[2];
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = lx / (r[0] * r[0]), by = ly / (r[1] * r[1]), bz = lz / (r[2] * r[2]);
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
      return (k0 * (k0 - 1)) / k1;
    },
  };
}

/** Rounded box: centre c, half extents h, corner radius rad, basis axes. */
export function roundBoxPart(c, h, rad, basis = null) {
  const B = basis || IDENTITY;
  const m = Math.hypot(h[0], h[1], h[2]) + rad;
  return {
    kind: 'box', c, h,
    aabb: [[c[0] - m, c[1] - m, c[2] - m], [c[0] + m, c[1] + m, c[2] + m]],
    sdf(x, y, z) {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const qx = Math.abs(px * B[0][0] + py * B[0][1] + pz * B[0][2]) - h[0];
      const qy = Math.abs(px * B[1][0] + py * B[1][1] + pz * B[1][2]) - h[1];
      const qz = Math.abs(px * B[2][0] + py * B[2][1] + pz * B[2][2]) - h[2];
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - rad;
    },
  };
}

/** Capped cylinder along the basis y axis: centre c, radius r, half height hh, edge rounding rad. */
export function cylinderPart(c, r, hh, rad = 0, basis = null) {
  const B = basis || IDENTITY;
  const m = Math.hypot(r, hh) + rad;
  return {
    kind: 'cyl', c,
    aabb: [[c[0] - m, c[1] - m, c[2] - m], [c[0] + m, c[1] + m, c[2] + m]],
    sdf(x, y, z) {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const lx = px * B[0][0] + py * B[0][1] + pz * B[0][2];
      const ly = px * B[1][0] + py * B[1][1] + pz * B[1][2];
      const lz = px * B[2][0] + py * B[2][1] + pz * B[2][2];
      const dx = Math.hypot(lx, lz) - (r - rad), dy = Math.abs(ly) - (hh - rad);
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rad;
    },
  };
}

/** Wrap any plain SDF function as a part with a box you give it (so you can mix in sdf.js shapes). */
export function customPart(sdf, aabb) {
  return { kind: 'custom', aabb, sdf };
}

/**
 * Exact distance of the whole parts list at one point.
 * @param {Part[]} parts
 */
export function evalParts(parts, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const v = p.prim.sdf(x, y, z);
    if (p.op === 'sub') d = smax(d, -v, p.k ?? 0);
    else d = smin(d, v, p.k ?? 0);
  }
  return d;
}

/** Box around every 'add' part, padded by its blend radius. */
export function partsBounds(parts, pad = 0) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    if (p.op === 'sub') continue;
    const k = (p.k ?? 0) + pad;
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p.prim.aabb[0][a] - k);
      hi[a] = Math.max(hi[a], p.prim.aabb[1][a] + k);
    }
  }
  return { bmin: lo, bmax: hi };
}

/**
 * Fill a grid by splatting each part only inside its (padded) box. Grid points no part touches
 * stay at +pad (outside). Returns a Float32Array indexed i + nx * (j + ny * k).
 */
export function fillPartsGrid(parts, bmin, cell, nx, ny, nz, pad) {
  const g = new Float32Array(nx * ny * nz).fill(pad);
  const touched = new Uint8Array(nx * ny * nz);
  for (const p of parts) {
    const pk = p.k ?? 0;
    const e = pk + cell * 3;
    const [lo, hi] = p.prim.aabb;
    const i0 = Math.max(0, Math.floor((lo[0] - e - bmin[0]) / cell)), i1 = Math.min(nx - 1, Math.ceil((hi[0] + e - bmin[0]) / cell));
    const j0 = Math.max(0, Math.floor((lo[1] - e - bmin[1]) / cell)), j1 = Math.min(ny - 1, Math.ceil((hi[1] + e - bmin[1]) / cell));
    const k0 = Math.max(0, Math.floor((lo[2] - e - bmin[2]) / cell)), k1 = Math.min(nz - 1, Math.ceil((hi[2] + e - bmin[2]) / cell));
    for (let k = k0; k <= k1; k++) {
      const z = bmin[2] + k * cell;
      for (let j = j0; j <= j1; j++) {
        const y = bmin[1] + j * cell;
        let idx = i0 + nx * (j + ny * k);
        for (let i = i0; i <= i1; i++, idx++) {
          const x = bmin[0] + i * cell;
          const v = p.prim.sdf(x, y, z);
          if (p.op === 'sub') { if (touched[idx]) g[idx] = smax(g[idx], -v, pk); }
          else { g[idx] = touched[idx] ? smin(g[idx], v, pk) : Math.min(v, pad); touched[idx] = 1; }
        }
      }
    }
  }
  return g;
}
