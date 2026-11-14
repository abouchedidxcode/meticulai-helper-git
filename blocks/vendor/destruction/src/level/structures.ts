// The demo's structures, each built like the real thing so it fails like it, from real pieces: posts,
// rails, plates, rafters, boards, bricks, panes, tiles and steel plates, each one rigid body, welded
// to its neighbours (Builder.autoWeld welds every pair of square pieces that touch, at the middle of
// the patch; turned pieces are welded where the code says). Their look and their joinery are
// Timberfall's (Patch's demolition game), scaled down: its mill's frame, roof, brick panels and
// windows, its riveted water tower, and its chimney stack.
//
//   barn      a timber-framed barn on a stone plinth: brick below, tarred weatherboards above,
//             oxblood doors, cream windows, a king-post roof of clay tiles
//   tower     a riveted steel water tank, full, on a four-legged braced lattice tower
//   wall      a brick garden wall with piers, stone coping and a ledged timber gate
//   chimney   a free-standing brick chimney on a stone base
//
// z up, metres. Each stands at the origin, its front to -y (where the camera starts).

import { add, Builder, frame, lerp3, norm, type Q4, scale, sub, type V3 } from '../physics/builder.ts';

export type StructureId = 'barn' | 'tower' | 'wall' | 'chimney';
export const STRUCTURES: StructureId[] = ['barn', 'tower', 'wall', 'chimney'];

/** Where the camera looks from when a structure is built: its target, distance, turn and tilt. */
export interface Framing {
  target: V3;
  distance: number;
  yaw: number;
  pitch: number;
}

export interface Built {
  builder: Builder;
  framing: Framing;
  /** How tall it stands (m), for the cannon's aim and the auto shots. */
  height: number;
}

const COURSE = 0.14;
const BRICK_T = 0.2;
const GLASS_T = 0.03;
/** The gap left over infill (m), more than the welder's touching distance. */
const INFILL_GAP = 0.016;

export function build(id: StructureId, seed = 11): Built {
  const b = new Builder(seed);
  b.group = 'ground';
  b.box('ground', [0, 0, -1], [160, 160, 2], { fixed: true, role: 'ground' });
  b.group = id;
  let out: Omit<Built, 'builder'>;
  switch (id) {
    case 'barn':
      out = barn(b);
      break;
    case 'tower':
      out = waterTower(b, 0, 0);
      break;
    case 'wall':
      out = gardenWall(b);
      break;
    case 'chimney':
      out = chimney(b);
      break;
  }
  b.autoWeld();
  hangOnce(b);
  return { builder: b, ...out };
}

/**
 * Cladding and glass hang on the frame by one weld each: their lowest to the frame. Welded at both
 * ends, a weatherboard or a pane braces the frame like a shear wall, so a knock that racked the frame
 * anywhere stripped every board and broke every window in the barn at once; hung once, they go where
 * they're hit, or with what they hang on.
 */
function hangOnce(b: Builder): void {
  const hung = new Set(['weatherboard', 'gable board', 'pane']);
  const keep = new Map<number, number>();
  b.welds.forEach((w, i) => {
    for (const [me, other] of [[w.a, w.b], [w.b, w.a]]) {
      const p = b.pieces[me];
      if (!hung.has(p.role) || hung.has(b.pieces[other].role)) continue;
      const k = keep.get(me);
      if (k === undefined || w.at[2] < b.welds[k].at[2] - 1e-3) keep.set(me, i);
    }
  });
  const kept = new Set(keep.values());
  const out = b.welds.filter((w, i) => {
    const ha = hung.has(b.pieces[w.a].role);
    const hb = hung.has(b.pieces[w.b].role);
    if (!ha && !hb) return true;
    if (ha && hb) return false;
    return kept.has(i);
  });
  b.welds.length = 0;
  b.welds.push(...out);
}

// ---- Shared pieces of building (from Timberfall's mill) ----

/**
 * Courses of brick between `from` and `to` along `axis` at `at` (the wall line), from `z0`:
 * stretcher bond, the courses' ends cut to fit. Infill is not built to carry the frame: the top
 * course stops short of what's over it, so the frame's load goes down the posts.
 */
function brickPanel(b: Builder, axis: 'x' | 'y', at: number, from: number, to: number, z0: number, courses: number, o: { role?: string; gap?: number; thick?: number; len?: number } = {}): void {
  const L = to - from;
  const n = Math.max(1, Math.round(L / (o.len ?? 0.44)));
  const len = L / n;
  const T = o.thick ?? BRICK_T;
  const ch = (courses * COURSE - (o.gap ?? INFILL_GAP)) / courses;
  for (let c = 0; c < courses; c++) {
    const z = z0 + c * ch;
    const cuts: number[] = [from];
    const half = (c % 2) * len * 0.5;
    for (let k = 0; k < n; k++) {
      const v = from + half + k * len;
      if (v > from + 0.05 && v < to - 0.05) cuts.push(v);
    }
    if (half) {
      const last = from + half + n * len;
      if (last < to - 0.05) cuts.push(last);
    }
    cuts.push(to);
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const shade = b.random();
      const role = o.role ?? 'brick';
      if (axis === 'x') b.span('brick', [cuts[k], at - T / 2, z], [cuts[k + 1], at + T / 2, z + ch], { role, shade });
      else b.span('brick', [at - T / 2, cuts[k], z], [at + T / 2, cuts[k + 1], z + ch], { role, shade });
    }
  }
}

