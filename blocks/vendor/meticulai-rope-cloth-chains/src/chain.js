// Cloth chains (from Inkbound): short verlet chains in WORLD space, pinned at one end to a point on a body. Because
// they live in the world they trail every motion of the body for free: ribbons, hair, scarf, sash, sleeve
// corners, hems, tails, antennae, banners. This is the 2D version (y up); chain3.js is the same in 3D.

export class Chain {
  /**
   * @param {number} n      nodes, including the pinned one
   * @param {number} seg    rest length of each link
   * @param {number} grav   downward acceleration (units/s^2)
   * @param {number} drag   0..1 velocity kept per 1/60 s (low = floats and trails, high = heavy and swings)
   * @param {number} [stiff] 0..: pull of each node toward its rest direction (hair and scarves keep a shape; ribbons do not)
   */
  constructor(n, seg, grav, drag, stiff = 0) {
    this.n = n;
    this.seg = seg;
    this.grav = grav;
    this.drag = drag;
    this.stiff = stiff;
    /** if the pin jumps further than this in one step (|dx| + |dy|), the chain resets instead of whipping across */
    this.snap = 420;
    /** @type {Float32Array} */ this.x = new Float32Array(n);
    /** @type {Float32Array} */ this.y = new Float32Array(n);
    this.ox = new Float32Array(n);
    this.oy = new Float32Array(n);
    this.live = false;
  }

  /** Hang from (ax, ay) along (dx, dy), at rest. */
  reset(ax, ay, dx, dy) {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.ox[i] = ax + dx * this.seg * i;
      this.y[i] = this.oy[i] = ay + dy * this.seg * i;
    }
    this.live = true;
  }

  /**
   * Advance by dt seconds with the pin at (ax, ay).
   * @param {number} ax pin x, world
   * @param {number} ay pin y, world
   * @param {number} rx rest direction x (unit): where the chain would like to point (used by `stiff`, and on reset)
   * @param {number} ry rest direction y
   * @param {number} dt seconds (any frame time; capped at 1/24 and split in two above 1/80)
   * @param {number} wx wind x, units/s^2
   * @param {number} wy wind y, units/s^2
   * @param {number} floor world y of the ground under it (nodes stay 2 units above it)
   */
  step(ax, ay, rx, ry, dt, wx, wy, floor) {
    const n = this.n, x = this.x, y = this.y, ox = this.ox, oy = this.oy, seg = this.seg;
    if (!this.live || Math.abs(ax - x[0]) + Math.abs(ay - y[0]) > this.snap) { this.reset(ax, ay, rx, ry); return; }
    const steps = dt > 1 / 80 ? 2 : 1;
    const h = Math.min(dt, 1 / 24) / steps;
    const keep = Math.pow(this.drag, h * 60);
    const sx = x[0], sy = y[0];
    for (let st = 1; st <= steps; st++) {
      // The pin moves in a straight line across the substeps, so a fast body does not yank the chain.
      const k = st / steps;
      const pxn = sx + (ax - sx) * k, pyn = sy + (ay - sy) * k;
      x[0] = pxn; y[0] = pyn; ox[0] = pxn; oy[0] = pyn;
      for (let i = 1; i < n; i++) {
        let vx = (x[i] - ox[i]) * keep, vy = (y[i] - oy[i]) * keep;
        ox[i] = x[i]; oy[i] = y[i];
        vx += wx * h * h; vy += (wy - this.grav) * h * h;
        if (this.stiff > 0) {
          // Stronger near the pin, fading toward the tip: hair keeps its sweep, the ends still flick.
          const s = this.stiff * h * h * (1 - (i - 1) / n);
          vx += (pxn + rx * seg * i - x[i]) * s; vy += (pyn + ry * seg * i - y[i]) * s;
        }
        x[i] += vx; y[i] += vy;
      }
      // Two passes of length constraints; the first link only moves its free end (the pin is fixed).
      for (let it = 0; it < 2; it++) {
        for (let i = 1; i < n; i++) {
          const dx = x[i] - x[i - 1], dy = y[i] - y[i - 1];
          const d = Math.hypot(dx, dy) || 1e-3;
          const c = (d - seg) / d;
          if (i === 1) { x[i] -= dx * c; y[i] -= dy * c; }
          else { x[i] -= dx * c * 0.5; y[i] -= dy * c * 0.5; x[i - 1] += dx * c * 0.5; y[i - 1] += dy * c * 0.5; }
        }
        x[0] = pxn; y[0] = pyn;
      }
      // Floor: stop above it and lose half the sideways speed (cloth drags on the ground).
      for (let i = 1; i < n; i++) if (y[i] < floor + 2) { y[i] = floor + 2; ox[i] += (x[i] - ox[i]) * 0.5; }
    }
  }

  /** Re-hang the chain on the next step (when the body is teleported, e.g. a new round). */
  kill() {
    this.live = false;
  }
}

/**
 * Adds a chain to the current Canvas 2D path as a tapered strip (w0 wide at the pin, w1 at the free end, both
 * half-widths); the pin is drawn at (ax, ay). `tipLen` adds a pointed tip. Then fill() it.
 * @param {CanvasRenderingContext2D} c
 * @param {Chain} ch
 */
export function chainPath(c, ch, ax, ay, w0, w1, tipLen = 0) {
  const n = ch.n, x = ch.x, y = ch.y;
  // left side out, right side back
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < n; j++) {
      const i = pass === 0 ? j : n - 1 - j;
      const xi = i === 0 ? ax : x[i], yi = i === 0 ? ay : y[i];
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const x0 = i0 === 0 ? ax : x[i0], y0 = i0 === 0 ? ay : y[i0];
      let tx = x[i1] - x0, ty = y[i1] - y0;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const w = (w0 + (w1 - w0) * (i / (n - 1))) * (pass === 0 ? 1 : -1);
      const qx = xi - ty * w, qy = yi + tx * w;
      if (pass === 0 && j === 0) c.moveTo(qx, qy);
      else c.lineTo(qx, qy);
      if (pass === 0 && j === n - 1 && tipLen > 0) c.lineTo(xi + tx * tipLen, yi + ty * tipLen);
    }
  }
  c.closePath();
}
