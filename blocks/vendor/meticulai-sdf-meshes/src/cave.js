// Seeded 3D caves as a density field: positive = rock, negative = open space, roughly the
// distance to the nearest wall. The open space is a smooth union of "tubes" (swept spheres:
// passages, shafts, chambers), domain-warped so no wall is ever geometric, then roughened with
// noise. Mesh it in chunks with chunks.js; sample the same field for collision, so what the
// player sees is what they hit.
//
// You can write the tube list by hand, or let makeCaveLayout(seed) plan a whole winding cave.
// All numbers default to the values tuned in Abyssal (1 unit = 1 m).
//
// No imports except noise.js. From Abyssal by Meticulai.

import { Noise, clamp, mulberry32 } from './noise.js';

/**
 * A swept sphere of open space from a to b (radius ra at a, rb at b). a == b gives a round room.
 * kind: 'passage' | 'neck' | 'shortcut' | 'chamber' | 'cavern' (rooms are made a little bigger).
 * @typedef {{ ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number, kind?: string }} Tube
 */

/** Tube kinds treated as rooms (their distance is scaled by roomScale, which widens them). */
export const ROOM_KINDS = ['chamber', 'cavern'];

/** Make a tube from two points. */
export function caveTube(a, b, ra, rb = ra, kind = 'passage') {
  return { ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], ra, rb, kind };
}

/**
 * Signed distance to the open space of one tube (negative inside). The cross-section is squashed
 * vertically (squashY 1.18) so passages read as caves with floors, not drainpipes.
 * @param {Tube} t
 */
export function tubeSDF(t, px, py, pz, squashY = 1.18) {
  const bax = t.bx - t.ax, bay = t.by - t.ay, baz = t.bz - t.az;
  const pax = px - t.ax, pay = py - t.ay, paz = pz - t.az;
  const l2 = bax * bax + bay * bay + baz * baz;
  let h = l2 > 1e-6 ? (pax * bax + pay * bay + paz * baz) / l2 : 0;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = (pay - bay * h) * squashY, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (t.ra + (t.rb - t.ra) * h);
}

/** @param {Tube} t */
export function tubeBounds(t) {
  const r = Math.max(t.ra, t.rb);
  return {
    minX: Math.min(t.ax, t.bx) - r, maxX: Math.max(t.ax, t.bx) + r,
    minY: Math.min(t.ay, t.by) - r, maxY: Math.max(t.ay, t.by) + r,
    minZ: Math.min(t.az, t.bz) - r, maxZ: Math.max(t.az, t.bz) + r,
  };
}

/** Default field settings (Abyssal's tuned values). */
export const CAVE_DEFAULTS = {
  /** domain warp: how far (m) walls wander, per axis, and the warp's frequency (1/m) */
  warpAmp: [4.5, 3.5, 4.5],
  warpFreq: 0.03,
  /** smooth-union radius between tubes (m): how rounded the junctions are */
  blend: 5,
  /** chambers and caverns: distance multiplied by this (under 1 widens them) */
  roomScale: 0.9,
  /** vertical squash of every tube's cross-section */
  squashY: 1.18,
  /** distance returned far from any tube (solid rock), and the cap on the field */
  cap: 30,
  /** surface detail is skipped where |distance| > detailBand (it cannot change the sign there) */
  detailBand: 9,
  /** wall roughness: big lumps (amplitude m, frequency 1/m), finer lumps, ridged ledges */
  roughAmp: 1.9,
  roughFreq: 0.06,
  fineAmp: 1.2,
  fineFreq: 0.11,
  ridgeAmp: 0.55,
  ridgeFreq: [0.21, 0.25, 0.21],
  /** extra roughness below given depths: [{ y, add }], each ramped over roughRamp metres. Abyssal: [{ y: -250, add: 0.5 }, { y: -520, add: 0.5 }] */
  roughDeepening: [],
  roughRamp: 40,
  /** optional floor: everything below floorY (+- floorNoise m) is rock. null = no floor */
  floorY: null,
  floorNoise: 3,
  /** spatial hash for tube lookup: cell size and padding (m) */
  hashCell: 16,
  hashPad: 12,
};

const key3 = (i, j, k) => ((i + 1024) * 2048 + (j + 1024)) * 2048 + (k + 1024);
const EMPTY = [];

/**
 * The cave density field. Build it from a plain spec ({ seed, tubes, ...options }) so a Web Worker
 * can build an identical copy from the same spec.
 */
export class CaveField {
  /** @param {{ seed: number, tubes: Tube[] } & Partial<typeof CAVE_DEFAULTS>} spec */
  constructor(spec) {
    this.spec = spec;
    this.seed = spec.seed | 0;
    this.tubes = spec.tubes;
    this.o = { ...CAVE_DEFAULTS, ...spec };
    this.noise = new Noise(this.seed);
    this.cells = new Map();
    const C = this.o.hashCell, p = this.o.hashPad;
    for (const t of this.tubes) {
      const b = tubeBounds(t);
      // pad by the smooth-union radius and the domain warp so nothing is missed
      for (let i = Math.floor((b.minX - p) / C); i <= Math.floor((b.maxX + p) / C); i++)
        for (let j = Math.floor((b.minY - p) / C); j <= Math.floor((b.maxY + p) / C); j++)
          for (let k = Math.floor((b.minZ - p) / C); k <= Math.floor((b.maxZ + p) / C); k++) {
            const key = key3(i, j, k);
            let arr = this.cells.get(key);
            if (!arr) this.cells.set(key, (arr = []));
            arr.push(t);
          }
    }
  }

