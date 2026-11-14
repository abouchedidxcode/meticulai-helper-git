/**
 * Smoothness metrics: record bone rotations (and effector positions) every frame, then compute
 * per-bone angular velocity, acceleration and jerk, and the pose delta at every transition.
 *
 * A "pop" shows up as a single frame whose rotation change is far larger than its neighbours'
 * (transition ratio >> 1) and as a jerk spike; smooth motion keeps both bounded.
 */
import * as THREE from 'three';
import { quatToScaledAxis, quatAlign, RAD } from './math.js';

/** @typedef {{ frame: number, t: number, label: string }} Transition */
/** @typedef {{ bone: string, maxVel: number, p95Vel: number, maxAcc: number, maxJerk: number, p99Jerk: number }} BoneStats  deg/s, deg/s^2, deg/s^3 */
/**
 * @typedef {object} TransitionStats
 * @property {string} label
 * @property {number} t
 * @property {number} deltaDeg largest single-bone rotation change in the transition frame (deg)
 * @property {string} bone
 * @property {number} neighbourDeg largest single-bone change in the 3 frames before/after (deg/frame)
 * @property {number} ratio deltaDeg / max(neighbourDeg, floor): ~1 means the transition frame looks like any other frame
 * @property {number} velJumpDegS largest change in angular velocity across the transition frame (deg/s)
 */
/** @typedef {{ name: string, maxSpeed: number, maxAcc: number, maxJerk: number, p99Jerk: number }} EffectorStats  m/s, m/s^2, m/s^3 */
/**
 * @typedef {object} MotionReport
 * @property {number} frames
 * @property {number} fps
 * @property {number} seconds
 * @property {BoneStats[]} bones
 * @property {TransitionStats[]} transitions
 * @property {EffectorStats[]} effectors
 * @property {{ vel: BoneStats, jerk: BoneStats, transition: TransitionStats | null }} worst
 */

export class MotionRecorder {
  /**
   * @param {{ name: string, obj: THREE.Object3D }[]} bones local rotations recorded
   * @param {{ name: string, obj: THREE.Object3D }[]} [effectors] world positions recorded
   * @param {number} [dt] fixed frame time
   */
  constructor(bones, effectors = [], dt = 1 / 60) {
    this.bones = bones;
    this.effectors = effectors;
    this.dt = dt;
    /** @type {Float32Array[]} per frame: 4 floats per bone (local) */
    this._rot = [];
    /** @type {Float32Array[]} per frame: 3 floats per effector (world) */
    this._eff = [];
    /** @type {Transition[]} */
    this.transitions = [];
    this._frame = 0;
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  /** Record the current state (call once per fixed-dt frame, after the rig is solved). */
  record() {
    const r = new Float32Array(this.bones.length * 4);
    this.bones.forEach((b, i) => {
      const q = b.obj.quaternion;
      r[i * 4] = q.x;
      r[i * 4 + 1] = q.y;
      r[i * 4 + 2] = q.z;
      r[i * 4 + 3] = q.w;
    });
    this._rot.push(r);
    const e = new Float32Array(this.effectors.length * 3);
    this.effectors.forEach((ef, i) => {
      ef.obj.getWorldPosition(this._v);
      e[i * 3] = this._v.x;
      e[i * 3 + 1] = this._v.y;
      e[i * 3 + 2] = this._v.z;
    });
    this._eff.push(e);
    this._frame++;
  }

  /** Marks that the frame about to be recorded is the first frame of a new clip/action. @param {string} label */
  markTransition(label) {
    this.transitions.push({ frame: this._frame, t: this._frame * this.dt, label });
  }

  get frameCount() {
    return this._frame;
  }

  /** Per-frame largest rotation change (deg) among bones accepted by `filter`. @param {(name: string) => boolean} [filter] @returns {number[]} */
  stepSeries(filter = () => true) {
    const out = [0];
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    for (let f = 1; f < this._rot.length; f++) {
      let m = 0;
      const p = this._rot[f - 1], c = this._rot[f];
      this.bones.forEach((b, i) => {
        if (!filter(b.name)) return;
        qa.set(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3]);
        qb.set(c[i * 4], c[i * 4 + 1], c[i * 4 + 2], c[i * 4 + 3]);
        m = Math.max(m, qa.angleTo(qb) * RAD);
      });
      out.push(m);
    }
    return out;
  }

