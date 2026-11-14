// Tiny procedural PS1-era textures (32 x 32 RGBA), painted pixel by pixel from a fixed seed so they look the
// same on every load. No three.js, no canvas: paintTexels() returns raw pixels (testable in Node).
// textures.js turns them into nearest-filtered three.js textures.

/** Small fast seeded random (mulberry32). Returns a function giving 0..1. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TEXEL_KINDS = ['bricks', 'planks', 'tiles', 'grass', 'cloth', 'skin', 'noise', 'checker'];

/**
 * Paint one texture. Pixels are a grey-scale pattern with a slight colour; tint it with the material colour.
 * @param {string} kind one of TEXEL_KINDS
 * @param {{ size?: number, seed?: number }} [opts]
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }} RGBA, row 0 at the top
 */
export function paintTexels(kind, { size = 32, seed = 7 } = {}) {
  if (!TEXEL_KINDS.includes(kind)) throw new Error(`ps1-look: unknown texture kind "${kind}"`);
  const n = size;
  const rnd = seeded(seed + TEXEL_KINDS.indexOf(kind) * 101);
  const data = new Uint8ClampedArray(n * n * 4);
  const put = (x, y, v, warm = 0) => {
    const i = ((y % n) * n + (x % n)) * 4;
    data[i] = v * (1 + warm);
    data[i + 1] = v;
    data[i + 2] = v * (1 - warm);
    data[i + 3] = 255;
  };
  const jitter = (amp) => (rnd() - 0.5) * amp;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 200;
      if (kind === 'bricks') {
        const row = Math.floor(y / (n / 8));
        const off = row % 2 ? n / 8 : 0;
        const mortar = y % (n / 8) === 0 || (x + off) % (n / 4) === 0;
        v = mortar ? 120 : 205 + jitter(40) - (row % 3) * 8;
      } else if (kind === 'planks') {
        const plank = Math.floor(x / (n / 4));
        const seam = x % (n / 4) === 0 || (y + plank * 11) % n === 0;
        v = seam ? 110 : 190 + Math.sin((y + plank * 7) * 0.9 + plank) * 14 + jitter(22);
      } else if (kind === 'tiles') {
        const grout = x % (n / 2) === 0 || y % (n / 2) === 0;
        v = grout ? 140 : 225 + jitter(18) - ((Math.floor(x / (n / 2)) + Math.floor(y / (n / 2))) % 2) * 25;
      } else if (kind === 'grass') {
        v = 180 + jitter(70) + (rnd() < 0.08 ? 50 : 0);
      } else if (kind === 'cloth') {
        v = (x + y) % 4 < 2 ? 205 + jitter(16) : 175 + jitter(16);
        if (y % (n / 4) === 0) v -= 40;
      } else if (kind === 'skin') {
        v = 225 + jitter(20);
      } else if (kind === 'noise') {
        v = 190 + jitter(60);
      } else if (kind === 'checker') {
        v = (Math.floor(x / (n / 4)) + Math.floor(y / (n / 4))) % 2 ? 235 : 150;
      }
      put(x, y, v, kind === 'planks' ? 0.06 : kind === 'bricks' ? 0.04 : 0);
    }
  }
  return { width: n, height: n, data };
}
