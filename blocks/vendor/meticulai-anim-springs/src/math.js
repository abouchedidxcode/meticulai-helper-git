/**
 * Small math helpers shared by the animation core. Pure functions; the quaternion helpers use
 * three.js types but never allocate in hot paths unless noted.
 */
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const LN2 = Math.LN2;
const EPS = 1e-8;

/** @type {(v: number, lo: number, hi: number) => number} */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** @type {(v: number) => number} */
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** @type {(a: number, b: number, t: number) => number} */
export const lerp = (a, b, t) => a + (b - a) * t;
/** @type {(a: number, b: number, v: number) => number} */
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
/** @type {(v: number, a0: number, a1: number, b0: number, b1: number) => number} */
export const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, v));
/** @type {(e0: number, e1: number, x: number) => number} */
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Smooth clamp: identity in the middle, then eases into the limits (C1, never exceeds them).
 * `soft` is the width of the easing zone. Hard clamps put kinks (jerk spikes) in motion.
 * @param {number} x @param {number} lo @param {number} hi @param {number} [soft]
 * @returns {number}
 */
export function softClamp(x, lo, hi, soft = 0.1) {
  const k = Math.max(1e-6, Math.min(soft, (hi - lo) / 2));
  if (x > hi - k) return hi - k * Math.exp(-(x - (hi - k)) / k);
  if (x < lo + k) return lo + k * Math.exp((x - (lo + k)) / k);
  return x;
}

/** Wrap an angle to (-PI, PI]. @param {number} a @returns {number} */
export function wrapAngle(a) {
  return a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));
}

/** Exponential smoothing factor for a given half-life (frame-rate independent). @param {number} halflife @param {number} dt */
export function dampFactor(halflife, dt) {
  return 1 - Math.pow(2, -dt / Math.max(halflife, EPS));
}

/** Move `current` toward `target`, halving the gap every `halflife` seconds. */
export function damp(current, target, halflife, dt) {
  return lerp(current, target, dampFactor(halflife, dt));
}

/**
 * Quaternion -> scaled angle-axis vector (axis * angle, radians), taking the short way round.
 * @param {THREE.Quaternion} q @param {THREE.Vector3} [out] @returns {THREE.Vector3}
 */
export function quatToScaledAxis(q, out = new THREE.Vector3()) {
  let { x, y, z, w } = q;
  if (w < 0) {
    x = -x; y = -y; z = -z; w = -w;
  }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < EPS) return out.set(2 * x, 2 * y, 2 * z);
  const angle = 2 * Math.atan2(s, w);
  const k = angle / s;
  return out.set(x * k, y * k, z * k);
}

/** Scaled angle-axis vector -> quaternion. @param {THREE.Vector3} v @param {THREE.Quaternion} [out] @returns {THREE.Quaternion} */
export function scaledAxisToQuat(v, out = new THREE.Quaternion()) {
  const angle = v.length();
  if (angle < EPS) return out.set(v.x * 0.5, v.y * 0.5, v.z * 0.5, 1).normalize();
  const s = Math.sin(angle * 0.5) / angle;
  return out.set(v.x * s, v.y * s, v.z * s, Math.cos(angle * 0.5));
}

/** Angle in radians between two orientations (0..PI). @param {THREE.Quaternion} a @param {THREE.Quaternion} b */
export function quatAngle(a, b) {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, d));
}