/** A rail between two posts along the wall. */
function rail(b: Builder, axis: 'x' | 'y', at: number, from: number, to: number, z0: number, z1: number, w: number): void {
  const zc = (z0 + z1) / 2;
  const h = z1 - z0;
  if (axis === 'x') b.member('timber', [from, at, zc], [to, at, zc], w, h, 2, { role: 'rail' });
  else b.member('timber', [at, from, zc], [at, to, zc], w, h, 2, { role: 'rail' });
}

/** A window: `lights` lights between mullions, each `panes` panes high, filling from..to, z0..z1. */
function windowLights(b: Builder, axis: 'x' | 'y', at: number, from: number, to: number, z0: number, z1: number, lights: number, panes: number): void {
  const MULL = 0.07;
  const BAR = 0.045;
  const lw = (to - from - (lights - 1) * MULL) / lights;
  // Windows carry nothing either: a gap under the head
  z1 -= INFILL_GAP;
  const ph = (z1 - z0 - (panes - 1) * BAR) / panes;
  const box = (a0: number, a1: number, zz0: number, zz1: number, t: number, mat: 'board' | 'glass', role: string) => {
    if (axis === 'x') b.span(mat, [a0, at - t / 2, zz0], [a1, at + t / 2, zz1], { role, shade: 0.6 });
    else b.span(mat, [at - t / 2, a0, zz0], [at + t / 2, a1, zz1], { role, shade: 0.6 });
  };
  for (let i = 0; i < lights; i++) {
    const a0 = from + i * (lw + MULL);
    if (i > 0) box(a0 - MULL, a0, z0, z1, 0.09, 'board', 'mullion');
    for (let k = 0; k < panes; k++) {
      const zz = z0 + k * (ph + BAR);
      if (k > 0) box(a0, a0 + lw, zz - BAR, zz, 0.06, 'board', 'glazing bar');
      box(a0, a0 + lw, zz, zz + ph, GLASS_T, 'glass', 'pane');
    }
  }
}

/** The id among `ids` whose centre is nearest `at`. */
function nearest(b: Builder, ids: number[], at: V3): number {
  let best = ids[0];
  let d = Infinity;
  for (const id of ids) {
    const p = b.pieces[id].pos;
    const e = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
    if (e < d) {
      d = e;
      best = id;
    }
  }
  return best;
}

/** Courses of dressed stone blocks along a line, broken joint. */
function stoneRun(b: Builder, axis: 'x' | 'y', at: number, from: number, to: number, z0: number, courses: number, h: number, T: number, block = 0.9): void {
  for (let c = 0; c < courses; c++) {
    const L = to - from;
    const n = Math.max(1, Math.round(L / block));
    const len = L / n;
    const cuts = [from];
    for (let k = 1; k < n; k++) cuts.push(from + k * len + (c % 2 ? len / 2 : 0));
    if (c % 2 && n > 1) cuts.push(from + len / 2);
    cuts.push(to);
    const sorted = [...new Set(cuts.filter((v) => v >= from && v <= to).map((v) => +v.toFixed(4)))].sort((p, q) => p - q);
    for (let k = 0; k + 1 < sorted.length; k++) {
      if (sorted[k + 1] - sorted[k] < 0.08) continue;
      const z = z0 + c * h;
      if (axis === 'x') b.span('stone', [sorted[k], at - T / 2, z], [sorted[k + 1], at + T / 2, z + h], { role: 'plinth', shade: b.random() });
      else b.span('stone', [at - T / 2, sorted[k], z], [at + T / 2, sorted[k + 1], z + h], { role: 'plinth', shade: b.random() });
    }
  }
}

// ---- The barn ----

/**
 * A small timber-framed barn, 7.2 by 4.8 m on its wall lines: oak posts every 2.4 m on sills on a
 * stone plinth, six courses of brick below a mid rail and tarred weatherboards above, glazed
 * windows, oxblood ledged doors, and a king-post roof of clay tiles. Load paths: tiles → rafters →
 * plates and ridge → posts → sills → plinth → ground. Take out a post and the plate over it has to
 * span two bays; it sags, and the roof over it follows it down.
 */
