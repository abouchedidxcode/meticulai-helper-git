/**
 * One Euro filter (after Casiez, Roussel & Vogel, "1€ Filter", CHI 2012; written from the paper).
 *
 * An adaptive low-pass filter: at low speed the cutoff is `minCutoff` (kills jitter while the hand
 * hovers), and it rises linearly with the (filtered) speed, `cutoff = minCutoff + beta * |dx/dt|`,
 * so fast motions get little lag.
 *
 * Units: `minCutoff` / `dCutoff` are in Hz; `beta` is in 1 / (value units), i.e. with
 * screen-normalised values (0..1) a beta of 5 means a 1 screen/s motion raises the cutoff by 5 Hz.
 *
 * Time is passed explicitly (seconds) so the filter is deterministic and robust to irregular
 * frame times.
 */

/**
 * @typedef {object} OneEuroParams
 * @property {number} minCutoff Cutoff (Hz) at zero speed. Lower = less jitter, more lag at rest.
 * @property {number} beta      Speed coefficient. Higher = less lag during fast motion.
 * @property {number} dCutoff   Cutoff (Hz) for the derivative estimate.
 */

/**
 * Tuned for a hand cursor in screen units (0..1) at 25-60 Hz tracking. MediaPipe jitter at rest is
 * about 0.003-0.006 screen units; at 30 Hz minCutoff 1.1 Hz gives alpha ~0.19 which removes it,
 * while a 1 screen/s swipe pushes the cutoff to ~6.6 Hz (~25 ms lag).
 * @type {OneEuroParams}
 */
export const CURSOR_FILTER = { minCutoff: 1.1, beta: 5.5, dCutoff: 1.2 };

/** Lighter filtering for the landmark *shape* (purely visual). @type {OneEuroParams} */
export const SHAPE_FILTER = { minCutoff: 2.2, beta: 2.5, dCutoff: 1.2 };

function smoothingAlpha(cutoffHz, dt) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

/** Largest dt (s) the filter will integrate over; protects against tab stalls. */
const MAX_DT = 0.1;
/** Smallest dt (s); protects against duplicate timestamps. */
const MIN_DT = 1 / 1000;

export class OneEuroFilter {
  /** @param {OneEuroParams} [params] */
  constructor(params = CURSOR_FILTER) {
    this.params = params;
    this._x = 0;
    this._dx = 0;
    this._lastT = -1;
    this._init = false;
  }

  /** Filter value `v` sampled at time `t` (seconds). @param {number} v @param {number} t */
  filter(v, t) {
    if (!this._init) {
      this._x = v; this._dx = 0; this._lastT = t; this._init = true;
      return v;
    }
    let dt = t - this._lastT;
    this._lastT = t;
    if (!(dt > MIN_DT)) dt = MIN_DT;
    if (dt > MAX_DT) dt = MAX_DT;

    const { minCutoff, beta, dCutoff } = this.params;
    const rawDx = (v - this._x) / dt;
    this._dx += smoothingAlpha(dCutoff, dt) * (rawDx - this._dx);
    const cutoff = minCutoff + beta * Math.abs(this._dx);
    this._x += smoothingAlpha(cutoff, dt) * (v - this._x);
    return this._x;
  }

  /** Current filtered value (last output). */
  get value() { return this._x; }
  /** Current filtered derivative (value units / s). */
  get derivative() { return this._dx; }
  get ready() { return this._init; }

  /** Forget history; the next sample passes through unfiltered. */
  reset() { this._init = false; this._dx = 0; }

  /** Jump to a value without history (e.g. hand re-acquired). @param {number} v @param {number} t */
  snap(v, t) { this._x = v; this._dx = 0; this._lastT = t; this._init = true; }
}

/**
 * 2D One Euro filter. The speed term uses the *vector* speed so both axes open up together on
 * diagonal motion (two independent scalar filters would lag more on the slower axis and bend
 * straight swipes).
 */
export class OneEuroFilter2D {
  /** @param {OneEuroParams} [params] */
  constructor(params = CURSOR_FILTER) {
    this.params = params;
    this._x = 0; this._y = 0; this._dx = 0; this._dy = 0;
    this._lastT = -1;
    this._init = false;
  }

  /** @param {number} vx @param {number} vy @param {number} t seconds @returns {{x:number,y:number}} */
  filter(vx, vy, t) {
    if (!this._init) {
      this.snap(vx, vy, t);
      return { x: vx, y: vy };
    }
    let dt = t - this._lastT;
    this._lastT = t;
    if (!(dt > MIN_DT)) dt = MIN_DT;
    if (dt > MAX_DT) dt = MAX_DT;

    const { minCutoff, beta, dCutoff } = this.params;
    const ad = smoothingAlpha(dCutoff, dt);
    this._dx += ad * ((vx - this._x) / dt - this._dx);
    this._dy += ad * ((vy - this._y) / dt - this._dy);
    const speed = Math.hypot(this._dx, this._dy);
    const a = smoothingAlpha(minCutoff + beta * speed, dt);
    this._x += a * (vx - this._x);
    this._y += a * (vy - this._y);
    return { x: this._x, y: this._y };
  }

  get value() { return { x: this._x, y: this._y }; }
  get ready() { return this._init; }

  reset() { this._init = false; this._dx = 0; this._dy = 0; }

  /** @param {number} x @param {number} y @param {number} t */
  snap(x, y, t) { this._x = x; this._y = y; this._dx = 0; this._dy = 0; this._lastT = t; this._init = true; }
}
