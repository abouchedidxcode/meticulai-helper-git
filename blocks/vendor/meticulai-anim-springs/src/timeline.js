/**
 * Timeline / sequencer: keyframed channel tracks plus named events.
 *
 *   const tl = new Timeline(layout)
 *     .key(0.35, { handR: [0.1, 0.9, 0.3], curlR: 0.2 })            // smooth (C1 Hermite) by default
 *     .key(0.60, { handR: [0.1, 0.8, 0.4] }, { ease: 'outBack' })   // per-segment easing
 *     .key(0.80, { handR: [...] }, { vel: { handR: [0, 0.4, 2.1] } }) // explicit velocity at a key
 *     .event(0.62, 'release');
 *   tl.startFrom(currentValues);   // key 0 = the live pose, so the action starts where we are
 *
 * Interpolation of each segment is chosen by the key that ends it:
 *  - 'smooth' (default): cubic Hermite with shape-preserving tangents. Velocity is continuous
 *    through keys, a key that is a local extreme gets zero slope (no overshoot past it), and the
 *    first/last keys are eased in/out (zero slope) unless an explicit `vel` is given.
 *  - an easing name/function: lerp with that easing (zero slope at both ends for in-out easings).
 *  - 'linear' / 'step'.
 */
import { getEase } from './easing.js';

/** @typedef {import('./channels.js').ChannelValues} ChannelValues */
/** @typedef {'smooth' | 'linear' | 'step' | import('./easing.js').EaseName | import('./easing.js').EaseFn} Interp */
/**
 * @typedef {object} KeyOptions
 * @property {Interp} [ease] interpolation of the segment that arrives at this key
 * @property {ChannelValues} [vel] explicit slope (units per second) at this key for the listed channels
 * @property {boolean} [hold] force zero velocity at this key (a deliberate stop)
 */
/** @typedef {{ t: number, v: number, interp: Interp, slope?: number, hold: boolean }} Key */
/** @typedef {{ t: number, name: string, data?: any }} TimelineEvent */

export class Track {
  constructor() {
    /** @type {Key[]} */
    this.keys = [];
    /** @type {number[]} */
    this._tangents = [];
    this._dirty = true;
    this._cursor = 0;
  }

  /** @param {Key} k */
  add(k) {
    const i = this.keys.findIndex((x) => Math.abs(x.t - k.t) < 1e-6);
    if (i >= 0) this.keys[i] = k;
    else {
      this.keys.push(k);
      this.keys.sort((a, b) => a.t - b.t);
    }
    this._dirty = true;
  }

  get start() {
    return this.keys.length ? this.keys[0].t : 0;
  }
  get end() {
    return this.keys.length ? this.keys[this.keys.length - 1].t : 0;
  }

  /** @param {number} k */
  scaleTime(k) {
    for (const key of this.keys) {
      key.t *= k;
      if (key.slope !== undefined) key.slope /= k;
    }
    this._dirty = true;
  }

