import { OneEuroFilter } from './oneEuro.js';
import { computeFeatures, smooth } from './features.js';
import { DEFAULT_MOTION, MOTIONS } from './motions.js';
import { POSES, scorePose } from './poses.js';

/**
 * @typedef {import('./types.js').GestureEvent} GestureEvent
 * @typedef {import('./types.js').GestureFrame} GestureFrame
 * @typedef {import('./types.js').GestureKind} GestureKind
 * @typedef {import('./types.js').HandInput} HandInput
 * @typedef {import('./types.js').HandResult} HandResult
 * @typedef {import('./types.js').PoseDef} PoseDef
 * @typedef {import('./types.js').TwoHandState} TwoHandState
 * @typedef {import('./motions.js').MotionConfig} MotionConfig
 * @typedef {import('./motions.js').MotionDetector} MotionDetector
 * @typedef {import('./motions.js').Sample} Sample
 */

/**
 * @typedef {object} PoseConfig
 * @property {number} enter A pose becomes active at this score...
 * @property {number} exit ...and stays active until it drops below this.
 * @property {number} margin A different pose must beat the active one by this much to take over.
 * @property {number} debounceMs Candidate must persist this long before the switch (ms).
 * @property {boolean} experimental Include experimental poses.
 *
 * @typedef {{ pose: PoseConfig, motion: MotionConfig, smoothing: { minCutoff: number, beta: number } }} EngineConfig
 * Any subset of the config, e.g. `{ pose: { experimental: false } }`:
 * @typedef {{ pose?: Partial<PoseConfig>, motion?: Partial<MotionConfig>, smoothing?: Partial<EngineConfig['smoothing']> }} EngineConfigInput
 *
 * Which gestures the engine listens for: an allow-list of names per kind. `null` / omitted = every
 * gesture of that kind (the default). A disabled pose is never classified (the pose picker chooses
 * among the enabled ones only, so it can't steal frames from them); a disabled motion or two-hand
 * gesture never fires. Motion names are event names ('swipe-left', 'tap', 'hold', ...), not detector ids.
 * @typedef {{ poses?: string[]|null, motions?: string[]|null, twoHand?: string[]|null }} GestureMask
 */

/** @type {PoseConfig} */
export const DEFAULT_POSE = { enter: 0.62, exit: 0.42, margin: 0.08, debounceMs: 70, experimental: true };

/** @type {EngineConfig} */
export const DEFAULT_CONFIG = {
  pose: DEFAULT_POSE,
  motion: DEFAULT_MOTION,
  smoothing: { minCutoff: 2.2, beta: 8 },
};

/** Every two-hand gesture name the engine emits. */
export const TWO_HAND = Object.freeze(['clap', 'zoom-in', 'zoom-out', 'steer-left', 'steer-right']);
const MASK_KIND = { pose: 'poses', motion: 'motions', 'two-hand': 'twoHand' };

const HISTORY_MS = 1600;
/** A hand unseen this long is forgotten (its pose ends). */
const LOST_MS = 250;

/**
 * GESTURE ENGINE. Feed it hands every frame; get back stable poses, per-pose scores, continuous
 * values and discrete events (pose start/end, swipes, circles, taps, claps, ...).
 *
 *   const engine = new GestureEngine();
 *   engine.on('swipe-left', (e) => ...);
 *   engine.on('pose', (e) => ...);           // every pose start/end
 *   const frame = engine.update(hands, performance.now());
 */
export class GestureEngine {
  /** @param {EngineConfigInput} [config] */
  constructor(config = {}) {
    /** @type {EngineConfig} */
    this.config = {
      pose: { ...DEFAULT_POSE, ...config.pose },
      motion: { ...DEFAULT_MOTION, ...config.motion },
      smoothing: { ...DEFAULT_CONFIG.smoothing, ...config.smoothing },
    };
    /** The latest frame (already updated when event listeners run). @type {GestureFrame} */
    this.frame = { t: 0, hands: [], twoHand: { present: false, distance: 0, angle: 0, zoom: 1 }, events: [] };
    /** @type {PoseDef[]} */
    this.poses = [...POSES];
    /** @type {MotionDetector[]} */
    this.motions = [...MOTIONS];
    this._tracks = [];
    this._nextId = 0;
    /** @type {Map<string, Set<(e: GestureEvent) => void>>} */
    this._listeners = new Map();
    this._two = { prevD: -1, clapSpeed: 0, clapCool: 0, grip: '', d0: 0, a0: 0, zoomFired: '', steerFired: '', lastT: 0, busyUntil: 0 };
    /** @type {{poses: Set<string>|null, motions: Set<string>|null, twoHand: Set<string>|null}} */
    this._mask = { poses: null, motions: null, twoHand: null };
  }

