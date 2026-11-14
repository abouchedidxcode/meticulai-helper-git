// Cube chunks of a density field (e.g. CaveField), meshed with surface nets so neighbouring
// chunks meet with no gaps and no doubled faces. Pure functions: run them in a Web Worker
// (chunk.worker.js, streamer.js) or directly (Node, tests, small worlds).
//
// Abyssal used 24 m chunks at 1 m voxels, about 70 ms per chunk, up to 3 workers.
// No imports except mesher.js. From Abyssal by Meticulai.

import { surfaceNets } from './mesher.js';

export const CHUNK_DEFAULTS = { chunk: 24, voxel: 1 };

/** Chunk coordinates pack into one number so they can key maps and cross to a worker. */
export const chunkKey = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
export function chunkCoords(key) {
  const k = (key % 1024) - 512;
  const r = Math.floor(key / 1024);
  return { i: Math.floor(r / 1024) - 512, j: (r % 1024) - 512, k };
}
export const chunkOf = (v, chunk = CHUNK_DEFAULTS.chunk) => Math.floor(v / chunk);

/** Linear sample of a density grid (NaN outside it). */
export function sampleGrid(g, wx, wy, wz) {
  const fx = (wx - g.ox) / g.step, fy = (wy - g.oy) / g.step, fz = (wz - g.oz) / g.step;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= g.nx - 1 || fy >= g.ny - 1 || fz >= g.nz - 1) return NaN;
  const x0 = fx | 0, y0 = fy | 0, z0 = fz | 0;
  const tx = fx - x0, ty = fy - y0, tz = fz - z0;
  const nx = g.nx, nxy = g.nx * g.ny, d = g.data;
  const i = x0 + nx * y0 + nxy * z0;
  const c00 = d[i] + (d[i + 1] - d[i]) * tx;
  const c10 = d[i + nx] + (d[i + nx + 1] - d[i + nx]) * tx;
  const c01 = d[i + nxy] + (d[i + nxy + 1] - d[i + nxy]) * tx;
  const c11 = d[i + nxy + nx] + (d[i + nxy + nx + 1] - d[i + nxy + nx]) * tx;
  const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
  return c0 + (c1 - c0) * tz;
}

/**
 * Mesh a density grid (positive = solid). Normals come from the grid's gradient (falling back to
 * the field at the edges); ao is a cheap occlusion term: how much solid sits a little way out
 * along the normal (1 = open, 0.1 = deep crack).
 * @param {{ nx: number, ny: number, nz: number, ox: number, oy: number, oz: number, step: number, data: Float32Array }} g
 * @param {(x: number, y: number, z: number) => number} density
 * @param {number} [lo] @param {number} [hi]  sample range that emits faces (chunk tiling)
 * @returns {import('./mesher.js').MeshData}
 */
export function meshDensityGrid(g, density, lo = 0, hi = 1e9) {
  const { positions, indices } = surfaceNets(g.data, g.nx, g.ny, g.nz, [g.ox, g.oy, g.oz], g.step, { lo, hi, solidPositive: true });
  const vcount = positions.length / 3;
  const normals = new Float32Array(vcount * 3);
  const ao = new Float32Array(vcount);
  const e = g.step * 0.75;
  for (let v = 0; v < vcount; v++) {
    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
    let gx = sampleGrid(g, px + e, py, pz) - sampleGrid(g, px - e, py, pz);
    let gy = sampleGrid(g, px, py + e, pz) - sampleGrid(g, px, py - e, pz);
    let gz = sampleGrid(g, px, py, pz + e) - sampleGrid(g, px, py, pz - e);
    if (!(gx === gx && gy === gy && gz === gz)) {
      gx = density(px + e, py, pz) - density(px - e, py, pz);
      gy = density(px, py + e, pz) - density(px, py - e, pz);
      gz = density(px, py, pz + e) - density(px, py, pz - e);
    }
    // the gradient points into rock; the surface normal points out into open space
    const l = Math.hypot(gx, gy, gz) || 1;
    const nX = -gx / l, nY = -gy / l, nZ = -gz / l;
    normals[v * 3] = nX; normals[v * 3 + 1] = nY; normals[v * 3 + 2] = nZ;
    let occ = 0, wsum = 0;
    for (let k = 1; k <= 4; k++) {
      const dist = k * k * 0.9;
      let s = sampleGrid(g, px + nX * dist, py + nY * dist, pz + nZ * dist);
      if (s !== s) s = -dist;
      // in open space s is around -dist; anything higher means nearby rock
      occ += Math.max(0, Math.min(1, (s + dist) / dist)) / k;
      wsum += 1 / k;
    }
    ao[v] = 1 - Math.min(1, occ / wsum) * 0.9;
  }
  return { positions, normals, ao, indices };
}

/**
 * Build one chunk: sample `field.density` into a grid padded by one sample before and two after,
 * mesh it, and keep only the faces this chunk owns. Empty chunks (all rock or all open) return
 * zero-length arrays quickly.
 * @param {{ density: (x: number, y: number, z: number) => number }} field
 * @param {number} key  from chunkKey(i, j, k)
 * @param {{ chunk?: number, voxel?: number }} [opts]
 * @returns {import('./mesher.js').MeshData & { key: number }}
 */
export function buildChunk(field, key, { chunk = CHUNK_DEFAULTS.chunk, voxel = CHUNK_DEFAULTS.voxel } = {}) {
  const { i, j, k } = chunkCoords(key);
  const step = voxel;
  const cells = Math.round(chunk / step);
  const n = cells + 3; // one padding sample before, two after
  const ox = i * chunk - step, oy = j * chunk - step, oz = k * chunk - step;
  const data = new Float32Array(n * n * n);
  let anyRock = false, anyOpen = false;
  for (let z = 0; z < n; z++) {
    const wz = oz + z * step;
    for (let y = 0; y < n; y++) {
      const wy = oy + y * step;
      for (let x = 0; x < n; x++) {
        const d = field.density(ox + x * step, wy, wz);
        data[x + n * (y + n * z)] = d;
        if (d > 0) anyRock = true; else anyOpen = true;
      }
    }
  }
  if (!anyRock || !anyOpen) return { positions: new Float32Array(0), normals: new Float32Array(0), ao: new Float32Array(0), indices: new Uint32Array(0), key };
  const grid = { nx: n, ny: n, nz: n, ox, oy, oz, step, data };
  const mesh = meshDensityGrid(grid, (x, y, z) => field.density(x, y, z), 1, 1 + cells);
  return { ...mesh, key };
}

/**
 * Every chunk that could contain a wall: those touching a tube's padded bounds. Build only these.
 * @param {{ tubes: import('./cave.js').Tube[] }} field
 */
export function liveChunks(field, { chunk = CHUNK_DEFAULTS.chunk, pad = 14 } = {}) {
  const out = new Set();
  for (const t of field.tubes) {
    const r = Math.max(t.ra, t.rb);
    const minX = Math.min(t.ax, t.bx) - r - pad, maxX = Math.max(t.ax, t.bx) + r + pad;
    const minY = Math.min(t.ay, t.by) - r - pad, maxY = Math.max(t.ay, t.by) + r + pad;
    const minZ = Math.min(t.az, t.bz) - r - pad, maxZ = Math.max(t.az, t.bz) + r + pad;
    for (let i = chunkOf(minX, chunk); i <= chunkOf(maxX, chunk); i++)
      for (let j = chunkOf(minY, chunk); j <= chunkOf(maxY, chunk); j++)
        for (let k = chunkOf(minZ, chunk); k <= chunkOf(maxZ, chunk); k++) out.add(chunkKey(i, j, k));
  }
  return out;
}
