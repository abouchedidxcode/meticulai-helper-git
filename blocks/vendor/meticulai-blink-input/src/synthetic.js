// SyntheticFace: a stand-in for FaceTracker that needs no camera. It plays a looping script of blinks,
// long closes, a one-eye squint, head turns, glances and a lost face, with a little noise, at 30 frames
// a second. Attach it to an EyeState exactly like a real tracker: eyeState.attach(new SyntheticFace()).
// Use it for demos, bots, recordings and tests. hold('closed') etc. overrides the script (calibration).

/** @typedef {import('./eye-state.js').FaceFrame} FaceFrame */

/**
 * One step of the script.
 * @typedef {object} SyntheticStep
 * @property {'open'|'closed'|'squint'|'gone'} eyes  squint = only the left eye closes (must NOT count as closed)
 * @property {number} ms       how long the step lasts
 * @property {number} [yaw]    head yaw in degrees (positive = player's left)
 * @property {number} [pitch]  head pitch in degrees
 * @property {number} [gaze]   iris offset -1..1 in image space (the EyeState mirrors it)
 * @property {string} [label]  what the step shows (the demo prints it)
 */

/** @type {SyntheticStep[]} */
export const DEFAULT_SCRIPT = Object.freeze([
  { eyes: 'open', ms: 1600, label: 'looking at the screen' },
  { eyes: 'closed', ms: 170, label: 'a quick blink' },
  { eyes: 'open', ms: 1300, gaze: 0.45, label: 'glancing to one side' },
  { eyes: 'open', ms: 1100, gaze: -0.45, label: 'glancing to the other side' },
  { eyes: 'closed', ms: 2200, label: 'eyes closed on purpose' },
  { eyes: 'open', ms: 1200, label: 'looking at the screen' },
  { eyes: 'squint', ms: 900, label: 'one eye shut (still counts as open)' },
  { eyes: 'open', ms: 900, label: 'looking at the screen' },
  { eyes: 'open', ms: 1600, yaw: 46, label: 'head turned away' },
  { eyes: 'open', ms: 1000, label: 'looking at the screen' },
  { eyes: 'gone', ms: 1300, label: 'face out of frame' },
  { eyes: 'open', ms: 900, pitch: -6, label: 'back again' },
  { eyes: 'closed', ms: 200, label: 'a quick blink' },
]);

const OPEN = 0.08;
const CLOSED = 0.8;

/** Deterministic noise in -1..1 from a number (a hash, so the same time gives the same frame). */
function noise(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

const smooth = (/** @type {number} */ x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** @param {SyntheticStep} st */
function target(st) {
  const l = st.eyes === 'closed' || st.eyes === 'squint' ? CLOSED : OPEN;
  const r = st.eyes === 'closed' ? CLOSED : OPEN;
  return { l, r, yaw: st.yaw ?? 0, pitch: st.pitch ?? 0, gaze: st.gaze ?? 0 };
}

export class SyntheticFace {
  /**
   * @param {{ script?: SyntheticStep[], fps?: number, noise?: number, startMs?: number }} [opts]
   */
  constructor({ script = DEFAULT_SCRIPT, fps = 30, noise: amount = 0.03, startMs = 0 } = {}) {
    this.script = script;
    this.fps = fps;
    this.noise = amount;
    this.startMs = startMs;
    this.delegate = 'synthetic';
    this.total = script.reduce((a, s) => a + s.ms, 0);
    /** @type {SyntheticStep|null} */
    this._hold = null;
    this._lastSlot = -1;
    /** The script step playing now (for labels). @type {SyntheticStep} */
    this.step = script[0];
  }

  /**
   * Override the script: 'open' | 'closed' | 'squint' | 'gone' | 'away', or null to go back to it.
   * @param {'open'|'closed'|'squint'|'gone'|'away'|null} what
   */
  hold(what) {
    if (what === null) this._hold = null;
    else if (what === 'away') this._hold = { eyes: 'open', ms: 1e9, yaw: 46, label: 'held: head turned away' };
    else this._hold = { eyes: what, ms: 1e9, label: `held: ${what}` };
  }

  /**
   * Same interface as FaceTracker.detect: a frame at most `fps` times a second, else null.
   * @param {any} _video ignored @param {number} nowMs
   * @returns {FaceFrame|null}
   */
  detect(_video, nowMs) {
    const slot = Math.floor((nowMs * this.fps) / 1000);
    if (slot === this._lastSlot) return null;
    this._lastSlot = slot;
    return this.frameAt(nowMs);
  }

  /**
   * The frame at a time (pure: same time, same frame).
   * @param {number} nowMs
   * @returns {FaceFrame}
   */
  frameAt(nowMs) {
    let cur;
    let prev;
    let local;
    if (this._hold) {
      cur = prev = this._hold;
      local = 1e6;
    } else {
      const n = this.script.length;
      const since = nowMs - this.startMs;
      let t = ((since % this.total) + this.total) % this.total;
      let i = 0;
      while (t >= this.script[i].ms) t -= this.script[i++].ms;
      cur = this.script[i];
      // the very first step starts from itself (no blend from the end of the loop)
      prev = i === 0 && since < this.total ? cur : this.script[(i - 1 + n) % n];
      local = t;
    }
    this.step = cur;
    if (cur.eyes === 'gone') return { faceDetected: false, blinkLeft: 0, blinkRight: 0, yawDeg: 0, pitchDeg: 0, irisX: 0 };
    const a = target(prev.eyes === 'gone' ? cur : prev);
    const b = target(cur);
    const kEye = smooth(local / 60); // eyelids move in ~60 ms
    const kHead = smooth(local / 280); // heads turn in ~0.3 s
    const kGaze = smooth(local / 160);
    const lerp = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ k) => x + (y - x) * k;
    const j = this.noise;
    const q = Math.floor(nowMs / 33);
    const clamp01 = (/** @type {number} */ v) => Math.min(1, Math.max(0, v));
    return {
      faceDetected: true,
      blinkLeft: clamp01(lerp(a.l, b.l, kEye) + noise(q) * j),
      blinkRight: clamp01(lerp(a.r, b.r, kEye) + noise(q + 0.5) * j),
      yawDeg: lerp(a.yaw, b.yaw, kHead) + noise(q + 0.25) * 1.5,
      pitchDeg: lerp(a.pitch, b.pitch, kHead) + noise(q + 0.75) * 1.0,
      irisX: lerp(a.gaze, b.gaze, kGaze) + noise(q + 0.125) * 0.03,
    };
  }

  close() {}
}
