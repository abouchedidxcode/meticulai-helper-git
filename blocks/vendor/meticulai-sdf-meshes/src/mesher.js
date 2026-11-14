// Surface nets: turns a signed distance field into a triangle mesh.
//
// How it works, in short: sample the field on a grid; every grid cell whose corners change sign
// gets ONE vertex (the average of the edge crossings); every grid edge that changes sign becomes
// a quad joining the four cells around it. Then each vertex is pushed onto the exact surface
// (Newton steps along the gradient) and given a normal from the field's gradient, so a modest
// grid already looks smooth. An optional "cavity" ambient occlusion is baked per vertex.
//
// Output is plain typed arrays (positions, normals, ao, indices), so it works in Node and in a
// Web Worker. geometry.js turns it into a three.js BufferGeometry.
//
// No imports except sdf.js / parts.js. From Dig Site (narrow band, cavity AO), Orbitball
// (exact-surface projection, splatted parts grid) and Abyssal (chunk tiling) by Meticulai.

import { clamp } from './sdf.js';
import { evalParts, fillPartsGrid, partsBounds } from './parts.js';

/** @typedef {{ positions: Float32Array, normals: Float32Array, ao: Float32Array, indices: Uint32Array }} MeshData */

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7], // x edges
  [0, 2], [1, 3], [4, 6], [5, 7], // y edges
  [0, 4], [1, 5], [2, 6], [3, 7], // z edges
];

/**
 * The surface-nets core over a sampled grid.
 * @param {Float32Array} data  samples, index i + nx * (j + ny * k)
 * @param {number} nx @param {number} ny @param {number} nz
 * @param {[number, number, number]} origin  world position of sample (0, 0, 0)
 * @param {number} step  grid spacing
 * @param {{ lo?: number, hi?: number, solidPositive?: boolean }} [opts]
 *   lo/hi: only grid edges whose base sample lies in [lo, hi) on every axis emit faces, so chunks
 *   padded by one sample tile without gaps or doubles. solidPositive: the field is a density
 *   (positive = solid) instead of an SDF (negative = solid).
 * @returns {{ positions: Float32Array, indices: Uint32Array }} faces wound outward (counter-clockwise seen from outside)
 */
export function surfaceNets(data, nx, ny, nz, origin, step, { lo = 0, hi = 1e9, solidPositive = false } = {}) {
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const nxy = nx * ny;
  const inside = solidPositive ? (v) => v > 0 : (v) => v < 0;
  const vIndex = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const corner = new Float32Array(8);
  for (let z = 0; z < cz; z++)
    for (let y = 0; y < cy; y++)
      for (let x = 0; x < cx; x++) {
        const i = x + nx * y + nxy * z;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const o = CORNERS[c];
          const v = data[i + o[0] + o[1] * nx + o[2] * nxy];
          corner[c] = v;
          if (inside(v)) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0], b = EDGES[e][1];
          const va = corner[a], vb = corner[b];
          if (inside(va) === inside(vb)) continue;
          const t = va / (va - vb);
          const A = CORNERS[a], B = CORNERS[b];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        vIndex[x + cx * (y + cy * z)] = pos.length / 3;
        pos.push(origin[0] + (x + sx / n) * step, origin[1] + (y + sy / n) * step, origin[2] + (z + sz / n) * step);
      }

  const idx = [];
  const cell = (x, y, z) => vIndex[x + cx * (y + cy * z)];
  const quad = (a, b, c, d, in0) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (in0) idx.push(a, b, c, a, c, d);
    else idx.push(a, c, b, a, d, c);
  };
  for (let z = Math.max(0, lo); z < Math.min(cz, hi); z++)
    for (let y = Math.max(0, lo); y < Math.min(cy, hi); y++)
      for (let x = Math.max(0, lo); x < Math.min(cx, hi); x++) {
        const i = x + nx * y + nxy * z;
        const in0 = inside(data[i]);
        // the edge along +x from sample (x, y, z) is shared by cells (x, y-1..y, z-1..z)
        if (y > 0 && z > 0 && in0 !== inside(data[i + 1])) quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), in0);
        if (x > 0 && z > 0 && in0 !== inside(data[i + nx])) quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), in0);
        if (x > 0 && y > 0 && in0 !== inside(data[i + nxy])) quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), in0);
      }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/**
 * Push vertices onto the exact surface of f, take normals from its gradient and bake cavity AO.
 * Mutates `positions`; returns { normals, ao }.
 * @param {Float32Array} positions
 * @param {(x: number, y: number, z: number) => number} f  the SDF (negative inside)
 * @param {number} cell  grid spacing
 * @param {{ project?: number, ao?: boolean, aoDist?: number | null }} [opts]
 */
