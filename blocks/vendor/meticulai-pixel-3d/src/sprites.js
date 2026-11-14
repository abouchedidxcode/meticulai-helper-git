// Procedural pixel-art sprite generator from the game Rootbound (2D canvas, crisp pixels, colours only from palette.js).
//
// Art scale: 12 art pixels = 1 world unit. In Rootbound everything sat in a side-on soil cross-section; crawling
// creatures are drawn from above (dorsal view) and turn in 16 headings, re-rasterised per heading (bitmaps are never rotated).
//
// How it works: each sprite is described as a handful of shapes (ellipsoids, polygons with a facet normal, 1 px
// lines, single pixels, custom per-pixel functions) in a local frame. A small rasteriser evaluates them at pixel
// centres into material / depth / normal buffers, then resolves every pixel to one tone of its material's ramp with
// light from the upper left. Afterwards: coloured selective outlines (dark ramp end on the shadow side, a softer tone
// on the lit side), darker separation lines where a part tucks behind another, and specular pixels. Dithering is
// used sparingly, only on materials that ask for it and only in the band between two tones.
//
// Every function is deterministic from its arguments and cached. Results: { canvas, ax, ay } where (ax, ay) is the
// anchor in canvas pixels (body centre for creatures, ground point for mushrooms).

import { RAMPS, rampHex, hexToRgb } from './palette.js';

// ---------------------------------------------------------------------------------------------------------------
// utils

function seedInt(seed) {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seedInt(seed);
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(ix, iy, s), hash2(ix + 1, iy, s), fx), lerp(hash2(ix, iy + 1, s), hash2(ix + 1, iy + 1, s), fx), fy);
}
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// light from the upper left, a little in front (world coords: +y up, +z toward the viewer)
const LIGHT = norm3(-0.58, 0.62, 0.55);
const HALF = norm3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
const BAYER2 = [[0.25, 0.75], [1.0, 0.5]];

const cache = new Map();
function cached(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); }
  return v;
}

// Where canvases come from. Browsers: <canvas> (or OffscreenCanvas in a worker). Node tests can pass a fake that
// records fillRect calls: setCanvasFactory((w, h) => ({ width: w, height: h, getContext: () => fakeCtx })).
let canvasFactory = null;
export function setCanvasFactory(fn) {
  canvasFactory = fn;
  cache.clear();
}
// Forget every cached sprite (call after editing palette.js ramps at runtime).
export function clearSpriteCache() {
  cache.clear();
}

