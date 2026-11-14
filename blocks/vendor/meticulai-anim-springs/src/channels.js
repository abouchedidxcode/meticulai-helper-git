/**
 * Channels: a flat Float32Array of named animation controls (scalars and small vectors), e.g.
 * `lean`, `handR` (xyz), `curlR`. Timelines key channels, the inertializer smooths transitions
 * between them, and a rig solver turns them into bone rotations. Working on channels instead of
 * bone quaternions keeps authoring readable (hand positions in meters, lean in radians) and keeps
 * IK targets moving along straight, natural paths while blending.
 */

/** @typedef {Record<string, number | readonly number[]>} ChannelSpec */
/** @typedef {Record<string, number | readonly number[]>} ChannelValues */

export class ChannelLayout {
  /** @param {ChannelSpec} spec name -> default value (number) or default vector (array) */
  constructor(spec) {
    this.spec = spec;
    /** @type {Map<string, number>} */
    this._offsets = new Map();
    /** @type {Map<string, number>} */
    this._widths = new Map();
    /** Per-component labels, e.g. handR.x, for debugging and metrics. @type {string[]} */
    this.componentNames = [];
    let i = 0;
    const defaults = [];
    /** @type {string[]} */
    this.names = Object.keys(spec);
    for (const name of this.names) {
      const v = spec[name];
      const arr = typeof v === 'number' ? [v] : [...v];
      this._offsets.set(name, i);
      this._widths.set(name, arr.length);
      arr.forEach((x, k) => {
        defaults.push(x);
        this.componentNames.push(arr.length === 1 ? name : `${name}.${'xyzw'[k] ?? k}`);
      });
      i += arr.length;
    }
    /** Number of floats in a channel buffer. */
    this.size = i;
    this._defaults = Float32Array.from(defaults);
  }

  has(name) {
    return this._offsets.has(name);
  }
  /** @param {string} name @returns {number} */
  index(name) {
    const o = this._offsets.get(name);
    if (o === undefined) throw new Error(`unknown channel "${name}"`);
    return o;
  }
  /** @param {string} name @returns {number} */
  width(name) {
    return this._widths.get(name) ?? 0;
  }
  /** A fresh buffer holding the defaults. @returns {Float32Array} */
  create() {
    return this._defaults.slice();
  }
  defaults() {
    return this._defaults;
  }
  /** @param {ArrayLike<number>} values @param {string} name */
  get(values, name) {
    return values[this.index(name)];
  }
  /** @param {ArrayLike<number>} values @param {string} name @param {{x:number,y:number,z:number}} out */
  getVec(values, name, out) {
    const i = this.index(name);
    out.x = values[i];
    out.y = values[i + 1];
    out.z = values[i + 2];
    return out;
  }
  /** @param {Float32Array} values @param {string} name @param {number | readonly number[]} v */
  set(values, name, v) {
    const i = this.index(name);
    if (typeof v === 'number') values[i] = v;
    else for (let k = 0; k < v.length; k++) values[i + k] = v[k];
  }
  /** Writes a partial set of named values into `values`. @param {Float32Array} values @param {ChannelValues} partial */
  assign(values, partial) {
    for (const k in partial) this.set(values, k, partial[k]);
    return values;
  }
  /** Reads every channel into a plain object (debugging / snapshots). @param {ArrayLike<number>} values */
  toObject(values) {
    /** @type {Record<string, number | number[]>} */
    const o = {};
    for (const n of this.names) {
      const i = this.index(n), w = this.width(n);
      o[n] = w === 1 ? values[i] : Array.from({ length: w }, (_, k) => values[i + k]);
    }
    return o;
  }
}
