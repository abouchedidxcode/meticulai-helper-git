/**
 * Springs for smooth following and secondary motion. All updates use the exact closed-form
 * solutions (the approach in Daniel Holden's article "Spring-It-On"), so they are stable at any
 * dt and frame-rate independent: stepping 1/30 once equals stepping 1/60 twice.
 *
 * Tuning is by half-life: the time for the remaining distance to the goal to roughly halve.
 */
import * as THREE from 'three';
import { quatToScaledAxis, scaledAxisToQuat, quatAlign } from './math.js';

const EPS = 1e-5;

/** @typedef {{ x: number, v: number }} SpringState */

/** @param {number} halflife seconds */
export function halflifeToDamping(halflife) {
  return (4 * Math.LN2) / (halflife + EPS);
}
/** @param {number} damping */
export function dampingToHalflife(damping) {
  return (4 * Math.LN2) / (damping + EPS);
}
/** @param {number} hz */
export function frequencyToStiffness(hz) {
  return (2 * Math.PI * hz) ** 2;
}

/**
 * Critically damped spring toward `goal` (goal velocity `goalV`). Mutates and returns `s`.
 * @param {SpringState} s @param {number} goal @param {number} halflife @param {number} dt @param {number} [goalV]
 * @returns {SpringState}
 */
export function criticalSpring(s, goal, halflife, dt, goalV = 0) {
  const y = halflifeToDamping(halflife) / 2;
  // Track a goal moving at constant velocity: solve relative to the moving goal.
  const j0 = s.x - goal;
  const j1 = s.v - goalV + j0 * y;
  const eydt = Math.exp(-y * dt);
  s.x = eydt * (j0 + j1 * dt) + goal + goalV * dt;
  s.v = eydt * (s.v - goalV - j1 * y * dt) + goalV;
  return s;
}

/**
 * Decays x (and its velocity) to zero with a critically damped spring. Used by inertialization.
 * @param {SpringState} s @param {number} halflife @param {number} dt @returns {SpringState}
 */
export function decaySpring(s, halflife, dt) {
  const y = halflifeToDamping(halflife) / 2;
  const j1 = s.v + s.x * y;
  const eydt = Math.exp(-y * dt);
  s.x = eydt * (s.x + j1 * dt);
  s.v = eydt * (s.v - j1 * y * dt);
  return s;
}

/**
 * General damped spring with stiffness and damping (under-, critically or over-damped), exact.
 * Use for secondary motion that should overshoot a little (a hood tip, a beard, a held object).
 * @param {SpringState} s @param {number} goal @param {number} stiffness @param {number} damping @param {number} dt
 * @returns {SpringState}
 */
export function dampedSpring(s, goal, stiffness, damping, dt) {
  const g = goal, x = s.x, v = s.v;
  const c = g;
  const y = damping / 2;
  const disc = stiffness - (damping * damping) / 4;
  if (Math.abs(disc) < EPS) {
    const j0 = x - c;
    const j1 = v + j0 * y;
    const eydt = Math.exp(-y * dt);
    s.x = j0 * eydt + dt * j1 * eydt + c;
    s.v = -y * j0 * eydt - y * dt * j1 * eydt + j1 * eydt;
  } else if (disc > 0) {
    const w = Math.sqrt(disc);
    let j = Math.sqrt(((v + y * (x - c)) ** 2) / (w * w + EPS) + (x - c) ** 2);
    const p = Math.atan((v + (x - c) * y) / (-(x - c) * w + EPS));
    j = x - c > 0 ? j : -j;
    const eydt = Math.exp(-y * dt);
    s.x = j * eydt * Math.cos(w * dt + p) + c;
    s.v = -y * j * eydt * Math.cos(w * dt + p) - w * j * eydt * Math.sin(w * dt + p);
  } else {
    const r = Math.sqrt(damping * damping - 4 * stiffness);
    const y0 = (damping + r) / 2;
    const y1 = (damping - r) / 2;
    const j1 = (c * y0 - x * y0 - v) / (y1 - y0);
    const j0 = x - j1 - c;
    const e0 = Math.exp(-y0 * dt);
    const e1 = Math.exp(-y1 * dt);
    s.x = j0 * e0 + j1 * e1 + c;
    s.v = -y0 * j0 * e0 - y1 * j1 * e1;
  }
  return s;
}

