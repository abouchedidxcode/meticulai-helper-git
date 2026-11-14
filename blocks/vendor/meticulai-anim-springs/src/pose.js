/**
 * Bone poses: local rotations (and optional local positions) keyed by bone name, plus the
 * operations layered animation needs: capture, apply, blend, additive difference, distance and
 * pose-matched entry search for crossfades.
 */
import * as THREE from 'three';
import { quatAngle, quatAlign, RAD } from './math.js';

/** @typedef {Map<string, THREE.Object3D>} BoneMap */

/**
 * Collect named bones (or any Object3D accepted by `filter`) under `root` into a map.
 * @param {THREE.Object3D} root @param {(o: THREE.Object3D) => boolean} [filter] @returns {BoneMap}
 */
export function collectBones(root, filter) {
  const m = new Map();
  root.traverse((o) => {
    if (o.name && (filter ? filter(o) : o.isBone)) m.set(o.name, o);
  });
  return m;
}

export class Pose {
  constructor() {
    /** @type {Map<string, THREE.Quaternion>} */
    this.rot = new Map();
    /** @type {Map<string, THREE.Vector3>} */
    this.pos = new Map();
  }

  /** @param {Iterable<string>} names @returns {Pose} */
  static identity(names) {
    const p = new Pose();
    for (const n of names) p.rot.set(n, new THREE.Quaternion());
    return p;
  }

  /** Captures the current local transforms of the given bones. @param {BoneMap} bones @param {boolean} [withPositions] */
  static capture(bones, withPositions = false) {
    const p = new Pose();
    for (const [n, b] of bones) {
      p.rot.set(n, b.quaternion.clone());
      if (withPositions) p.pos.set(n, b.position.clone());
    }
    return p;
  }

  clone() {
    return new Pose().copy(this);
  }

  /** @param {Pose} o @returns {this} */
  copy(o) {
    for (const [n, q] of o.rot) (this.rot.get(n) ?? setQ(this.rot, n)).copy(q);
    for (const [n, v] of o.pos) (this.pos.get(n) ?? setV(this.pos, n)).copy(v);
    return this;
  }

  /** @param {BoneMap} bones @param {number} [weight] */
  applyTo(bones, weight = 1) {
    for (const [n, q] of this.rot) {
      const b = bones.get(n);
      if (!b) continue;
      if (weight >= 1) b.quaternion.copy(q);
      else b.quaternion.slerp(q, weight);
    }
    for (const [n, v] of this.pos) {
      const b = bones.get(n);
      if (!b) continue;
      if (weight >= 1) b.position.copy(v);
      else b.position.lerp(v, weight);
    }
  }

  /** this = slerp(a, b, w) per bone (bones missing from one side take the other). @param {Pose} a @param {Pose} b @param {number} w */
  blend(a, b, w) {
    // `this` may alias `a` or `b`: read both inputs into temporaries before writing.
    for (const [n, qa] of a.rot) {
      const qb = b.rot.get(n);
      const out = this.rot.get(n) ?? setQ(this.rot, n);
      if (!qb) {
        out.copy(qa);
        continue;
      }
      _q.copy(qb);
      quatAlign(_q, qa);
      _q2.copy(qa).slerp(_q, w);
      out.copy(_q2);
    }
    for (const [n, qb] of b.rot) if (!a.rot.has(n)) (this.rot.get(n) ?? setQ(this.rot, n)).copy(qb);
    for (const [n, va] of a.pos) {
      const vb = b.pos.get(n);
      _v.copy(va);
      if (vb) _v.lerp(vb, w);
      (this.pos.get(n) ?? setV(this.pos, n)).copy(_v);
    }
    return this;
  }

  /**
   * Adds an additive pose: rot = rot * slerp(identity, delta, w * mask[bone]).
   * `delta` is a pose of local rotation offsets (see Pose.difference).
   * @param {Pose} delta @param {number} [w] @param {Record<string, number>} [mask]
   */
  addAdditive(delta, w = 1, mask) {
    if (w === 0) return this;
    for (const [n, d] of delta.rot) {
      const m = mask ? (mask[n] ?? 0) : 1;
      if (m === 0) continue;
      const q = this.rot.get(n);
      if (!q) continue;
      _q.identity().slerp(quatAlign(_q2.copy(d), _q), w * m);
      q.multiply(_q);
    }
    for (const [n, d] of delta.pos) {
      const m = mask ? (mask[n] ?? 0) : 1;
      const v = this.pos.get(n);
      if (v && m) v.addScaledVector(d, w * m);
    }
    return this;
  }

  /** delta such that reference * delta = pose (per bone, local). @param {Pose} pose @param {Pose} reference */
  static difference(pose, reference) {
    const d = new Pose();
    for (const [n, q] of pose.rot) {
      const r = reference.rot.get(n);
      d.rot.set(n, r ? r.clone().invert().multiply(q) : q.clone());
    }
    for (const [n, v] of pose.pos) {
      const r = reference.pos.get(n);
      d.pos.set(n, r ? v.clone().sub(r) : v.clone());
    }
    return d;
  }

  /** Largest per-bone rotation difference to another pose, in degrees. @param {Pose} o @returns {{bone: string, deg: number}} */
  maxAngleTo(o) {
    let best = { bone: '', deg: 0 };
    for (const [n, q] of this.rot) {
      const p = o.rot.get(n);
      if (!p) continue;
      const deg = quatAngle(q, p) * RAD;
      if (deg > best.deg) best = { bone: n, deg };
    }
    return best;
  }

  /** Weighted sum of squared rotation differences (radians^2); weights default to 1. @param {Pose} o @param {Record<string, number>} [weights] */
  distance(o, weights) {
    let s = 0;
    for (const [n, q] of this.rot) {
      const p = o.rot.get(n);
      if (!p) continue;
      const a = quatAngle(q, p);
      s += (weights?.[n] ?? 1) * a * a;
    }
    return s;
  }
}

/**
 * Pose-matched entry: returns the time in [t0, t1] whose pose is closest to `current`
 * (sampled every `step` seconds). Crossfading from there instead of t=0 removes most of the
 * pose gap before blending even starts.
 * @param {(t: number, out: Pose) => void} sample @param {Pose} current @param {number} t0 @param {number} t1
 * @param {number} [step] @param {Record<string, number>} [weights]
 * @returns {{ time: number, distance: number }}
 */
export function findBestEntryTime(sample, current, t0, t1, step = 1 / 30, weights) {
  const tmp = current.clone();
  let best = { time: t0, distance: Infinity };
  for (let t = t0; t <= t1 + 1e-9; t += step) {
    sample(t, tmp);
    const d = current.distance(tmp, weights);
    if (d < best.distance) best = { time: t, distance: d };
  }
  return best;
}

function setQ(m, n) {
  const q = new THREE.Quaternion();
  m.set(n, q);
  return q;
}
function setV(m, n) {
  const v = new THREE.Vector3();
  m.set(n, v);
  return v;
}
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
