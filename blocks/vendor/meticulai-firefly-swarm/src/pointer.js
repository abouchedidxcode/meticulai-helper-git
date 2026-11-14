/**
 * A mouse or touch pointer as a "hand" with an openness, the way the game's pointer mode felt:
 *   hold the button   the hand closes over POINTER_CLOSE_S (0.55 s): always slow enough to count as a gentle catch
 *   quick tap/click   (released within TAP_S, 0.15 s) the hand snaps shut in 50 ms: a frantic snatch that startles
 *   let go            the hand opens again over 0.22 s (over the jar: the fireflies go in)
 * Openness is simply 1 - close here. In the game the pointer drove a synthetic hand through a gesture engine first;
 * the timings, and so the slow / frantic outcome, are the same.
 */

/** Seconds for a held button to close the hand fully. Slow enough to always count as a gentle catch. */
export const POINTER_CLOSE_S = 0.55;
/** A tap shorter than this snaps the hand shut (frantic). */
export const TAP_S = 0.15;
/** Seconds to open again after letting go. */
export const POINTER_OPEN_S = 0.22;

export class PointerHand {
  /**
   * @param {HTMLElement} el element to listen on (the canvas)
   * @param {{ closeS?: number, tapS?: number, openS?: number, id?: number }} [opts]
   */
  constructor(el, opts = {}) {
    this.el = el;
    this.closeS = opts.closeS ?? POINTER_CLOSE_S;
    this.tapS = opts.tapS ?? TAP_S;
    this.openS = opts.openS ?? POINTER_OPEN_S;
    this.id = opts.id ?? 0;
    /** Screen position 0..1, y down. */
    this.x = 0.5; this.y = 0.55;
    this.down = false; this.downT = 0; this.close = 0; this.snap = 0;
    /** True once the pointer has been over the element (no hand before that). */
    this.seen = false;
    /** @param {PointerEvent} e */
    const at = (e) => {
      const r = el.getBoundingClientRect();
      this.x = (e.clientX - r.left) / Math.max(1, r.width);
      this.y = (e.clientY - r.top) / Math.max(1, r.height);
      this.seen = true;
    };
    this._down = (/** @type {PointerEvent} */ e) => { at(e); this.press(); el.setPointerCapture?.(e.pointerId); };
    this._move = (/** @type {PointerEvent} */ e) => at(e);
    this._up = () => this.lift();
    el.addEventListener('pointerdown', this._down);
    el.addEventListener('pointermove', this._move);
    el.addEventListener('pointerup', this._up);
    el.addEventListener('pointercancel', this._up);
  }

  /** Button down (also callable by a bot or test). */
  press() { this.down = true; this.downT = performance.now() / 1000; }

  /** Button up: a quick tap snaps the hand shut. */
  lift() {
    if (this.down && performance.now() / 1000 - this.downT < this.tapS && this.close < 0.5) this.snap = 0.16; // quick tap: snap shut
    this.down = false;
  }

  /** Advance the closing; returns openness (1 open .. 0 fist). @param {number} dt seconds */
  update(dt) {
    const p = this;
    if (p.snap > 0) { p.snap -= dt; p.close = p.snap > 0.08 ? Math.min(1, p.close + dt / 0.05) : Math.max(0, p.close - dt / 0.12); }
    else if (p.down) p.close = Math.min(1, p.close + dt / this.closeS);
    else p.close = Math.max(0, p.close - dt / this.openS);
    return 1 - p.close;
  }

  get openness() { return 1 - this.close; }

  dispose() {
    const el = this.el;
    el.removeEventListener('pointerdown', this._down);
    el.removeEventListener('pointermove', this._move);
    el.removeEventListener('pointerup', this._up);
    el.removeEventListener('pointercancel', this._up);
  }
}
