/**
 * Layered pose blending: one base layer (a clip or procedural pose source) plus any number of
 * additive layers (breathing, sway, look-at, recoil...), each with a smoothed weight and an
 * optional per-bone mask. Base transitions use inertialization by default, or a pose-matched
 * crossfade (the new source starts at the time whose pose best matches the current output).
 *
 *   const stack = new LayerStack(boneNames);
 *   stack.play(clipSource(clip), { mode: 'crossfade', fade: 0.25, matchPose: true });
 *   stack.addLayer({ name: 'breath', weight: 1, evaluate: (dt, t, out) => {...} });
 *   const pose = stack.update(dt); pose.applyTo(bones);
 */
import * as THREE from 'three';
import { Pose, findBestEntryTime } from './pose.js';
import { PoseInertializer } from './inertialize.js';
import { Spring } from './spring.js';
import { easings } from './easing.js';

/**
 * @typedef {object} PoseSource
 * @property {string} name
 * @property {number} duration seconds
 * @property {boolean} [loop]
 * @property {(t: number, out: Pose) => void} sample writes the pose at time t into `out` (only bones it animates)
 */
/**
 * @typedef {object} AdditiveLayer
 * @property {string} name
 * @property {number} weight target weight; the effective weight follows it on a spring (see fadeHalflife)
 * @property {number} [fadeHalflife] seconds, default 0.2
 * @property {Record<string, number>} [mask] per-bone multipliers (missing bones get 0); omit to affect every bone
 * @property {(dt: number, t: number, out: Pose) => void} evaluate writes local rotation *offsets* (identity = no change)
 */
/**
 * @typedef {object} PlayOptions
 * @property {'inertial' | 'crossfade' | 'cut'} [mode] default 'inertial'
 * @property {number} [fade] crossfade duration (s) or inertialization half-life (s)
 * @property {boolean} [matchPose] for crossfades: start the new source at its best-matching time
 * @property {[number, number]} [matchWindow] search window for matchPose (default: its first 40%)
 * @property {number} [rate]
 * @property {number} [startTime]
 */

export class LayerStack {
  /** @param {string[]} boneNames @param {{ halflife?: number, bindPose?: Pose }} [opts] */
  constructor(boneNames, opts = {}) {
    this.boneNames = boneNames;
    /** Every frame starts from this pose (bones a source doesn't animate stay here). */
    this.bindPose = opts.bindPose?.clone() ?? Pose.identity(boneNames);
    this.output = Pose.identity(boneNames);
    this._scratch = Pose.identity(boneNames);
    this._current = null;
    this._previous = null;
    this._fadeT = 0;
    this._fadeDur = 0;
    this._time = 0;
    this._inert = new PoseInertializer(opts.halflife ?? 0.12);
    /** @type {{ layer: AdditiveLayer, w: Spring, pose: Pose }[]} */
    this._layers = [];
  }

  /** @returns {PoseSource | null} */
  get playing() {
    return this._current?.source ?? null;
  }
  get sourceTime() {
    return this._current?.time ?? 0;
  }

  /**
   * Switch the base layer. Resolves when the source finishes (non-looping) or is replaced.
   * @param {PoseSource} source @param {PlayOptions} [opts] @returns {Promise<void>}
   */
  play(source, opts = {}) {
    const mode = opts.mode ?? 'inertial';
    let start = opts.startTime ?? 0;
    if (mode === 'crossfade' && opts.matchPose && this._current) {
      const [a, b] = opts.matchWindow ?? [0, source.duration * 0.4];
      start = findBestEntryTime((t, out) => source.sample(t, out), this.output, a, b).time;
    }
    if (this._current && !this._current.done) {
      this._current.done = true;
      this._current.resolve();
    }
    let resolve = () => {};
    const p = new Promise((r) => (resolve = r));
    const next = { source, time: start, rate: opts.rate ?? 1, resolve, done: false };
    if (mode === 'crossfade' && this._current) {
      this._previous = this._current;
      this._fadeT = 0;
      this._fadeDur = Math.max(1e-3, opts.fade ?? 0.25);
    } else {
      this._previous = null;
      this._fadeDur = 0;
    }
    if (mode === 'inertial' && this._current) {
      source.sample(start, this._scratch);
      this._inert.halflife = opts.fade ?? this._inert.halflife;
      this._inert.transition(this._scratch);
    }
    this._current = next;
    return p;
  }