function barn(b: Builder): Omit<Built, 'builder'> {
  const POST = 0.24;
  const XS = [-3.6, -1.2, 1.2, 3.6];
  const HY = 2.4;
  const YS = [-HY, 0, HY];
  const PLINTH_TOP = 0.42;
  const SILL_TOP = PLINTH_TOP + POST;
  const RAIL_LO = SILL_TOP + 6 * COURSE;
  const RAIL_HI = RAIL_LO + 0.14;
  const OPEN_HI = 2.62;
  const LINTEL_HI = OPEN_HI + 0.16;
  const PLATE_LO = 3.12;
  const PLATE_HI = PLATE_LO + POST;
  const XE = XS[XS.length - 1];

  // ---- The plinth: two courses of dressed stone under the sills
  const T = 0.36;
  for (const y of [-HY, HY]) stoneRun(b, 'x', y, -XE - T / 2, XE + T / 2, 0, 2, PLINTH_TOP / 2, T);
  for (const x of [-XE, XE]) stoneRun(b, 'y', x, -HY + T / 2, HY - T / 2, 0, 2, PLINTH_TOP / 2, T);

  // ---- The frame: sills, posts, plates
  // (Long timbers in pieces of 1.25 m or less: the broadphase sizes its cells to the largest pieces)
  for (const y of [-HY, HY]) b.member('timber', [-XE - POST / 2, y, PLINTH_TOP + POST / 2], [XE + POST / 2, y, PLINTH_TOP + POST / 2], POST, POST, 6, { role: 'sill' });
  for (const x of [-XE, XE]) b.member('timber', [x, -HY + POST / 2, PLINTH_TOP + POST / 2], [x, HY - POST / 2, PLINTH_TOP + POST / 2], POST, POST, 4, { role: 'sill' });
  for (const x of XS) for (const y of [-HY, HY]) b.member('timber', [x, y, SILL_TOP], [x, y, PLATE_LO], POST, POST, 2, { role: 'post' });
  for (const x of [-XE, XE]) b.member('timber', [x, 0, SILL_TOP], [x, 0, PLATE_LO], POST, POST, 2, { role: 'post' });
  for (const y of [-HY, HY]) b.member('timber', [-XE - POST / 2, y, PLATE_LO + POST / 2], [XE + POST / 2, y, PLATE_LO + POST / 2], POST, POST, 6, { role: 'plate' });

  // ---- The walls, bay by bay
  type Bay = 'brick' | 'window' | 'door';
  const CLAD = POST / 2 + 0.045;
  const bay = (axis: 'x' | 'y', at: number, p0: number, p1: number, kind: Bay, ends: [number, number]) => {
    const from = p0 + POST / 2;
    const to = p1 - POST / 2;
    const out = Math.sign(at);
    let cladFrom = RAIL_HI;
    if (kind === 'door') {
      // A pair of ledged barn doors: vertical boards, a lintel over
      const n = 10;
      const w = (to - from) / n;
      for (let k = 0; k < n; k++) {
        const a = from + k * w;
        if (axis === 'x') b.span('board', [a + 0.003, at - 0.04, SILL_TOP], [a + w - 0.003, at + 0.04, OPEN_HI], { role: 'door', shade: 0.2 });
        else b.span('board', [at - 0.04, a + 0.003, SILL_TOP], [at + 0.04, a + w - 0.003, OPEN_HI], { role: 'door', shade: 0.2 });
      }
      // Ledges across the back of each leaf
      const i0 = at - out * 0.04;
      const i1 = at - out * 0.1;
      for (const zz of [SILL_TOP + 0.35, OPEN_HI - 0.35])
        for (const [a0, a1] of [[from + 0.05, (from + to) / 2 - 0.05], [(from + to) / 2 + 0.05, to - 0.05]]) {
          if (axis === 'x') b.span('board', [a0, i0, zz - 0.07], [a1, i1, zz + 0.07], { role: 'ledge', shade: 0.2 });
          else b.span('board', [i0, a0, zz - 0.07], [i1, a1, zz + 0.07], { role: 'ledge', shade: 0.2 });
        }
      rail(b, axis, at, from, to, OPEN_HI, LINTEL_HI, POST);
      cladFrom = LINTEL_HI;
    } else {
      brickPanel(b, axis, at, from, to, SILL_TOP, 6);
      rail(b, axis, at, from, to, RAIL_LO, RAIL_HI, POST);
    }
    // The window: studs either side of the opening, a sill and a head between them, four panes
    const w0 = (from + to) / 2 - 0.55;
    const w1 = (from + to) / 2 + 0.55;
    const win0 = RAIL_HI + 0.32;
    const win1 = PLATE_LO - 0.34;
    if (kind === 'window') {
      const stud = (c: number) => {
        if (axis === 'x') b.span('timber', [c - 0.05, at - 0.07, RAIL_HI], [c + 0.05, at + 0.07, PLATE_LO], { role: 'stud' });
        else b.span('timber', [at - 0.07, c - 0.05, RAIL_HI], [at + 0.07, c + 0.05, PLATE_LO], { role: 'stud' });
      };
      stud(w0 - 0.05);
      stud(w1 + 0.05);
      rail(b, axis, at, w0, w1, win0 - 0.1, win0, 0.14);
      rail(b, axis, at, w0, w1, win1, win1 + 0.1, 0.14);
      windowLights(b, axis, at, w0, w1, win0, win1, 2, 2);
    }
    // Tarred weatherboards outside the posts, broken round the window, butted at the posts' middles
    const BOARD_T = 0.045;
    const face = at + out * (POST / 2 + BOARD_T / 2);
    const n = Math.max(1, Math.round((PLATE_HI - cladFrom) / 0.2));
    const h = (PLATE_HI - cladFrom) / n;
    const [a0, a1] = ends;
    for (let k = 0; k < n; k++) {
      const z0 = cladFrom + k * h;
      const z1 = z0 + h;
      let spans: [number, number][] = kind === 'window' && z1 > win0 - 0.1 && z0 < win1 + 0.1 ? [[a0, w0 - 0.1], [w1 + 0.1, a1]] : [[a0, a1]];
      spans = spans.filter(([s0, s1]) => s1 - s0 > 0.08);
      // Long runs in two boards, butted end to end
      spans = spans.flatMap(([s0, s1]): [number, number][] => (s1 - s0 > 1.3 ? [[s0, (s0 + s1) / 2], [(s0 + s1) / 2, s1]] : [[s0, s1]]));
      for (const [s0, s1] of spans) {
        const shade = 0.5 + b.random() * 0.1;
        if (axis === 'x') b.span('board', [s0 + 0.002, face - BOARD_T / 2, z0], [s1 - 0.002, face + BOARD_T / 2, z1], { role: 'weatherboard', shade });
        else b.span('board', [face - BOARD_T / 2, s0 + 0.002, z0], [face + BOARD_T / 2, s1 - 0.002, z1], { role: 'weatherboard', shade });
      }
    }
  };
  const front: Bay[] = ['window', 'door', 'window'];
  const back: Bay[] = ['brick', 'window', 'brick'];
  const ends = (i: number) => [i === 0 ? XS[0] - CLAD : XS[i], i === XS.length - 2 ? XE + CLAD : XS[i + 1]] as [number, number];
  for (let i = 0; i < 3; i++) {
    bay('x', -HY, XS[i], XS[i + 1], front[i], ends(i));
    bay('x', HY, XS[i], XS[i + 1], back[i], ends(i));
  }
  const shortEnds = (i: number): [number, number] => [i === 0 ? -HY - POST / 2 : 0, i === 1 ? HY + POST / 2 : 0];
  bay('y', -XE, YS[0], YS[1], 'brick', shortEnds(0));
  bay('y', -XE, YS[1], YS[2], 'window', shortEnds(1));
  bay('y', XE, YS[0], YS[1], 'window', shortEnds(0));
  bay('y', XE, YS[1], YS[2], 'brick', shortEnds(1));

  // ---- The roof: a king-post truss over each pair of posts, common rafters between, a ridge, tiles
  const PITCH = (36 * Math.PI) / 180;
  const RAFTER_D = 0.18;
  const EAVE_Y = HY + 0.55;
  const tan = Math.tan(PITCH);
  const cos = Math.cos(PITCH);
  // A rafter's underside: the plane through the cladding's outer top edge
  const under = (y: number) => PLATE_HI + (HY + POST / 2 + 0.05 - Math.abs(y)) * tan;
  const ridgeZ = under(0);
  const sides = [-1, 1].map((s) => ({ s, normal: norm([0, s * Math.sin(PITCH), Math.cos(PITCH)]) as V3 }));
  const rafterIds = new Map<string, number[]>();
  const rafter = (x: number, side: (typeof sides)[number], w: number) => {
    const off = scale(side.normal, RAFTER_D / 2);
    const eave: V3 = add([x, side.s * EAVE_Y, under(EAVE_Y)], off);
    const top: V3 = add([x, -side.s * 0.05, under(0.05)], off);
    const ids = b.member('timber', eave, top, w, RAFTER_D, 3, { role: 'rafter', up: side.normal });
    rafterIds.set(`${x},${side.s}`, ids);
    // Seated on the plate (birdsmouth)
    const seat: V3 = [x, side.s * (HY + POST / 4), PLATE_HI + 0.02];
    b.weldToAny(nearest(b, ids, seat), seat, 0.06, ids);
    return ids;
  };
  const OVER = 0.3;
  b.member('timber', [-XE - OVER, 0, ridgeZ + 0.13], [XE + OVER, 0, ridgeZ + 0.13], 0.12, 0.26, 7, { role: 'ridge' });
  const pairUp = (x: number) => {
    const south = rafterIds.get(`${x},-1`)!;
    const north = rafterIds.get(`${x},1`)!;
    b.weld(south[south.length - 1], north[north.length - 1], [x, 0, ridgeZ + 0.1]);
  };
  for (const x of XS) {
    // Tie beam across between the plates (at the gables, over the end posts), king post, struts
    const tieIds = b.member('timber', [x, -HY + POST / 2, PLATE_LO + POST / 2], [x, HY - POST / 2, PLATE_LO + POST / 2], 0.22, POST, 4, { role: 'tie beam' });
    b.member('timber', [x, 0, PLATE_HI], [x, 0, ridgeZ], 0.18, 0.18, 2, { role: 'king post' });
    for (const side of sides) {
      const ids = rafter(x, side, 0.16);
      const footAt: V3 = [x, side.s * (HY - 0.2), PLATE_HI - 0.05];
      b.weld(ids[0], nearest(b, tieIds, footAt), footAt);
      b.weldToAny(ids[ids.length - 1], [x, -side.s * 0.05, ridgeZ + 0.05], 0.1, ids);
      const mid: V3 = add([x, side.s * 1.3, under(1.3)], scale(side.normal, -0.02));
      const foot: V3 = [x, side.s * 0.09, PLATE_HI + 0.22];
      const strut = b.member('timber', foot, mid, 0.12, 0.12, 1, { role: 'strut', up: [1, 0, 0] });
      b.weldToAny(strut[0], foot, 0.05, strut);
      b.weld(strut[0], nearest(b, ids, mid), mid);
    }
    pairUp(x);
  }
  const commons = [-2.4, 0, 2.4];
  for (const x of commons) {
    for (const side of sides) {
      const ids = rafter(x, side, 0.11);
      b.weldToAny(ids[ids.length - 1], [x, -side.s * 0.05, ridgeZ + 0.05], 0.1, ids);
    }
    pairUp(x);
  }
  // Tiles: courses of clay tile slabs up each slope, each slab spanning two rafters
  const rafterXs = [...XS, ...commons].sort((p, q) => p - q);
  const xs = [-XE - OVER, ...rafterXs.slice(1, -1), XE + OVER];
  const run = (EAVE_Y - 0.06) / cos;
  const COURSES = 7;
  const TILE_T = 0.06;
  for (const side of sides) {
    const along = run / COURSES;
    const q: Q4 = frame([1, 0, 0], side.normal);
    for (let c = 0; c < COURSES; c++) {
      const t = (c + 0.5) * along;
      const yy = side.s * (EAVE_Y - t * cos);
      const base: V3 = [0, yy, under(Math.abs(yy))];
      const centre = add(base, scale(side.normal, RAFTER_D + TILE_T / 2));
      for (let i = 0; i + 1 < xs.length; i++) {
        const x0 = xs[i] + 0.004;
        const x1 = xs[i + 1] - 0.004;
        const id = b.box('tile', [(x0 + x1) / 2, centre[1], centre[2]], [x1 - x0, along - 0.006, TILE_T], { rot: q, role: 'tile', shade: b.random() });
        for (const rx of rafterXs) {
          if (rx < x0 - 0.05 || rx > x1 + 0.05) continue;
          const ids = rafterIds.get(`${rx},${side.s}`);
          if (!ids) continue;
          const at: V3 = add([rx, yy, under(Math.abs(yy))], scale(side.normal, RAFTER_D));
          b.weld(id, nearest(b, ids, at), at);
        }
      }
    }
  }
  // Gables: vertical boards filling the triangle over each end tie beam
  for (const x of [-XE, XE]) {
    const out = Math.sign(x);
    const n = 18;
    const w = (2 * HY - 0.1) / n;
    for (let k = 0; k < n; k++) {
      const y0 = -HY + 0.05 + k * w;
      const y1 = y0 + w;
      const top = under(Math.max(Math.abs(y0), Math.abs(y1))) - 0.01;
      if (top - PLATE_HI < 0.12) continue;
      const id = b.span('board', [x + out * 0.14, y0 + 0.003, PLATE_HI], [x + out * 0.185, y1 - 0.003, top], { role: 'gable board', shade: 0.45 + b.random() * 0.1 });
      b.weldToAny(id, [x + out * 0.1, (y0 + y1) / 2, PLATE_HI - 0.05], 0.04);
      const yc = (y0 + y1) / 2;
      const side = sides[yc < 0 ? 0 : 1];
      const ids = rafterIds.get(`${x},${side.s}`);
      if (ids) b.weld(id, nearest(b, ids, [x, yc, top]), [x + out * 0.09, yc, top - 0.05]);
    }
  }
  return { framing: { target: [0, 0, 2.3], distance: 15.5, yaw: -0.62, pitch: 0.2 }, height: ridgeZ };
}

