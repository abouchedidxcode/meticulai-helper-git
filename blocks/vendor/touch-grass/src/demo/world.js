// The demo's meadow: rolling ground that climbs to hills at the horizon, dry and green patches, a dirt track
// across it, a few bare scrapes and damp hollows. Plain functions of (x, z): the field reads them once.

function hash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** 0 to 1, mostly near 0.5. */
export function fbm(x, z, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, z, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    x = x * 2.03 + 11.7;
    z = z * 2.03 - 5.3;
  }
  return sum / norm;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x / 240 + 3.1, z / 240 - 1.7, 3, 1) - 0.5) * 16;
  h += (fbm(x / 58 + 9.3, z / 58 + 4.1, 3, 5) - 0.5) * 2.6;
  // the land climbs away from the meadow, into hills
  const far = smooth(260, 1500, r);
  h += far * far * (40 + 230 * fbm(x / 900 + 1.3, z / 900 + 7.7, 3, 9));
  return h;
}

/** How far (x, z) is from the middle of the track, metres. */
export function trackDistance(x, z) {
  const tx = 9 + 17 * Math.sin(z / 52) + 5 * Math.sin(z / 21 + 1.3);
  const slope = (17 / 52) * Math.cos(z / 52) + (5 / 21) * Math.cos(z / 21 + 1.3);
  return Math.abs(x - tx) / Math.sqrt(1 + slope * slope);
}

export function paint(x, z) {
  const dry = smooth(0.46, 0.72, fbm(x / 64 + 2.2, z / 64 + 8.1, 3, 21));
  const wet = smooth(0.67, 0.74, fbm(x / 47 + 5.5, z / 47 + 9.9, 2, 33));
  let growth = 1;
  const track = trackDistance(x, z);
  // a dirt track, worn bare: wide enough that a grass fire stops at it
  growth = Math.min(growth, smooth(0.7, 1.5, track + (fbm(x / 3.1, z / 3.1, 2, 61) - 0.5) * 0.5));
  // scrapes of bare earth
  growth = Math.min(growth, 1 - smooth(0.8, 0.86, fbm(x / 19 + 40, z / 19 - 12, 2, 44)));
  const flowers = smooth(0.4, 0.7, fbm(x / 38 - 6, z / 38 + 3, 2, 55)) * (1 - 0.6 * wet);
  return { dry: dry * (1 - wet), growth, wet, flowers };
}