  /** @param {AdditiveLayer} layer */
  addLayer(layer) {
    const w = new Spring(layer.weight, layer.fadeHalflife ?? 0.2);
    this._layers.push({ layer, w, pose: Pose.identity(this.boneNames) });
    return layer;
  }

  /** @param {string} name @param {number} weight @param {number} [fadeHalflife] */
  setLayerWeight(name, weight, fadeHalflife) {
    const s = this._layers.find((l) => l.layer.name === name);
    if (!s) return;
    s.layer.weight = weight;
    if (fadeHalflife !== undefined) s.w.halflife = fadeHalflife;
  }

  /** Current (smoothed) weight of a layer. @param {string} name */
  layerWeight(name) {
    return this._layers.find((l) => l.layer.name === name)?.w.x ?? 0;
  }

  /** @param {number} dt @returns {Pose} the output pose (reused every frame) */
  update(dt) {
    this._time += dt;
    this.output.copy(this.bindPose);
    const cur = this._current;
    if (cur) {
      cur.time += dt * cur.rate;
      const d = cur.source.duration;
      if (cur.source.loop && d > 0) cur.time %= d;
      else if (cur.time >= d && !cur.done) {
        cur.done = true;
        cur.resolve();
      }
      cur.source.sample(Math.min(cur.time, d), this.output);
      if (this._previous && this._fadeDur > 0) {
        this._fadeT += dt;
        const u = Math.min(1, this._fadeT / this._fadeDur);
        const w = easings.smootherstep(u);
        const prev = this._previous;
        prev.time += dt * prev.rate;
        if (prev.source.loop && prev.source.duration > 0) prev.time %= prev.source.duration;
        this._scratch.copy(this.bindPose);
        prev.source.sample(Math.min(prev.time, prev.source.duration), this._scratch);
        this.output.blend(this._scratch, this.output, w);
        if (u >= 1) this._previous = null;
      }
    }
    this._inert.apply(this.output, dt);
    for (const s of this._layers) {
      const w = s.w.update(dt, s.layer.weight);
      if (Math.abs(w) < 1e-4) continue;
      for (const q of s.pose.rot.values()) q.identity();
      for (const v of s.pose.pos.values()) v.set(0, 0, 0);
      s.layer.evaluate(dt, this._time, s.pose);
      this.output.addAdditive(s.pose, w, s.layer.mask);
    }
    return this.output;
  }
}

/**
 * Wraps a three.js AnimationClip (quaternion + position tracks named `<bone>.quaternion`) as a PoseSource.
 * @param {THREE.AnimationClip} clip @param {boolean} [loop] @returns {PoseSource}
 */
export function clipSource(clip, loop = false) {
  const tracks = clip.tracks.map((tr) => {
    const [bone, prop] = tr.name.split('.');
    // createInterpolant picks slerp for quaternion tracks.
    const interp = /** @type {any} */ (tr).createInterpolant();
    return { bone, prop, interp };
  });
  return {
    name: clip.name,
    duration: clip.duration,
    loop,
    sample(t, out) {
      for (const { bone, prop, interp } of tracks) {
        const r = interp.evaluate(t);
        if (prop === 'quaternion') {
          const q = out.rot.get(bone);
          if (q) q.set(r[0], r[1], r[2], r[3]).normalize();
        } else if (prop === 'position') {
          let v = out.pos.get(bone);
          if (!v) out.pos.set(bone, (v = new THREE.Vector3()));
          v.set(r[0], r[1], r[2]);
        }
      }
    },
  };
}