// ---- The water tower ----

/** A riveted steel tank on a four-legged lattice tower, full of water (Timberfall's). */
function waterTower(b: Builder, cx: number, cy: number): Omit<Built, 'builder'> {
  const L = 1.45;
  const LEG = 0.22;
  const TOP = 8.2;
  const corners: [number, number][] = [[-L, -L], [L, -L], [L, L], [-L, L]];
  for (const [dx, dy] of corners) {
    b.span('stone', [cx + dx - 0.35, cy + dy - 0.35, 0], [cx + dx + 0.35, cy + dy + 0.35, 0.45], { role: 'footing', shade: b.random() });
    b.member('steel', [cx + dx, cy + dy, 0.45], [cx + dx, cy + dy, TOP], LEG, LEG, 6, { role: 'leg' });
  }
  // Girts between the legs, and X-braces in each face of each panel
  const levels = [0.45, 3.05, 5.65, TOP];
  for (const z of levels.slice(1, -1)) {
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 4];
      const a: V3 = [cx + ax, cy + ay, z];
      const c: V3 = [cx + bx, cy + by, z];
      b.member('steel', lerp3(a, c, LEG / 2 / (2 * L)), lerp3(c, a, LEG / 2 / (2 * L)), 0.14, 0.14, 1, { role: 'girt' });
    }
  }
  for (let lv = 0; lv + 1 < levels.length; lv++) {
    const z0 = levels[lv] + 0.25;
    const z1 = levels[lv + 1] - 0.25;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % 4];
      // Offset outwards so the braces sit on the legs' faces
      const out: V3 = norm([(ax + bx) / 2, (ay + by) / 2, 0]);
      const o = scale(out, LEG / 2 + 0.03);
      const p = (x: number, y: number, z: number) => add([cx + x, cy + y, z], o);
      const d1 = b.member('steel', p(ax, ay, z0), p(bx, by, z1), 0.05, 0.05, 1, { role: 'brace', up: out })[0];
      const d2 = b.member('steel', p(bx, by, z0), p(ax, ay, z1), 0.05, 0.05, 1, { role: 'brace', up: out })[0];
      b.weldToAny(d1, sub(p(ax, ay, z0), o), 0.15);
      b.weldToAny(d1, sub(p(bx, by, z1), o), 0.15);
      b.weldToAny(d2, sub(p(bx, by, z0), o), 0.15);
      b.weldToAny(d2, sub(p(ax, ay, z1), o), 0.15);
      // Riveted where they cross (they overlap there)
      b.weld(d1, d2, p((ax + bx) / 2, (ay + by) / 2, (z0 + z1) / 2));
    }
  }
  // The platform: two main beams on the legs, cross beams on those, a deck
  for (const dy of [-L, L]) b.member('steel', [cx - L - 0.3, cy + dy, TOP + 0.15], [cx + L + 0.3, cy + dy, TOP + 0.15], 0.24, 0.3, 2, { role: 'beam' });
  for (const dx of [-1.2, -0.4, 0.4, 1.2]) b.member('steel', [cx + dx, cy - L - 0.3, TOP + 0.4], [cx + dx, cy + L + 0.3, TOP + 0.4], 0.16, 0.2, 1, { role: 'beam' });
  const deckZ = TOP + 0.5;
  // The tank: a floor plate (heavy: it carries the water), two rings of curved plates, a stepped lid
  const R = 1.55;
  const N = 14;
  const H = 1.25;
  const floor = b.box('steel', [cx, cy, deckZ + 0.04], [3.1, 3.1, 0.08], { role: 'tank floor' });
  // Water: the floor is made heavy rather than adding a body that would rattle about
  b.pieces[floor].density = 22;
  const ring: number[][] = [];
  for (let r = 0; r < 2; r++) {
    const row: number[] = [];
    for (let k = 0; k < N; k++) {
      const a = ((k + (r ? 0.5 : 0)) / N) * Math.PI * 2;
      const w = 2 * R * Math.sin(Math.PI / N) + 0.01;
      const c: V3 = [cx + Math.cos(a) * R, cy + Math.sin(a) * R, deckZ + 0.08 + H * (r + 0.5)];
      const q = frame([-Math.sin(a), Math.cos(a), 0], [0, 0, 1]);
      row.push(b.box('steel', c, [w, 0.05, H - 0.004], { rot: q, role: 'tank plate', shade: r }));
    }
    ring.push(row);
  }
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < N; k++) {
      const a = ((k + 1 + (r ? 0.5 : 0)) / N) * Math.PI * 2 - Math.PI / N;
      const z = deckZ + 0.08 + H * (r + 0.5);
      b.weld(ring[r][k], ring[r][(k + 1) % N], [cx + Math.cos(a) * R, cy + Math.sin(a) * R, z]);
      if (r === 0) b.weld(ring[0][k], floor, [cx + Math.cos(a - Math.PI / N) * R, cy + Math.sin(a - Math.PI / N) * R, deckZ + 0.08]);
    }
  for (let k = 0; k < N; k++) {
    const a = ((k + 0.5) / N) * Math.PI * 2;
    const p: V3 = [cx + Math.cos(a) * R, cy + Math.sin(a) * R, deckZ + 0.08 + H];
    b.weld(ring[1][k], ring[0][k], p);
    b.weld(ring[1][k], ring[0][(k + 1) % N], p);
  }
  for (const dx of [-1.2, -0.4, 0.4, 1.2]) b.weldToAny(floor, [cx + dx, cy, deckZ], 0.06, [floor]);
  // Lid: stepped square plates turned against each other, an octagon from below, and a finial
  let below = ring[1];
  let z = deckZ + 0.08 + 2 * H;
  const steps: [number, number][] = [[3.3, 0.08], [2.5, 0.08], [1.6, 0.08], [0.7, 0.1]];
  steps.forEach(([w, t], i) => {
    const q = frame([Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4), 0], [0, 0, 1]);
    const id = b.box('steel', [cx, cy, z + t / 2], [w, w, t], { rot: q, role: 'lid', shade: 2 });
    for (const pid of below) {
      const p = b.pieces[pid].pos;
      b.weld(id, pid, i === 0 ? [p[0], p[1], z] : [cx + (p[0] - cx) * 0.2, cy + (p[1] - cy) * 0.2, z]);
    }
    below = [id];
    z += t;
  });
  const fin = b.box('steel', [cx, cy, z + 0.2], [0.14, 0.14, 0.4], { role: 'finial', shade: 2, manual: true });
  b.weld(fin, below[0], [cx, cy, z]);
  return { framing: { target: [0, 0, 5.9], distance: 23, yaw: -0.55, pitch: 0.13 }, height: z + 0.4 };
}

