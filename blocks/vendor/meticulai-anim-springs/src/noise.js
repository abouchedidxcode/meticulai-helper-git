/**
 * Seeded randomness: a fast PRNG (mulberry32) plus smooth 1D value noise and fBm for breathing,
 * idle sway and tremor. Same seed -> same sequence, so captures and tests are reproducible.
 */

/**
 * mulberry32 (public domain): 32-bit state, good statistical quality for animation use. Returns [0,1).
 * @param {number} seed @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash -> [0,1). Stateless; used by value noise lattices. @param {number} n @param {number} [seed] */
export function hash1(n, seed = 0) {
  let h = (Math.imul(n | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hash a string to a 32-bit seed (FNV-1a). @param {string} s */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  /** @param {number} [seed] */
  constructor(seed = 1) {
    this.seed = seed;
    this._next = mulberry32(seed);
  }
  /** [0,1) */
  random() {
    return this._next();
  }
  range(lo, hi) {
    return lo + (hi - lo) * this._next();
  }
  /** Integer in [lo, hi] inclusive. */
  int(lo, hi) {
    return Math.floor(this.range(lo, hi + 1));
  }
  /** +-amount around 0 */
  signed(amount = 1) {
    return (this._next() * 2 - 1) * amount;
  }
  /** @param {number} p */
  chance(p) {
    return this._next() < p;
  }
  /** @returns {1 | -1} */
  sign() {
    return this._next() < 0.5 ? -1 : 1;
  }
  /** @template T @param {readonly T[]} items @returns {T} */
  pick(items) {
    return items[Math.floor(this._next() * items.length) % items.length];
  }
  /** Approximately normal (Irwin-Hall with 4 samples), mean 0, std ~1. */
  gauss() {
    return (this._next() + this._next() + this._next() + this._next() - 2) * Math.sqrt(3);
  }
  /** A child generator with an independent stream (for per-system determinism). @param {number | string} salt @returns {Rng} */
  fork(salt) {
    const s = typeof salt === 'string' ? hashString(salt) : salt;
    return new Rng((Math.imul(this.seed ^ 0x9e3779b9, 0x85ebca6b) ^ s) >>> 0);
  }
}

/** Smooth 1D value noise in [-1,1] with quintic interpolation (C2 continuous). @param {number} x @param {number} [seed] */
export function valueNoise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash1(i, seed) * 2 - 1;
  const b = hash1(i + 1, seed) * 2 - 1;
  return a + (b - a) * u;
}

/** Fractal (fBm) value noise in roughly [-1,1]. */
export function fbm1(x, seed = 0, octaves = 3, lacunarity = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise1(x * f, seed + o * 1013);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** A named noise channel: call `at(t)` with time in seconds. */
export class Noise1 {
  /** @param {number} seed @param {number} [hz] @param {number} [amp] @param {number} [octaves] */
  constructor(seed, hz = 0.3, amp = 1, octaves = 2) {
    this.seed = seed;
    this.hz = hz;
    this.amp = amp;
    this.octaves = octaves;
  }
  /** @param {number} t seconds */
  at(t) {
    return fbm1(t * this.hz, this.seed, this.octaves) * this.amp;
  }
}