  /** World position history of an effector (for path overlays). @param {string} name @returns {THREE.Vector3[]} */
  path(name) {
    const i = this.effectors.findIndex((e) => e.name === name);
    return this._eff.map((f) => new THREE.Vector3(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]));
  }

  /**
   * @param {{ floorDeg?: number, transitionBones?: (name: string) => boolean, from?: number, to?: number }} [opts]
   *   transitionBones: only these bones count for transition deltas (e.g. exclude eyes and
   *   fingers whose fast motion is intentional).
   * @returns {MotionReport}
   */
  analyze(opts = {}) {
    const dt = this.dt;
    const all = this._rot;
    const from = Math.max(0, opts.from ?? 0), to = Math.min(all.length, opts.to ?? all.length);
    const rotFrames = all.slice(from, to);
    const n = rotFrames.length;
    const floor = opts.floorDeg ?? 0.25;
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    const w = new THREE.Vector3();
    // Angular velocity per bone per frame (deg/s vectors) and per-frame angle change (deg).
    const vel = this.bones.map(() => /** @type {THREE.Vector3[]} */ ([]));
    const step = this.bones.map(() => /** @type {number[]} */ ([]));
    for (let f = 1; f < n; f++) {
      for (let b = 0; b < this.bones.length; b++) {
        const p = rotFrames[f - 1], c = rotFrames[f];
        qa.set(p[b * 4], p[b * 4 + 1], p[b * 4 + 2], p[b * 4 + 3]);
        qb.set(c[b * 4], c[b * 4 + 1], c[b * 4 + 2], c[b * 4 + 3]);
        // local angular velocity: delta = inv(prev) * cur
        const d = this._q.copy(qa).invert().multiply(qb);
        quatAlign(d, new THREE.Quaternion());
        quatToScaledAxis(d, w);
        const v = w.clone().multiplyScalar(RAD / dt);
        vel[b].push(v);
        step[b].push(w.length() * RAD);
      }
    }
    const bones = this.bones.map((bone, b) => {
      const vs = vel[b];
      const speeds = vs.map((v) => v.length());
      const acc = [];
      for (let i = 1; i < vs.length; i++) acc.push(vs[i].clone().sub(vs[i - 1]).divideScalar(dt));
      const jerk = [];
      for (let i = 1; i < acc.length; i++) jerk.push(acc[i].clone().sub(acc[i - 1]).length() / dt);
      return {
        bone: bone.name,
        maxVel: max(speeds),
        p95Vel: percentile(speeds, 0.95),
        maxAcc: max(acc.map((a) => a.length())),
        maxJerk: max(jerk),
        p99Jerk: percentile(jerk, 0.99),
      };
    });

    const transitions = this.transitions
      .map((tr) => ({ ...tr, frame: tr.frame - from }))
      .filter((tr) => tr.frame >= 4 && tr.frame < n - 4)
      .map((tr) => {
        // step index s corresponds to the change from frame s to s+1; the transition frame's
        // change is (tr.frame-1 -> tr.frame) = step[tr.frame - 1].
        const k = tr.frame - 1;
        let delta = 0, bone = '', neigh = 0, velJump = 0;
        for (let b = 0; b < this.bones.length; b++) {
          if (opts.transitionBones && !opts.transitionBones(this.bones[b].name)) continue;
          const s = step[b];
          if (s[k] > delta) {
            delta = s[k];
            bone = this.bones[b].name;
          }
          for (const j of [k - 3, k - 2, k - 1, k + 1, k + 2, k + 3]) if (j >= 0 && j < s.length) neigh = Math.max(neigh, s[j]);
          if (k >= 1) velJump = Math.max(velJump, vel[b][k].clone().sub(vel[b][k - 1]).length());
        }
        return { label: tr.label, t: tr.t, deltaDeg: delta, bone, neighbourDeg: neigh, ratio: delta / Math.max(neigh, floor), velJumpDegS: velJump };
      });

    const effectors = this.effectors.map((ef, i) => {
      const pos = this._eff.slice(from, to).map((f) => new THREE.Vector3(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]));
      const v = [];
      for (let k = 1; k < pos.length; k++) v.push(pos[k].clone().sub(pos[k - 1]).divideScalar(dt));
      const a = [];
      for (let k = 1; k < v.length; k++) a.push(v[k].clone().sub(v[k - 1]).divideScalar(dt));
      const j = [];
      for (let k = 1; k < a.length; k++) j.push(a[k].clone().sub(a[k - 1]).length() / dt);
      return {
        name: ef.name,
        maxSpeed: max(v.map((x) => x.length())),
        maxAcc: max(a.map((x) => x.length())),
        maxJerk: max(j),
        p99Jerk: percentile(j, 0.99),
      };
    });

    const byVel = [...bones].sort((x, y) => y.maxVel - x.maxVel)[0];
    const byJerk = [...bones].sort((x, y) => y.p99Jerk - x.p99Jerk)[0];
    const worstT = [...transitions].sort((x, y) => y.ratio - x.ratio)[0] ?? null;
    return {
      frames: n,
      fps: 1 / dt,
      seconds: n * dt,
      bones,
      transitions,
      effectors,
      worst: { vel: byVel, jerk: byJerk, transition: worstT },
    };
  }
}

/** @param {number[]} xs */
export function max(xs) {
  let m = 0;
  for (const x of xs) if (x > m) m = x;
  return m;
}

/** @param {number[]} xs @param {number} p 0..1 */
export function percentile(xs, p) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

/** Mean distance (m) between two paths resampled to the same number of points. @param {THREE.Vector3[]} a @param {THREE.Vector3[]} b */
export function pathDistance(a, b, samples = 64) {
  if (!a.length || !b.length) return 0;
  let s = 0;
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    s += a[Math.round(u * (a.length - 1))].distanceTo(b[Math.round(u * (b.length - 1))]);
  }
  return s / samples;
}
