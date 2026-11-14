/**
 * Motion gestures: detectors over a short per-hand history (position, size, roll, pose, pinch).
 * Each detector is a plain object so games can add their own with `engine.registerMotion`.
 */

/**
 * @typedef {object} Sample
 * @property {number} t ms
 * @property {number} x
 * @property {number} y
 * @property {number} size palm size (depth proxy)
 * @property {number} roll radians
 * @property {string|null} pose
 * @property {number} pinch 0..1
 * @property {number} open Raw (undebounced) mean finger extension 0..1.
 *
 * @typedef {typeof DEFAULT_MOTION} MotionConfig
 *
 * @typedef {object} MotionHit
 * @property {string} name
 * @property {Record<string, number|string>} [data]
 * @property {boolean} [reset] clear the history after firing
 *
 * @typedef {object} MotionContext
 * @property {Sample[]} h
 * @property {number} now
 * @property {MotionConfig} cfg
 * @property {Record<string, number>} mem Per-hand scratch space a detector may keep between frames.
 * @property {boolean} [busy] Both hands are moving fast in opposite directions: a two-hand gesture is under way.
 * @property {(name: string) => boolean} [enabled] Is this motion name switched on (see GestureEngine.setEnabled)?
 *
 * @typedef {object} MotionDetector
 * @property {string} id
 * @property {string[]} names
 * @property {(c: MotionContext) => MotionHit|null} detect
 * @property {number} [cooldownMs] Override MotionConfig.cooldownMs (e.g. 0 for taps, which must allow double taps).
 */

export const DEFAULT_MOTION = {
  /** Swipe: travel (screen fraction) within `swipeMs`, and how dominant the main axis must be. */
  swipeDist: 0.2, swipeMs: 380, swipeAxis: 1.8,
  /** Push / pull: palm size ratio change within `pushMs` while staying roughly in place. */
  pushRatio: 1.28, pushMs: 450, pushDrift: 0.09,
  /** Circle: fraction of a full turn, minimum radius, time window. */
  circleTurns: 0.85, circleRadius: 0.035, circleMs: 1500,
  /** Wave (x) / shake (y): direction reversals of at least `waveAmp` within `waveMs`. */
  waveReversals: 3, waveAmp: 0.035, waveMs: 1300,
  /** Twist: roll change (degrees) within `twistMs`. */
  twistDeg: 55, twistMs: 600,
  /** Tap: pinch closed then opened within `tapMs`; double tap: two within `doubleTapMs`. */
  tapMs: 350, doubleTapMs: 550,
  /** Throw: fist opening while moving faster than this (screen / s). */
  throwSpeed: 1.1,
  /** Hold: a pose kept this long. */
  holdMs: 800,
  /** Two hands: clap closing speed and distance; zoom ratios; steering angle (degrees). */
  clapSpeed: 0.9, clapDist: 0.2,
  zoomIn: 1.45, zoomOut: 0.7,
  steerDeg: 35,
  /** Same detector on the same hand can't fire again for this long. */
  cooldownMs: 650,
};

/** Latest sample at least `ms` old (or the oldest one). */
function back(h, now, ms) {
  for (let i = h.length - 1; i >= 0; i--) if (now - h[i].t >= ms) return h[i];
  return h[0];
}
const within = (h, now, ms) => h.filter((s) => now - s.t <= ms);

