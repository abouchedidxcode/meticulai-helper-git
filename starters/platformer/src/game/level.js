// Turns a level's text (levels.js) into something the game can ask questions of:
//   level.solid(cx, cy)   is this tile a wall or floor?        level.oneWay(cx, cy)   a jump-through platform?
//   level.hazard(cx, cy)  does this tile hurt?                 level.tile(cx, cy)     the tile id (TILES)
// plus the lists of things placed in it (start, coins, checkpoints, goal, enemies, movers).
//
// Coordinates: x grows to the right, y grows UP, one tile = 1 unit. Tile (cx, cy) covers x..x+1, y..y+1,
// and the bottom row of the text is cy = 0. Left and right of the level count as solid (invisible walls);
// below it is empty (a pit); above it is open sky.
// No drawing here (and no three.js): tools and the bot can read a level without a browser.

import { LEGEND, TILES } from './levels.js';

const BY_ID = Object.values(TILES).reduce((a, t) => ((a[t.id] = t), a), []);

function rowsOf(text) {
  const rows = text.replace(/\t/g, '    ').split('\n').map((r) => r.replace(/\s+$/, ''));
  while (rows.length && rows[0] === '') rows.shift(); // blank lines above only add sky: use `rows` for that
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  return rows;
}

export function parseLevel(def) {
  // Join the sections left to right, lined up at the bottom.
  const parts = def.sections.map(rowsOf).map((rows) => ({ rows, w: Math.max(1, ...rows.map((r) => r.length)) }));
  const w = parts.reduce((n, p) => n + p.w, 0);
  const h = Math.max(def.rows ?? 0, ...parts.map((p) => p.rows.length + 3));
  const cells = new Uint8Array(w * h);
  const chars = new Array(w * h).fill(' ');
  const level = { id: def.id, name: def.name ?? def.id, next: def.next ?? null, w, h, cells, start: { x: 2.5, y: 4 }, coins: [], checkpoints: [], goal: null, enemies: [], movers: [], unknown: [] };

  let x0 = 0;
  for (const part of parts) {
    part.rows.forEach((row, r) => {
      const cy = part.rows.length - 1 - r;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === ' ' || ch === '.') continue;
        const cx = x0 + i;
        chars[cy * w + cx] = ch;
        const what = LEGEND[ch];
        if (!what) level.unknown.push(`"${ch}" at column ${cx}, row ${cy}`);
        else if (what.tile) cells[cy * w + cx] = TILES[what.tile].id;
        else if (what.thing === 'start') level.start = { x: cx + 0.5, y: cy };
        else if (what.thing === 'coin') level.coins.push({ x: cx + 0.5, y: cy + 0.5 });
        else if (what.thing === 'checkpoint') level.checkpoints.push({ x: cx + 0.5, y: cy });
        else if (what.thing === 'goal') level.goal = { x: cx + 0.5, y: cy };
        else if (what.thing === 'enemy') level.enemies.push({ x: cx + 0.5, y: cy, type: what.type });
        else if (what.thing === 'mover') level.movers.push({ cx, cy });
      }
    });
    x0 += part.w;
  }
  if (level.unknown.length) console.warn(`Level "${level.id}": characters not in the legend (treated as air): ${level.unknown.slice(0, 5).join('; ')}`);

  // A mover travels along the run of track characters touching it: ~ sideways, : up and down.
  const charAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= w || cy >= h ? ' ' : chars[cy * w + cx]);
  level.movers = level.movers.map(({ cx, cy }) => {
    let ex = cx;
    let ey = cy;
    for (const [dx, dy, track] of [[1, 0, '~'], [-1, 0, '~'], [0, 1, ':'], [0, -1, ':']]) {
      let n = 0;
      while (charAt(cx + dx * (n + 1), cy + dy * (n + 1)) === track) n++;
      if (n) { ex = cx + dx * n; ey = cy + dy * n; break; }
    }
    // x = centre, y = the TOP surface (what you stand on).
    return { x0: cx + 0.5, y0: cy + 1, x1: ex + 0.5, y1: ey + 1 };
  });
  level.checkpoints.sort((a, b) => a.x - b.x);

  level.tile = (cx, cy) => (cx < 0 || cx >= w || cy < 0 || cy >= h ? 0 : cells[cy * w + cx]);
  level.solid = (cx, cy) => (cx < 0 || cx >= w ? true : cy < 0 || cy >= h ? false : !!BY_ID[cells[cy * w + cx]].solid);
  level.oneWay = (cx, cy) => !!BY_ID[level.tile(cx, cy)].oneWay;
  level.hazard = (cx, cy) => !!BY_ID[level.tile(cx, cy)].hazard;
  return level;
}