function makeCanvas(w, h) {
  if (canvasFactory) return canvasFactory(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/**
 * Material: ramp name, tone range [lo, hi] used for diffuse shading, hl = specular tone.
 * opts: amb (ambient 0..1), spec (specular power; 0 = none), specT (threshold), dither, noOutline,
 *       out (shadow-side outline tone), litOut (tone drop on the lit side), wrap (soft light wrap)
 */
const MAT_CACHE = new Map();
function M(ramp, lo, hi, o = {}) {
  const key = `${ramp}|${lo}|${hi}|${JSON.stringify(o)}`;
  let m = MAT_CACHE.get(key);
  if (!m) { m = makeMat(ramp, lo, hi, o); MAT_CACHE.set(key, m); }
  return m;
}
function makeMat(ramp, lo, hi, o) {
  const n = RAMPS[ramp].length;
  return {
    ramp, lo, hi, hl: o.hl ?? Math.min(n - 1, hi + 1), amb: o.amb ?? 0.12, spec: o.spec ?? 0, specT: o.specT ?? 0.82,
    dither: !!o.dither, noOutline: !!o.noOutline, out: o.out ?? 0, litOut: o.litOut ?? 2, wrap: o.wrap ?? 0.25,
    outRamp: o.outRamp || ramp,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// rasteriser

class Sprite {
  constructor(w, h, ax, ay) {
    this.w = w; this.h = h; this.ax = ax; this.ay = ay;
    const n = w * h;
    this.mat = new Int16Array(n).fill(-1);
    this.z = new Float32Array(n).fill(-1e9);
    this.shade = new Float32Array(n);
    this.spec = new Float32Array(n);
    this.part = new Int16Array(n).fill(-1);
    this.fixed = new Int8Array(n).fill(-1);   // absolute ramp index override
    this.add = new Int8Array(n);               // relative tone adjust
    this.sep = new Uint8Array(n);              // part draws separation lines
    this.mats = [];
    this.matIds = new Map();
    this.rot = 0; this.ox = 0; this.oy = 0; this.mx = 1;
    this.nextPart = 0;
  }
  frame(rot = 0, ox = 0, oy = 0, mx = 1) { this.rot = rot; this.ox = ox; this.oy = oy; this.mx = mx; return this; }
  mid(m) {
    let id = this.matIds.get(m);
    if (id === undefined) { id = this.mats.length; this.mats.push(m); this.matIds.set(m, id); }
    return id;
  }
  newPart() { return this.nextPart++; }
  // local frame -> world (y up)
  toWorld(lx, ly) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.mx * (this.ox + c * lx - s * ly), this.oy + s * lx + c * ly];
  }
  // canvas pixel centre -> local frame
  pixLocal(px, py) {
    const wx = this.mx * (px + 0.5 - this.ax), wy = this.ay - (py + 0.5);
    const dx = wx - this.ox, dy = wy - this.oy;
    const c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    return [c * dx - s * dy, s * dx + c * dy];
  }
  // rotate a local-frame direction to world
  dirWorld(nx, ny) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.mx * (c * nx - s * ny), s * nx + c * ny];
  }
  light(n, m) {
    const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    const w = m.wrap;
    const dif = clamp((d + w) / (1 + w), 0, 1);
    return m.amb + (1 - m.amb) * dif;
  }
  plot(px, py, z, m, shade, part, o = {}) {
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const i = py * this.w + px;
    if (z < this.z[i]) return;
    this.z[i] = z;
    this.mat[i] = this.mid(m);
    this.shade[i] = shade;
    this.spec[i] = o.spec ?? 0;
    this.part[i] = part ?? -1;
    this.fixed[i] = o.fixed ?? -1;
    this.add[i] = o.add ?? 0;
    this.sep[i] = o.sep ? 1 : 0;
  }
  /**
   * Generic per-pixel shape in the local frame. fn(lx, ly) -> null | { z, n:[x,y,z] (local), m?, add?, fixed?, shade? }
   */
  shape(fn, { m, part = this.newPart(), sep = false } = {}) {
    for (let py = 0; py < this.h; py++) for (let px = 0; px < this.w; px++) {
      const [lx, ly] = this.pixLocal(px, py);
      const res = fn(lx, ly, px, py);
      if (!res) continue;
      const mm = res.m || m;
      let shade = res.shade, spec = 0;
      if (shade === undefined) {
        const [wx, wy] = this.dirWorld(res.n[0], res.n[1]);
        const n = norm3(wx, wy, res.n[2]);
        shade = this.light(n, mm);
        if (mm.spec) spec = Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), mm.spec);
      }
      this.plot(px, py, res.z, mm, shade, part, { spec, add: res.add, fixed: res.fixed, sep });
    }
    return part;
  }
  /** ellipsoid at (x, y) local, radii rx, ry (in its own rotation a), height rz, base depth z. */
  ellipsoid({ x = 0, y = 0, rx, ry, rz = Math.min(rx, ry), a = 0, z = 0, m, part, sep, mod, clip }) {
    const ca = Math.cos(-a), sa = Math.sin(-a), cb = Math.cos(a), sb = Math.sin(a);
    return this.shape((lx, ly) => {
      const dx = lx - x, dy = ly - y;
      const u = ca * dx - sa * dy, v = sa * dx + ca * dy;
      const q = (u * u) / (rx * rx) + (v * v) / (ry * ry);
      if (q > 1) return null;
      if (clip && !clip(u, v)) return null;
      const h = Math.sqrt(1 - q);
      const nu = u / (rx * rx), nv = v / (ry * ry);
      const res = { z: z + h * rz, n: [cb * nu - sb * nv, sb * nu + cb * nv, h / rz] };
      if (mod) mod(res, u / rx, v / ry, h);
      return res;
    }, { m, part, sep });
  }
  /** polygon (local points) with a flat facet normal (local) */
  poly(pts, { n = [0, 0, 1], z = 0, m, part, sep, mod }) {
    return this.shape((lx, ly) => {
      if (!inPoly(pts, lx, ly)) return null;
      const res = { z, n };
      if (mod) mod(res, lx, ly);
      return res;
    }, { m, part, sep });
  }
  /** 1 px line between local points, fixed tone */
  line(x0, y0, x1, y1, { m, tone, z = 0, part = this.newPart() }) {
    const [a0, b0] = this.toWorld(x0, y0), [a1, b1] = this.toWorld(x1, y1);
    const p0x = a0 + this.ax, p0y = this.ay - b0, p1x = a1 + this.ax, p1y = this.ay - b1;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p1x - p0x), Math.abs(p1y - p0y))));
    let lastX = null, lastY = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.floor(lerp(p0x, p1x, t)), py = Math.floor(lerp(p0y, p1y, t));
      if (px === lastX && py === lastY) continue;
      lastX = px; lastY = py;
      this.plot(px, py, z, m, 0, part, { fixed: tone });
    }
    return part;
  }
  polyline(pts, o) { const part = o.part ?? this.newPart(); for (let i = 0; i < pts.length - 1; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { ...o, part }); return part; }
  /** single pixel at a local point */
  dot(x, y, { m, tone, z = 0, part = this.newPart() }) {
    const [wx, wy] = this.toWorld(x, y);
    this.plot(Math.floor(wx + this.ax), Math.floor(this.ay - wy), z, m, 0, part, { fixed: tone });
    return part;
  }
  /** raw canvas pixel */
  px(px, py, { m, tone, z = 1e6 }) { this.plot(px, py, z, m, 0, -2, { fixed: tone }); }

  render({ outline = true } = {}) {
    const { w, h } = this;
    const n = w * h;
    const tone = new Int16Array(n).fill(-1);
    // resolve tones
    for (let i = 0; i < n; i++) {
      const mi = this.mat[i];
      if (mi < 0) continue;
      const m = this.mats[mi];
      let t;
      if (this.fixed[i] >= 0) t = this.fixed[i];
      else {
        const span = m.hi - m.lo + 1;
        const f = this.shade[i] * span - 0.5;
        let k = Math.round(f);
        if (m.dither) {
          const fr = f - Math.floor(f);
          if (Math.abs(fr - 0.5) < 0.16) {
            const x = i % w, y = (i / w) | 0;
            k = Math.floor(f) + (fr > BAYER2[y & 1][x & 1] ? 1 : 0);
          }
        }
        t = m.lo + clamp(k, 0, span - 1);
        if (m.spec && this.spec[i] > m.specT) t = m.hl;
      }
      tone[i] = t + this.add[i];
    }
    // separation lines: a part pixel that sits behind a neighbouring different part darkens by one
    const out = tone.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (this.mat[i] < 0 || !this.sep[i] || this.fixed[i] >= 0) continue;
      const p = this.part[i];
      let behind = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (this.mat[j] >= 0 && this.part[j] !== p && this.part[j] >= 0 && this.z[j] > this.z[i] + 0.25) { behind = true; break; }
      }
      if (behind) out[i] = Math.max(0, tone[i] - 1);
    }
    // selective outline (4-neighbour only, so lines stay 1 px clean)
    const outMat = new Int16Array(n).fill(-1);
    if (outline) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (this.mat[i] >= 0) continue;
        let best = -1, bz = -1e9, lit = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (this.mat[j] < 0 || this.mats[this.mat[j]].noOutline) continue;
          if (this.z[j] > bz) { bz = this.z[j]; best = j; lit = dx === 1 || dy === 1; }
        }
        if (best < 0) continue;
        const m = this.mats[this.mat[best]];
        outMat[i] = this.mat[best];
        out[i] = lit ? Math.max(m.out, out[best] - m.litOut) : m.out;
      }
    }
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < n; i++) {
      const mi = this.mat[i] >= 0 ? this.mat[i] : outMat[i];
      if (mi < 0) continue;
      const m = this.mats[mi];
      const ramp = this.mat[i] >= 0 ? m.ramp : m.outRamp;
      ctx.fillStyle = rampHex(ramp, out[i]);
      ctx.fillRect(i % w, (i / w) | 0, 1, 1);
    }
    return canvas;
  }
}

function inPoly(pts, x, y) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

const result = (s, extra = {}) => ({ canvas: s.render(extra.render), ax: s.ax, ay: s.ay, ...extra.data });
const dirAngle = (dir) => (((dir % 16) + 16) % 16) * (TAU / 16);

// ---------------------------------------------------------------------------------------------------------------
// BEETLE: a ground beetle seen from above, ~12 px long, 16 headings, 4-frame tripod walk

const BEETLE_KINDS = [
  { body: M('violet', 0, 3, { spec: 7, specT: 0.6, hl: 4 }), head: M('violet', 0, 2, { spec: 7, specT: 0.6, hl: 4 }), leg: ['violet', 2] },
  { body: M('gold', 0, 2, { spec: 7, specT: 0.6, hl: 4 }), head: M('trunk', 0, 3, { spec: 7, specT: 0.6, hl: 5 }), leg: ['bark', 2] },
  { body: M('slate', 0, 2, { spec: 7, specT: 0.6, hl: 4 }), head: M('slate', 0, 2, { spec: 7, specT: 0.6, hl: 4 }), leg: ['clay', 3] },
];