/** @type {MotionDetector[]} */
export const MOTIONS = [
  // throw first: a throw is also a fast sideways move, and must win over the swipe it contains
  {
    id: 'throw', names: ['throw'],
    detect: ({ h, now, cfg }) => {
      if (h.length < 3) return null;
      const cur = h[h.length - 1];
      // react to the fingers actually opening (raw), not the debounced pose: by the time "open"
      // is confirmed the arm has already slowed down
      if (cur.open < 0.6) return null;
      // was a fist a moment ago?
      const recent = within(h, now, 300);
      if (!recent.some((s) => s.pose === 'fist' || s.pose === 'claw')) return null;
      const old = back(h, now, 120);
      const dt = (cur.t - old.t) / 1000;
      if (dt <= 0) return null;
      const vx = (cur.x - old.x) / dt, vy = (cur.y - old.y) / dt;
      const sp = Math.hypot(vx, vy);
      if (sp < cfg.throwSpeed) return null;
      return { name: 'throw', reset: true, data: { vx: +vx.toFixed(2), vy: +vy.toFixed(2) } };
    },
  },
  {
    id: 'swipe', names: ['swipe-left', 'swipe-right', 'swipe-up', 'swipe-down'],
    detect: ({ h, now, cfg, busy }) => {
      const cur = h[h.length - 1], old = back(h, now, cfg.swipeMs);
      if (now - old.t < cfg.swipeMs * 0.4) return null;
      // each hand of a clap / zoom / wheel looks like a swipe on its own
      if (busy) return null;
      // a moving fist is carrying something (and may be about to throw it), not swiping
      if (cur.pose === 'fist') return null;
      const dx = cur.x - old.x, dy = cur.y - old.y;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.max(ax, ay) < cfg.swipeDist) return null;
      if (ax > ay * cfg.swipeAxis) return { name: dx < 0 ? 'swipe-left' : 'swipe-right', reset: true, data: { dist: ax } };
      if (ay > ax * cfg.swipeAxis) return { name: dy < 0 ? 'swipe-up' : 'swipe-down', reset: true, data: { dist: ay } };
      return null;
    },
  },
  {
    id: 'push', names: ['push', 'pull'],
    detect: ({ h, now, cfg }) => {
      const cur = h[h.length - 1], old = back(h, now, cfg.pushMs);
      if (now - old.t < cfg.pushMs * 0.4 || old.size <= 0) return null;
      if (Math.hypot(cur.x - old.x, cur.y - old.y) > cfg.pushDrift) return null;
      const r = cur.size / old.size;
      if (r > cfg.pushRatio) return { name: 'push', reset: true, data: { ratio: r } };
      if (r < 1 / cfg.pushRatio) return { name: 'pull', reset: true, data: { ratio: r } };
      return null;
    },
  },
  {
    id: 'circle', names: ['circle-cw', 'circle-ccw'],
    detect: ({ h, now, cfg }) => {
      const w = within(h, now, cfg.circleMs);
      if (w.length < 10) return null;
      let cx = 0, cy = 0;
      for (const s of w) { cx += s.x; cy += s.y; }
      cx /= w.length; cy /= w.length;
      let r = 0;
      for (const s of w) r += Math.hypot(s.x - cx, s.y - cy);
      r /= w.length;
      if (r < cfg.circleRadius) return null;
      let turn = 0;
      for (let i = 1; i < w.length; i++) {
        let d = Math.atan2(w[i].y - cy, w[i].x - cx) - Math.atan2(w[i - 1].y - cy, w[i - 1].x - cx);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        turn += d;
      }
      // screen y points down, so a positive angle sweep is clockwise as seen on screen
      if (Math.abs(turn) < cfg.circleTurns * 2 * Math.PI) return null;
      return { name: turn > 0 ? 'circle-cw' : 'circle-ccw', reset: true, data: { radius: r } };
    },
  },
  {
    id: 'wave', names: ['wave', 'shake'],
    detect: ({ h, now, cfg }) => {
      const w = within(h, now, cfg.waveMs);
      if (w.length < 8) return null;
      // direction changes of at least waveAmp (hysteresis, so jitter doesn't count)
      const reversals = (get) => {
        let n = 0, dir = 0, hi = get(w[0]), lo = hi;
        for (const s of w) {
          const v = get(s);
          if (v > hi) hi = v;
          if (v < lo) lo = v;
          if (dir !== -1 && hi - v > cfg.waveAmp) { if (dir === 1) n++; dir = -1; hi = lo = v; }
          else if (dir !== 1 && v - lo > cfg.waveAmp) { if (dir === -1) n++; dir = 1; hi = lo = v; }
        }
        return n;
      };
      const rx = reversals((s) => s.x), ry = reversals((s) => s.y);
      if (rx >= cfg.waveReversals && rx > ry) return { name: 'wave', reset: true, data: { reversals: rx } };
      if (ry >= cfg.waveReversals && ry > rx) return { name: 'shake', reset: true, data: { reversals: ry } };
      return null;
    },
  },
  {
    id: 'twist', names: ['twist-cw', 'twist-ccw'],
    detect: ({ h, now, cfg }) => {
      const cur = h[h.length - 1], old = back(h, now, cfg.twistMs);
      if (now - old.t < cfg.twistMs * 0.4) return null;
      let d = cur.roll - old.roll;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) < (cfg.twistDeg * Math.PI) / 180) return null;
      if (Math.hypot(cur.x - old.x, cur.y - old.y) > 0.12) return null; // a swipe, not a twist
      return { name: d > 0 ? 'twist-cw' : 'twist-ccw', reset: true, data: { degrees: Math.round((d * 180) / Math.PI) } };
    },
  },
  {
    // pinch tap with hysteresis: closes above 0.75, opens below 0.4, so a wobbly half-pinch can't chatter
    id: 'tap', names: ['tap', 'double-tap'], cooldownMs: 0,
    detect: ({ h, now, cfg, mem, enabled }) => {
      const cur = h[h.length - 1];
      const closed = mem.closed === 1;
      if (!closed && cur.pinch > 0.75) { mem.closed = 1; mem.closedAt = now; return null; }
      if (closed && cur.pinch < 0.4) {
        mem.closed = 0;
        if (now - mem.closedAt > cfg.tapMs) return null;
        // with double tap switched off every tap is a plain tap
        const dbl = (enabled ? enabled('double-tap') : true) && now - (mem.lastTap ?? -1e9) < cfg.doubleTapMs;
        mem.lastTap = dbl ? -1e9 : now;
        return { name: dbl ? 'double-tap' : 'tap' };
      }
      return null;
    },
  },
];

