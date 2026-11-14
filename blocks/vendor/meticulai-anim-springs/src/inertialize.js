/**
 * Inertialization: transitions without crossfades.
 *
 * At a transition we record the offset between where the character *was* (the last output) and
 * where the new animation *starts*, for both value and velocity. That offset is then decayed to
 * zero with a critically damped spring while the new animation plays underneath. Position and
 * velocity stay continuous (no pops, no velocity kinks), and only one animation is evaluated.
 * (The idea is from David Bollo's GDC 2018 talk "Inertialization", in the spring-based form
 * described by Daniel Holden.)
 */
import * as THREE from 'three';
import { decaySpring, criticalSpring } from './spring.js';
import { quatToScaledAxis, scaledAxisToQuat, quatAlign } from './math.js';

/** Inertializer over a flat channel buffer. */
export class ChannelInertializer {
  /** @param {number} size floats per frame @param {number} [halflife] seconds */
  constructor(size, halflife = 0.12) {
    this.size = size;
    this.halflife = halflife;
    this.offset = new Float32Array(size);
    this.offsetVel = new Float32Array(size);
    /** Last output and its velocity (tracked automatically by update()). */
    this.lastOut = new Float32Array(size);
    this.lastOutVel = new Float32Array(size);
    this._primed = false;
    this._s = { x: 0, v: 0 };
  }

  /**
   * Call when the source switches. `dst` / `dstVel` are the new source's values and velocity at
   * its start (velocity defaults to zero).
   * @param {ArrayLike<number>} dst @param {ArrayLike<number>} [dstVel] @param {number} [halflife]
   */
  transition(dst, dstVel, halflife) {
    if (halflife !== undefined) this.halflife = halflife;
    if (!this._primed) return;
    for (let i = 0; i < this.size; i++) {
      this.offset[i] = this.lastOut[i] - dst[i];
      this.offsetVel[i] = this.lastOutVel[i] - (dstVel ? dstVel[i] : 0);
    }
  }

  /** Decays the offset and writes input + offset into `out` (may alias `input`). @param {ArrayLike<number>} input @param {number} dt @param {Float32Array} out */
  update(input, dt, out) {
    const s = this._s;
    for (let i = 0; i < this.size; i++) {
      if (this.offset[i] !== 0 || this.offsetVel[i] !== 0) {
        s.x = this.offset[i];
        s.v = this.offsetVel[i];
        decaySpring(s, this.halflife, dt);
        if (Math.abs(s.x) < 1e-7 && Math.abs(s.v) < 1e-6) s.x = s.v = 0;
        this.offset[i] = s.x;
        this.offsetVel[i] = s.v;
      }
      const v = input[i] + this.offset[i];
      if (this._primed && dt > 0) this.lastOutVel[i] = (v - this.lastOut[i]) / dt;
      out[i] = v;
      this.lastOut[i] = v;
    }
    this._primed = true;
    return out;
  }

  /** Largest remaining offset (absolute), useful to know when a transition has settled. */
  get residual() {
    let m = 0;
    for (let i = 0; i < this.size; i++) m = Math.max(m, Math.abs(this.offset[i]));
    return m;
  }

  reset() {
    this.offset.fill(0);
    this.offsetVel.fill(0);
    this._primed = false;
  }
}

/**
 * Critically damped follower per channel: a tiny low-pass "muscle" filter. Fed a C1 curve
 * (keyframe splines), its output is C2 (continuous acceleration), which removes the jerk spikes
 * that splines have at every key. Half-life ~20-30 ms keeps the lag to a few centimetres.
 */
export class ChannelFollower {
  /** @param {number} size @param {number} [halflife] seconds */
  constructor(size, halflife = 0.025) {
    this.size = size;
    this.x = new Float32Array(size);
    this.v = new Float32Array(size);
    /** Per-channel half-life (s); defaults to the constructor value. */
    this.halflives = new Float32Array(size).fill(halflife);
    this._primed = false;
    this._s = { x: 0, v: 0 };
  }
  /** @param {ArrayLike<number>} input @param {number} dt @param {Float32Array} out */
  update(input, dt, out) {
    if (!this._primed) {
      for (let i = 0; i < this.size; i++) this.x[i] = input[i];
      this._primed = true;
    }
    const s = this._s;
    for (let i = 0; i < this.size; i++) {
      s.x = this.x[i];
      s.v = this.v[i];
      criticalSpring(s, input[i], this.halflives[i], dt);
      this.x[i] = s.x;
      this.v[i] = s.v;
      out[i] = s.x;
    }
    return out;
  }
  reset() {
    this._primed = false;
    this.v.fill(0);
  }
}