  _prepare() {
    const K = this.keys;
    const n = K.length;
    this._tangents = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const k = K[i];
      if (k.slope !== undefined) {
        this._tangents[i] = k.slope;
        continue;
      }
      if (k.hold || i === 0 || i === n - 1) continue;
      const next = K[i + 1];
      // Both neighbouring segments must be Hermite for a shared tangent to make sense.
      if (k.interp !== 'smooth' || next.interp !== 'smooth') continue;
      const prev = K[i - 1];
      const h0 = k.t - prev.t, h1 = next.t - k.t;
      if (h0 <= 0 || h1 <= 0) continue;
      const d0 = (k.v - prev.v) / h0;
      const d1 = (next.v - k.v) / h1;
      if (d0 * d1 <= 0) continue; // local extreme or flat: stop exactly on the key
      let m = (d0 * h1 + d1 * h0) / (h0 + h1);
      // Fritsch-Carlson style limiter: no overshoot inside the neighbouring segments.
      const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
      if (Math.abs(m) > lim) m = Math.sign(m) * lim;
      this._tangents[i] = m;
    }
    this._dirty = false;
  }

  _segment(t) {
    const K = this.keys;
    let i = Math.min(this._cursor, K.length - 2);
    if (i < 0) i = 0;
    while (i > 0 && t < K[i].t) i--;
    while (i < K.length - 2 && t >= K[i + 1].t) i++;
    this._cursor = i;
    return i;
  }

  /** @param {number} t @returns {number} */
  sample(t) {
    const K = this.keys;
    if (K.length === 0) return 0;
    if (t <= K[0].t) return K[0].v;
    if (t >= K[K.length - 1].t) return K[K.length - 1].v;
    if (this._dirty) this._prepare();
    const i = this._segment(t);
    const a = K[i], b = K[i + 1];
    const h = b.t - a.t;
    const s = h > 0 ? (t - a.t) / h : 1;
    switch (b.interp) {
      case 'step':
        return s < 1 ? a.v : b.v;
      case 'linear':
        return a.v + (b.v - a.v) * s;
      case 'smooth': {
        const m0 = this._tangents[i] * h, m1 = this._tangents[i + 1] * h;
        const s2 = s * s, s3 = s2 * s;
        return (2 * s3 - 3 * s2 + 1) * a.v + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * b.v + (s3 - s2) * m1;
      }
      default:
        return a.v + (b.v - a.v) * getEase(b.interp)(s);
    }
  }

  /** Slope (units per second) at time t. @param {number} t @returns {number} */
  derivative(t) {
    const K = this.keys;
    if (K.length < 2 || t < K[0].t || t > K[K.length - 1].t) return 0;
    if (this._dirty) this._prepare();
    const i = this._segment(t);
    const a = K[i], b = K[i + 1];
    const h = b.t - a.t;
    if (h <= 0) return 0;
    const s = (t - a.t) / h;
    switch (b.interp) {
      case 'step':
        return 0;
      case 'linear':
        return (b.v - a.v) / h;
      case 'smooth': {
        const m0 = this._tangents[i] * h, m1 = this._tangents[i + 1] * h;
        const s2 = s * s;
        return ((6 * s2 - 6 * s) * a.v + (3 * s2 - 4 * s + 1) * m0 + (-6 * s2 + 6 * s) * b.v + (3 * s2 - 2 * s) * m1) / h;
      }
      default: {
        const e = getEase(b.interp);
        const ds = 1e-4;
        const s0 = Math.max(0, s - ds), s1 = Math.min(1, s + ds);
        return ((b.v - a.v) * (e(s1) - e(s0))) / ((s1 - s0) * h);
      }
    }
  }
}

export class Timeline {
  /** @param {import('./channels.js').ChannelLayout} layout */
  constructor(layout) {
    this.layout = layout;
    /** Component index -> track. @type {Map<number, Track>} */
    this.tracks = new Map();
    /** @type {TimelineEvent[]} */
    this.events = [];
    /** @type {number | null} */
    this._explicitDuration = null;
  }

  get duration() {
    if (this._explicitDuration !== null) return this._explicitDuration;
    let d = 0;
    for (const tr of this.tracks.values()) d = Math.max(d, tr.end);
    for (const e of this.events) d = Math.max(d, e.t);
    return d;
  }

  /** Sets the duration explicitly (the timeline may end after its last key, holding values). @param {number} t */
  end(t) {
    this._explicitDuration = t;
    return this;
  }

  /** @param {number} t @param {ChannelValues} values @param {KeyOptions} [opts] @returns {this} */
  key(t, values, opts = {}) {
    const interp = opts.ease ?? 'smooth';
    for (const name in values) {
      const base = this.layout.index(name);
      const v = values[name];
      const vel = opts.vel?.[name];
      const arr = typeof v === 'number' ? [v] : v;
      for (let k = 0; k < arr.length; k++) {
        const slope = vel === undefined ? undefined : typeof vel === 'number' ? vel : vel[k];
        this._track(base + k).add({ t, v: arr[k], interp, slope, hold: !!opts.hold });
      }
    }
    return this;
  }

  /** @param {number} t @param {string} name @param {any} [data] @returns {this} */
  event(t, name, data) {
    this.events.push({ t, name, data });
    this.events.sort((a, b) => a.t - b.t);
    return this;
  }

  /**
   * Adds a key at t=0 holding the live values for every track that doesn't start at 0, so the
   * action begins exactly where the previous one left off. With `all`, every channel gets a
   * track (channels never keyed later then simply hold their current value).
   * @param {ArrayLike<number>} current @param {{ all?: boolean }} [opts]
   */
  startFrom(current, opts = {}) {
    const n = this.layout.size;
    for (let i = 0; i < n; i++) {
      let tr = this.tracks.get(i);
      if (!tr) {
        if (!opts.all) continue;
        tr = this._track(i);
      }
      if (tr.keys.length === 0 || tr.start > 1e-6) tr.add({ t: 0, v: current[i], interp: 'smooth', hold: false });
    }
    return this;
  }

