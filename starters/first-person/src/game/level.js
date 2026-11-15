// THE LEVEL, AS DATA. Draw a new place by editing MAP: one character = one square of CELL metres.
// The same data builds what you see (meshes) and what you bump into (the `solids` list for collide.js).
//
// To change the place: edit MAP (every row must be the same length; keep a wall all the way round).
// To add a new kind of square: add a line to LEGEND (and, for a new solid shape, to SOLIDS).
// To add something off the grid (a bridge, a table): push to EXTRA_SOLIDS.
//
// Also here: the walkable grid and findPath() (used by the bot; enemies could use it too).

import * as THREE from 'three';
import { createRandom } from '../core/random.js';
import { makeBox, makeCyl } from './collide.js';

export const CELL = 2; // metres per map square

// prettier-ignore
export const MAP = [
  '#############################',
  '#......T.......#............#',
  '#..L......,....#......L.....#',
  '#.........,....o............#',
  '#....==...,.........oo......#',
  '#....=....,.................#',
  '#.........,,,,,,,,,...=.....#',
  '#.........,.......,...=..T..#',
  '####o..o##,..bbb..,...==....#',
  '#.........,..bAb..,.........#',
  '#..L......,..bbb..,,,,,,,...#',
  '#.........,...,...,.....,...#',
  '#....T....,,,,P,,,,..o..,.L.#',
  '#.........,.......,.....,...#',
  '#..===o...,.......,.........#',
  '#.........,..##o..,,,,......#',
  '#.........,.......,..#......#',
  '#....L....,..T....,..#...=..#',
  '#.........,.......,..o..==..#',
  '#.........,,,,,,,,,.........#',
  '#..o...........,.......L....#',
  '#..............,............#',
  '#############################',
];

// What each character means.
//   floor: 'path' paints a flagstone (anything else is grass)
//   solid: a name from SOLIDS below
//   thing: something the game places there: 'lantern' or 'start' (the player). Add your own kinds freely:
//          buildLevel() returns things[kind] = [{ x, y, z }, ...] for game.js to use.
export const LEGEND = {
  '.': {},
  ',': { floor: 'path' },
  '#': { solid: 'wall' },
  '=': { solid: 'low' },
  b: { solid: 'step' },
  o: { solid: 'pillar' },
  T: { solid: 'tree' },
  L: { thing: 'lantern' },
  A: { solid: 'step', thing: 'lantern' },
  P: { floor: 'path', thing: 'start' },
};

// The solid kinds. height in metres; vary = random extra height (ruined look); walk: can you walk over it?
// A top lower than the player's step height (tuning: move.stepHeight, 0.35 m) is walked up without a jump.
// 'low' walls (0.8 m) can be jumped; everything taller is a wall.
export const SOLIDS = {
  wall: { shape: 'box', height: 2.7, vary: 0.9, walk: false, cap: true },
  low: { shape: 'box', height: 0.8, vary: 0, walk: false, cap: true },
  step: { shape: 'box', height: 0.3, vary: 0, walk: true },
  pillar: { shape: 'cyl', radius: 0.45, height: 2.2, vary: 1.6, walk: false },
  tree: { shape: 'cyl', radius: 0.3, height: 2.6, vary: 0.8, walk: false },
};

// Free-form solids that do not fit the grid: makeBox(cx, cz, width, depth, y0, y1) or makeCyl(x, z, r, y0, y1).
// They collide but are not drawn: add your own mesh for them in scenery.js.
export const EXTRA_SOLIDS = [];

const W = MAP[0].length;
const H = MAP.length;
MAP.forEach((row, i) => {
  if (row.length !== W) throw new Error(`level.js: MAP row ${i} is ${row.length} wide, row 0 is ${W}. All rows must match.`);
  for (const ch of row) if (!LEGEND[ch]) throw new Error(`level.js: MAP row ${i} uses "${ch}", which is not in LEGEND.`);
});

export const cellX = (cx) => (cx - (W - 1) / 2) * CELL;
export const cellZ = (cz) => (cz - (H - 1) / 2) * CELL;
export const toCell = (x, z) => ({ cx: Math.round(x / CELL + (W - 1) / 2), cz: Math.round(z / CELL + (H - 1) / 2) });
export const SIZE = { width: W * CELL, depth: H * CELL };

const walkable = MAP.map((row) => [...row].map((ch) => {
  const kind = LEGEND[ch].solid;
  return !kind || SOLIDS[kind].walk;
}));
export const canWalk = (cx, cz) => cx >= 0 && cz >= 0 && cx < W && cz < H && walkable[cz][cx];

/** Can a body walk in a straight line between two points? (Checks the squares on the way, with a margin.) */
export function clearLine(ax, az, bx, bz, margin = 0.5) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / 0.5));
  const px = len > 0 ? (-(bz - az) / len) * margin : 0;
  const pz = len > 0 ? ((bx - ax) / len) * margin : 0;
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const z = az + ((bz - az) * i) / n;
    for (const k of [-1, 0, 1]) {
      const c = toCell(x + px * k, z + pz * k);
      if (!canWalk(c.cx, c.cz)) return false;
    }
  }
  return true;
}

