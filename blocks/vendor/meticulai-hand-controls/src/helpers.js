/**
 * Small game-side helpers the hands games built on top of the engine. Pure logic, no DOM, so they
 * are unit-tested and work the same with camera, synthetic, mouse or touch input.
 */

/**
 * Pinch as a click, with hysteresis so a wobbly half-pinch doesn't chatter: it goes down at `on`
 * and only comes back up below `off`. Feed it `hand.pinch` (0..1) every frame, or null when no hand.
 * Numbers from Show of Hands' hall cursor.
 */
export class PinchClick {
  constructor(on = 0.72, off = 0.42) {
    this.on = on;
    this.off = off;
    this.down = false;
  }
  /** True on the frame a pinch begins. @param {number|null|undefined} strength */
  update(strength) {
    if (strength == null) { this.down = false; return false; }
    if (!this.down && strength >= this.on) { this.down = true; return true; }
    if (this.down && strength <= this.off) this.down = false;
    return false;
  }
}

/**
 * Hold-to-confirm in a zone (e.g. "hold your open hand on the button"). Tolerates a few frames of
 * lost tracking (`grace` seconds) so noise doesn't reset the ring; when the hand leaves for longer,
 * the ring drains at 3x speed instead of snapping to zero. From Show of Hands' "back to the hall" corner.
 */
export class HoldZone {
  constructor(time = 1.2, grace = 0.25) {
    this.time = time;
    this.grace = grace;
    this.t = 0;
    this._miss = 0;
  }
  /** 0..1 for drawing the ring. */
  get progress() { return Math.min(1, this.t / this.time); }
  /** @param {boolean} inside @param {number} dt seconds @returns {boolean} true on the frame it completes */
  update(inside, dt) {
    if (inside) { this._miss = 0; this.t += dt; }
    else { this._miss += dt; if (this._miss > this.grace) this.t = Math.max(0, this.t - dt * 3); }
    if (this.t >= this.time) { this.t = 0; return true; }
    return false;
  }
  reset() { this.t = 0; this._miss = 0; }
}

/** Fireflies' grip numbers: open at or above 0.6, closed below 0.4, a close faster than 120 ms is a snatch. */
export const GRIP_DEFAULTS = Object.freeze({ openAbove: 0.6, closedBelow: 0.4, franticMs: 120 });

/**
 * Per-hand grip (open hand <-> fist) with hysteresis, measuring how fast the hand closed. Feed it
 * `hand.features.openness` every frame. A hand that first appears already closed counts as closed
 * without a close event.
 *
 * Speed: when openness crosses below `closedBelow`, look back over the last second for the peak
 * openness, then time how long the hand took to fall from (peak - 0.12) to `closedBelow`,
 * interpolating between samples so a 30 fps camera does not quantise it. That band is a fraction of
 * the whole open-to-fist range, so `durationMs` is scaled up to "the hand closed fully in about N ms".
 */
export class Grip {
  /** @param {{openAbove:number, closedBelow:number, franticMs:number}} [tune] */
  constructor(tune = GRIP_DEFAULTS) {
    this.tune = tune;
    /** @type {'unknown'|'open'|'closed'} */
    this.state = 'unknown';
    /** Closing progress for visuals (0 open .. 1 closed). */
    this.progress = 0;
    this._hist = [];
  }

  /**
   * @param {number} openness 0 fist .. 1 open @param {number} t ms
   * @returns {{type:'close', kind:'slow'|'frantic', durationMs:number} | {type:'open'} | null}
   */
  update(openness, t) {
    const { openAbove, closedBelow } = this.tune;
    this.progress = Math.min(1, Math.max(0, (openAbove - openness) / (openAbove - closedBelow)));
    this._hist.push({ t, o: openness });
    while (this._hist.length > 2 && this._hist[0].t < t - 1000) this._hist.shift();
    if (this.state === 'unknown') {
      if (openness >= openAbove) this.state = 'open';
      else if (openness < closedBelow) this.state = 'closed';
      return null;
    }
    if (this.state === 'open') {
      if (openness < closedBelow) {
        this.state = 'closed';
        const durationMs = closeDuration(this._hist, closedBelow);
        return { type: 'close', kind: durationMs < this.tune.franticMs ? 'frantic' : 'slow', durationMs };
      }
      return null;
    }
    if (openness >= openAbove) { this.state = 'open'; return { type: 'open' }; }
    return null;
  }

  reset() { this.state = 'unknown'; this._hist = []; this.progress = 0; }
}

/**
 * Estimated full-close time (ms) from an openness history ending at the frame that crossed `closedBelow`.
 * @param {{t:number, o:number}[]} hist @param {number} closedBelow
 */
export function closeDuration(hist, closedBelow) {
  const n = hist.length;
  if (n < 2) return 0;
  let peak = 0;
  for (const h of hist) peak = Math.max(peak, h.o);
  const hi = Math.max(closedBelow + 0.1, peak - 0.12);
  // exact time openness fell through `lo` (between the last two samples)
  const a = hist[n - 2], b = hist[n - 1];
  const tLo = a.o === b.o ? b.t : a.t + ((a.o - closedBelow) / (a.o - b.o)) * (b.t - a.t);
  // last time it was at or above `hi`, interpolated forward to where it fell through
  let tHi = hist[0].t;
  for (let i = n - 1; i > 0; i--) {
    const p = hist[i - 1], q = hist[i];
    if (p.o >= hi && q.o < hi) { tHi = p.t + ((p.o - hi) / (p.o - q.o)) * (q.t - p.t); break; }
    if (q.o >= hi) { tHi = q.t; break; }
  }
  const band = hi - closedBelow;
  return Math.max(0, (tLo - tHi) / band);
}

/** Exponential smoothing step toward a target (frame-rate independent cursor easing). */
export function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/**
 * A plain-words message for a failed `startCamera()`, for players. Always ends by pointing at the
 * fallback controls, because the game must stay playable without a camera.
 * @param {unknown} err @param {string} [fallback] e.g. 'the mouse', 'touch', 'the arrow keys'
 */
export function cameraProblem(err, fallback = 'the mouse, touch or keys') {
  const name = /** @type {any} */ (err)?.name ?? '';
  const why = {
    NotAllowedError: 'Camera access was blocked. To use your hands, allow the camera in the address bar and try again.',
    SecurityError: 'Camera access was blocked. To use your hands, allow the camera in the address bar and try again.',
    NotFoundError: 'No camera was found on this device.',
    OverconstrainedError: 'No camera was found on this device.',
    NotReadableError: 'The camera is in use by another app or tab. Close it and try again.',
    AbortError: 'The camera is in use by another app or tab. Close it and try again.',
    NotSupportedError: 'This page can only use the camera over https (or on localhost), in a recent browser.',
  }[name] ?? 'The camera could not be started.';
  return `${why} You can still play with ${fallback}.`;
}

/** The privacy line to show next to every camera button. */
export const PRIVACY_LINE = 'Your camera video never leaves this device.';