  /** Delays every key and event by dt seconds (to prepend a prelude). @param {number} dt */
  shift(dt) {
    for (const tr of this.tracks.values()) {
      for (const k of tr.keys) k.t += dt;
      tr.scaleTime(1); // marks tangents dirty
    }
    for (const e of this.events) e.t += dt;
    if (this._explicitDuration !== null) this._explicitDuration += dt;
    return this;
  }

  /**
   * Inserts `dt` seconds at time `at`: every key and event at or after `at` moves later (keys
   * before it stay). Used to slow down one move without touching the rest of the performance.
   * @param {number} at @param {number} dt
   */
  insertTime(at, dt) {
    if (dt <= 0) return this;
    for (const tr of this.tracks.values()) {
      for (const k of tr.keys) if (k.t >= at - 1e-9) k.t += dt;
      tr.scaleTime(1);
    }
    for (const e of this.events) if (e.t >= at - 1e-9) e.t += dt;
    if (this._explicitDuration !== null && this._explicitDuration >= at) this._explicitDuration += dt;
    return this;
  }

  /**
   * Speed limit for vector channels (e.g. hand positions): wherever the average speed between
   * two consecutive keys of `channel` exceeds `vmax`, time is inserted before the later key so it
   * doesn't. Segments that end in a key with explicit velocity or a non-smooth ease (a deliberate
   * throw or slap) are left alone. Returns the seconds added.
   * @param {string} channel @param {number} vmax units per second @returns {number}
   */
  limitSpeed(channel, vmax) {
    const base = this.layout.index(channel);
    const dims = this.layout.width(channel);
    const trs = Array.from({ length: dims }, (_, k) => this.tracks.get(base + k));
    if (trs.some((t) => !t || t.keys.length < 2)) return 0;
    const times = [...new Set(trs.flatMap((t) => t.keys.map((k) => +k.t.toFixed(6))))].sort((a, b) => a - b);
    let added = 0;
    for (let i = 1; i < times.length; i++) {
      const t0 = times[i - 1] + added, t1 = times[i] + added;
      const keyAt = trs.map((t) => t.keys.find((k) => Math.abs(k.t - t1) < 1e-5));
      if (keyAt.some((k) => k && (k.slope !== undefined || k.interp !== 'smooth'))) continue;
      let d2 = 0;
      for (const t of trs) d2 += (t.sample(t1) - t.sample(t0)) ** 2;
      const need = Math.sqrt(d2) / vmax - (t1 - t0);
      if (need > 1e-3) {
        this.insertTime(t1 - 1e-7, need);
        added += need;
      }
    }
    return added;
  }

  /**
   * Arcs for a vector channel (e.g. a hand): each move of at least `minDist` between two keys
   * gets a via key halfway, pushed off the straight chord by `bulge` x its length toward `up`
   * (projected perpendicular to the chord), so reaches travel on a natural curve instead of a
   * ruler line. Segments ending in explicit velocity or a non-smooth ease are left alone, and
   * `skip(a, b)` can exempt others (e.g. slides along a table).
   * @param {string} channel
   * @param {{ minDist?: number, bulge?: number, up: readonly number[], skip?: (a: number[], b: number[]) => boolean }} opts
   * @returns {number} via keys added
   */
  addArcs(channel, opts) {
    const base = this.layout.index(channel);
    const dims = this.layout.width(channel);
    const trs = Array.from({ length: dims }, (_, k) => this.tracks.get(base + k));
    if (trs.some((t) => !t || t.keys.length < 2)) return 0;
    const minDist = opts.minDist ?? 0.12, bulge = opts.bulge ?? 0.1;
    const times = [...new Set(trs.flatMap((t) => t.keys.map((k) => +k.t.toFixed(6))))].sort((a, b) => a - b);
    const adds = [];
    for (let i = 1; i < times.length; i++) {
      const t0 = times[i - 1], t1 = times[i];
      if (t1 - t0 < 0.12) continue;
      const k1 = trs.map((t) => t.keys.find((k) => Math.abs(k.t - t1) < 1e-5));
      if (k1.some((k) => k && (k.slope !== undefined || k.interp !== 'smooth'))) continue;
      const a = trs.map((t) => t.sample(t0)), b = trs.map((t) => t.sample(t1));
      const chord = b.map((x, k) => x - a[k]);
      const len = Math.hypot(...chord);
      if (len < minDist || opts.skip?.(a, b)) continue;
      const c = chord.map((x) => x / len);
      const d = opts.up.reduce((s, u, k) => s + u * c[k], 0);
      const perp = opts.up.map((u, k) => u - d * c[k]);
      const pl = Math.hypot(...perp);
      if (pl < 0.2) continue; // moving mostly along `up`: no sideways room for an arc
      const tm = (t0 + t1) / 2;
      const mid = trs.map((t) => t.sample(tm));
      adds.push({ t: tm, v: mid.map((x, k) => x + (perp[k] / pl) * bulge * len) });
    }
    for (const ad of adds) trs.forEach((t, k) => t.add({ t: ad.t, v: ad.v[k], interp: 'smooth', hold: false }));
    return adds.length;
  }