export function projectAndShade(positions, f, cell, { project = 2, ao = true, aoDist = null } = {}) {
  const nv = positions.length / 3;
  const N = new Float32Array(nv * 3);
  const AO = new Float32Array(nv);
  const e = cell * 0.25;
  const aoD = aoDist ?? cell * 3;
  for (let v = 0; v < nv; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let it = 0; it <= project; it++) {
      const d = f(x, y, z);
      gx = f(x + e, y, z) - f(x - e, y, z);
      gy = f(x, y + e, z) - f(x, y - e, z);
      gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      if (it < project) {
        const s = clamp(d, -cell, cell); // never move a vertex more than one cell per step
        x -= gx * s; y -= gy * s; z -= gz * s;
      }
    }
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    N[v * 3] = gx; N[v * 3 + 1] = gy; N[v * 3 + 2] = gz;
    if (ao) {
      // classic SDF occlusion: how much the field "closes in" along the normal
      let occ = 0, w = 1;
      for (let s = 1; s <= 5; s++) {
        const dd = (aoD * s) / 5;
        const sd = f(x + gx * dd, y + gy * dd, z + gz * dd);
        occ += w * Math.max(0, dd - sd);
        w *= 0.6;
      }
      AO[v] = clamp(1 - (occ / aoD) * 1.6, 0, 1);
    } else AO[v] = 1;
  }
  return { normals: N, ao: AO };
}

/**
 * Mesh any SDF function over the box [min, max] with cell size `cell`.
 * @param {(x: number, y: number, z: number) => number} f
 * @param {[number, number, number]} min @param {[number, number, number]} max
 * @param {number} cell  grid spacing (world units). Halving it costs ~8x the time.
 * @param {{ ao?: boolean, aoDist?: number | null, project?: number, narrowBand?: boolean }} [opts]
 *   narrowBand (default true): sample a 4x coarser grid first and only evaluate fine points near the
 *   surface. Big speed-up; only safe when f is close to a true distance (thin features far from any
 *   coarse sample can be missed: turn it off if a thin part disappears).
 * @returns {MeshData}
 */
export function meshSDF(f, min, max, cell, { ao = true, aoDist = null, project = 2, narrowBand = true } = {}) {
  const h = cell;
  const nx = Math.ceil((max[0] - min[0]) / h) + 2;
  const ny = Math.ceil((max[1] - min[1]) / h) + 2;
  const nz = Math.ceil((max[2] - min[2]) / h) + 2;
  const ox = min[0] - h, oy = min[1] - h, oz = min[2] - h;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  if (narrowBand) {
    const C = 4;
    const cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
    const coarse = new Float32Array(cx * cy * cz);
    for (let k = 0; k < cz; k++)
      for (let j = 0; j < cy; j++)
        for (let i = 0; i < cx; i++) coarse[i + cx * (j + cy * k)] = f(ox + i * C * h, oy + j * C * h, oz + k * C * h);
    const band = C * h * 1.2;
    for (let k = 0; k < nz; k++) {
      const ck = Math.round(k / C);
      for (let j = 0; j < ny; j++) {
        const cj = Math.round(j / C);
        for (let i = 0; i < nx; i++) {
          const c = coarse[Math.round(i / C) + cx * (cj + cy * ck)];
          field[idx(i, j, k)] = Math.abs(c) > band ? c : f(ox + i * h, oy + j * h, oz + k * h);
        }
      }
    }
  } else {
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) field[idx(i, j, k)] = f(ox + i * h, oy + j * h, oz + k * h);
  }
  const { positions, indices } = surfaceNets(field, nx, ny, nz, [ox, oy, oz], h);
  const { normals, ao: AO } = projectAndShade(positions, f, h, { project, ao, aoDist });
  return { positions, normals, ao: AO, indices };
}

/**
 * Mesh a parts list (see parts.js). Fills the grid part by part inside each part's box, so it is
 * fast for many small parts (a whole character).
 * @param {import('./parts.js').Part[]} parts
 * @param {{ bmin?: number[], bmax?: number[], cell?: number, project?: number, ao?: boolean, aoDist?: number | null }} [opts]
 *   bmin/bmax default to the parts' boxes padded by their blend radius and two cells.
 * @returns {MeshData & { field: (x: number, y: number, z: number) => number }}
 */
export function meshParts(parts, { bmin, bmax, cell = 0.01, project = 2, ao = false, aoDist = null } = {}) {
  if (!bmin || !bmax) ({ bmin, bmax } = partsBounds(parts, cell * 2));
  const nx = Math.ceil((bmax[0] - bmin[0]) / cell) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / cell) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / cell) + 1;
  const g = fillPartsGrid(parts, bmin, cell, nx, ny, nz, cell * 4);
  const field = (x, y, z) => evalParts(parts, x, y, z);
  const { positions, indices } = surfaceNets(g, nx, ny, nz, bmin, cell);
  const { normals, ao: AO } = projectAndShade(positions, field, cell, { project, ao, aoDist });
  return { positions, normals, ao: AO, indices, field };
}
