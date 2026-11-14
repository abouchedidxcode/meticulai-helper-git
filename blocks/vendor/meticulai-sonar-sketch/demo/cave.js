// A small procedural cave for the demo: a chamber with a few winding tunnels, a ledge and lumpy walls.
// density(x, y, z) is positive in rock and negative in the open (about the distance to the nearest wall).

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy), uz);
}

function segDist(px, py, pz, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz)));
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}

// tunnels as polylines of [x, y, z, radius]
const TUNNELS = [
  // the long gallery: wide, gently winding, with a flat floor (below)
  [[0, 0, 0, 6], [2, -0.5, -14, 6.5], [6, -1, -28, 6], [3, -1.5, -42, 6.5], [-4, -2, -56, 7]],
  [[0, 0, 0, 4], [16, 2, 4, 3.6], [28, 1, -4, 4], [36, -2, -16, 4.5]],
  [[0, 0, 0, 3.5], [-14, 4, 6, 3.2], [-24, 8, 0, 3.6]],
  // a shaft dropping out of the chamber floor
  [[-5, -4, 4, 2.8], [-6, -14, 6, 3], [-4, -24, 3, 3.4]],
];
// rock pillars standing in the chamber and the gallery: [x, z, radius]
const PILLARS = [[-4, -2, 1.3], [5, 3, 1.0], [-1, -20, 1.4], [5, -34, 1.2]];

export function caveDensity(x, y, z) {
  // the chamber: a flattened dome
  let open = Math.hypot(x / 1.05, (y + 1) / 0.62, z / 1.1) - 11;
  for (const tun of TUNNELS) {
    for (let i = 0; i < tun.length - 1; i++) {
      const a = tun[i], b = tun[i + 1];
      const d = segDist(x, y, z, a, b);
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / (abx * abx + aby * aby + abz * abz)));
      open = Math.min(open, d - (a[3] + (b[3] - a[3]) * t));
    }
  }
  // a flat sandy floor everywhere but the shaft
  const shaft = Math.hypot(x + 5, z - 4) - 3;
  open = Math.max(open, Math.min(-(y + 4.5 + z * 0.02), shaft));
  for (const p of PILLARS) open = Math.max(open, -(Math.hypot(x - p[0], z - p[1]) - p[2] - 0.15 * Math.sin(y * 1.3)));
  // lumpy rock: two octaves of noise on the walls
  const n = vnoise(x * 0.18, y * 0.18, z * 0.18) * 2.4 + vnoise(x * 0.55, y * 0.55, z * 0.55) * 0.7 - 1.55;
  return open + n;
}

/** Things to find, marked in amber by a ping that reaches them. */
export const CAVE_TARGETS = [
  { pos: { x: 4, y: -3.4, z: -24 } },
  { pos: { x: 24, y: 0, z: 0 } },
  { pos: { x: -18, y: 4, z: 4 } },
];