// ---- The garden wall ----

/**
 * A brick garden wall, 9 m long and 2.1 m high, in stretcher bond between square piers, on a
 * course of stone, with stone coping and caps, and a ledged and braced timber gate between the
 * middle piers. Mortar is brittle: a hole stays a hole, and what's left over it holds by its
 * neighbours until there aren't enough of them.
 */
function gardenWall(b: Builder): Omit<Built, 'builder'> {
  const T = 0.22;
  const P = 0.46;
  const BASE = 0.24;
  const COURSES = 14;
  const TOP = BASE + COURSES * COURSE;
  const piers = [-4.4, -0.9, 0.9, 4.4];
  // The base: one course of stone the whole length
  stoneRun(b, 'x', 0, piers[0] - P / 2 - 0.04, piers[3] + P / 2 + 0.04, 0, 1, BASE, P + 0.08, 1.1);
  // Piers: two bricks a course, turned course by course
  for (const x of piers) {
    for (let c = 0; c < COURSES + 1; c++) {
      const z0 = BASE + c * COURSE;
      const z1 = z0 + COURSE;
      const shade = () => b.random();
      if (c % 2 === 0) {
        b.span('brick', [x - P / 2, -P / 2, z0], [x, P / 2, z1], { role: 'pier', shade: shade() });
        b.span('brick', [x, -P / 2, z0], [x + P / 2, P / 2, z1], { role: 'pier', shade: shade() });
      } else {
        b.span('brick', [x - P / 2, -P / 2, z0], [x + P / 2, 0, z1], { role: 'pier', shade: shade() });
        b.span('brick', [x - P / 2, 0, z0], [x + P / 2, P / 2, z1], { role: 'pier', shade: shade() });
      }
    }
    // A stone cap, and a smaller block on it
    const capZ = BASE + (COURSES + 1) * COURSE;
    b.span('stone', [x - P / 2 - 0.05, -P / 2 - 0.05, capZ], [x + P / 2 + 0.05, P / 2 + 0.05, capZ + 0.1], { role: 'cap', shade: 0.4 });
    b.span('stone', [x - 0.16, -0.16, capZ + 0.1], [x + 0.16, 0.16, capZ + 0.36], { role: 'cap', shade: 0.45 });
  }
  // Panels between the outer and inner piers, coped with stone
  for (const [p0, p1] of [[piers[0], piers[1]], [piers[2], piers[3]]]) {
    const from = p0 + P / 2;
    const to = p1 - P / 2;
    brickPanel(b, 'x', 0, from, to, BASE, COURSES, { thick: T, gap: 0 });
    const n = 3;
    for (let k = 0; k < n; k++) b.span('stone', [from + ((to - from) * k) / n + 0.002, -T / 2 - 0.05, TOP], [from + ((to - from) * (k + 1)) / n - 0.002, T / 2 + 0.05, TOP + 0.09], { role: 'coping', shade: b.random() });
  }
  // The gate: two ledged and braced leaves of vertical boards, hung on the inner piers
  const g0 = piers[1] + P / 2 + 0.02;
  const g1 = piers[2] - P / 2 - 0.02;
  const mid = (g0 + g1) / 2;
  const GZ0 = BASE + 0.08;
  const GZ1 = BASE + 1.62;
  for (const [a0, a1] of [[g0, mid - 0.01], [mid + 0.01, g1]]) {
    const n = 4;
    const w = (a1 - a0) / n;
    const boards: number[] = [];
    for (let k = 0; k < n; k++) boards.push(b.span('board', [a0 + k * w + 0.004, -0.02, GZ0], [a0 + (k + 1) * w - 0.004, 0.02, GZ1 - (k % 2) * 0.04], { role: 'gate', shade: 0.85 }));
    for (const zz of [GZ0 + 0.22, GZ1 - 0.24]) b.span('board', [a0 + 0.02, 0.02, zz - 0.06], [a1 - 0.02, 0.07, zz + 0.06], { role: 'ledge', shade: 0.85 });
    // Hung on its pier: welded to the pier's face top and bottom (hinges)
    const hinge = a0 < mid ? piers[1] + P / 2 : piers[2] - P / 2;
    const edge = a0 < mid ? boards[0] : boards[n - 1];
    for (const zz of [GZ0 + 0.22, GZ1 - 0.24]) b.weldToAny(edge, [hinge, 0, zz], 0.03, boards);
  }
  return { framing: { target: [0, 0, 1.2], distance: 13.5, yaw: -0.5, pitch: 0.17 }, height: TOP + 0.4 };
}