export function beetle(seed, dir = 0, frame = 0, chewing = false) {
  dir = ((Math.round(dir) % 16) + 16) % 16; frame = ((Math.round(frame) % 4) + 4) % 4;
  return cached(`beetle:${seed}:${dir}:${frame}:${chewing ? 1 : 0}`, () => {
    const r = rng('beetle:' + seed);
    const kind = r.pick(BEETLE_KINDS);
    const s = r.range(0.95, 1.06);
    const sp = new Sprite(21, 21, 10.5, 10.5).frame(dirAngle(dir));
    const legM = M(kind.leg[0], 0, RAMPS[kind.leg[0]].length - 1, { noOutline: true });
    const lt = kind.leg[1];
    // legs: tripod gait (L1 R2 L3 swing together)
    const ph = [1, 0, -1, 0][frame];
    const legs = [[1.9, 0.9, 2.4, 4.0], [0.3, -0.2, -0.1, 4.6], [-1.3, -1.7, -3.6, 4.3]];
    legs.forEach(([bx, kx, fx, reach], li) => {
      for (const side of [-1, 1]) {
        const tri = (li === 1) === (side > 0) ? 1 : -1;
        const sw = ph * tri * 0.9;
        const base = [bx * s, side * 1.5 * s];
        const knee = [(bx + kx + sw * 0.5) * s, side * (reach - 1.3) * s];
        const foot = [(bx + fx + sw) * s, side * reach * s];
        sp.polyline([base, knee, foot], { m: legM, tone: lt, z: -2 });
      }
    });
    // antennae
    for (const side of [-1, 1]) {
      const wig = chewing ? 0 : [0, 0.3, 0, -0.3][frame] * side;
      sp.polyline([[4.4 * s, side * 0.8 * s], [5.9 * s, side * (1.7 + wig) * s], [7.1 * s, side * (2.8 + wig) * s]], { m: legM, tone: lt, z: -1 });
    }
    // mandibles (open on alternate frames while chewing)
    const open = chewing && frame % 2 === 0;
    for (const side of [-1, 1]) sp.line(4.7 * s, side * 0.5 * s, 5.6 * s, side * (open ? 1.2 : 0.2) * s, { m: legM, tone: lt, z: 1 });
    // two elytra, each with its own highlight, meeting at a dark seam
    for (const side of [-1, 1]) {
      sp.ellipsoid({ x: -1.5 * s, y: side * 1.45 * s, rx: 4.3 * s, ry: 1.65 * s, rz: 2.4, a: side * -0.04, m: kind.body, sep: true,
        mod: (res, u, v) => { if (v * side < -0.72) res.add = -1; } });
    }
    sp.ellipsoid({ x: 2.05 * s, y: 0, rx: 1.4 * s, ry: 2.2 * s, rz: 2.0, z: 0.15, m: kind.head, sep: true });
    sp.ellipsoid({ x: 3.75 * s, y: 0, rx: 1.15 * s, ry: 1.4 * s, rz: 1.4, z: -0.3, m: kind.head, sep: true,
      mod: (res, u, v) => { if (Math.abs(v) > 0.6 && u > -0.1) res.fixed = 0; } });
    return result(sp);
  });
}

// distance-to-polyline tube (worms, grubs): pts in local coords, rad(t) radius, mod(res, t, c) for markings
function tube(sp, pts, rad, { m, z = 0, mod, part }) {
  const n = pts.length - 1;
  return sp.shape((x, y) => {
    let best = 1e9, bt = 0, bi = 0;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
      const t = clamp(((x - ax) * ex + (y - ay) * ey) / l2, 0, 1);
      const d = Math.hypot(x - ax - ex * t, y - ay - ey * t);
      if (d < best) { best = d; bt = (i + t) / n; bi = i; }
    }
    const R = rad(bt);
    if (best > R) return null;
    const [ax, ay] = pts[bi], [bx, by] = pts[bi + 1];
    const tl = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / tl, ny = (bx - ax) / tl;
    const c = clamp(((x - ax) * nx + (y - ay) * ny) / R, -1, 1);
    const res = { z: z + bt * 0.5 + Math.sqrt(1 - c * c), n: [nx * c, ny * c, Math.sqrt(Math.max(0, 1 - c * c)) + 0.05] };
    if (mod) mod(res, bt, c);
    return res;
  }, { m, part });
}

// ---------------------------------------------------------------------------------------------------------------
// GRUB: a cream beetle larva, ~10 px, segmented, amber head capsule, wriggles

