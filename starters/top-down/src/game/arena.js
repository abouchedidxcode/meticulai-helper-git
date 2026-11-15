// The arena: a walled garden drawn from a TEXT MAP, plus all collision (player, enemies, shots)
// and the path-finding grid enemies use to walk around walls.
//
// To make a new arena, edit MAP below (one character = one 2 m square). Legend:
//   #  wall: blocks everyone and every shot
//   o  planter: a round obstacle, blocks everyone and every shot (cover)
//   ~  pond: blocks walking, shots fly over it
//   P  where the player starts          B  where the boss appears
//   a b c d ...  spawn gates, named in the wave table (waves.js): "where: 'a'"
//   .  open floor
// Rows may be any length (keep them all the same) and there can be several arenas: see STARTER.md
// "a dungeon crawler with rooms".

import * as THREE from 'three';
import { createRandom } from '../core/random.js';
import { createAtmosphere } from '../render/atmosphere.js';
import { apart, instanced, mergeParts } from './shapes.js';

export const CELL = 2; // metres per map character

export const MAP = [
  '###################',
  '#a.......#.......b#',
  '#.................#',
  '#...o....B....o...#',
  '#......#...#......#',
  '#..~..............#',
  '#........P........#',
  '#..............~..#',
  '#......#...#......#',
  '#...o.........o...#',
  '#.................#',
  '#d.......#.......c#',
  '###################',
];

