// A body for a ghost contact: points in body space (x forward, snout at 0 and tail at -length; y up; z to the side),
// a long fish- or whale-like shape made of rings, with fins. Seeded, so the same seed gives the same body.
// The game drew its own creature here; this is a generic stand-in with the same layout and point count (~300).

/** small seeded random (mulberry32) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} [o]
 * @param {number} [o.length] body length (m), default 40
 * @param {number} [o.girth] the thickest radius (m), default length * 0.09
 * @param {number} [o.rings] rings along the body, default 34
 * @param {number} [o.seed]
 * @returns {Float32Array} xyz triples
 */
export function bodySketch({ length = 40, girth = length * 0.09, rings = 34, seed = 0x9a057 } = {}) {
  const rnd = mulberry32(seed);
  const out = [];
  const j = () => (rnd() - 0.5) * 0.35;
  const add = (x, y, z) => out.push(x - length / 2 + j(), y + j(), z + j());
  // the profile: blunt head (u = 1), thickest a third of the way back, thin tail stalk (u = 0)
  const radius = (u) => girth * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.7) * 1.02)), 0.8) + 0.25;
  for (let i = 0; i < rings; i++) {
    const u = 0.015 + 0.975 * Math.pow(i / (rings - 1), 0.85);
    const ry = radius(u), rz = ry * 0.8;
    const n = ry > 1.2 ? 10 : 6;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 0.37;
      add((u - 0.5) * length, Math.cos(a) * ry, Math.sin(a) * rz);
    }
  }
  // a dorsal ridge over the shoulders
  for (let i = 0; i < 11; i++) {
    const u = 0.18 + (i / 10) * 0.48;
    const env = Math.sin(((u - 0.16) / 0.52) * Math.PI);
    add((u - 0.5) * length - 0.6, radius(u) + 0.4 + env * 1.4, 0);
  }
  // pectoral fins, swept out and down
  for (const side of [1, -1]) {
    const r = radius(0.6);
    for (let i = 0; i < 6; i++) {
      const k = i / 5;
      add(0.1 * length - k * 8 * (length / 40), -r * 0.45 - k * 3.4 * (length / 40), side * (r * 0.6 + k * 4.6 * (length / 40)));
    }
  }
  // the tail fluke, a fan at the very back
  const sc = length / 40;
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 1.6;
    for (const k of [0.5, 1]) out.push(-length - Math.cos(a) * 2.2 * k * sc + j(), Math.sin(a) * 3 * k * sc + j(), j());
  }
  return new Float32Array(out);
}