/** @typedef {{ rot: Map<string, THREE.Quaternion>, pos?: Map<string, THREE.Vector3> }} PoseLike */

/**
 * Inertializer over bone rotations (and positions). For clip-driven layers (glTF clips on an
 * imported model, or first-person hands): call `transition(newPose)` when switching clips, then
 * `apply(pose, dt)` every frame on the freshly sampled pose.
 */
export class PoseInertializer {
  /** @param {number} [halflife] seconds */
  constructor(halflife = 0.12) {
    this.halflife = halflife;
    this._offRot = new Map();
    this._offRotVel = new Map();
    this._offPos = new Map();
    this._offPosVel = new Map();
    this._lastRot = new Map();
    this._lastRotVel = new Map();
    this._lastPos = new Map();
    this._lastPosVel = new Map();
    this._s = { x: 0, v: 0 };
  }

  /**
   * @param {PoseLike} dst the new source's pose at its start
   * @param {{ rot?: Map<string, THREE.Vector3>, pos?: Map<string, THREE.Vector3> }} [dstVel]
   */
  transition(dst, dstVel) {
    for (const [name, q] of dst.rot) {
      const last = this._lastRot.get(name);
      if (!last) continue;
      // offset rotation such that out = off * dst == last
      _q.copy(last).multiply(_q2.copy(q).invert());
      quatAlign(_q, _qi);
      getOr(this._offRot, name).copy(quatToScaledAxis(_q, _v));
      const w = getOr(this._offRotVel, name).copy(this._lastRotVel.get(name) ?? _zero);
      const dv = dstVel?.rot?.get(name);
      if (dv) w.sub(dv);
    }
    if (dst.pos)
      for (const [name, p] of dst.pos) {
        const last = this._lastPos.get(name);
        if (!last) continue;
        getOr(this._offPos, name).copy(last).sub(p);
        const v = getOr(this._offPosVel, name).copy(this._lastPosVel.get(name) ?? _zero);
        const dv = dstVel?.pos?.get(name);
        if (dv) v.sub(dv);
      }
  }

  /** Applies the decaying offsets to `pose` in place and records the output. @param {PoseLike} pose @param {number} dt */
  apply(pose, dt) {
    for (const [name, q] of pose.rot) {
      const off = this._offRot.get(name);
      if (off) {
        const vel = this._offRotVel.get(name);
        this._decayVec(off, vel, dt);
        scaledAxisToQuat(off, _q);
        q.premultiply(_q).normalize();
      }
      const had = this._lastRot.has(name);
      const last = getOrQ(this._lastRot, name);
      const w = getOr(this._lastRotVel, name);
      if (dt > 0 && had) {
        _q.copy(q).multiply(_q2.copy(last).invert());
        quatAlign(_q, _qi);
        quatToScaledAxis(_q, w).divideScalar(dt);
      }
      last.copy(q);
    }
    if (pose.pos)
      for (const [name, p] of pose.pos) {
        const off = this._offPos.get(name);
        if (off) {
          this._decayVec(off, this._offPosVel.get(name), dt);
          p.add(off);
        }
        const last = getOr(this._lastPos, name);
        if (dt > 0) getOr(this._lastPosVel, name).copy(p).sub(last).divideScalar(dt);
        last.copy(p);
      }
    return pose;
  }

  _decayVec(x, v, dt) {
    const s = this._s;
    for (const k of ['x', 'y', 'z']) {
      s.x = x[k];
      s.v = v[k];
      decaySpring(s, this.halflife, dt);
      x[k] = s.x;
      v[k] = s.v;
    }
  }
}

function getOr(m, k) {
  let v = m.get(k);
  if (!v) m.set(k, (v = new THREE.Vector3()));
  return v;
}
function getOrQ(m, k) {
  let v = m.get(k);
  if (!v) m.set(k, (v = new THREE.Quaternion()));
  return v;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _zero = new THREE.Vector3();