/** Shortest walk between two world points as a list of { x, z } square centres (breadth-first search). */
export function findPath(ax, az, bx, bz) {
  const a = toCell(ax, az);
  const b = toCell(bx, bz);
  const key = (cx, cz) => cz * W + cx;
  const from = new Map([[key(a.cx, a.cz), -1]]);
  const queue = [[a.cx, a.cz]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < queue.length; i++) {
    const [cx, cz] = queue[i];
    if (cx === b.cx && cz === b.cz) break;
    for (const [dx, dz] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (from.has(key(nx, nz)) || !canWalk(nx, nz)) continue;
      if (dx && dz && (!canWalk(cx + dx, cz) || !canWalk(cx, cz + dz))) continue; // no cutting corners
      from.set(key(nx, nz), key(cx, cz));
      queue.push([nx, nz]);
    }
  }
  const path = [];
  let k = key(b.cx, b.cz);
  if (!from.has(k)) return path;
  while (k !== -1) {
    path.unshift({ x: cellX(k % W), z: cellZ(Math.floor(k / W)) });
    k = from.get(k);
  }
  return path;
}

/**
 * Build the level into the scene. Returns { solids, things: { lantern: [..], start: [..] } }
 * where each thing is { x, y, z } (y = the height of the floor there).
 */
export function buildLevel(scene, look) {
  const rand = createRandom(77); // fixed: the place is the same for every seed
  const solids = [...EXTRA_SOLIDS];
  const things = { lantern: [], start: [] };
  const boxes = []; // { x, y, z, sx, sy, sz, color }
  const cyls = [];
  const slabs = [];
  const crowns = [];

  const stone = look.base[2];
  const stoneDark = look.mix(look.base[2], look.shadow, 0.35);
  const capCol = look.mix(look.base[2], look.light, 0.22);
  const stepCol = look.mix(look.base[3], look.light, 0.12);
  const trunkCol = look.mix(look.base[3], look.shadow, 0.55);
  const leafCol = look.mix(look.base[1], look.shadow, 0.25);
  const jitter = (c, amount = 0.08) => look.shade(c, rand.range(-amount, amount));

  for (let cz = 0; cz < H; cz++) {
    for (let cx = 0; cx < W; cx++) {
      const def = LEGEND[MAP[cz][cx]];
      const x = cellX(cx);
      const z = cellZ(cz);
      let floorY = 0;

      if (def.floor === 'path') {
        slabs.push({ x: x + rand.range(-0.04, 0.04), z: z + rand.range(-0.04, 0.04), rot: rand.range(-0.05, 0.05), color: jitter(look.base[3], 0.07) });
      }

      const kind = SOLIDS[def.solid];
      if (kind) {
        const edge = cx === 0 || cz === 0 || cx === W - 1 || cz === H - 1;
        const h = kind.height + (edge ? kind.vary : rand.range(0, kind.vary)); // the outer wall is whole, the ruin is broken
        if (kind.shape === 'box') {
          solids.push(makeBox(x, z, CELL, CELL, 0, h));
          boxes.push({ x, y: h / 2, z, sx: CELL, sy: h, sz: CELL, color: jitter(def.solid === 'step' ? stepCol : rand.chance(0.25) ? stoneDark : stone) });
          if (kind.cap) boxes.push({ x, y: h + 0.06, z, sx: CELL + 0.14, sy: 0.14, sz: CELL + 0.14, color: jitter(capCol, 0.05) });
          if (kind.walk) floorY = h;
        } else {
          solids.push(makeCyl(x, z, kind.radius, 0, h));
          const tree = def.solid === 'tree';
          cyls.push({ x, y: h / 2, z, r: kind.radius, h, color: jitter(tree ? trunkCol : stone) });
          if (tree) crowns.push({ x, y: h + 0.9, z, s: rand.range(1.5, 2.1), color: jitter(leafCol) });
          else cyls.push({ x, y: h + 0.07, z, r: kind.radius + 0.1, h: 0.14, color: jitter(capCol, 0.05) });
        }
      }
      if (def.thing) (things[def.thing] ??= []).push({ x, y: floorY, z });
    }
  }

  // One draw call per shape: instanced meshes with a colour per instance.
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  function instanced(geo, mat, list, place) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      place(it);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(it.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  const flat = () => new THREE.MeshLambertMaterial({ flatShading: true });
  instanced(new THREE.BoxGeometry(1, 1, 1), flat(), boxes, (b) =>
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q.identity(), new THREE.Vector3(b.sx, b.sy, b.sz)));
  instanced(new THREE.CylinderGeometry(1, 1.08, 1, 9), flat(), cyls, (c) =>
    m.compose(new THREE.Vector3(c.x, c.y, c.z), q.identity(), new THREE.Vector3(c.r, c.h, c.r)));
  instanced(new THREE.IcosahedronGeometry(1, 1), flat(), crowns, (c) =>
    m.compose(new THREE.Vector3(c.x, c.y, c.z), q.setFromAxisAngle(up, c.s * 3), new THREE.Vector3(c.s, c.s * 0.8, c.s)));
  const slabMesh = instanced(new THREE.BoxGeometry(CELL * 0.94, 0.05, CELL * 0.94), flat(), slabs, (s) =>
    m.compose(new THREE.Vector3(s.x, 0.005, s.z), q.setFromAxisAngle(up, s.rot), new THREE.Vector3(1, 1, 1)));
  if (slabMesh) slabMesh.castShadow = false;

  return { solids, things };
}

/** 'path' or 'grass' under a point (footstep sounds). */
export function floorAt(x, z) {
  const c = toCell(x, z);
  const def = LEGEND[MAP[c.cz]?.[c.cx]] ?? {};
  return def.floor === 'path' || def.solid === 'step' ? 'path' : 'grass';
}