  /** Add or replace a pose. @param {PoseDef} def */
  registerPose(def) { this.poses = [...this.poses.filter((p) => p.id !== def.id), def]; }
  /** Add or replace a motion detector. @param {MotionDetector} d */
  registerMotion(d) { this.motions = [...this.motions.filter((m) => m.id !== d.id), d]; }

  /**
   * Listen to events. `name` is an event name ('fist', 'swipe-left', 'clap', ...), a kind
   * ('pose' | 'motion' | 'two-hand') or '*' for everything. Returns an unsubscribe function.
   * @param {string} name @param {(e: GestureEvent) => void} fn @returns {() => void}
   */
  on(name, fn) {
    let set = this._listeners.get(name);
    if (!set) this._listeners.set(name, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Every gesture name the engine can emit (poses + motions + two-hand), for UIs. */
  get catalog() {
    return {
      poses: this._activePoses().map((p) => ({ id: p.id, name: p.name, hint: p.hint, experimental: !!p.experimental })),
      motions: this.motions.flatMap((m) => m.names).concat('hold'),
      twoHand: [...TWO_HAND],
    };
  }

  /**
   * Turn gestures on or off. Each kind given replaces that kind's allow-list (`null` = all on);
   * kinds left out keep their current setting. `setEnabled(null)` turns everything back on.
   *   engine.setEnabled({ poses: ['fist', 'victory'], motions: ['tap'] });
   * @param {GestureMask|null} mask
   */
  setEnabled(mask) {
    if (!mask) { this._mask = { poses: null, motions: null, twoHand: null }; return; }
    for (const k of /** @type {const} */ (['poses', 'motions', 'twoHand'])) {
      if (k in mask) { const v = mask[k]; this._mask[k] = v ? new Set(v) : null; }
    }
  }

  /** The current allow-lists (`null` = every gesture of that kind). */
  get enabled() {
    const out = (s) => (s ? [...s] : null);
    return { poses: out(this._mask.poses), motions: out(this._mask.motions), twoHand: out(this._mask.twoHand) };
  }

  /**
   * Is this gesture switched on? Without `kind`, a name is on if it isn't masked in the kind that lists it.
   * @param {string} name @param {GestureKind} [kind]
   */
  isEnabled(name, kind) {
    if (kind) { const s = this._mask[MASK_KIND[kind]]; return !s || s.has(name); }
    if (this.poses.some((p) => p.id === name)) return this.isEnabled(name, 'pose');
    if (TWO_HAND.includes(name)) return this.isEnabled(name, 'two-hand');
    return this.isEnabled(name, 'motion');
  }

  /** Forget every hand (e.g. after switching camera / synthetic input). */
  reset() { this._tracks = []; this._two.prevD = -1; this._two.grip = ''; }

  _activePoses() { return this.config.pose.experimental ? this.poses : this.poses.filter((p) => !p.experimental); }

  /**
   * Run one frame. `t` is in milliseconds and must increase.
   * @param {HandInput[]} inputs @param {number} t @returns {GestureFrame}
   */
  update(inputs, t) {
    /** @type {GestureEvent[]} */
    const events = [];
    const emit = (e) => events.push(e);
    const live = this._assign(inputs, t);
    // hands that vanished end their pose
    for (const tr of this._tracks) {
      if (t - tr.lastSeen > LOST_MS) {
        if (tr.pose) emit({ kind: 'pose', name: tr.pose, phase: 'end', hand: tr.id, t });
        tr.pose = null;
      }
    }
    this._tracks = this._tracks.filter((tr) => t - tr.lastSeen <= LOST_MS);

    // both hands moving fast in opposite directions -> a two-hand gesture, not two one-hand swipes
    const movers = live.map(([tr]) => tr).filter((tr) => Math.hypot(tr.vel.x, tr.vel.y) > 0.5);
    if (movers.length >= 2 && movers[0].vel.x * movers[1].vel.x + movers[0].vel.y * movers[1].vel.y < 0) this._two.busyUntil = t + 300;
    const busy = t < this._two.busyUntil;

    /** @type {HandResult[]} */
    const hands = [];
    for (const [tr, input] of live) hands.push(this._updateHand(tr, input, t, emit, busy));
    hands.sort((a, b) => a.id - b.id);
    const twoHand = this._updateTwo(hands, t, emit);

    this.frame = { t, hands, twoHand, events };
    for (const e of events) this._dispatch(e);
    return this.frame;
  }

  // ---------------------------------------------------------------- hand identity
  _assign(inputs, t) {
    const out = [];
    const free = new Set(this._tracks);
    const centre = (h) => { const L = h.landmarks; return { x: (L[0].x + L[9].x) / 2, y: (L[0].y + L[9].y) / 2 }; };
    // explicit ids first
    for (const h of inputs) {
      if (h.landmarks.length !== 21 || h.id === undefined) continue;
      let tr = this._tracks.find((x) => x.id === h.id);
      if (!tr) { tr = this._newTrack(h, h.id); this._tracks.push(tr); }
      free.delete(tr);
      out.push([tr, h]);
    }
    // then nearest previous position
    for (const h of inputs) {
      if (h.landmarks.length !== 21 || h.id !== undefined) continue;
      const c = centre(h);
      let best = null, bd = 0.35;
      for (const tr of free) {
        const r = tr.result;
        if (!r) continue;
        const d = Math.hypot(r.features.center.x - c.x, r.features.center.y - c.y) + (tr.handedness === h.handedness ? 0 : 0.1);
        if (d < bd) { bd = d; best = tr; }
      }
      if (!best) { best = this._newTrack(h); this._tracks.push(best); }
      free.delete(best);
      out.push([best, h]);
    }
    for (const [tr] of out) tr.lastSeen = t;
    return out;
  }

  _newTrack(h, id) {
    const s = this.config.smoothing;
    const mk = () => Array.from({ length: 63 }, () => new OneEuroFilter({ minCutoff: s.minCutoff, beta: s.beta, dCutoff: 1 }));
    return {
      id: id ?? this._nextId++, handedness: h.handedness, lastSeen: 0, filters: mk(), wfilters: mk(),
      pose: null, poseSince: 0, cand: null, candSince: 0, held: false,
      hist: [], mem: {}, cooldown: {}, vel: { x: 0, y: 0 }, result: null,
    };
  }

  // ---------------------------------------------------------------- one hand
  _updateHand(tr, input, t, emit, busy = false) {
    const sec = t / 1000;
    const filt = (pts, f, scale) => pts.map((p, i) => ({
      x: f[i * 3].filter(p.x * scale, sec) / scale,
      y: f[i * 3 + 1].filter(p.y * scale, sec) / scale,
      z: f[i * 3 + 2].filter(p.z * scale, sec) / scale,
    }));
    // world landmarks are in metres (~0.1 per hand): scale up so the filter's speed terms behave alike
    const hand = {
      ...input,
      landmarks: filt(input.landmarks, tr.filters, 1),
      world: input.world && input.world.length === 21 ? filt(input.world, tr.wfilters, 10) : undefined,
    };
    tr.handedness = input.handedness;
    const f = computeFeatures(hand);

    // ---- poses
    const poseMask = this._mask.poses;
    /** @type {Record<string, number>} */
    const scores = {};
    let best = null, bestS = 0;
    // every pose is scored (UIs can show disabled ones too), but only enabled ones can win
    for (const p of this._activePoses()) {
      const s = scorePose(p, f);
      scores[p.id] = s;
      if (s > bestS && (!poseMask || poseMask.has(p.id))) { bestS = s; best = p.id; }
    }
    const cfg = this.config.pose;
    const cur = tr.pose;
    const curS = cur && (!poseMask || poseMask.has(cur)) ? scores[cur] ?? 0 : 0;
    let want = cur;
    if (cur && curS < cfg.exit) want = null;
    if (best && bestS >= cfg.enter && best !== cur && (!cur || bestS > curS + cfg.margin)) want = best;
    if (want !== cur) {
      if (tr.cand !== want) { tr.cand = want; tr.candSince = t; }
      // dropping to "no pose" waits a little longer, so poses don't blink off between frames
      const need = want === null ? cfg.debounceMs * 1.6 : cfg.debounceMs;
      if (t - tr.candSince >= need) {
        if (cur) emit({ kind: 'pose', name: cur, phase: 'end', hand: tr.id, t, data: { heldMs: Math.round(t - tr.poseSince) } });
        tr.pose = want;
        tr.poseSince = t;
        tr.held = false;
        if (want) emit({ kind: 'pose', name: want, phase: 'start', hand: tr.id, t, data: { score: +bestS.toFixed(2) } });
      }
    } else tr.cand = cur;
    const motionMask = this._mask.motions;
    const motionOn = (n) => !motionMask || motionMask.has(n);
    if (tr.pose && !tr.held && t - tr.poseSince >= this.config.motion.holdMs) {
      tr.held = true;
      if (motionOn('hold')) emit({ kind: 'motion', name: 'hold', hand: tr.id, t, data: { pose: tr.pose } });
    }

    // ---- motion history + velocity
    const pinch = 1 - smooth(0.2, 0.42, f.tipGap[0]);
    const prev = tr.hist[tr.hist.length - 1];
    /** @type {Sample} */
    const sample = { t, x: f.center.x, y: f.center.y, size: f.size, roll: f.roll, pose: tr.pose, pinch, open: f.openness };
    if (prev && t > prev.t) {
      const dt = (t - prev.t) / 1000, k = 1 - Math.exp(-dt / 0.06);
      tr.vel.x += k * ((sample.x - prev.x) / dt - tr.vel.x);
      tr.vel.y += k * ((sample.y - prev.y) / dt - tr.vel.y);
    }
    tr.hist.push(sample);
    while (tr.hist.length && t - tr.hist[0].t > HISTORY_MS) tr.hist.shift();
    for (const d of this.motions) {
      if (motionMask && !d.names.some(motionOn)) continue;
      const mem = (tr.mem[d.id] ??= {});
      const hit = d.detect({ h: tr.hist, now: t, cfg: this.config.motion, mem, busy, enabled: motionOn });
      if (!hit || !motionOn(hit.name)) continue;
      const cd = d.cooldownMs ?? this.config.motion.cooldownMs;
      if (t < (tr.cooldown[d.id] ?? 0)) continue;
      tr.cooldown[d.id] = t + cd;
      emit({ kind: 'motion', name: hit.name, hand: tr.id, t, data: hit.data });
      if (hit.reset) tr.hist = [sample];
    }

    /** @type {HandResult} */
    const res = {
      id: tr.id, handedness: tr.handedness, features: f, pose: tr.pose, confidence: tr.pose ? scores[tr.pose] ?? 0 : 0,
      scores, heldMs: tr.pose ? t - tr.poseSince : 0, velocity: { ...tr.vel }, pinch, landmarks: hand.landmarks,
    };
    tr.result = res;
    return res;
  }

  // ---------------------------------------------------------------- two hands
  _updateTwo(hands, t, emitAll) {
    const st = this._two, cfg = this.config.motion;
    const twoMask = this._mask.twoHand;
    const emit = (e) => { if (!twoMask || twoMask.has(e.name)) emitAll(e); };
    const dt = st.lastT ? Math.min(0.1, (t - st.lastT) / 1000) : 0;
    st.lastT = t;
    st.clapCool = Math.max(0, st.clapCool - dt);
    if (hands.length < 2) { st.prevD = -1; st.clapSpeed = 0; st.grip = ''; return { present: false, distance: 0, angle: 0, zoom: 1 }; }
    // left-most on screen first
    const [a, b] = [...hands].sort((p, q) => p.features.center.x - q.features.center.x);
    const ca = a.features.center, cb = b.features.center;
    const d = Math.hypot(cb.x - ca.x, cb.y - ca.y);
    const ang = Math.atan2(cb.y - ca.y, cb.x - ca.x);

    // clap: open hands slammed together
    if (st.prevD >= 0 && dt > 0) st.clapSpeed = Math.max((st.prevD - d) / dt, st.clapSpeed - dt * 6);
    st.prevD = d;
    const opens = (h) => h.features.openness > 0.55;
    if (st.clapCool <= 0 && opens(a) && opens(b) && d < cfg.clapDist && st.clapSpeed > cfg.clapSpeed) {
      st.clapCool = 1;
      st.clapSpeed = 0;
      emit({ kind: 'two-hand', name: 'clap', t });
    }

    // grip with both hands (both pinching or both fists) -> zoom & steering wheel
    const gripOf = (h) => (h.pinch > 0.7 ? 'pinch' : h.pose === 'fist' ? 'fist' : '');
    const g = gripOf(a) && gripOf(a) === gripOf(b) ? gripOf(a) : '';
    if (g !== st.grip) { st.grip = g; st.d0 = d; st.a0 = ang; st.zoomFired = ''; st.steerFired = ''; }
    let zoom = 1;
    if (g) {
      zoom = st.d0 > 1e-3 ? d / st.d0 : 1;
      if (zoom > cfg.zoomIn && st.zoomFired !== 'in') { st.zoomFired = 'in'; emit({ kind: 'two-hand', name: 'zoom-in', t, data: { zoom: +zoom.toFixed(2) } }); }
      if (zoom < cfg.zoomOut && st.zoomFired !== 'out') { st.zoomFired = 'out'; emit({ kind: 'two-hand', name: 'zoom-out', t, data: { zoom: +zoom.toFixed(2) } }); }
      let da = ang - st.a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const lim = (cfg.steerDeg * Math.PI) / 180;
      // right hand lower than the left (positive angle on screen) = wheel turned right
      if (da > lim && st.steerFired !== 'r') { st.steerFired = 'r'; emit({ kind: 'two-hand', name: 'steer-right', t, data: { degrees: Math.round((da * 180) / Math.PI) } }); }
      if (da < -lim && st.steerFired !== 'l') { st.steerFired = 'l'; emit({ kind: 'two-hand', name: 'steer-left', t, data: { degrees: Math.round((da * 180) / Math.PI) } }); }
      if (Math.abs(da) < lim * 0.4) st.steerFired = '';
    }
    return { present: true, distance: d, angle: ang, zoom };
  }

  _dispatch(e) {
    for (const key of [e.name, e.kind, '*']) this._listeners.get(key)?.forEach((fn) => fn(e));
  }
}