  /** Multiplies every key and event time by k (tempo jitter). @param {number} k */
  scaleTime(k) {
    for (const tr of this.tracks.values()) tr.scaleTime(k);
    for (const e of this.events) e.t *= k;
    if (this._explicitDuration !== null) this._explicitDuration *= k;
    return this;
  }

  /** Writes sampled values for every tracked component into `out` (others untouched). @param {number} t @param {Float32Array} out */
  sample(t, out) {
    for (const [i, tr] of this.tracks) out[i] = tr.sample(t);
    return out;
  }

  /** Writes slopes (units/s) for tracked components into `out` (others set to 0). @param {number} t @param {Float32Array} out */
  velocity(t, out) {
    out.fill(0);
    for (const [i, tr] of this.tracks) out[i] = tr.derivative(t);
    return out;
  }

  /** Events with t0 < e.t <= t1. @returns {TimelineEvent[]} */
  eventsIn(t0, t1) {
    return this.events.filter((e) => e.t > t0 && e.t <= t1);
  }

  /** Time of the first event with this name, or -1. @param {string} name */
  eventTime(name) {
    return this.events.find((e) => e.name === name)?.t ?? -1;
  }

  /** @param {number} i @returns {Track} */
  _track(i) {
    let tr = this.tracks.get(i);
    if (!tr) {
      tr = new Track();
      this.tracks.set(i, tr);
    }
    return tr;
  }
}

/**
 * Plays a timeline into a channel buffer, firing events as time crosses them.
 * `rate` scales playback speed; `update` returns false once finished (non-looping).
 */
export class TimelinePlayer {
  /** @param {Timeline} timeline @param {Float32Array} out @param {boolean} [loop] */
  constructor(timeline, out, loop = false) {
    this.timeline = timeline;
    this.out = out;
    this.loop = loop;
    this.time = 0;
    this.rate = 1;
    this.finished = false;
    /** @type {Set<(e: TimelineEvent) => void>} */
    this._listeners = new Set();
    /** @type {() => void} */
    this._resolve = () => {};
    /** Resolves when a non-looping timeline finishes or stop() is called. @type {Promise<void>} */
    this.done = new Promise((r) => (this._resolve = r));
  }

  /** @param {(e: TimelineEvent) => void} cb @returns {() => boolean} unsubscribe */
  onEvent(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  /** @param {number} dt @returns {boolean} false once finished */
  update(dt) {
    if (this.finished) return false;
    const d = this.timeline.duration;
    const t0 = this.time === 0 ? -1e-9 : this.time;
    let t1 = this.time + dt * this.rate;
    if (this.loop && d > 0 && t1 > d) {
      for (const e of this.timeline.eventsIn(t0, d)) this._listeners.forEach((l) => l(e));
      t1 -= d;
      for (const e of this.timeline.eventsIn(-1e-9, t1)) this._listeners.forEach((l) => l(e));
    } else {
      for (const e of this.timeline.eventsIn(t0, t1)) this._listeners.forEach((l) => l(e));
    }
    this.time = t1;
    this.timeline.sample(Math.min(this.time, d), this.out);
    if (!this.loop && this.time >= d) {
      this.finished = true;
      this._resolve();
      return false;
    }
    return true;
  }

  stop() {
    if (!this.finished) {
      this.finished = true;
      this._resolve();
    }
  }
}