  /** Tubes that can affect this point. */
  tubesNear(x, y, z) {
    const C = this.o.hashCell;
    return this.cells.get(key3(Math.floor(x / C), Math.floor(y / C), Math.floor(z / C))) ?? EMPTY;
  }

  /** Signed distance to open space, before surface detail (negative = open). */
  open(x, y, z) {
    const o = this.o;
    const tubes = this.tubesNear(x, y, z);
    if (tubes.length === 0) return o.cap;
    const n = this.noise;
    const f = o.warpFreq;
    const wx = x + o.warpAmp[0] * n.noise3(x * f + 11.3, y * f, z * f);
    const wy = y + o.warpAmp[1] * n.noise3(x * f - 7.1, y * f + 31.7, z * f);
    const wz = z + o.warpAmp[2] * n.noise3(x * f, y * f - 5.3, z * f + 17.9);
    let d = 1e9;
    const k = o.blend;
    for (let i = 0; i < tubes.length; i++) {
      const t = tubes[i];
      let s = tubeSDF(t, wx, wy, wz, o.squashY);
      if (ROOM_KINDS.includes(t.kind)) s *= o.roomScale;
      // polynomial smooth min (Inigo Quilez)
      const h = clamp(0.5 + (0.5 * (s - d)) / k, 0, 1);
      d = s + (d - s) * h - k * h * (1 - h);
    }
    if (o.floorY !== null && o.floorY !== undefined) d = Math.max(d, o.floorY - y + o.floorNoise * n.noise3(x * 0.05, 3.3, z * 0.05));
    return Math.min(d, o.cap);
  }

  /** Rock density: positive = rock, negative = open, about the distance to the wall in metres. */
  density(x, y, z) {
    const o = this.o;
    const d0 = this.open(x, y, z);
    // far from any wall the detail can't change the sign: skip it
    if (d0 > o.detailBand || d0 < -o.detailBand) return d0;
    const n = this.noise;
    let amp = o.roughAmp;
    for (const s of o.roughDeepening) amp += s.add * Math.min(1, Math.max(0, (s.y - y) / o.roughRamp + 0.5));
    let d = d0 + amp * n.fbm3(x * o.roughFreq, y * o.roughFreq, z * o.roughFreq, 3);
    d += o.fineAmp * n.fbm3(x * o.fineFreq, y * o.fineFreq, z * o.fineFreq, 2);
    d += o.ridgeAmp * (n.ridge3(x * o.ridgeFreq[0], y * o.ridgeFreq[1], z * o.ridgeFreq[2], 2) - 0.6);
    return d;
  }

  /** As an SDF (negative inside rock), for meshSDF() or the parts mesher. */
  sdf(x, y, z) {
    return -this.density(x, y, z);
  }

  /** Gradient by central differences (points into rock). */
  grad(x, y, z, out = { x: 0, y: 0, z: 0 }, e = 0.35) {
    out.x = (this.density(x + e, y, z) - this.density(x - e, y, z)) / (2 * e);
    out.y = (this.density(x, y + e, z) - this.density(x, y - e, z)) / (2 * e);
    out.z = (this.density(x, y, z + e) - this.density(x, y, z - e)) / (2 * e);
    return out;
  }

  /** March down from (x, y, z) to the first rock. Returns the floor's y or null. */
  findFloor(x, y, z, maxDrop = 40) {
    if (this.density(x, y, z) > 0) return null;
    let py = y;
    for (let s = 0; s < maxDrop / 0.5; s++) {
      py -= 0.5;
      if (this.density(x, py, z) > 0) {
        let lo = py, hi = py + 0.5;
        for (let i = 0; i < 6; i++) {
          const m = (lo + hi) / 2;
          if (this.density(x, m, z) > 0) lo = m; else hi = m;
        }
        return hi;
      }
    }
    return null;
  }
}

/**
 * Plan a whole cave from a seed: a route that winds forward (toward -z) and down from `start`,
 * mixing long galleries, sheer shafts and ordinary slopes, with side chambers through narrow necks,
 * the odd tight shortcut that skips a bend, and a great cavern at the bottom.
 * Returns { seed, tubes, path, chambers, cavern, floorY } (pass seed, tubes and floorY to CaveField).
 * @param {number} seed
 * @param {{ start?: number[], startRadius?: number, bottomY?: number, bands?: { top: number, r: [number, number], chamber: number }[], shortcutChance?: number, cavern?: boolean }} [opts]
 */
