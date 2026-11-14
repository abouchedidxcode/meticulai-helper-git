// The same verlet chain in 3D (y up), for three.js games: the 2D chain.js with a z axis added and nothing else
// changed (same substeps, drag curve, stiffness falloff, two constraint passes, floor rule).

export class Chain3 {
  /**
   * @param {number} n      nodes, including the pinned one
   * @param {number} seg    rest length of each link (metres in a three.js game)
   * @param {number} grav   downward acceleration (units/s^2; about 9.8 for real cloth in metres)
   * @param {number} drag   0..1 velocity kept per 1/60 s (low = floats and trails, high = heavy and swings)
   * @param {number} [stiff] 0..: pull of each node toward its rest direction (hair and scarves keep a shape)
   */
  constructor(n, seg, grav, drag, stiff = 0) {
    this.n = n;
    this.seg = seg;
    this.grav = grav;
    this.drag = drag;
    this.stiff = stiff;
    /** if the pin jumps further than this in one step (|dx| + |dy| + |dz|), the chain resets */
    this.snap = 3;
    /** distance kept above the floor (2 px in the 2D game; set it to about the cloth's thickness) */
    this.floorGap = 0.01;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.ox = new Float32Array(n); this.oy = new Float32Array(n); this.oz = new Float32Array(n);
    this.live = false;
  }

  /** Hang from a along direction d, at rest. */
  reset(ax, ay, az, dx, dy, dz) {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.ox[i] = ax + dx * this.seg * i;
      this.y[i] = this.oy[i] = ay + dy * this.seg * i;
      this.z[i] = this.oz[i] = az + dz * this.seg * i;
    }
    this.live = true;
  }

  /**
   * Advance by dt seconds with the pin at `a`.
   * @param {{x:number,y:number,z:number}|number[]} a pin, world (a Vector3 or [x, y, z])
   * @param {{x:number,y:number,z:number}|number[]} r rest direction (unit)
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number}|number[]} [w] wind, units/s^2
   * @param {number} [floor] world y of the ground
   */
  step(a, r, dt, w = ZERO, floor = -1e9) {
    const ax = a.x ?? a[0], ay = a.y ?? a[1], az = a.z ?? a[2];
    const rx = r.x ?? r[0], ry = r.y ?? r[1], rz = r.z ?? r[2];
    const wx = w.x ?? w[0], wy = w.y ?? w[1], wz = w.z ?? w[2];
    const n = this.n, x = this.x, y = this.y, z = this.z, ox = this.ox, oy = this.oy, oz = this.oz, seg = this.seg;
    if (!this.live || Math.abs(ax - x[0]) + Math.abs(ay - y[0]) + Math.abs(az - z[0]) > this.snap) {
      this.reset(ax, ay, az, rx, ry, rz);
      return;
    }
    const steps = dt > 1 / 80 ? 2 : 1;
    const h = Math.min(dt, 1 / 24) / steps;
    const keep = Math.pow(this.drag, h * 60);
    const sx = x[0], sy = y[0], sz = z[0];
    const fy = floor + this.floorGap;
    for (let st = 1; st <= steps; st++) {
      const k = st / steps;
      const px = sx + (ax - sx) * k, py = sy + (ay - sy) * k, pz = sz + (az - sz) * k;
      x[0] = ox[0] = px; y[0] = oy[0] = py; z[0] = oz[0] = pz;
      for (let i = 1; i < n; i++) {
        let vx = (x[i] - ox[i]) * keep, vy = (y[i] - oy[i]) * keep, vz = (z[i] - oz[i]) * keep;
        ox[i] = x[i]; oy[i] = y[i]; oz[i] = z[i];
        vx += wx * h * h; vy += (wy - this.grav) * h * h; vz += wz * h * h;
        if (this.stiff > 0) {
          const s = this.stiff * h * h * (1 - (i - 1) / n);
          vx += (px + rx * seg * i - x[i]) * s; vy += (py + ry * seg * i - y[i]) * s; vz += (pz + rz * seg * i - z[i]) * s;
        }
        x[i] += vx; y[i] += vy; z[i] += vz;
      }
      for (let it = 0; it < 2; it++) {
        for (let i = 1; i < n; i++) {
          const dx = x[i] - x[i - 1], dy = y[i] - y[i - 1], dz = z[i] - z[i - 1];
          const d = Math.hypot(dx, dy, dz) || 1e-3;
          const c = (d - seg) / d;
          if (i === 1) { x[i] -= dx * c; y[i] -= dy * c; z[i] -= dz * c; }
          else {
            x[i] -= dx * c * 0.5; y[i] -= dy * c * 0.5; z[i] -= dz * c * 0.5;
            x[i - 1] += dx * c * 0.5; y[i - 1] += dy * c * 0.5; z[i - 1] += dz * c * 0.5;
          }
        }
        x[0] = px; y[0] = py; z[0] = pz;
      }
      for (let i = 1; i < n; i++) {
        if (y[i] < fy) {
          y[i] = fy;
          ox[i] += (x[i] - ox[i]) * 0.5;
          oz[i] += (z[i] - oz[i]) * 0.5;
        }
      }
    }
  }

  /** Re-hang the chain on the next step (after a teleport). */
  kill() {
    this.live = false;
  }

  /** Length of the whole chain as it is now (for tests and debugging). */
  length() {
    let L = 0;
    for (let i = 1; i < this.n; i++) L += Math.hypot(this.x[i] - this.x[i - 1], this.y[i] - this.y[i - 1], this.z[i] - this.z[i - 1]);
    return L;
  }
}

const ZERO = [0, 0, 0];
