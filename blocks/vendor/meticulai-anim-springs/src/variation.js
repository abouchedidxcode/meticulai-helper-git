/**
 * Variation: never the same thing twice in a row, and never quite the same even when it is.
 *
 *  - VariationPicker: weighted choice among variants that excludes the last `avoid` picks
 *    (default 1: never the same variant back-to-back) and gently favours the least recently used.
 *  - Jitter: seeded perturbation of timings, amplitudes and positions for each performance.
 */

/** @template T @typedef {{ value: T, weight?: number }} Variant */

/** @template T */
export class VariationPicker {
  /**
   * @param {readonly (T | Variant<T>)[]} items plain values, or { value, weight }
   * @param {import('./noise.js').Rng} rng
   * @param {number} [avoid] how many recent picks are excluded (use 2 once there are 4+ variants)
   */
  constructor(items, rng, avoid = 1) {
    this._rng = rng;
    this._avoid = avoid;
    /** @type {number[]} */
    this._history = [];
    /** @type {Variant<T>[]} */
    this._items = items.map((it) =>
      typeof it === 'object' && it !== null && 'value' in it ? /** @type {Variant<T>} */ (it) : { value: /** @type {T} */ (it) },
    );
  }

  get size() {
    return this._items.length;
  }
  /** Index of the last pick (-1 before the first). */
  get lastIndex() {
    return this._history.length ? this._history[this._history.length - 1] : -1;
  }

  /** @param {(v: T) => boolean} [filter] @returns {T} */
  next(filter) {
    return this._items[this.nextIndex(filter)].value;
  }

  /** @param {(v: T) => boolean} [filter] @returns {number} */
  nextIndex(filter) {
    const n = this._items.length;
    if (n === 0) throw new Error('VariationPicker: no variants');
    const window = Math.min(this._avoid, n - 1);
    const recent = new Set(this._history.slice(-window));
    let candidates = [...this._items.keys()].filter((i) => !recent.has(i) && (!filter || filter(this._items[i].value)));
    if (candidates.length === 0) candidates = [...this._items.keys()].filter((i) => i !== this.lastIndex || n === 1);
    // Favour variants that haven't been seen for a while (1x..2x weight by age).
    const age = (i) => {
      const k = this._history.lastIndexOf(i);
      return k < 0 ? this._history.length + 1 : this._history.length - k;
    };
    const weights = candidates.map((i) => (this._items[i].weight ?? 1) * (1 + Math.min(1, age(i) / (n + 1))));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this._rng.random() * total;
    let pick = candidates[candidates.length - 1];
    for (let k = 0; k < candidates.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        pick = candidates[k];
        break;
      }
    }
    this._history.push(pick);
    if (this._history.length > 32) this._history.shift();
    return pick;
  }
}

/**
 * @typedef {object} JitterOptions
 * @property {number} [time] relative timing jitter (0.08 = +-8%)
 * @property {number} [amp] relative amplitude jitter
 * @property {number} [tempo] global tempo factor applied by `t()`
 * @property {number} [gain] global amplitude factor applied by `a()`
 */

/** Per-performance jitter. Create one per action instance from a forked Rng. */
export class Jitter {
  /** @param {import('./noise.js').Rng} rng @param {JitterOptions} [opts] */
  constructor(rng, opts = {}) {
    this.rng = rng;
    this.time = opts.time ?? 0.08;
    this.amp = opts.amp ?? 0.12;
    this.tempo = opts.tempo ?? 1;
    this.gain = opts.gain ?? 1;
  }

  /** A duration/time jittered by +-time and scaled by 1/tempo. */
  t(x) {
    return (x * (1 + this.rng.signed(this.time))) / this.tempo;
  }
  /** An amplitude jittered by +-amp and scaled by gain. */
  a(x) {
    return x * (1 + this.rng.signed(this.amp)) * this.gain;
  }
  /** x +- abs. */
  n(x, abs) {
    return x + this.rng.signed(abs);
  }
  /** A vector with each component offset by up to +-abs (or per-axis amounts). @param {readonly number[]} x @param {number | readonly number[]} abs */
  v(x, abs) {
    return x.map((c, i) => c + this.rng.signed(typeof abs === 'number' ? abs : abs[i] ?? 0));
  }
  range(lo, hi) {
    return this.rng.range(lo, hi);
  }
  int(lo, hi) {
    return this.rng.int(lo, hi);
  }
  chance(p) {
    return this.rng.chance(p);
  }
  sign() {
    return this.rng.sign();
  }
  pick(items) {
    return this.rng.pick(items);
  }
}