export function grub(seed, dir = 0, frame = 0) {
  dir = ((Math.round(dir) % 16) + 16) % 16; frame = ((Math.round(frame) % 4) + 4) % 4;
  return cached(`grub:${seed}:${dir}:${frame}`, () => {
    const r = rng('grub:' + seed);
    const s = r.range(0.95, 1.06);
    const sp = new Sprite(19, 19, 9.5, 9.5).frame(dirAngle(dir), 0, 0, r.sign());
    const skin = M('bark', 3, 6, { amb: 0.22, spec: 9, specT: 0.86, hl: 6, out: 1, litOut: 2 });
    const head = M('gold', 1, 4, { spec: 10, specT: 0.8, hl: 5, out: 0 });
    const legM = M('gold', 0, 6, { noOutline: true });
    // a C-curled body; the curl breathes open and shut as it wriggles
    const wob = [0, 1, 0, -1][frame];
    const Rc = (2.9 + 0.25 * wob) * s, a0 = -0.95 * Math.PI + wob * 0.12, a1 = 0.5 * Math.PI;
    const pts = [];
    for (let i = 0; i <= 14; i++) { const a = lerp(a0, a1, i / 14); pts.push([Math.cos(a) * Rc - 0.6, Math.sin(a) * Rc]); }
    const hx = pts[14][0] + 0.9 * s, hy = pts[14][1] - 0.4;
    // little legs under the front segments
    for (let i = 0; i < 3; i++) {
      const [x, y] = pts[13 - i * 1];
      sp.line(x, y, x * 0.35, y * 0.35, { m: legM, tone: 3, z: -2 });
    }
    tube(sp, pts, (t) => (1.05 + 0.75 * Math.sin(Math.min(1, t * 1.25 + 0.08) * Math.PI)) * s, { m: skin,
      mod: (res, t, c) => {
        if ((t * 9 + 0.5) % 1 < 0.17 && Math.abs(c) < 0.8) res.add = -1;   // segment folds
        if (t < 0.28 && c < 0.2) res.add = (res.add || 0) - 1;              // gut showing through the rear
      } });
    sp.ellipsoid({ x: hx, y: hy, rx: 1.35 * s, ry: 1.3 * s, rz: 1.4, z: 2.2, m: head, sep: true });
    sp.dot(hx + 1.1 * s, hy - 0.6 * s, { m: legM, tone: 0, z: 4 });
    sp.dot(hx + 1.2 * s, hy + 0.3 * s, { m: legM, tone: 0, z: 4 });
    return result(sp);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// CRYSTAL: faceted prisms in a lump of rock; stages consume the prisms (4 = full, 0 = rock only); glow = active

const CRYSTAL_HUES = {
  violet: { ramp: 'violet', lo: 1, hi: 4, rim: 5 },
  rose: { ramp: 'rose', lo: 1, hi: 4, rim: 5 },
  quartz: { ramp: 'slate', lo: 2, hi: 5, rim: 5 },
};

export function crystal(seed, hue = 'violet', stage = 4, glow = 0) {
  stage = clamp(Math.round(stage), 0, 4); glow = glow ? 1 : 0;
  if (!CRYSTAL_HUES[hue]) hue = 'violet';
  return cached(`crystal:${seed}:${hue}:${stage}:${glow}`, () => {
    const r = rng('crystal:' + seed);
    const H = CRYSTAL_HUES[hue];
    const sp = new Sprite(24, 24, 12, 15);
    // rock matrix
    const rock = M('stone', 0, 3, { dither: true, amb: 0.15, out: 0 });
    const rx = r.range(5.2, 6.4), ry = r.range(2.8, 3.4);
    const sd = seedInt(seed) % 97;
    sp.ellipsoid({ x: 0, y: -2.2, rx, ry, rz: 3, z: -4, m: rock, sep: true,
      mod: (res, u, v) => { const n = vnoise(u * 3 + sd, v * 3); res.n[0] += (n - 0.5) * 0.9; res.n[1] += (vnoise(u * 3, v * 3 + sd) - 0.5) * 0.9; } });
    sp.ellipsoid({ x: r.sign() * r.range(4.5, 5.5), y: -3.4, rx: 2.2, ry: 1.6, rz: 1.6, z: -4.5, m: rock, sep: true });
    // prisms: a fan, sorted small to large; stage keeps the largest
    const n = r.int(5, 7);
    const specs = [];
    const fan = Math.PI / 2 + r.range(-0.25, 0.25);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = fan + (t - 0.5) * r.range(1.2, 1.6) + r.range(-0.1, 0.1);
      const len = r.range(6, 10.5) * (1 - Math.abs(t - 0.5) * 0.75);
      const wid = r.range(1.15, 1.6) * (len > 7.5 ? 1.15 : 0.9);
      specs.push({ a, len, wid, bx: Math.cos(a) * r.range(0.5, 1.8), by: -1.2 + Math.sin(a) * 0.4, z: r.range(0, 1) - Math.abs(t - 0.5) * 2 });
    }
    specs.sort((p, q) => q.len * q.wid - p.len * p.wid);
    const keep = Math.round((specs.length * stage) / 4);
    const body = M(H.ramp, H.lo, H.hi, { out: 0, litOut: 1, amb: 0.04, wrap: 0 });
    const rimM = M(H.ramp, 0, RAMPS[H.ramp].length - 1, { noOutline: true });
    const drawn = specs.slice(0, keep).sort((p, q) => p.z - q.z);
    for (const c of drawn) {
      const dx = Math.cos(c.a), dy = Math.sin(c.a), nx = -dy, ny = dx;
      const w = c.wid, L = c.len, tip = w * 0.9;
      const P = (along, across) => [c.bx + dx * along + nx * across, c.by + dy * along + ny * across];
      // three facets lengthwise: left (lit), middle, right (shade), plus two tip facets
      const facets = [
        { pts: [P(0, -w), P(L, -w), P(L, -w * 0.3), P(0, -w * 0.3)], n: [-nx * 0.9, -ny * 0.9, 0.45] },
        { pts: [P(0, -w * 0.3), P(L, -w * 0.3), P(L, w * 0.3), P(0, w * 0.3)], n: [0, 0, 1] },
        { pts: [P(0, w * 0.3), P(L, w * 0.3), P(L, w), P(0, w)], n: [nx * 0.9, ny * 0.9, 0.45] },
        { pts: [P(L, -w), P(L + tip, 0), P(L, w * 0.0)], n: [dx * 0.6 - nx * 0.5, dy * 0.6 - ny * 0.5, 0.6] },
        { pts: [P(L, 0), P(L + tip, 0), P(L, w)], n: [dx * 0.6 + nx * 0.5, dy * 0.6 + ny * 0.5, 0.6] },
      ];
      const part = sp.newPart();
      facets.forEach((f, fi) => sp.poly(f.pts, { n: f.n, z: 1 + c.z + (fi === 1 ? 0.2 : 0), m: body, part, sep: true,
        mod: (res, lx, ly) => {
          // milky base: the bottom third goes one tone duller
          const along = (lx - c.bx) * dx + (ly - c.by) * dy;
          if (along < L * 0.3) res.add = -1;
        } }));
      // shadow edge: a dark line down the right side and over the tip separates overlapping prisms
      const s0 = P(L * 0.2, w - 0.3), s1 = P(L, w - 0.3), s2 = P(L + tip - 0.3, 0);
      sp.polyline([s0, s1, s2], { m: rimM, tone: Math.max(0, H.lo - 1), z: 2.1 + c.z, part });
      // lit edge highlight
      const e0 = P(L * 0.35, -w + 0.4), e1 = P(L + tip * 0.6, -w * 0.3);
      sp.line(e0[0], e0[1], e1[0], e1[1], { m: rimM, tone: glow ? H.rim : H.hi, z: 2.2 + c.z, part });
    }
    if (glow && keep > 0) {
      // sparkle pixels at a couple of tips
      for (const c of drawn.slice(-2)) {
        const tx = c.bx + Math.cos(c.a) * (c.len + c.wid * 0.9), ty = c.by + Math.sin(c.a) * (c.len + c.wid * 0.9);
        sp.dot(tx, ty + 1, { m: rimM, tone: H.rim, z: 9 });
      }
    }
    return result(sp);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// ORGANIC: a pocket of leaf litter, rotten wood and a twig, embedded in the soil (stage 3 = full .. 0 = crumbs)

export function organic(seed, stage = 3) {
  stage = clamp(Math.round(stage), 0, 3);
  return cached(`organic:${seed}:${stage}`, () => {
    const r = rng('organic:' + seed);
    const sp = new Sprite(30, 22, 15, 11);
    const sd = seedInt(seed) % 91;
    const humus = M('loam', 0, 3, { dither: true, out: 0, litOut: 1, amb: 0.2 });
    const k = [0.45, 0.65, 0.85, 1][stage];
    // humus mound: lumpy edge
    sp.shape((x, y) => {
      const a = Math.atan2(y / 0.62, x);
      const R = 12 * k * (0.82 + 0.3 * vnoise(Math.cos(a) * 2 + sd, Math.sin(a) * 2));
      const d = Math.hypot(x, y / 0.62);
      if (d > R) return null;
      const hgt = Math.sqrt(1 - (d / R) ** 2);
      const g = vnoise(x * 0.9 + sd, y * 0.9);
      return { z: -3 + hgt, n: [x / R * 0.6 + (g - 0.5) * 0.8, y / R * 0.6 + (vnoise(x, y + sd) - 0.5) * 0.8, 0.8] };
    }, { m: humus });
    const items = [];
    // rotten wood chunk with grain
    items.push(() => {
      const wood = M('bark', 2, 5, { out: 0, amb: 0.18 });
      const a = r.range(-0.4, 0.4), L = r.range(5.5, 7.5), Wd = r.range(2.2, 2.8);
      const cx = r.range(-5, -2), cy = r.range(-1.5, 1);
      sp.ellipsoid({ x: cx, y: cy, rx: L, ry: Wd, rz: 2, a, z: 0, m: wood, sep: true,
        mod: (res, u, v) => {
          const grain = Math.sin(v * 9 + Math.sin(u * 3) * 1.4);
          if (grain > 0.7) res.add = -1;
          if (Math.abs(u) > 0.86) { res.add = -1; if (Math.abs(v) < 0.4) res.add = -2; } // broken ends show darker rings
          if (vnoise(u * 4 + sd, v * 4) > 0.72) res.add = (res.add || 0) - 1;          // rot spots
        } });
    });
    // leaves: dry/autumn, each with a midrib
    const nLeaves = r.int(3, 4);
    for (let i = 0; i < nLeaves; i++) items.push(() => {
      const ramp = r.pick(['leafDry', 'leafAutumn', 'leafDry']);
      const lm = M(ramp, 2, 5, { out: 1, litOut: 2, amb: 0.2 });
      const a = r.range(0, TAU), L = r.range(4.0, 5.2), Wd = L * r.range(0.42, 0.55);
      const cx = r.range(-8, 8) * k, cy = r.range(-4, 4) * k;
      const curl = r.range(-0.4, 0.4);
      sp.shape((x, y) => {
        const dx = x - cx, dy = y - cy;
        const u = (Math.cos(-a) * dx - Math.sin(-a) * dy) / L, v0 = (Math.sin(-a) * dx + Math.cos(-a) * dy) / Wd;
        const v = v0 - curl * (u * u - 0.5);
        if (Math.abs(u) > 1) return null;
        const half = Math.pow(Math.max(0, 1 - u * u), 0.8) * (u < 0 ? 1 : 0.92);
        if (Math.abs(v) > half) return null;
        const res = { z: 1 + i * 0.3, n: [Math.cos(a) * 0 - v * 0.6 * Math.sin(a), v * 0.6 * Math.cos(a), 0.9] };
        res.n = [-Math.sin(a) * v * 0.7, Math.cos(a) * v * 0.7, 0.8];
        if (Math.abs(v) < 0.16) res.add = 1;            // midrib catches light
        return res;
      }, { m: lm, sep: true });
    });
    // twig with a fork
    items.push(() => {
      const tw = M('bark', 0, 5, { out: 0, litOut: 1 });
      const a = r.range(-0.5, 0.5) + (r() < 0.5 ? 0 : Math.PI), L = r.range(9, 12) * k;
      const x0 = -Math.cos(a) * L / 2 + r.range(-1, 1), y0 = -Math.sin(a) * L / 2 + r.range(-2, 2);
      const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
      const part = sp.newPart();
      sp.line(x0, y0, x1, y1, { m: tw, tone: 3, z: 3, part });
      sp.line(x0, y0 + 1, x1, y1 + 1, { m: tw, tone: 4, z: 3.1, part });
      const fx = lerp(x0, x1, 0.6), fy = lerp(y0, y1, 0.6);
      sp.line(fx, fy, fx + Math.cos(a + 0.7) * 3.5, fy + Math.sin(a + 0.7) * 3.5, { m: tw, tone: 3, z: 2.9, part });
    });
    const order = [0, 1, 2, 3, 4, 5].slice(0, items.length);
    // stage removes items: twig and leaves go last (first drawn = first eaten)
    const nKeep = [0, Math.ceil(items.length * 0.35), Math.ceil(items.length * 0.7), items.length][stage];
    order.slice(items.length - nKeep).forEach((i) => items[i]());
    // crumbs
    const cr = M('loam', 0, 4, { noOutline: true });
    for (let i = 0; i < 6 + stage * 2; i++) sp.dot(r.range(-12, 12) * k, r.range(-6, 6) * k, { m: cr, tone: r.pick([3, 4, 2]), z: 0.5 });
    return result(sp);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// MUSHROOMS: a cluster on the grass surface; anchor = ground point (bottom centre)

const MUSH_KINDS = [
  { cap: M('bark', 2, 5, { spec: 10, specT: 0.9, hl: 6, out: 0 }), spots: null },                   // tan brown caps
  { cap: M('fruit', 1, 4, { spec: 10, specT: 0.9, hl: 4, out: 0 }), spots: ['birch', 5] },          // red, white spots
  { cap: M('sand', 1, 4, { spec: 10, specT: 0.9, hl: 4, out: 0 }), spots: null },                   // pale fawn
];

export function mushrooms(seed, grow = 3) {
  grow = clamp(Math.round(grow), 0, 3);
  return cached(`mushrooms:${seed}:${grow}`, () => {
    const r = rng('mush:' + seed);
    const kind = r.pick(MUSH_KINDS);
    const sp = new Sprite(26, 16, 13, 15);
    const stem = M('birch', 2, 5, { out: 1, outRamp: 'birch', amb: 0.25 });
    const gill = M('bark', 0, 6, { noOutline: true });
    const g = [0.3, 0.55, 0.8, 1][grow];
    const n = r.int(2, 4);
    const list = [];
    for (let i = 0; i < n; i++) list.push({ x: (i - (n - 1) / 2) * r.range(3.2, 4.2) + r.range(-0.6, 0.6), h: r.range(5, 10) * (i === 0 ? 1 : r.range(0.55, 0.9)), cr: r.range(2.6, 4), lean: r.range(-0.25, 0.25) });
    list.sort((a, b) => b.h - a.h);
    list.forEach((mu, i) => {
      const h = Math.max(1.5, mu.h * g), cr = Math.max(1.4, mu.cr * (0.45 + 0.55 * g));
      const top = [mu.x + mu.lean * h, h];
      const part = sp.newPart();
      // stem: tapered column, lit from the left
      sp.shape((x, y) => {
        if (y < 0 || y > h) return null;
        const t = y / h;
        const cx = mu.x + mu.lean * y, w = lerp(0.95, 0.6, t) * Math.max(0.8, cr * 0.32);
        const u = (x - cx) / w;
        if (Math.abs(u) > 1) return null;
        return { z: i * 0.1, n: [u, 0, Math.sqrt(1 - u * u)] };
      }, { m: stem, part });
      // cap: half-dome over the stem top
      const capH = cr * (grow === 0 ? 0.9 : 0.62);
      sp.shape((x, y) => {
        const u = (x - top[0]) / cr, v = (y - top[1] + 0.5) / capH;
        if (v < 0 || u * u + v * v > 1) return null;
        const hh = Math.sqrt(1 - u * u - v * v);
        const res = { z: 1 + i * 0.1 + hh, n: [u, v * 0.8 + 0.1, hh] };
        if (v < 0.22 && Math.abs(u) < 0.92) res.add = -1;                         // dark rim edge underneath
        if (kind.spots && hash2(Math.floor(x * 1), Math.floor(y * 1), seedInt(seed) + i) > 0.86 && v > 0.3) { res.m = M(kind.spots[0], 0, 5); res.fixed = kind.spots[1]; }
        return res;
      }, { m: kind.cap, part: sp.newPart(), sep: true });
      // gills: a dark line under the cap
      if (grow > 0) sp.line(top[0] - cr * 0.75, top[1] - 0.2, top[0] + cr * 0.75, top[1] - 0.2, { m: gill, tone: 1, z: 0.9 + i * 0.1 });
    });
    return result(sp);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// CURIOS: small buried finds

export const CURIO_KINDS = ['snail', 'acorn', 'hazelnut', 'vertebra', 'birdskull', 'shard', 'key', 'marble', 'ammonite', 'leaffossil', 'bottle', 'seeds', 'worm'];
const CURIO_LABELS = {
  snail: 'A snail shell, long empty', acorn: 'An acorn that never became an oak', hazelnut: 'A hazelnut a mouse forgot',
  vertebra: 'A vertebra, from something small', birdskull: 'A small bird\'s skull, light as paper', shard: 'A shard of an old pot',
  key: 'An iron key to a door long gone', marble: 'A clay marble, lost mid-game', ammonite: 'An ammonite, older than the hills',
  leaffossil: 'A leaf pressed into stone', bottle: 'The neck of an old green bottle', seeds: 'Seeds a mouse put by for winter',
  worm: 'An earthworm, curled up asleep',
};

// log-spiral shell sampler: returns { f (0..1 across the whorl tube), k (whorl index), th } or null
function spiralAt(x, y, r0, W, turns, th0 = 0) {
  const rr = Math.hypot(x, y);
  if (rr < 0.3) return { f: 0.5, k: 0, th: 0, rr };
  let th = Math.atan2(y, x) - th0;
  th = ((th % TAU) + TAU) % TAU;
  const s = Math.log(rr / r0) / Math.log(W) - th / TAU;
  const k = Math.floor(s);
  if (k >= turns || s < -1) return null;
  return { f: s - k, k, th, rr };
}

const CURIO_DRAW = {
  snail(sp, r) {
    const pal = r.pick([['bark', 2, 5], ['sand', 1, 4], ['clay', 2, 4]]);
    const shell = M(pal[0], pal[1], pal[2], { out: 0, spec: 10, specT: 0.9 });
    const band = r() < 0.6;
    const th0 = r.range(0, TAU);
    sp.shape((x, y) => {
      const sm = spiralAt(x, y, 0.5, 2.15, 2.45, th0);
      if (!sm) return null;
      const er = [x / (sm.rr || 1), y / (sm.rr || 1)];
      const c = sm.f * 2 - 1;
      const res = { z: 2 - sm.k * 0.1 + Math.sqrt(1 - c * c), n: [er[0] * c, er[1] * c, Math.sqrt(Math.max(0, 1 - c * c)) + 0.2] };
      if (sm.f < 0.15) res.add = -1;                                             // suture
      if (band && sm.f > 0.5 && sm.f < 0.66 && sm.k >= 1) res.add = -1;           // spiral band
      return res;
    }, { m: shell });
  },
  acorn(sp, r) {
    const nut = M('bark', 2, 5, { out: 0, spec: 10, specT: 0.82, hl: 6 });
    const cap = M('leafDry', 1, 4, { out: 0 });
    sp.frame(r.range(-0.5, 0.5) - Math.PI / 2, 0, 0, r.sign());
    sp.ellipsoid({ x: -0.2, y: 0, rx: 4.4, ry: 3.0, rz: 2.8, m: nut,
      mod: (res, u) => { if (u > 0.9) res.add = -1; } });
    sp.ellipsoid({ x: -3.7, y: 0, rx: 2.0, ry: 3.4, rz: 2.4, z: 0.6, m: cap, sep: true,
      clip: (u) => u < 0.75,
      mod: (res, u) => { if (u > 0.35) res.add = -1; else if (Math.abs(((u + 1) * 4) % 1 - 0.5) < 0.18) res.add = -1; } });
    sp.line(-5.6, 0, -6.6, 0.8, { m: M('trunk', 0, 5, { noOutline: true }), tone: 3, z: 2 });
    sp.dot(4.2, 0, { m: nut, tone: 1, z: 3 });
    sp.frame(0);
  },
  hazelnut(sp, r) {
    const shell = M('bark', 2, 5, { out: 0, spec: 9, specT: 0.82, hl: 6 });
    const base = M('sand', 2, 4, { out: 0 });
    sp.frame(r.range(-0.5, 0.5));
    sp.ellipsoid({ x: 0, y: -0.3, rx: 4.0, ry: 4.3, rz: 3.5, m: shell,
      mod: (res, u, v) => {
        if (v < -0.38 + 0.1 * Math.sin(u * 6)) res.m = base;
        else if (Math.abs(Math.sin(u * 5.5)) > 0.94 && v > -0.2) res.add = -1;   // a few stripes
      } });
    sp.dot(0, 4.5, { m: shell, tone: 2, z: 5 });
    sp.frame(0);
  },
  vertebra(sp, r) {
    const bone = M('bark', 3, 6, { out: 1, litOut: 2, amb: 0.2 });
    sp.frame(r.range(-0.3, 0.3));
    sp.ellipsoid({ x: 0, y: -1.9, rx: 2.7, ry: 2.1, rz: 1.6, z: 1, m: bone, sep: true,
      mod: (res, u, v) => { const d = u * u + v * v; if (d < 0.32) res.add = -1; if (d < 0.08) res.add = -2; } });
    sp.shape((x, y) => {
      const d = Math.hypot(x / 1.15, (y - 0.5) / 1.0);
      if (y < -0.9 || d > 2.5 || d < 1.2) return null;
      const t = (d - 1.2) / 1.3 * 2 - 1;
      return { z: 0.5, n: [x / d * t * 0.8, (y - 0.5) / d * t * 0.8, 0.7] };
    }, { m: bone, sep: true });
    sp.poly([[-0.7, 2.6], [0.7, 2.6], [0.25, 4.6], [-0.3, 4.6]], { n: [-0.2, 0.3, 0.9], z: 0.3, m: bone, sep: true });
    for (const s of [-1, 1]) sp.poly([[s * 2.3, -0.9], [s * 2.5, -2.4], [s * 4.8, -3.2], [s * 4.8, -2.0]], { n: [s * 0.15, 0.4, 0.9], z: 0.2, m: bone, sep: true });
    sp.frame(0);
  },
  birdskull(sp, r) {
    const bone = M('bark', 3, 6, { out: 1, litOut: 2, amb: 0.22 });
    const hole = M('topsoil', 0, 4, { noOutline: true });
    sp.frame(r.range(-0.3, 0.3), 0, 0, r.sign());
    sp.ellipsoid({ x: -1.6, y: 0.3, rx: 3.2, ry: 2.8, rz: 2.4, m: bone });
    sp.ellipsoid({ x: -1.0, y: 0.9, rx: 1.25, ry: 1.15, rz: 0.4, z: 3, m: hole, mod: (res, u, v) => { res.fixed = u + v > 0.6 ? 2 : 0; } });  // the orbit
    sp.poly([[1.1, 1.8], [7.0, -0.5], [6.8, -1.0], [1.2, -0.5]], { n: [0.1, 0.5, 0.85], z: 1.2, m: bone, sep: true });
    sp.poly([[0.9, -1.0], [6.2, -1.5], [0.7, -2.2]], { n: [0.05, -0.4, 0.9], z: 0.8, m: bone, sep: true });
    sp.dot(3.0, 0.3, { m: hole, tone: 1, z: 4 });   // nostril
    sp.frame(0);
  },
  shard(sp, r) {
    const clay = M('clay', 2, 4, { out: 0, amb: 0.22 });
    const slip = M('trunk', 0, 5, { noOutline: true });
    const cream = M('sand', 0, 4, { noOutline: true });
    const n = r.int(5, 7);
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r.range(-0.3, 0.3); const R = r.range(4.4, 6.4); pts.push([Math.cos(a) * R, Math.sin(a) * R * 0.85]); }
    const by = r.range(-1.0, 1.0), tilt = r.range(-0.25, 0.25);
    const motif = r.int(0, 1);
    sp.poly(pts, { n: [-0.12, 0.12, 1], z: 0, m: clay,
      mod: (res, x, y) => {
        const yy = y - by - tilt * x;
        res.n = [-0.15 + x * 0.05, 0.1 + y * 0.03, 1];
        if (Math.abs(yy) < 1.3) {
          res.m = slip; res.fixed = 1;
          const hit = motif === 0 ? Math.abs(yy - Math.sin(x * 1.2) * 0.7) < 0.42 : (Math.abs(((x + 20) % 2.6) - 1.3) < 0.5 && Math.abs(yy) < 0.5);
          if (hit) { res.m = cream; res.fixed = 4; }
        }
      } });
  },
  key(sp, r) {
    const iron = M('clay', 0, 3, { out: 0, amb: 0.22, litOut: 1 });
    sp.frame(r.range(-0.6, 0.6), 0, 0, r.sign());
    const sd = r.int(0, 99);
    const rust = (res, x, y) => { const k = vnoise(x * 1.2 + sd, y * 1.2); if (k > 0.64) res.add = 1; else if (k < 0.28) res.add = -1; };
    sp.shape((x, y) => {
      const d = Math.hypot(x + 4.2, y);
      if (d > 2.8 || d < 1.4) return null;
      const t = (d - 1.4) / 1.4 * 2 - 1;
      const res = { z: 0, n: [(x + 4.2) / d * t, y / d * t, Math.sqrt(Math.max(0, 1 - t * t)) + 0.3] };
      rust(res, x, y);
      return res;
    }, { m: iron });
    sp.shape((x, y) => {
      if (x < -1.6 || x > 4.9 || Math.abs(y) > 0.75) return null;
      const res = { z: 0, n: [0, y * 1.1, 1] };
      if (x < -0.8 && x > -1.5) res.add = 1;
      rust(res, x, y);
      return res;
    }, { m: iron });
    const teeth = r.pick([[[3.0, 4.9, 2.8]], [[2.8, 3.7, 2.8], [4.1, 4.9, 2.0]]]);
    for (const [x0, x1, h] of teeth) sp.poly([[x0, 0], [x1, 0], [x1, -h], [x0, -h]], { n: [0, 0.2, 1], z: 0.1, m: iron, mod: (res, x, y) => rust(res, x, y) });
    sp.frame(0);
  },
  marble(sp, r) {
    const ramp = r.pick([['fruit', 1, 3], ['water', 2, 4], ['gold', 2, 4], ['leafSummer', 2, 4]]);
    const mm = M(ramp[0], ramp[1], ramp[2], { out: 0, spec: 16, specT: 0.82, hl: Math.min(RAMPS[ramp[0]].length - 1, ramp[2] + 2) });
    const chip = M('sand', 2, 4, { out: 0 });
    const sd = r.int(0, 99);
    sp.ellipsoid({ x: 0, y: 0, rx: 3.3, ry: 3.3, rz: 3.3, m: mm,
      mod: (res, u, v) => {
        if (vnoise(u * 2.2 + sd, v * 2.2) > 0.7) res.m = chip;                 // chipped paint, bare clay
        else if (Math.abs(Math.sin((u + v * 0.6) * 4 + sd)) < 0.22) res.add = -1; // painted swirl
      } });
  },
  ammonite(sp, r) {
    const stone = M('stone', 0, 3, { dither: true, out: 0, amb: 0.2 });
    const shell = M('sand', 2, 4, { out: 1, litOut: 1, amb: 0.2, outRamp: 'sand' });
    const sd = r.int(0, 99);
    sp.shape((x, y) => {
      const a = Math.atan2(y, x);
      const R = 7.4 * (0.88 + 0.22 * vnoise(Math.cos(a) * 1.5 + sd, Math.sin(a) * 1.5));
      const d = Math.hypot(x, y / 0.82);
      if (d > R) return null;
      const h = Math.sqrt(1 - (d / R) ** 2);
      return { z: h * 1.5, n: [x / R * 0.7, y / R * 0.7, 0.5 + h] };
    }, { m: stone });
    const th0 = r.range(0, TAU);
    sp.shape((x, y) => {
      const sm = spiralAt(x, y, 0.55, 1.9, 3.1, th0);
      if (!sm || sm.rr > 5.8) return null;
      const er = [x / (sm.rr || 1), y / (sm.rr || 1)];
      const c = sm.f * 2 - 1;
      const res = { z: 3, n: [er[0] * c, er[1] * c, Math.sqrt(Math.max(0, 1 - c * c)) + 0.2] };
      if (sm.f < 0.2) res.fixed = 1;                                                      // whorl suture
      else if (sm.k >= 2 && Math.abs(Math.sin(sm.th * 7 + sm.k)) < 0.2) res.add = -1;     // ribs on the outer whorl
      return res;
    }, { m: shell, sep: true });
  },
  leaffossil(sp, r) {
    const slab = M('slate', 2, 4, { out: 1, litOut: 1, amb: 0.25, dither: true });
    const imp = M('stone', 0, 4, { noOutline: true });
    const n = r.int(6, 8);
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r.range(-0.25, 0.25); const R = r.range(6.4, 7.8); pts.push([Math.cos(a) * R, Math.sin(a) * R * 0.66]); }
    const la = r.range(-0.4, 0.4);
    sp.poly(pts, { n: [-0.1, 0.1, 1], z: 0, m: slab,
      mod: (res, x, y) => {
        const u = (Math.cos(-la) * x - Math.sin(-la) * y) / 6.0, v = (Math.sin(-la) * x + Math.cos(-la) * y);
        const half = 2.8 * Math.pow(Math.max(0, 1 - u * u), 0.75) * (u > 0 ? 0.9 : 1);
        if (Math.abs(u) < 1 && Math.abs(v) < half) {
          res.m = imp; res.fixed = Math.abs(v) > half - 0.7 && v > 0 ? 2 : 1;
          if (Math.abs(v) < 0.42 || Math.abs(((u * 6.0 - Math.abs(v) * 1.1) % 2.0 + 2.0) % 2.0) < 0.45) res.fixed = 0;
        } else if (u < -1 && u > -1.3 && Math.abs(v) < 0.45) { res.m = imp; res.fixed = 0; }
      } });
  },
  bottle(sp, r) {
    const glass = M('leafSummer', 2, 5, { out: 0, litOut: 1, spec: 14, specT: 0.85, hl: 6, amb: 0.25 });
    sp.frame(Math.PI / 2 + r.range(-0.45, 0.45), 0, 0, r.sign());
    sp.shape((x, y) => {
      if (x > 5.4 || x < -5.2) return null;
      let rr;
      if (x > 4.0) rr = 1.75; else if (x > 3.4) rr = 1.15; else if (x > -0.4) rr = 1.1; else rr = Math.min(3.2, 1.1 + (-0.4 - x) * 1.1);
      const brk = -3.6 + 0.9 * Math.sin(y * 2.0 + 1) + 0.5 * Math.sin(y * 4.7);
      if (x < brk || Math.abs(y) > rr) return null;
      const t = y / rr;
      const res = { z: 0, n: [0, t, Math.sqrt(Math.max(0, 1 - t * t)) + 0.1] };
      if (x > 3.9 && x < 4.4) res.add = -1;                               // under the lip ring
      if (t < -0.25 && t > -0.62 && x > -2.4 && x < 3.6) res.fixed = 6;         // a long glint along the neck
      else if (t > 0.1 && t < 0.5 && x < 3.8) res.add = (res.add || 0) - 1; // darker through the middle
      return res;
    }, { m: glass });
    sp.frame(0);
  },
  seeds(sp, r) {
    const hollow = M('topsoil', 0, 4, { noOutline: true });
    sp.shape((x, y) => { const d = Math.hypot(x / 7.2, y / 4.8); return d < 1 ? { z: -5, n: [0, 0, 1], fixed: d < 0.78 ? 0 : 1 } : null; }, { m: hollow });
    const sun = M('slate', 1, 3, { out: 0, litOut: 1, spec: 10, specT: 0.9, hl: 4 });
    const grain = M('sand', 2, 4, { out: 1, litOut: 1 });
    const n = r.int(10, 12);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r());
      const x = Math.cos(a) * d * 4.2, y = Math.sin(a) * d * 2.4 + 0.3;
      const ang = r.range(0, TAU);
      if (r() < 0.5) {
        sp.ellipsoid({ x, y, rx: 2.1, ry: 1.15, rz: 1.1, a: ang, z: 1 + (1 - d) * 2 + i * 0.05, m: sun,
          mod: (res, u, v) => { if (Math.abs(v) < 0.3 && Math.abs(u) < 0.75) { res.m = M('birch', 0, 5); res.fixed = 4; } } });         // the pale stripe
      } else sp.ellipsoid({ x, y, rx: 1.7, ry: 1.05, rz: 1, a: ang, z: 1 + (1 - d) * 2 + i * 0.05, m: grain });
    }
  },
};

function wormSprite(seed, frame) {
  const r = rng('curio:worm:' + seed);
  const sp = new Sprite(17, 17, 8.5, 8.5);
  const skin = M('rose', 1, 3, { out: 0, spec: 10, specT: 0.88, hl: 4, amb: 0.18 });
  const burrow = M('topsoil', 0, 2, { noOutline: true });
  const th0 = r.range(0, TAU), dirS = r.sign();
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const th = th0 + dirS * t * TAU * 1.05;
    const rr = 5.4 - 2.7 * t + (frame ? 0.35 * Math.sin(t * 12) : 0);
    pts.push([Math.cos(th) * rr, Math.sin(th) * rr]);
  }
  tube(sp, pts, () => 2.0, { m: burrow, z: -6, mod: (res) => { res.fixed = 1; } });
  tube(sp, pts, (t) => 1.1 * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.15 + 0.04) * Math.PI)) + (t > 0.2 && t < 0.3 ? 0.2 : 0), { m: skin,
    mod: (res, t, c) => {
      if (t > 0.2 && t < 0.3) res.add = 1;                                  // clitellum
      else if ((t * 16 + frame * 0.5) % 1 < 0.22 && Math.abs(c) < 0.85) res.add = -1; // segment rings
    } });
  return sp.render();
}

export function curio(kind, seed = 1) {
  if (!CURIO_KINDS.includes(kind)) throw new Error('unknown curio kind: ' + kind);
  return cached(`curio:${kind}:${seed}`, () => {
    if (kind === 'worm') {
      const frames = [wormSprite(seed, 0), wormSprite(seed, 1)];
      return { canvas: frames[0], frames, ax: 8, ay: 8, label: CURIO_LABELS.worm, kind };
    }
    const r = rng(`curio:${kind}:${seed}`);
    const sp = new Sprite(18, 18, 9, 9);
    CURIO_DRAW[kind](sp, r);
    const canvas = sp.render();
    return { canvas, frames: [canvas], ax: 9, ay: 9, label: CURIO_LABELS[kind], kind };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// sky and surface life: hand-placed pixel maps (tones index into a ramp)

function fromMap(rows, ramps, ax, ay) {
  const h = rows.length, w = rows[0].length;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    const c = ramps[ch];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  }
  return { canvas, ax, ay };
}

const BIRD_FRAMES = [
  ['a.....a', '.ab.ba.', '..bbb..', '.......'],
  ['.......', 'aab.baa', '..bbb..', '.......'],
  ['.......', '...b...', '.abbba.', 'a.....a'],
];
export function bird(frame = 0) {
  frame = ((Math.round(frame) % 3) + 3) % 3;
  return cached(`bird:${frame}`, () => fromMap(BIRD_FRAMES[frame], { a: rampHex('skyNight', 1), b: rampHex('outline', 1) }, 3, 2));
}

const BUTTERFLY_FRAMES = [
  ['ab.ba', 'bcdcb', '.bdb.', '.a.a.'],
  ['..b..', '.bdb.', '.bdb.', '..a..'],
];
const BUTTERFLY_RAMPS = [['leafAutumn', 2, 4, 6], ['gold', 3, 4, 6], ['blossom', 0, 1, 3], ['water', 3, 4, 6], ['birch', 3, 4, 5]];
export function butterfly(seed = 1, frame = 0) {
  frame = ((Math.round(frame) % 2) + 2) % 2;
  return cached(`butterfly:${seed}:${frame}`, () => {
    const r = rng('butterfly:' + seed);
    const [ramp, dk, md, lt] = r.pick(BUTTERFLY_RAMPS);
    return fromMap(BUTTERFLY_FRAMES[frame], { a: rampHex(ramp, dk), b: rampHex(ramp, md), c: rampHex(ramp, lt), d: rampHex('outline', 1) }, 2, 2);
  });
}

const LEAF_SHAPES = [
  ['.ab', 'abc', 'bc.'],
  ['ab..', '.bcb', '..bc'],
  ['.a.', 'abc', '.bc', '..c'],
  ['ab', 'bc'],
];
export function leaf(seed = 1, season = 'summer') {
  return cached(`leaf:${seed}:${season}`, () => {
    const r = rng('leaf:' + seed);
    const ramp = season === 'autumn' ? r.pick(['leafAutumn', 'leafAutumn', 'leafDry']) : 'leafSummer';
    const base = season === 'autumn' ? r.int(2, 3) : r.int(3, 4);
    const shape = r.pick(LEAF_SHAPES);
    const out = fromMap(shape, { a: rampHex(ramp, base - 1), b: rampHex(ramp, base), c: rampHex(ramp, base + 1) }, 1, 1);
    return out;
  });
}

// re-export for tools that want the colour list
export { hexToRgb };

// The rasteriser itself, for drawing your own sprites in the same style:
//   const sp = new Sprite(w, h, ax, ay);              // canvas size and anchor (pixels from the top-left)
//   sp.ellipsoid({ x, y, rx, ry, rz, m: spriteMaterial('gold', 1, 4, { spec: 8 }) });
//   const canvas = sp.render();                        // outlined, palette-exact canvas
export { Sprite, M as spriteMaterial, rng as seededRandom, tube, inPoly };