/** Makes `q` lie in the same hemisphere as `ref` (so lerps and blends take the short path). @param {THREE.Quaternion} q @param {THREE.Quaternion} ref */
export function quatAlign(q, ref) {
  if (q.x * ref.x + q.y * ref.y + q.z * ref.z + q.w * ref.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  return q;
}

/** Scales a rotation's angle by `w` (w=0 identity, w=1 unchanged). @param {THREE.Quaternion} q @param {number} w @param {THREE.Quaternion} [out] */
export function quatScale(q, w, out = new THREE.Quaternion()) {
  const v = quatToScaledAxis(q, _v0);
  v.multiplyScalar(w);
  return scaledAxisToQuat(v, out);
}

/**
 * Quaternion from Euler angles in radians, applied in the given order (default YXZ: yaw, pitch, roll).
 * @param {number} x @param {number} y @param {number} z @param {THREE.EulerOrder} [order] @param {THREE.Quaternion} [out]
 */
export function quatFromEuler(x, y, z, order = 'YXZ', out = new THREE.Quaternion()) {
  _e0.set(x, y, z, order);
  return out.setFromEuler(_e0);
}

/**
 * Decomposes `q` into swing (perpendicular to `axis`) and twist (around the unit `axis`): q = swing * twist.
 * @param {THREE.Quaternion} q @param {THREE.Vector3} axis @param {THREE.Quaternion} swing @param {THREE.Quaternion} twist
 */
export function swingTwist(q, axis, swing, twist) {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  twist.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  const len = Math.hypot(twist.x, twist.y, twist.z, twist.w);
  if (len < EPS) twist.identity();
  else twist.set(twist.x / len, twist.y / len, twist.z / len, twist.w / len);
  swing.copy(q).multiply(_q0.copy(twist).invert());
}

/**
 * Clamp a rotation's angle to at most `maxAngle` radians (soft: eases in over `soft` rad).
 *
 * Pass `history` (one Quaternion per call site, kept between frames) for a clamp that is
 * continuous in time. Without it the clamp works on the shortest arc, and when a request crosses
 * 180 degrees the shortest arc flips to the opposite axis, so the clamped result jumps by up to
 * 2 x maxAngle in one frame (a hand turning upside down). With it the request is kept in the same
 * hemisphere as last frame's request, so its angle runs continuously past 180 degrees; beyond 270
 * degrees the result tapers to identity (a full turn), which keeps it continuous for any path.
 * @param {THREE.Quaternion} q mutated and returned
 * @param {number} maxAngle @param {number} [soft] @param {THREE.Quaternion} [history]
 * @returns {THREE.Quaternion}
 */
export function clampQuatAngle(q, maxAngle, soft = 0, history) {
  if (!history) {
    const v = quatToScaledAxis(q, _v0);
    const a = v.length();
    const b = soft > 0 ? softClamp(a, -maxAngle, maxAngle, soft) : Math.min(a, maxAngle);
    if (a > 1e-9 && b !== a) scaledAxisToQuat(v.multiplyScalar(b / a), q);
    return q;
  }
  alignWithHistory(q, history);
  const s = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
  if (s < 1e-9) return q.w >= 0 ? q : q.identity();
  const a = 2 * Math.atan2(s, q.w); // 0..2PI, continuous while the request is continuous
  let b;
  if (a <= Math.PI) b = soft > 0 ? softClamp(a, -maxAngle, maxAngle, soft) : Math.min(a, maxAngle);
  else {
    const atPi = soft > 0 ? softClamp(Math.PI, -maxAngle, maxAngle, soft) : Math.min(Math.PI, maxAngle);
    b = atPi * (1 - smoothstep(1.5 * Math.PI, 2 * Math.PI, a));
  }
  if (b === a) return q;
  _v0.set(q.x / s, q.y / s, q.z / s).multiplyScalar(b);
  return scaledAxisToQuat(_v0, q);
}

/**
 * Puts `q` in the same hemisphere as last frame's `history` (so its angle runs continuously past
 * 180 degrees) and stores it. Once a request has come all the way round to (almost) a full turn
 * the history is re-anchored to the short way, where both readings agree to within ~0.1 degree.
 * @param {THREE.Quaternion} q @param {THREE.Quaternion} history
 */
export function alignWithHistory(q, history) {
  quatAlign(q, history);
  if (q.w < -0.9995) q.set(-q.x, -q.y, -q.z, -q.w);
  history.copy(q);
  return q;
}

/**
 * Builds a rotation that maps the orthonormal frame (fromA, fromB) onto (toA, toB). B is re-orthogonalised.
 * @param {THREE.Vector3} fromA @param {THREE.Vector3} fromB @param {THREE.Vector3} toA @param {THREE.Vector3} toB
 * @param {THREE.Quaternion} [out] @returns {THREE.Quaternion}
 */
export function quatFromFrames(fromA, fromB, toA, toB, out = new THREE.Quaternion()) {
  const m1 = frameMatrix(fromA, fromB, _m0);
  const m2 = frameMatrix(toA, toB, _m1);
  // R = M2 * M1^T
  m1.transpose();
  m2.multiply(m1);
  return out.setFromRotationMatrix(m2);
}

function frameMatrix(a, b, m) {
  const x = _v1.copy(a).normalize();
  const z = _v2.crossVectors(x, b).normalize();
  const y = _v3.crossVectors(z, x);
  return m.makeBasis(x, y, z);
}

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _e0 = new THREE.Euler();
const _m0 = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();
