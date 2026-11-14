// Signed distance field (SDF) modelling in plain JavaScript: primitives, smooth booleans,
// transforms and surface relief. An SDF is a function (x, y, z) => distance: negative inside
// the shape, positive outside, zero on the surface. Build a shape by combining functions,
// then turn it into a mesh with meshSDF() in mesher.js.
//
// No imports: runs in the browser, in a Web Worker and in Node.
//
// smin/smax, the bound-corrected ellipsoid and the exact round cone are Inigo Quilez's
// published formulas (iquilezles.org, "distance functions" and "smooth minimum"; MIT). See LICENSE.
// From Dig Site and Orbitball by Meticulai.

/** @typedef {(x: number, y: number, z: number) => number} SDF */
/** @typedef {[number, number, number]} Vec3 */

// ---------------------------------------------------------------- scalar helpers

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Polynomial smooth minimum (Inigo Quilez). Blends two distances; k is the blend radius in
 * world units (0 = hard union). The result is never above min(a, b).
 * @param {number} a @param {number} b @param {number} k
 */
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}
/** Smooth maximum (Inigo Quilez): -smin(-a, -b, k). */
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}
/** Subtract distance b from a with a rounded edge of radius k. */
export const ssub = (a, b, k) => smax(a, -b, k);

// ---------------------------------------------------------------- primitives (each returns an SDF)

/** Sphere centred at (cx, cy, cz). Exact. */
export const sphere = (cx, cy, cz, r) => (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;

/** Axis-aligned ellipsoid with radii rx, ry, rz. Approximate (Inigo Quilez's bound-corrected version). */
export const ellipsoid = (cx, cy, cz, rx, ry, rz) => (x, y, z) => {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
};

/**
 * Round cone (tapered capsule) from a (radius ra) to b (radius rb). Exact (Inigo Quilez, sdRoundCone).
 * The workhorse for limbs, bones, horns, tails.
 */
export function roundCone(ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
  };
}
/** Capsule from a to b with radius r. */
export const capsule = (ax, ay, az, bx, by, bz, r) => roundCone(ax, ay, az, bx, by, bz, r, r + 1e-6);

/** Rounded box centred at c with half extents h and corner radius r. Exact. */
export const roundBox = (cx, cy, cz, hx, hy, hz, r) => (x, y, z) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
};

/** Capped cylinder along y: centre c, radius r, half height hh, edge rounding rad. Exact. */
export const cylinder = (cx, cy, cz, r, hh, rad = 0) => (x, y, z) => {
  const dx = Math.hypot(x - cx, z - cz) - (r - rad), dy = Math.abs(y - cy) - (hh - rad);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rad;
};

/** A tapered tube through a polyline of [x, y, z, r] points (round cones), optionally smooth-joined by k. */
export function tube(pts, k = 0.0) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    segs.push(roundCone(a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3]));
  }
  return (x, y, z) => {
    let d = segs[0](x, y, z);
    for (let i = 1; i < segs.length; i++) d = k > 0 ? smin(d, segs[i](x, y, z), k) : Math.min(d, segs[i](x, y, z));
    return d;
  };
}

/**
 * Sample a smooth Catmull-Rom curve through control points [x, y, z, r] into n + 1 tube points.
 * `tube(curve(ctrl, 12))` gives a bent, tapering limb, rib or horn.
 * @param {number[][]} ctrl @param {number} [n]
 */
export function curve(ctrl, n = 12) {
  const out = [];
  const P = (i) => ctrl[clamp(i, 0, ctrl.length - 1)];
  const segs = ctrl.length - 1;
  for (let s = 0; s <= n; s++) {
    const u = (s / n) * segs;
    const i = Math.min(Math.floor(u), segs - 1);
    const t = u - i;
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const v = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      v[c] =
        0.5 *
        (2 * p1[c] +
          (-p0[c] + p2[c]) * t +
          (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t +
          (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t);
    }
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------- combinators

/** Hard union of any number of SDFs. */
export const union = (...fs) => (x, y, z) => {
  let d = fs[0](x, y, z);
  for (let i = 1; i < fs.length; i++) d = Math.min(d, fs[i](x, y, z));
  return d;
};
/** Smooth union with blend radius k. Add shapes that overlap a lot, not small lumps (see HOW-TO-USE). */
export const sunion = (k, ...fs) => (x, y, z) => {
  let d = fs[0](x, y, z);
  for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
  return d;
};
/** Carve every b out of a with a rounded edge of radius k. */
export const subtract = (k, a, ...bs) => (x, y, z) => {
  let d = a(x, y, z);
  for (const b of bs) d = smax(d, -b(x, y, z), k);
  return d;
};
/** Keep only where a and b overlap, with a rounded edge of radius k. */
export const intersect = (k, a, b) => (x, y, z) => smax(a(x, y, z), b(x, y, z), k);

// ---------------------------------------------------------------- transforms

/** Scale space per axis (approximate distance, fine for meshing). */
export const scaled = (f, sx, sy, sz) => {
  const m = Math.min(sx, sy, sz);
  return (x, y, z) => f(x / sx, y / sy, z / sz) * m;
};
export const translated = (f, tx, ty, tz) => (x, y, z) => f(x - tx, y - ty, z - tz);
/** Rotate the shape about z by angle a (radians). */
export const rotZ = (f, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return (x, y, z) => f(c * x + s * y, -s * x + c * y, z);
};
export const rotY = (f, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return (x, y, z) => f(c * x - s * z, y, s * x + c * z);
};
export const rotX = (f, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return (x, y, z) => f(x, c * y + s * z, -s * y + c * z);
};
/** Mirror across the x = 0 plane (model one side, get both). */
export const mirrorX = (f) => (x, y, z) => f(Math.abs(x), y, z);
/** Mirror across the z = 0 plane. */
export const mirrorZ = (f) => (x, y, z) => f(x, y, Math.abs(z));
/** Hollow the shape into a shell of thickness t (inwards). */
export const shell = (f, t) => (x, y, z) => {
  const d = f(x, y, z);
  return Math.max(d, -d - t);
};

// ---------------------------------------------------------------- surface relief

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Cheap deterministic value noise in -1..1 (no seed; offset the input for variety). */
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const wgt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        r += wgt * hash3(xi + dx, yi + dy, zi + dz);
      }
  return r * 2 - 1;
}
/** Add surface relief (pits, ridges) to an SDF. amp in world units, freq in 1/unit. */
export const rough = (f, amp, freq) => (x, y, z) =>
  f(x, y, z) + amp * (vnoise(x * freq, y * freq, z * freq) + 0.5 * vnoise(x * freq * 2.3 + 7, y * freq * 2.3, z * freq * 2.3));