export function makeCaveLayout(seed, opts = {}) {
  const {
    start = [0, -8, -4],
    startRadius = 12,
    bottomY = -760, // the floor; the route stops 50 m above it and opens into the cavern
    // passage radius ranges and side-chamber chance per depth band (top of each band, highest first)
    bands = [
      { top: Infinity, r: [7.5, 12], chamber: 0.5 },
      { top: -250, r: [9, 15], chamber: 0.6 },
      { top: -520, r: [12, 19], chamber: 0.6 },
    ],
    shortcutChance = 0.16,
    cavern: withCavern = true,
  } = opts;
  const rnd = mulberry32(seed * 7919 + 13);
  const R = (a, b) => a + (b - a) * rnd();
  const tubes = [], path = [], chambers = [];
  const add = (a, b, ra, rb, kind) => tubes.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, ra, rb, kind });
  const bandAt = (yy) => {
    let b = 0;
    for (let i = 0; i < bands.length; i++) if (yy <= bands[i].top) b = i;
    return b;
  };

  let x = start[0], y = start[1], z = start[2];
  path.push({ x, y, z, r: startRadius });
  // heading in the horizontal plane: 0 = toward -z. It wanders but never turns back on itself.
  let heading = 0;
  const cavernTop = bottomY + 50;
  let n = 0;
  while (y > cavernTop) {
    n++;
    const b = bandAt(y);
    let horiz, drop;
    const roll = rnd();
    if (n === 1) { horiz = R(20, 26); drop = R(6, 10); } // the mouth: an easy first run
    else if (roll < 0.22) { horiz = R(26, 38); drop = R(1, 6); } // a long gallery
    else if (roll < 0.4) { horiz = R(3, 8); drop = R(24, 36); } // a sheer shaft
    else { horiz = R(12, 24); drop = R(10, 22); }
    heading += R(-0.75, 0.75);
    heading = Math.max(-1.25, Math.min(1.25, heading));
    const r0 = path[path.length - 1].r;
    const nx = x + Math.sin(heading) * horiz;
    const nz = z - Math.cos(heading) * horiz;
    const ny = Math.max(cavernTop, y - drop);
    const rb = bands[bandAt(ny)].r;
    const r1 = R(rb[0], rb[1]);
    add({ x, y, z }, { x: nx, y: ny, z: nz }, r0, r1, 'passage');
    x = nx; y = ny; z = nz;
    path.push({ x, y, z, r: r1 });

    // side chamber: off to the left or right of the route, through a narrow neck
    if (rnd() < bands[b].chamber && y < start[1] - 16) {
      const side = rnd() < 0.5 ? -1 : 1;
      const cr = R(6.5, 11) + b * 1.5;
      const off = r1 + cr + R(4, 12);
      const a = heading + side * (Math.PI / 2 + R(-0.5, 0.5));
      const c = { x: x + Math.sin(a) * off, y: y + R(-8, 3), z: z - Math.cos(a) * off };
      add({ x, y, z }, c, R(3.4, 4.8), R(3.0, 4.6), 'neck');
      add({ x: c.x, y: c.y + cr * 0.15, z: c.z }, { x: c.x + R(-4, 4), y: c.y - cr * 0.2, z: c.z + R(-4, 4) }, cr, cr * R(0.75, 1), 'chamber');
      chambers.push({ ...c, r: cr });
    }

    // a tight shortcut that skips a bend and rejoins further down
    if (path.length > 3 && rnd() < shortcutChance) {
      const back = path[path.length - 3];
      const sa = heading + (rnd() < 0.5 ? -1 : 1) * Math.PI / 2;
      const off = R(12, 22);
      const m = { x: (back.x + x) / 2 + Math.sin(sa) * off, y: (back.y + y) / 2, z: (back.z + z) / 2 - Math.cos(sa) * off };
      add(back, m, R(3.2, 4.4), R(3.0, 4.0), 'shortcut');
      add(m, { x, y, z }, R(3.0, 4.0), R(3.2, 4.4), 'shortcut');
    }
  }

  let cavern = null;
  if (withCavern) {
    // the great cavern on the floor: a cluster of fat overlapping rooms
    const ahead = { x: x + Math.sin(heading) * 40, z: z - Math.cos(heading) * 40 };
    cavern = { x: ahead.x, y: bottomY + 22, z: ahead.z, r: 52 };
    add({ x, y, z }, { x: cavern.x, y: cavern.y + 8, z: cavern.z }, path[path.length - 1].r, 20, 'passage');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + R(-0.3, 0.3);
      const rr = i === 0 ? 0 : R(18, 34);
      const c = { x: cavern.x + Math.cos(a) * rr, y: cavern.y + R(-4, 6), z: cavern.z + Math.sin(a) * rr };
      add(c, { x: c.x + R(-8, 8), y: c.y - R(4, 10), z: c.z + R(-8, 8) }, R(17, 24), R(15, 21), 'cavern');
    }
  }
  return { seed, tubes, path, chambers, cavern, floorY: bottomY };
}