/**
 * Display info for motion and two-hand gestures (poses carry their own name and hint).
 * @type {Record<string, {name: string, hint: string, hands?: 2}>}
 */
export const MOTION_INFO = {
  'swipe-left': { name: 'Swipe left', hint: 'Sweep your hand quickly to the left' },
  'swipe-right': { name: 'Swipe right', hint: 'Sweep your hand quickly to the right' },
  'swipe-up': { name: 'Swipe up', hint: 'Sweep your hand quickly upward' },
  'swipe-down': { name: 'Swipe down', hint: 'Sweep your hand quickly downward' },
  push: { name: 'Push', hint: 'Push your open palm toward the camera' },
  pull: { name: 'Pull', hint: 'Pull your hand back away from the camera' },
  'circle-cw': { name: 'Circle clockwise', hint: 'Draw a circle in the air, clockwise' },
  'circle-ccw': { name: 'Circle anticlockwise', hint: 'Draw a circle in the air, anticlockwise' },
  wave: { name: 'Wave', hint: 'Wave side to side a few times' },
  shake: { name: 'Shake', hint: 'Shake your hand up and down a few times' },
  'twist-cw': { name: 'Twist clockwise', hint: 'Turn your hand like a doorknob, clockwise' },
  'twist-ccw': { name: 'Twist anticlockwise', hint: 'Turn your hand like a doorknob, anticlockwise' },
  tap: { name: 'Pinch tap', hint: 'Quickly pinch thumb and index, then release' },
  'double-tap': { name: 'Double pinch tap', hint: 'Two quick pinch taps' },
  throw: { name: 'Throw', hint: 'Make a fist, then fling it open while moving fast' },
  hold: { name: 'Hold a pose', hint: 'Keep any pose still for a moment' },
  clap: { name: 'Clap', hint: 'Clap both open hands together', hands: 2 },
  'zoom-in': { name: 'Spread (zoom in)', hint: 'Pinch with both hands, then pull them apart', hands: 2 },
  'zoom-out': { name: 'Squeeze (zoom out)', hint: 'Pinch with both hands apart, then bring them together', hands: 2 },
  'steer-left': { name: 'Steer left', hint: 'Both fists on a wheel, turn it left', hands: 2 },
  'steer-right': { name: 'Steer right', hint: 'Both fists on a wheel, turn it right', hands: 2 },
};
