/**
 * Inverse kinematics and aiming helpers that work on any three.js bone hierarchy, whatever its
 * local axis conventions (axes are measured from the bind pose when the solver is created).
 *
 *  - TwoBoneIK: analytic arm/leg solver with a pole target and soft reach (no elbow snap at full
 *    extension). The upper bone's twist comes from the bend plane, so there is no drift.
 *  - lookAngles / aimBone: yaw/pitch of a target relative to a reference frame, and a clamped,
 *    weighted single-bone aim.
 */
import * as THREE from 'three';
import { clamp, quatFromFrames } from './math.js';

/**
 * @typedef {object} TwoBoneSolveOptions
 * @property {number} [weight] 0..1 blend between the incoming (FK) rotations and the IK result
 * @property {number} [softness] distance (m) over which reach is softened near full extension; 0 disables. Default 0.015
 */

export class TwoBoneIK {
  /**
   * @param {THREE.Object3D} upper e.g. upper arm / thigh
   * @param {THREE.Object3D} lower e.g. forearm / shin
   * @param {THREE.Object3D} end e.g. hand / foot (its position is the tip)
   * @param {THREE.Vector3} bendHint world direction the middle joint points toward in the bind pose
   *   (elbows point back: (0,0,-1) for a character facing +Z; knees point forward).
   */
  constructor(upper, lower, end, bendHint) {
    this.upper = upper;
    this.lower = lower;
    this.end = end;
    // Bone-to-child directions and hinge axes in each bone's local frame (from the bind pose).
    this._upperAxis = new THREE.Vector3();
    this._upperHinge = new THREE.Vector3();
    this._lowerAxis = new THREE.Vector3();
    this._lowerHinge = new THREE.Vector3();
    /** Last solve's reach ratio (distance / max reach), for diagnostics. */
    this.reach = 0;
    upper.updateWorldMatrix(true, true);
    const a = upper.getWorldPosition(new THREE.Vector3());
    const b = lower.getWorldPosition(new THREE.Vector3());
    const c = end.getWorldPosition(new THREE.Vector3());
    this.upperLen = a.distanceTo(b);
    this.lowerLen = b.distanceTo(c);
    const dirU = b.clone().sub(a).normalize();
    const dirL = c.clone().sub(b).normalize();
    // Hinge axis: perpendicular to the limb and the direction the joint bends toward.
    const chain = c.clone().sub(a).normalize();
    const pole = bendHint.clone().sub(chain.clone().multiplyScalar(bendHint.dot(chain))).normalize();
    const hinge = new THREE.Vector3().crossVectors(chain, pole).normalize();
    const qU = upper.getWorldQuaternion(new THREE.Quaternion()).invert();
    const qL = lower.getWorldQuaternion(new THREE.Quaternion()).invert();
    this._upperAxis.copy(dirU).applyQuaternion(qU);
    this._upperHinge.copy(hinge).applyQuaternion(qU);
    this._lowerAxis.copy(dirL).applyQuaternion(qL);
    this._lowerHinge.copy(hinge).applyQuaternion(qL);
  }

