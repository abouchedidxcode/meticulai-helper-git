// Flock simulation (from Murmur by Meticulai, meticulai.com): a few thousand boids on the CPU with a counting-sort
// spatial hash. Birds live in world space. The player sets a target point; each bird blends
//   - attraction to the target (outside a "core" radius, so the cloud has volume and swirls)
//   - matching the flyway's forward flow
//   - separation / alignment / local cohesion with nearby birds (first K found)
//   - obstacle + terrain avoidance (limited strength, so aiming still matters)
//   - a smooth per-bird wander
// Dead birds are swap-removed so live birds stay contiguous (render uses instanceCount = count).
// Units: metres and seconds; the numbers below were tuned for starlings (a cloud of 2,000-7,000 birds).

/** mulberry32: a tiny seeded random generator (public domain). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;
const HASH_MASK = HASH_SIZE - 1;

export const MODE = { LOOSE: 0, GATHER: 1 };

// The game's tuned numbers. Weights are accelerations (m/s^2 per unit of each steering term).
export const DEFAULT_PARAMS = {
  neighborR: 2.0, // neighbour search radius (shrinks when gathered)
  sepR: 1.35, // personal space, loose
  sepRGather: 0.62, // personal space, gathered
  maxNeighbors: 10, // stop after the first K neighbours found (cheap, and real starlings track ~7)
  wSep: 34, // separation
  wAli: 2.6, // alignment (match neighbours' velocity)
  wCoh: 0.35, // local cohesion (weak: the target and swirl hold the cloud together)
  wTarget: 3.2, // pull toward the target, loose
  wTargetGather: 9.0, // pull toward the target, gathered
  wFlow: 1.6, // match the flyway's flow velocity
  wWander: 2.0, // per-bird wander
  wSwirl: 7.5, // the coherent swirl field (what makes it look like a murmuration)
  swirlSpeed: 0.55, // how fast the swirl field evolves
  maxRel: 18, // max speed relative to the flow, m/s (doubles during a scatter)
};

export class Flock {
  /**
   * @param {number} [max] capacity (arrays are allocated once)
   * @param {{ seed?: number, params?: Partial<typeof DEFAULT_PARAMS> }} [opts] seed for spawn/burst randomness
   *   (same seed + same calls = same flock); params override the tuned defaults
   */
  constructor(max = 5000, opts = {}) {
    this.max = max;
    this.random = opts.seed == null ? Math.random : mulberry32(opts.seed);
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.acc = new Float32Array(max * 3);
    // per-bird: x = flap phase offset, y = bank (radians), z = wander seed, w = size jitter
    this.misc = new Float32Array(max * 4);
    this.age = new Float32Array(max); // seconds since joining (for join animation / grace)

    this.cellOf = new Int32Array(max);
    this.cellStart = new Int32Array(HASH_SIZE + 1);
    this.sorted = new Int32Array(max);

    this.target = [0, 0, 0]; // where the player wants the flock (world)
    this.flow = [0, 0, 1]; // world velocity of the flyway frame (the flock travels with it; [0, 0, 0] to hover)
    this.tightness = 0; // 0 loose .. 1 gathered (smoothed)
    this.scatter = 0; // 0..1 decays after a scatter burst
    this.time = 0;

    // tunables (see DEFAULT_PARAMS)
    this.p = { ...DEFAULT_PARAMS, ...(opts.params || {}) };

    this.centroid = [0, 0, 0];
    this.radius = 0; // rms radius around centroid
    this.onDeath = null; // (x,y,z,vx,vy,vz,cause) => void
  }

  // Loose-flock core radius scales with bird count: more birds = bigger cloud = harder to thread gaps.
  coreRadius(t) {
    const n = Math.max(this.count, 1);
    const loose = 2.2 + Math.cbrt(n) * 0.72;
    const tight = 0.9 + Math.cbrt(n) * 0.26;
    return loose + (tight - loose) * t;
  }

  spawn(n, cx, cy, cz, spread = 6, vx = 0, vy = 0, vz = 0) {
    const added = Math.min(n, this.max - this.count);
    for (let k = 0; k < added; k++) {
      const i = this.count++;
      const u = this.random(), v = this.random(), w = Math.cbrt(this.random());
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      const r = spread * w;
      this.pos[i * 3] = cx + r * Math.sin(ph) * Math.cos(th);
      this.pos[i * 3 + 1] = cy + r * Math.cos(ph) * 0.6;
      this.pos[i * 3 + 2] = cz + r * Math.sin(ph) * Math.sin(th);
      this.vel[i * 3] = vx + (this.random() - 0.5) * 2;
      this.vel[i * 3 + 1] = vy + (this.random() - 0.5) * 2;
      this.vel[i * 3 + 2] = vz + (this.random() - 0.5) * 2;
      this.misc[i * 4] = this.random() * 100;
      this.misc[i * 4 + 1] = 0;
      this.misc[i * 4 + 2] = this.random() * 1000;
      this.misc[i * 4 + 3] = 0.85 + this.random() * 0.3;
      this.age[i] = 0;
    }
    return added;
  }

  kill(i, cause = 0, silent = false) {
    const j = --this.count;
    if (this.onDeath && !silent) {
      this.onDeath(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2], cause);
    }
    if (i !== j) {
      for (let c = 0; c < 3; c++) {
        this.pos[i * 3 + c] = this.pos[j * 3 + c];
        this.vel[i * 3 + c] = this.vel[j * 3 + c];
      }
      for (let c = 0; c < 4; c++) this.misc[i * 4 + c] = this.misc[j * 4 + c];
      this.age[i] = this.age[j];
    }
  }

  burst() {
    this.scatter = 1;
    const [cx, cy, cz] = this.centroid;
    for (let i = 0; i < this.count; i++) {
      let dx = this.pos[i * 3] - cx, dy = this.pos[i * 3 + 1] - cy, dz = this.pos[i * 3 + 2] - cz;
      const d = Math.hypot(dx, dy, dz) + 0.001;
      const s = (11 + this.random() * 7) / d;
      this.vel[i * 3] += dx * s;
      this.vel[i * 3 + 1] += dy * s * 0.7;
      this.vel[i * 3 + 2] += dz * s * 0.5;
    }
  }

  _hash(x, y, z) {
    // large primes, then mask
    return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & HASH_MASK;
  }

  _buildGrid(cell) {
    const n = this.count, pos = this.pos, inv = 1 / cell;
    const start = this.cellStart;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const h = this._hash(Math.floor(pos[i * 3] * inv), Math.floor(pos[i * 3 + 1] * inv), Math.floor(pos[i * 3 + 2] * inv));
      this.cellOf[i] = h;
      start[h + 1]++;
    }
    for (let h = 0; h < HASH_SIZE; h++) start[h + 1] += start[h];
    // fill using a cursor copy
    const cursor = this._cursor || (this._cursor = new Int32Array(HASH_SIZE));
    cursor.set(start.subarray(0, HASH_SIZE));
    for (let i = 0; i < n; i++) this.sorted[cursor[this.cellOf[i]]++] = i;
  }

  /**
   * Advance the flock by dt seconds (the game capped dt at 1/30).
   * @param {number} dt
   * @param {{ colliders?: Array<{ sdf(x:number,y:number,z:number,out:Float32Array):boolean }>,
   *   predators?: Array<{ x:number, y:number, z:number, r:number, k:number }>, groundAt?: (x:number, z:number) => number,
   *   wind?: number[], immortal?: boolean }} [world] birds die on the ground or inside a collider unless immortal
   */
  step(dt, world) {
    const n = this.count;
    if (n === 0) return;
    this.time += dt;
    const P = this.p;
    const t = this.tightness;
    const sc = this.scatter;
    const pos = this.pos, vel = this.vel, acc = this.acc, misc = this.misc;

    const sepR = P.sepR + (P.sepRGather - P.sepR) * t;
    const nR = Math.max(P.neighborR * (1 - 0.45 * t), sepR * 1.6);
    const nR2 = nR * nR, sepR2 = sepR * sepR;
    const core = this.coreRadius(t) * (1 + sc * 1.6);
    const wT = (P.wTarget + (P.wTargetGather - P.wTarget) * t) * (1 - sc * 0.85);
    const wCoh = P.wCoh * (1 - sc);
    const [tx, ty, tz] = this.target;
    const [fx, fy, fz] = this.flow;
    const flowSpeed = Math.hypot(fx, fy, fz);

    this._buildGrid(nR);
    const inv = 1 / nR;
    const start = this.cellStart, sorted = this.sorted;
    const maxN = P.maxNeighbors;
    const time = this.time;
    // swirl field frame: follows the centroid, wavelength scales with the flock's size
    const [mcx, mcy, mcz] = this.centroid;
    const kS = 2.2 / Math.max(4, this.coreRadius(t));
    const ph1 = time * P.swirlSpeed, ph2 = time * P.swirlSpeed * 0.77 + 1.3, ph3 = time * P.swirlSpeed * 1.21 + 2.1;

    for (let i = 0; i < n; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      const vx = vel[i * 3], vy = vel[i * 3 + 1], vz = vel[i * 3 + 2];
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, found = 0;
      const gx = Math.floor(px * inv), gy = Math.floor(py * inv), gz = Math.floor(pz * inv);
      outer: for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        const h = this._hash(gx + ox, gy + oy, gz + oz);
        for (let k = start[h], e = start[h + 1]; k < e; k++) {
          const j = sorted[k];
          if (j === i) continue;
          const dx = px - pos[j * 3], dy = py - pos[j * 3 + 1], dz = pz - pos[j * 3 + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > nR2 || d2 < 1e-6) continue;
          if (d2 < sepR2) {
            const f = (sepR2 - d2) / (sepR2 * Math.sqrt(d2));
            sx += dx * f; sy += dy * f; sz += dz * f;
          }
          ax += vel[j * 3]; ay += vel[j * 3 + 1]; az += vel[j * 3 + 2];
          cx += pos[j * 3]; cy += pos[j * 3 + 1]; cz += pos[j * 3 + 2];
          if (++found >= maxN) break outer;
        }
      }

      let fxA = sx * P.wSep, fyA = sy * P.wSep, fzA = sz * P.wSep;
      if (found > 0) {
        const invF = 1 / found;
        fxA += (ax * invF - vx) * P.wAli;
        fyA += (ay * invF - vy) * P.wAli;
        fzA += (az * invF - vz) * P.wAli;
        fxA += (cx * invF - px) * wCoh;
        fyA += (cy * invF - py) * wCoh;
        fzA += (cz * invF - pz) * wCoh;
      }

      // target attraction outside the core
      const dxT = tx - px, dyT = ty - py, dzT = tz - pz;
      const dT = Math.hypot(dxT, dyT, dzT) + 1e-4;
      const over = dT - core;
      if (over > 0) {
        const f = wT * Math.min(over, 30) / dT;
        fxA += dxT * f; fyA += dyT * f * 1.15; fzA += dzT * f;
      } else {
        // gentle inner pull keeps the cloud from drifting apart inside the core
        const f = wT * 0.03;
        fxA += dxT * f; fyA += dyT * f; fzA += dzT * f;
      }

      // match the flyway's forward flow
      fxA += (fx - vx) * P.wFlow;
      fyA += (fy - vy) * P.wFlow;
      fzA += (fz - vz) * P.wFlow;

      // coherent swirl: an ABC (Arnold–Beltrami–Childress) flow anchored to the flock. It's
      // divergence-free and chaotic, so whole regions of the cloud fold and roll together the way a
      // murmuration does, instead of each bird jittering on its own.
      const qx = (px - mcx) * kS, qy = (py - mcy) * kS * 1.4, qz = (pz - mcz) * kS;
      const ux = Math.sin(qz + ph1) + Math.cos(qy + ph2);
      const uy = Math.sin(qx + ph3) + Math.cos(qz + ph1);
      const uz = Math.sin(qy + ph2) + Math.cos(qx + ph3);
      const ww = P.wSwirl * (1 - 0.55 * t);
      fxA += ux * ww; fyA += uy * ww * 0.6; fzA += uz * ww * 0.8;
      // a little individual wander on top
      const sd = misc[i * 4 + 2];
      const wj = P.wWander * (1 - 0.6 * t);
      fxA += Math.sin(time * 0.9 + sd) * Math.cos(time * 0.37 + sd * 1.7) * wj;
      fyA += Math.sin(time * 0.71 + sd * 2.3) * wj * 0.55;
      fzA += Math.cos(time * 0.83 + sd * 0.6) * wj * 0.5;

      acc[i * 3] = fxA; acc[i * 3 + 1] = fyA; acc[i * 3 + 2] = fzA;
    }

    // obstacle + ground avoidance and integration
    const cols = world?.colliders || [];
    // predators: { x, y, z, r, k } — birds flee inside r (the flash-expansion ripple of a real murmuration)
    const preds = world?.predators || [];
    const wind = world?.wind, windK = 1 - 0.6 * this.tightness;
    const out = this._out || (this._out = new Float32Array(4));
    let mx = 0, my = 0, mz = 0;
    for (let i = n - 1; i >= 0; i--) {
      let px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      let ax = acc[i * 3], ay = acc[i * 3 + 1], az = acc[i * 3 + 2];
      let dead = 0;

      // ground
      if (world?.groundAt) {
        const g = world.groundAt(px, pz);
        const h = py - g;
        if (h < 0.15) dead = 1;
        else if (h < 4) ay += (4 - h) * (4 - h) * 6;
      }
      // colliders: signed distance + outward normal
      for (let c = 0; c < cols.length && !dead; c++) {
        const col = cols[c];
        if (!col.sdf(px, py, pz, out)) continue; // quick reject (out of range)
        const d = out[0];
        if (d < 0) { dead = 2; break; }
        const R = 3.2;
        if (d < R) {
          const k = (1 - d / R);
          const s = k * k * 70;
          ax += out[1] * s; ay += out[2] * s; az += out[3] * s;
        }
      }
      for (let q = 0; q < preds.length; q++) {
        const pr = preds[q];
        const dx = px - pr.x, dy = py - pr.y, dz = pz - pr.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < pr.r * pr.r) {
          const d = Math.sqrt(d2) + 1e-3, k = 1 - d / pr.r;
          const s = k * k * pr.k / d;
          ax += dx * s; ay += dy * s; az += dz * s;
        }
      }
      // wind: a gathered flock holds its line better; the push varies across the cloud so it shears
      if (wind) {
        const v = 0.7 + 0.6 * ((i * 0.618034) % 1);
        ax += wind[0] * windK * v; ay += wind[1] * windK * v; az += wind[2] * windK * v;
      }
      if (dead && world?.immortal) { dead = 0; ay += 80; }
      if (dead) { this.kill(i, dead); continue; }

      let vx = vel[i * 3] + ax * dt, vy = vel[i * 3 + 1] + ay * dt, vz = vel[i * 3 + 2] + az * dt;
      // clamp velocity relative to flow
      let rx = vx - fx, ry = vy - fy, rz = vz - fz;
      const rl = Math.hypot(rx, ry, rz);
      const maxRel = P.maxRel * (1 + sc);
      if (rl > maxRel) { const s = maxRel / rl; rx *= s; ry *= s; rz *= s; vx = fx + rx; vy = fy + ry; vz = fz + rz; }
      // never fly backwards relative to the flyway
      const fwd = (vx * fx + vy * fy + vz * fz) / Math.max(flowSpeed, 1e-3);
      if (fwd < flowSpeed * 0.45) {
        const add = (flowSpeed * 0.45 - fwd) / Math.max(flowSpeed, 1e-3);
        vx += fx * add; vy += fy * add; vz += fz * add;
      }
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      pos[i * 3] = px + vx * dt; pos[i * 3 + 1] = py + vy * dt; pos[i * 3 + 2] = pz + vz * dt;

      // bank from lateral acceleration (relative to velocity), smoothed
      const sp = Math.hypot(vx, vz) + 1e-4;
      const lat = (ax * vz - az * vx) / sp; // signed lateral accel
      const b = Math.max(-1.2, Math.min(1.2, -lat * 0.035));
      misc[i * 4 + 1] += (b - misc[i * 4 + 1]) * Math.min(1, dt * 6);
      this.age[i] += dt;

      mx += pos[i * 3]; my += pos[i * 3 + 1]; mz += pos[i * 3 + 2];
    }

    const m = this.count;
    if (m > 0) {
      mx /= m; my /= m; mz /= m;
      this.centroid[0] = mx; this.centroid[1] = my; this.centroid[2] = mz;
      let r2 = 0;
      const stride = Math.max(1, Math.floor(m / 400));
      let cnt = 0;
      for (let i = 0; i < m; i += stride) {
        const dx = pos[i * 3] - mx, dy = pos[i * 3 + 1] - my, dz = pos[i * 3 + 2] - mz;
        r2 += dx * dx + dy * dy + dz * dz; cnt++;
      }
      this.radius = Math.sqrt(r2 / cnt);
    }
    this.scatter = Math.max(0, this.scatter - dt * 0.9);
  }

  // Count birds within r of a point (used by falcon strikes / straggler pickup).
  densityAt(x, y, z, r) {
    let c = 0; const r2 = r * r, pos = this.pos;
    for (let i = 0; i < this.count; i++) {
      const dx = pos[i * 3] - x, dy = pos[i * 3 + 1] - y, dz = pos[i * 3 + 2] - z;
      if (dx * dx + dy * dy + dz * dz < r2) c++;
    }
    return c;
  }
}