export function buildArena(scene, look, map = MAP) {
  const rand = createRandom(77); // fixed: the garden looks the same for every seed
  const rows = map.length;
  const cols = map[0].length;
  const W = cols * CELL;
  const H = rows * CELL;
  const ox = -W / 2; // world x of the map's left edge
  const oz = -H / 2; // world z of the map's top edge (the top of the map is the far side of the screen)

  const walls = new Uint8Array(cols * rows); // 1 = wall
  const blocked = new Uint8Array(cols * rows); // 1 = enemies can't walk through this square
  const rounds = []; // { x, z, r, low }  low = shots fly over it (ponds)
  const gates = {}; // letter -> [{ x, z }]
  const start = { x: 0, z: 0 };
  const bossSpot = { x: 0, z: -4 };
  const cx = (c) => ox + (c + 0.5) * CELL;
  const cz = (r) => oz + (r + 0.5) * CELL;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = map[r][c] ?? '#';
      const i = r * cols + c;
      if (ch === '#') walls[i] = blocked[i] = 1;
      else if (ch === 'o') { rounds.push({ x: cx(c), z: cz(r), r: 0.85, low: false }); blocked[i] = 1; }
      else if (ch === '~') { rounds.push({ x: cx(c), z: cz(r), r: 1.05, low: true }); blocked[i] = 1; }
      else if (ch === 'P') { start.x = cx(c); start.z = cz(r); }
      else if (ch === 'B') { bossSpot.x = cx(c); bossSpot.z = cz(r); }
      else if (/[a-z]/.test(ch)) (gates[ch] ??= []).push({ x: cx(c), z: cz(r) });
    }
  }

  // --- Collision -------------------------------------------------------------------------------

  const col = (x) => Math.floor((x - ox) / CELL);
  const row = (z) => Math.floor((z - oz) / CELL);
  const wallAt = (c, r) => c < 0 || r < 0 || c >= cols || r >= rows || walls[r * cols + c] === 1;

  // Push a circle (p.x, p.z, radius) out of walls and round obstacles. `low: false` ignores ponds
  // (for things that fly). Returns true if it touched anything.
  function pushOut(p, radius, low = true) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const c0 = col(p.x - radius);
      const c1 = col(p.x + radius);
      const r0 = row(p.z - radius);
      const r1 = row(p.z + radius);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!wallAt(c, r)) continue;
          const minX = ox + c * CELL;
          const minZ = oz + r * CELL;
          const nx = Math.max(minX, Math.min(p.x, minX + CELL));
          const nz = Math.max(minZ, Math.min(p.z, minZ + CELL));
          let dx = p.x - nx;
          let dz = p.z - nz;
          const d = Math.hypot(dx, dz);
          if (d >= radius) continue;
          hit = true;
          if (d < 1e-5) {
            // Centre inside the square: leave by the nearest side.
            const l = p.x - minX, rr = minX + CELL - p.x, t = p.z - minZ, b = minZ + CELL - p.z;
            const least = Math.min(l, rr, t, b);
            if (least === l) p.x = minX - radius;
            else if (least === rr) p.x = minX + CELL + radius;
            else if (least === t) p.z = minZ - radius;
            else p.z = minZ + CELL + radius;
          } else {
            dx /= d; dz /= d;
            p.x = nx + dx * radius;
            p.z = nz + dz * radius;
          }
        }
      }
      for (const o of rounds) {
        if (o.low && !low) continue;
        const dx = p.x - o.x;
        const dz = p.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + radius;
        if (d >= min) continue;
        hit = true;
        if (d < 1e-5) p.x += min;
        else { p.x = o.x + (dx / d) * min; p.z = o.z + (dz / d) * min; }
      }
    }
    return hit;
  }

  // Would a shot be stopped here? (walls and planters; ponds don't stop shots)
  function blocksShot(x, z, pad = 0) {
    if (wallAt(col(x), row(z))) return true;
    for (const o of rounds) if (!o.low && Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    return false;
  }

  // Is the straight line between two points free of walls and planters?
  function lineClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d / 0.45);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (blocksShot(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.1)) return false;
    }
    return true;
  }

  // Can something of this radius stand here?
  const probe = { x: 0, z: 0 };
  function isFree(x, z, radius = 0.6) {
    if (blocked[row(z) * cols + col(x)] !== 0 || wallAt(col(x), row(z))) return false;
    probe.x = x; probe.z = z;
    return !pushOut(probe, radius);
  }

  // --- Path-finding: how many squares from each square to the player ---------------------------
  // Enemies with no clear line to the player step to the neighbouring square with the lowest number.

  const steps = new Int16Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let flowCell = -1;
  function updateFlow(x, z) {
    const target = row(z) * cols + col(x);
    if (target === flowCell || target < 0 || target >= steps.length || blocked[target]) return;
    flowCell = target;
    steps.fill(-1);
    let head = 0;
    let tail = 0;
    queue[tail++] = target;
    steps[target] = 0;
    while (head < tail) {
      const i = queue[head++];
      const c = i % cols;
      const r = (i - c) / cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (blocked[j] || steps[j] >= 0) continue;
        steps[j] = steps[i] + 1;
        queue[tail++] = j;
      }
    }
  }
  // Direction (unit x, z written into out) to walk from here toward the player, around walls.
  function flowDir(x, z, out) {
    const c = col(x);
    const r = row(z);
    let best = -1;
    let bestSteps = Infinity;
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const s = steps[nr * cols + nc];
      if (s >= 0 && s < bestSteps) { bestSteps = s; best = nr * cols + nc; }
    }
    if (best < 0) return false;
    const bc = best % cols;
    const dx = cx(bc) - x;
    const dz = cz((best - bc) / cols) - z;
    const d = Math.hypot(dx, dz) || 1;
    out.x = dx / d;
    out.z = dz / d;
    return true;
  }

  // --- Looks -------------------------------------------------------------------------------------

  const air = createAtmosphere(scene, { look, far: 150, shadows: { size: 2048, area: 26, far: 110 } });
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...extra });
  const tinted = (extra = {}) => new THREE.MeshStandardMaterial({ roughness: 0.95, ...extra }); // colour per copy

  // Meadow all around, and the garden floor: one picture painted from the palette (soft squares so
  // movement reads, worn paths, darker edges).
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), std(look.base[1]));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.03;
  meadow.receiveShadow = true;
  scene.add(meadow);

  const px = 48; // picture pixels per square
  const canvas = document.createElement('canvas');
  canvas.width = cols * px;
  canvas.height = rows * px;
  const g = canvas.getContext('2d');
  g.fillStyle = look.base[0];
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.fillStyle = look.shade(look.base[0], (c + r) % 2 ? -0.045 : 0.03);
      g.fillRect(c * px + 2, r * px + 2, px - 4, px - 4);
    }
  }
  g.globalAlpha = 0.3;
  g.fillStyle = look.base[3];
  for (let i = 0; i < 70; i++) {
    // worn paths: a cross through the middle and a loop
    const t = rand.next();
    const onCross = i % 2 === 0;
    const x = onCross ? (i % 4 === 0 ? t : 0.5 + rand.range(-0.02, 0.02)) : 0.5 + Math.cos(t * 6.283) * 0.3;
    const y = onCross ? (i % 4 === 0 ? 0.5 + rand.range(-0.03, 0.03) : t) : 0.5 + Math.sin(t * 6.283) * 0.3;
    g.beginPath();
    g.ellipse(x * canvas.width, y * canvas.height, rand.range(26, 54), rand.range(20, 40), rand.range(0, 3), 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 0.35;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = look.shade(look.base[0], rand.range(-0.16, 0.16));
    g.fillRect(rand.range(0, canvas.width), rand.range(0, canvas.height), rand.range(2, 5), rand.range(2, 5));
  }
  g.globalAlpha = 1;
  const floorTex = new THREE.CanvasTexture(canvas);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls: a stone block per '#', with a hedge on top. Two draw calls for all of them.
  const wallCount = walls.reduce((n, v) => n + v, 0);
  const hedgeColor = apart(look, look.mix(look.base[1], look.shadow, 0.25), look.base[0], 0.05); // walls must read on any ground
  const stone = instanced(scene, new THREE.BoxGeometry(CELL, 1, CELL), tinted(), wallCount, { shadow: true, receive: true, colors: true });
  const hedge = instanced(scene, new THREE.BoxGeometry(CELL * 0.96, 1, CELL * 0.96), tinted({ flatShading: true }), wallCount, { shadow: true, receive: true, colors: true });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!walls[r * cols + c]) continue;
      const h = rand.range(0.7, 0.95);
      const top = rand.range(0.45, 0.8);
      stone.place(cx(c), h / 2, cz(r), { sy: h, color: look.shade(look.base[2], rand.range(-0.08, 0.08)) });
      hedge.place(cx(c), h + top / 2, cz(r), { sy: top, color: look.shade(hedgeColor, rand.range(-0.06, 0.1)) });
    }
  }
  stone.done();
  hedge.done();

  // Planters (cover) and ponds.
  const pots = rounds.filter((o) => !o.low);
  const ponds = rounds.filter((o) => o.low);
  const potGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.85, 0.7, 0.9, 10), color: look.base[3], at: [0, 0.45, 0] },
    { geo: new THREE.CylinderGeometry(0.93, 0.93, 0.16, 10), color: look.shade(look.base[3], 0.14), at: [0, 0.9, 0] },
    { geo: new THREE.IcosahedronGeometry(0.72, 1), color: look.mix(look.base[0], look.base[1], 0.5), at: [0, 1.35, 0], scale: [1, 0.8, 1] },
    { geo: new THREE.IcosahedronGeometry(0.4, 0), color: look.shade(look.base[0], 0.12), at: [0.3, 1.75, 0.15] },
  ]);
  const potMesh = instanced(scene, potGeo, std('#ffffff', { vertexColors: true }), Math.max(1, pots.length), { shadow: true, receive: true });
  pots.forEach((o, i) => potMesh.place(o.x, 0, o.z, { yaw: i * 1.7 }));
  potMesh.done();
  const water = apart(look, look.mix(look.sky.top, look.light, 0.2), look.base[0], 0.12);
  const pondGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(1.05, 1.05, 0.06, 20), color: water, at: [0, 0.03, 0] },
    { geo: new THREE.TorusGeometry(1.05, 0.13, 5, 20), color: look.shade(look.base[2], 0.05), at: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.03, 9), color: look.shade(look.base[0], -0.15), at: [0.35, 0.08, 0.25] }, // lily pads
    { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.03, 9), color: look.shade(look.base[0], -0.05), at: [-0.4, 0.08, -0.3] },
    { geo: new THREE.IcosahedronGeometry(0.1, 0), color: look.shade(look.light, 0.6), at: [0.35, 0.14, 0.25] },
  ]);
  const pondMesh = instanced(scene, pondGeo, std('#ffffff', { vertexColors: true, roughness: 0.5 }), Math.max(1, ponds.length), { receive: true });
  ponds.forEach((o, i) => pondMesh.place(o.x, 0, o.z, { yaw: i * 2.1 }));
  pondMesh.done();
  const ripple = instanced(scene, new THREE.RingGeometry(0.94, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: look.mix(water, look.light, 0.35), transparent: true, opacity: 0.35 }), Math.max(1, ponds.length));

  // Grass tufts (they sway) and little flowers. Kept clear of the walls.
  const tuftGeo = new THREE.ConeGeometry(0.1, 0.34, 3).translate(0, 0.15, 0);
  const tufts = instanced(scene, tuftGeo, tinted(), 460, { receive: true, colors: true });
  const tuftList = [];
  for (let i = 0; i < 460; i++) {
    const inside = i < 300;
    const x = inside ? rand.range(ox + CELL, -ox - CELL) : rand.range(-48, 48);
    const z = inside ? rand.range(oz + CELL, -oz - CELL) : rand.range(-40, 30);
    if (inside ? !isFree(x, z, 0.3) : Math.abs(x) < W / 2 + 0.3 && Math.abs(z) < H / 2 + 0.3) continue;
    const ground = inside ? look.base[0] : look.base[1];
    tuftList.push({ x, z, yaw: rand.range(0, 6), s: rand.range(0.7, 1.5), ph: rand.range(0, 6), color: rand.pick([look.shade(ground, 0.12), look.shade(ground, -0.1), look.shade(ground, 0.22)]) });
  }
  const blooms = instanced(scene, new THREE.IcosahedronGeometry(0.07, 0), tinted(), 110, { colors: true });
  for (let i = 0; i < 110; i++) {
    const x = rand.range(-44, 44);
    const z = rand.range(-36, 26);
    if (Math.abs(x) < W / 2 && Math.abs(z) < H / 2 && !isFree(x, z, 0.3)) continue;
    blooms.place(x, 0.1, z, { color: rand.pick([look.shade(look.light, 0.5), look.mix(look.light, look.base[3], 0.4), look.shade(look.light, 0.8)]) });
  }
  blooms.done();

  // Trees outside the walls (mid distance) and soft hills beyond (far): depth at the top of the screen.
  const treeGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.2, 0.32, 1.8, 6), color: look.mix(look.base[3], look.shadow, 0.55), at: [0, 0.9, 0] },
    { geo: new THREE.IcosahedronGeometry(1.3, 1), color: '#ffffff', at: [0, 2.5, 0], scale: [1, 0.85, 1] },
    { geo: new THREE.IcosahedronGeometry(0.8, 1), color: '#f0f0f0', at: [0.55, 3.3, -0.2] },
  ]);
  const trees = instanced(scene, treeGeo, std('#ffffff', { vertexColors: true, flatShading: true }), 46, { shadow: true, colors: true });
  const leaf = [look.mix(look.base[1], look.shadow, 0.2), look.mix(look.base[0], look.base[1], 0.6), look.mix(look.base[1], look.accent[1], 0.3)];
  for (let i = 0; i < 46; i++) {
    const side = i % 4; // 0 far side (most), 1 left, 2 right, 3 near
    const x = side === 1 ? -W / 2 - rand.range(2.5, 16) : side === 2 ? W / 2 + rand.range(2.5, 16) : rand.range(-W / 2 - 14, W / 2 + 14);
    const z = side === 0 ? -H / 2 - rand.range(2.5, 22) : side === 3 ? H / 2 + rand.range(3, 9) : rand.range(-H / 2 - 12, H / 2 + 6);
    trees.place(x, 0, z, { yaw: rand.range(0, 6), sx: rand.range(0.85, 1.5), color: rand.pick(leaf) });
  }
  trees.done();
  const hills = instanced(scene, new THREE.SphereGeometry(1, 14, 8), std(look.mix(look.base[1], look.lighting.fog, 0.45)), 12);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (1.05 + (i / 11) * 0.9) + rand.range(-0.05, 0.05); // an arc across the far side
    const d = rand.range(70, 105);
    const s = rand.range(16, 30);
    hills.place(Math.cos(a) * d, -2, Math.sin(a) * d, { sx: s, sy: s * 0.35, sz: s });
  }
  hills.done();

  // Petals drifting on the wind: a little life in the air.
  const drift = instanced(scene, new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: look.mix(look.light, look.accent[0], 0.3), side: THREE.DoubleSide }), 36);
  const driftSeeds = Array.from({ length: 36 }, () => [rand.range(-24, 24), rand.range(0.6, 3.5), rand.range(-16, 16), rand.range(0, 6)]);

  function animate(time) {
    tufts.begin();
    for (const t of tuftList) tufts.place(t.x, 0, t.z, { yaw: t.yaw, roll: Math.sin(time * 1.6 + t.ph + t.x * 0.3) * 0.22, sx: t.s, color: t.color });
    tufts.done();
    ripple.begin();
    ponds.forEach((o, i) => {
      const u = (time * 0.2 + i * 0.37) % 1;
      ripple.place(o.x, 0.08, o.z, { sx: 0.15 + u * 0.8, sy: 1 });
    });
    ripple.done();
    drift.begin();
    for (const [x, y, z, ph] of driftSeeds) {
      const u = time * 1.1 + ph * 9;
      drift.place(((x + u + 24) % 48) - 24, y + Math.sin(u * 0.7 + ph) * 0.4, z + Math.sin(u * 0.31 + ph) * 1.5, { yaw: u * 1.3, pitch: u * 0.9 + ph, roll: ph });
    }
    drift.done();
  }
  animate(0);

  return {
    cols, rows, width: W, height: H, start, bossSpot, gates, rounds, air,
    pushOut, blocksShot, lineClear, isFree, updateFlow, flowDir, animate,
    // Half-sizes of the walkable area, for clamping and for the bot.
    halfX: W / 2 - CELL, halfZ: H / 2 - CELL,
  };
}