  /**
   * Places `end` at `target` (world), bending toward `pole` (world point). Call after the
   * parents of `upper` are posed; world matrices are updated here.
   * @param {THREE.Vector3} target @param {THREE.Vector3} pole @param {TwoBoneSolveOptions} [opts]
   */
  solve(target, pole, opts = {}) {
    const weight = opts.weight ?? 1;
    const softness = opts.softness ?? 0.015;
    if (weight <= 0) return;
    const { upper, lower } = this;
    upper.updateWorldMatrix(true, false);
    const a = upper.getWorldPosition(_a);
    const lab = this.upperLen, lcb = this.lowerLen;
    const maxReach = lab + lcb;
    const minReach = Math.abs(lab - lcb) + 1e-3;

    const toT = _d.copy(target).sub(a);
    let dist = toT.length();
    if (dist < 1e-6) {
      toT.set(0, -1, 0);
      dist = 1e-6;
    }
    const dir = toT.divideScalar(dist);
    // Soft IK: approach full extension asymptotically (Dunn's soft IK).
    let d = dist;
    const ds = maxReach - softness;
    if (softness > 0 && d > ds) d = ds + softness * (1 - Math.exp(-(d - ds) / softness));
    d = clamp(d, minReach, maxReach * 0.9999);
    this.reach = dist / maxReach;

    const toP = _p.copy(pole).sub(a);
    const poleDir = toP.addScaledVector(dir, -toP.dot(dir));
    if (poleDir.lengthSq() < 1e-10) poleDir.set(0, -1, 0).addScaledVector(dir, -dir.y);
    poleDir.normalize();

    const cosA = clamp((lab * lab + d * d - lcb * lcb) / (2 * lab * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const elbow = _e.copy(a).addScaledVector(dir, lab * cosA).addScaledVector(poleDir, lab * sinA);
    const wrist = _w.copy(a).addScaledVector(dir, d);
    const hinge = _h.crossVectors(dir, poleDir).normalize();

    // Upper bone world rotation from (axis -> elbow dir, hinge -> hinge).
    const upDir = _u.copy(elbow).sub(a).normalize();
    quatFromFrames(this._upperAxis, this._upperHinge, upDir, hinge, _qw);
    setWorldQuaternion(upper, _qw, weight);
    upper.updateWorldMatrix(false, false);
    lower.updateWorldMatrix(false, false);

    const loDir = _u.copy(wrist).sub(lower.getWorldPosition(_l)).normalize();
    quatFromFrames(this._lowerAxis, this._lowerHinge, loDir, hinge, _qw);
    setWorldQuaternion(lower, _qw, weight);
    lower.updateWorldMatrix(false, true);
  }
}

/**
 * Sets a bone's world rotation (keeping its parent), optionally blended by weight.
 * @param {THREE.Object3D} bone @param {THREE.Quaternion} world @param {number} [weight]
 */
export function setWorldQuaternion(bone, world, weight = 1) {
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(_qp) : _qp.identity();
  const local = _ql.copy(parentQ).invert().multiply(world);
  if (weight >= 1) bone.quaternion.copy(local);
  else bone.quaternion.slerp(local, weight);
}

/**
 * Yaw (around the frame's up) and pitch (positive = up) of `target` seen from `from`, in the
 * frame `frame` (world rotation whose +Z is "forward" and +Y is "up").
 * @param {THREE.Vector3} from @param {THREE.Quaternion} frame @param {THREE.Vector3} target
 * @param {{ yaw: number, pitch: number }} [out]
 */
export function lookAngles(from, frame, target, out = { yaw: 0, pitch: 0 }) {
  const d = _d.copy(target).sub(from).applyQuaternion(_qp.copy(frame).invert());
  out.yaw = Math.atan2(d.x, d.z);
  out.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  return out;
}

/**
 * @typedef {object} AimOptions
 * @property {THREE.Vector3} forward bone-local axis that should point at the target (e.g. the face's forward)
 * @property {number} [weight]
 * @property {number} [maxAngle] max rotation away from the incoming pose (radians)
 */

/** Rotates a single bone so its local `forward` axis points at `target` (world), clamped. @param {THREE.Object3D} bone @param {THREE.Vector3} target @param {AimOptions} opts */
export function aimBone(bone, target, opts) {
  bone.updateWorldMatrix(true, false);
  const pos = bone.getWorldPosition(_a);
  const wq = bone.getWorldQuaternion(_qw);
  const cur = _u.copy(opts.forward).applyQuaternion(wq).normalize();
  const want = _d.copy(target).sub(pos).normalize();
  const delta = _ql.setFromUnitVectors(cur, want);
  if (opts.maxAngle !== undefined) {
    const ang = 2 * Math.acos(clamp(delta.w, -1, 1));
    if (ang > opts.maxAngle) {
      const k = opts.maxAngle / ang;
      delta.slerpQuaternions(_qp.identity(), delta.clone(), k);
    }
  }
  const newWorld = _qw.premultiply(delta);
  setWorldQuaternion(bone, newWorld, opts.weight ?? 1);
}

const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();
const _u = new THREE.Vector3();
const _l = new THREE.Vector3();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _ql = new THREE.Quaternion();