/** Scalar critically damped follower. */
export class Spring {
  /** @param {number} [value] @param {number} [halflife] seconds */
  constructor(value = 0, halflife = 0.15) {
    this.halflife = halflife;
    this.x = value;
    this.v = 0;
    this.target = value;
  }
  /** @param {number} dt @param {number} [target] @returns {number} */
  update(dt, target = this.target) {
    this.target = target;
    criticalSpring(this, target, this.halflife, dt);
    return this.x;
  }
  /** @param {number} value */
  snap(value) {
    this.x = this.target = value;
    this.v = 0;
  }
}

/** Under-damped scalar spring parameterised by frequency (Hz) and damping ratio (0..1 bouncy, 1 critical). */
export class BouncySpring {
  /** @param {number} [value] @param {number} [hz] @param {number} [ratio] */
  constructor(value = 0, hz = 2, ratio = 0.4) {
    this.hz = hz;
    this.ratio = ratio;
    this.x = value;
    this.v = 0;
    this.target = value;
  }
  /** @param {number} dt @param {number} [target] @returns {number} */
  update(dt, target = this.target) {
    this.target = target;
    const k = frequencyToStiffness(this.hz);
    const d = 2 * this.ratio * Math.sqrt(k);
    dampedSpring(this, target, k, d, dt);
    return this.x;
  }
}

/** Vector3 critically damped follower (independent per component). */
export class SpringVec3 {
  /** @param {THREE.Vector3} [value] @param {number} [halflife] */
  constructor(value, halflife = 0.15) {
    this.halflife = halflife;
    this.x = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.target = new THREE.Vector3();
    /** @type {SpringState} */
    this._s = { x: 0, v: 0 };
    if (value) this.snap(value);
  }
  /** @param {number} dt @param {THREE.Vector3} [target] @returns {THREE.Vector3} */
  update(dt, target) {
    if (target) this.target.copy(target);
    for (const k of /** @type {const} */ (['x', 'y', 'z'])) {
      this._s.x = this.x[k];
      this._s.v = this.v[k];
      criticalSpring(this._s, this.target[k], this.halflife, dt);
      this.x[k] = this._s.x;
      this.v[k] = this._s.v;
    }
    return this.x;
  }
  /** @param {THREE.Vector3} value */
  snap(value) {
    this.x.copy(value);
    this.target.copy(value);
    this.v.set(0, 0, 0);
  }
}

/**
 * Quaternion critically damped follower. Velocity `w` is an angular velocity vector (rad/s, scaled axis).
 */
export class SpringQuat {
  /** @param {THREE.Quaternion} [value] @param {number} [halflife] */
  constructor(value, halflife = 0.15) {
    this.halflife = halflife;
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();
    this.target = new THREE.Quaternion();
    if (value) this.snap(value);
  }
  /** @param {number} dt @param {THREE.Quaternion} [target] @returns {THREE.Quaternion} */
  update(dt, target) {
    if (target) this.target.copy(target);
    const y = halflifeToDamping(this.halflife) / 2;
    // j0 = log(q * inv(goal)) as scaled axis
    _qa.copy(this.q).multiply(_qb.copy(this.target).invert());
    quatAlign(_qa, _qi);
    const j0 = quatToScaledAxis(_qa, _va);
    const j1 = _vb.copy(this.w).addScaledVector(j0, y);
    const eydt = Math.exp(-y * dt);
    const nx = _vc.copy(j0).addScaledVector(j1, dt).multiplyScalar(eydt);
    scaledAxisToQuat(nx, _qa);
    this.q.copy(_qa).multiply(this.target).normalize();
    this.w.addScaledVector(j1, -y * dt).multiplyScalar(eydt);
    return this.q;
  }
  /** @param {THREE.Quaternion} value */
  snap(value) {
    this.q.copy(value);
    this.target.copy(value);
    this.w.set(0, 0, 0);
  }
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _vc = new THREE.Vector3();
