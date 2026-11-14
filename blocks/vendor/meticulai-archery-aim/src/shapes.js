// SHAPES: segment tests for a target's test(p0, p1). Each returns the first point where the segment from p0 to p1
// enters the shape, as { t (0..1 along the segment), point, normal }, or null. Pure maths, no three.js.
import { Vec3 } from './vec3.js';

/** Segment p0 -> p1 against a sphere (centre c, radius r). */
export function segmentSphere(p0, p1, c, r) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const fx = p0.x - c.x, fy = p0.y - c.y, fz = p0.z - c.z;
  const a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), cc = fx * fx + fy * fy + fz * fz - r * r;
  if (cc <= 0) return hitAt(p0, dx, dy, dz, 0, c, r);                  // starts inside
  if (a < 1e-12) return null;
  const disc = b * b - 4 * a * cc; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > 1) return null;
  return hitAt(p0, dx, dy, dz, t, c, r);
}
function hitAt(p0, dx, dy, dz, t, c, r) {
  const point = new Vec3(p0.x + dx * t, p0.y + dy * t, p0.z + dz * t);
  const normal = new Vec3().subVectors(point, c).multiplyScalar(1 / (r || 1));
  return { t, point, normal };
}

// closest point parameters between segment P (p0 + s*u) and segment Q (q0 + w*v)
function closestST(p0, u, q0, v) {
  const rx = p0.x - q0.x, ry = p0.y - q0.y, rz = p0.z - q0.z;
  const a = u.x * u.x + u.y * u.y + u.z * u.z, e = v.x * v.x + v.y * v.y + v.z * v.z, f = v.x * rx + v.y * ry + v.z * rz;
  let s, w;
  if (a < 1e-12 && e < 1e-12) return [0, 0];
  if (a < 1e-12) { s = 0; w = Math.min(1, Math.max(0, f / e)); return [s, w]; }
  const c = u.x * rx + u.y * ry + u.z * rz;
  if (e < 1e-12) { w = 0; s = Math.min(1, Math.max(0, -c / a)); return [s, w]; }
  const b = u.x * v.x + u.y * v.y + u.z * v.z, den = a * e - b * b;
  s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  w = (b * s + f) / e;
  if (w < 0) { w = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (w > 1) { w = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  return [s, w];
}
const _u = new Vec3(), _v = new Vec3(), _p = new Vec3(), _q = new Vec3();
function distToAxis(px, py, pz, a, v) {
  const vv = v.x * v.x + v.y * v.y + v.z * v.z;
  let w = vv > 1e-12 ? ((px - a.x) * v.x + (py - a.y) * v.y + (pz - a.z) * v.z) / vv : 0;
  w = Math.min(1, Math.max(0, w));
  _q.set(a.x + v.x * w, a.y + v.y * w, a.z + v.z * w);
  return Math.hypot(px - _q.x, py - _q.y, pz - _q.z);
}

/** Segment p0 -> p1 against a capsule: the axis from a to b, radius r (a rider's body, a post, a limb). */
export function segmentCapsule(p0, p1, a, b, r) {
  _u.subVectors(p1, p0); _v.subVectors(b, a);
  const [s] = closestST(p0, _u, a, _v);
  _p.copy(p0).addScaledVector(_u, s);
  if (distToAxis(_p.x, _p.y, _p.z, a, _v) > r) return null;
  // the segment comes within r: find where it first does (bisection between the start and the closest approach)
  if (distToAxis(p0.x, p0.y, p0.z, a, _v) <= r) return capHit(p0, 0, a, r);
  let lo = 0, hi = s;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (distToAxis(p0.x + _u.x * m, p0.y + _u.y * m, p0.z + _u.z * m, a, _v) <= r) hi = m; else lo = m; }
  return capHit(p0, hi, a, r);
}
function capHit(p0, t, a, r) {
  const point = new Vec3(p0.x + _u.x * t, p0.y + _u.y * t, p0.z + _u.z * t);
  distToAxis(point.x, point.y, point.z, a, _v);
  const normal = new Vec3().subVectors(point, _q).multiplyScalar(1 / (r || 1));
  return { t, point, normal };
}

/**
 * Segment p0 -> p1 against a box turned by `yaw` about the vertical (a board, a shield, a wall, a cart):
 * centre c, half sizes hx (across), hy (up), hz (through), yaw in radians (the box's +Z faces sin(yaw), cos(yaw)).
 */
export function segmentBox(p0, p1, c, hx, hy, hz, yaw = 0) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  // into the box's frame: x' = x*cos - z*sin, z' = x*sin + z*cos (inverse of a yaw turn)
  const lx = (p) => (p.x - c.x) * cs - (p.z - c.z) * sn, lz = (p) => (p.x - c.x) * sn + (p.z - c.z) * cs;
  const o = [lx(p0), p0.y - c.y, lz(p0)], e = [lx(p1), p1.y - c.y, lz(p1)];
  const d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]], h = [hx, hy, hz];
  let t0 = 0, t1 = 1, axis = -1, sign = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) { if (o[i] < -h[i] || o[i] > h[i]) return null; continue; }
    let ta = (-h[i] - o[i]) / d[i], tb = (h[i] - o[i]) / d[i], sg = -1;
    if (ta > tb) { const k = ta; ta = tb; tb = k; sg = 1; }
    if (ta > t0) { t0 = ta; axis = i; sign = sg; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  const point = new Vec3(p0.x + (p1.x - p0.x) * t0, p0.y + (p1.y - p0.y) * t0, p0.z + (p1.z - p0.z) * t0);
  const nl = [0, 0, 0]; if (axis >= 0) nl[axis] = sign; else nl[2] = -1;
  // back to the world: x = x'*cos + z'*sin, z = -x'*sin + z'*cos
  const normal = new Vec3(nl[0] * cs + nl[2] * sn, nl[1], -nl[0] * sn + nl[2] * cs);
  return { t: t0, point, normal };
}