// ---- The chimney ----

/** A free-standing square brick chimney, 10 m, on a base of dressed stone, with a corbelled cap. */
function chimney(b: Builder): Omit<Built, 'builder'> {
  const S = 1.0;
  const T = BRICK_T;
  const x0 = -S / 2;
  const x1 = S / 2;
  const y0 = -S / 2;
  const y1 = S / 2;
  // The base: three courses of stone, a little wider than the stack
  const B = S + 0.4;
  for (let c = 0; c < 3; c++) {
    const z0 = c * 0.32;
    const w = B - c * 0.1;
    if (c % 2 === 0) {
      b.span('stone', [-w / 2, -w / 2, z0], [w / 2 - 0.5, w / 2, z0 + 0.32], { role: 'plinth', shade: b.random() });
      b.span('stone', [w / 2 - 0.5, -w / 2, z0], [w / 2, w / 2, z0 + 0.32], { role: 'plinth', shade: b.random() });
    } else {
      b.span('stone', [-w / 2, -w / 2, z0], [w / 2, w / 2 - 0.5, z0 + 0.32], { role: 'plinth', shade: b.random() });
      b.span('stone', [-w / 2, w / 2 - 0.5, z0], [w / 2, w / 2, z0 + 0.32], { role: 'plinth', shade: b.random() });
    }
  }
  const z0 = 0.96;
  const top = 10.4;
  const courses = Math.round((top - z0) / COURSE);
  const add1 = (min: V3, max: V3, role = 'chimney') => b.span('brick', min, max, { role, shade: b.random() });
  for (let c = 0; c < courses; c++) {
    const za = z0 + c * COURSE;
    const zb = za + COURSE;
    // Two courses near the top stand out a little (corbelling)
    const k = c >= courses - 4 && c < courses - 2 ? 0.05 : 0;
    const [ax0, ax1, ay0, ay1] = [x0 - k, x1 + k, y0 - k, y1 + k];
    if (c % 2 === 0) {
      for (const [ya, yb] of [[ay0, ay0 + T], [ay1 - T, ay1]]) {
        add1([ax0, ya, za], [(ax0 + ax1) / 2, yb, zb]);
        add1([(ax0 + ax1) / 2, ya, za], [ax1, yb, zb]);
      }
      add1([ax0, ay0 + T, za], [ax0 + T, ay1 - T, zb]);
      add1([ax1 - T, ay0 + T, za], [ax1, ay1 - T, zb]);
    } else {
      for (const [xa, xb] of [[ax0, ax0 + T], [ax1 - T, ax1]]) {
        add1([xa, ay0, za], [xb, (ay0 + ay1) / 2, zb]);
        add1([xa, (ay0 + ay1) / 2, za], [xb, ay1, zb]);
      }
      add1([ax0 + T, ay0, za], [ax1 - T, ay0 + T, zb]);
      add1([ax0 + T, ay1 - T, za], [ax1 - T, ay1, zb]);
    }
  }
  // A stone cap
  const zc = z0 + courses * COURSE;
  b.span('stone', [x0 - 0.08, y0 - 0.08, zc], [x0 + S / 2, y1 + 0.08, zc + 0.12], { role: 'cap', shade: 0.3 });
  b.span('stone', [x0 + S / 2, y0 - 0.08, zc], [x1 + 0.08, y1 + 0.08, zc + 0.12], { role: 'cap', shade: 0.3 });
  return { framing: { target: [0, 0, 4.6], distance: 18, yaw: -0.6, pitch: 0.12 }, height: zc + 0.12 };
}
