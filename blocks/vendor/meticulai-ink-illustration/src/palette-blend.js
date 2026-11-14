// Whole colour sets that blend smoothly into each other, as Pop Quiz re-inks its world for each chapter
// (sky, fog, lights, materials, ink, hatch level and sun direction all cross-fade together).
// Pure JavaScript, no three.js import, so it can be tested with `node --test`.
//
//   const pal = createPaletteBlend(EXAMPLE_PALETTES);
//   pal.set(1, 4);          // blend to palette 1 over 4 seconds (smoothstep eased)
//   pal.update(dt);         // every frame; returns true while blending
//   material.color.fromArray(pal.live.ground);   // colours are LINEAR [r, g, b] (three's working space)
//   ink.set({ hatchLevel: pal.live.hatch });
//
// Palette values: '#rrggbb' strings (sRGB, like a colour picker) become linear [r, g, b] arrays;
// numbers blend as numbers; arrays of numbers blend per component, and keys ending in "Dir" are
// re-normalised (a sun direction keeps unit length). Strings that are not colours are copied as-is.

/** @typedef {Record<string, string | number | number[]>} Palette */
/** @typedef {Record<string, number | number[] | string>} LivePalette */

/** sRGB 0..1 -> linear (the standard sRGB transfer curve, same as three.js). */
export function srgbToLinear(c) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

/** linear 0..1 -> sRGB 0..1. */
export function linearToSrgb(c) {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}

const HEX = /^#([0-9a-f]{6})$/i;

/** '#rrggbb' -> linear [r, g, b]. */
export function hexToLinear(hex) {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
}

/** linear [r, g, b] -> '#rrggbb'. */
export function linearToHex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255).toString(16).padStart(2, '0')).join('');
}

/** The easing Pop Quiz uses for every blend: smoothstep, t*t*(3-2t). */
export function ease(t) {
  return t * t * (3 - 2 * t);
}

function normalize(v) {
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}

/** A palette as live values: colours to linear arrays, directions normalised, everything copied. */
export function toLive(p) {
  /** @type {LivePalette} */
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && HEX.test(v)) out[k] = hexToLinear(v);
    else if (Array.isArray(v)) out[k] = k.endsWith('Dir') ? normalize(v) : v.slice();
    else out[k] = v;
  }
  return out;
}

/** Blend two live palettes at e (0..1), writing into `out` (arrays reused). */
export function mixLive(a, b, e, out = {}) {
  for (const k of Object.keys(b)) {
    const x = a[k], y = b[k];
    if (Array.isArray(y) && Array.isArray(x)) {
      const arr = Array.isArray(out[k]) ? out[k] : (out[k] = new Array(y.length));
      for (let i = 0; i < y.length; i++) arr[i] = x[i] + (y[i] - x[i]) * e;
      if (k.endsWith('Dir')) {
        const n = normalize(arr);
        for (let i = 0; i < n.length; i++) arr[i] = n[i];
      }
    } else if (typeof y === 'number' && typeof x === 'number') {
      out[k] = x + (y - x) * e;
    } else {
      out[k] = e < 1 ? (x ?? y) : y; // strings and missing keys switch at the end
    }
  }
  return out;
}

/**
 * @param {Palette[]} palettes  every palette should have the same keys
 * @param {{ start?: number }} [opts]
 */
export function createPaletteBlend(palettes, { start = 0 } = {}) {
  if (!palettes.length) throw new Error('createPaletteBlend needs at least one palette');
  const targets = palettes.map(toLive);
  const clampIndex = (i) => Math.max(0, Math.min(targets.length - 1, Math.round(i)));
  let index = clampIndex(start);
  const live = toLive(palettes[index]);
  let from = toLive(palettes[index]);
  let to = targets[index];
  let t = 1;
  let duration = 1;

  return {
    /** The values to read every frame (same object and arrays for the whole run). */
    live,
    get index() { return index; },
    /** 0..1 progress of the current blend (1 = settled). */
    get progress() { return t; },
    count: targets.length,
    /**
     * Start blending to palette i over `seconds`. Starts from wherever the live values are now,
     * so changing your mind mid-blend never jumps.
     */
    set(i, seconds = 4) {
      index = clampIndex(i);
      from = {};
      for (const [k, v] of Object.entries(live)) from[k] = Array.isArray(v) ? v.slice() : v;
      to = targets[index];
      duration = Math.max(0.001, seconds);
      t = 0;
    },
    /** Advance the blend. Returns true while it is still moving. */
    update(dt) {
      if (t >= 1) return false;
      t = Math.min(1, t + dt / duration);
      mixLive(from, to, ease(t), live);
      return true;
    },
  };
}

/**
 * Three example palettes for the test scene (role names match it). Ink, hatch levels and most light colours are
 * Pop Quiz's own day, dusk and night inks; the material colours are new. Hex values are sRGB.
 * @type {Palette[]}
 */
export const EXAMPLE_PALETTES = [
  {
    name: 'day',
    sky: '#97d2e4', fog: '#e6ead6', ink: '#1d2340', paper: '#fff4e0', hatch: 0.14,
    ground: '#c9c17a', stone: '#f6e8cc', prop: '#e2865a', accent: '#f2b33d', figure: '#2f7bd9', skin: '#f3c9a4',
    far: '#a9c7b0', cream: '#fbefd9', blue: '#2ec4b0',
    hemiSky: '#d6eeff', hemiGround: '#c48f5e', sunLight: '#fffaf0', sunDir: [-0.55, 0.75, 0.4],
  },
  {
    name: 'dusk',
    sky: '#b04f8a', fog: '#e3887c', ink: '#1c1030', paper: '#ffe6cf', hatch: 0.14,
    ground: '#e69a72', stone: '#ecb89c', prop: '#9e4a6a', accent: '#ffcc4d', figure: '#ff8a3d', skin: '#ffc4b2',
    far: '#a85a86', cream: '#ffd9c2', blue: '#5c4aa0',
    hemiSky: '#ffa0ae', hemiGround: '#5c2e5c', sunLight: '#ffb27a', sunDir: [-0.8, 0.25, -0.3],
  },
  {
    name: 'night',
    sky: '#192356', fog: '#2a3472', ink: '#05061a', paper: '#e8ecff', hatch: 0.07,
    ground: '#5a66ac', stone: '#8c96d4', prop: '#34337a', accent: '#7cf0ff', figure: '#9a72ff', skin: '#8f9ee0',
    far: '#3b4a8e', cream: '#aab4ea', blue: '#2a3c8a',
    hemiSky: '#6274c8', hemiGround: '#1d1c46', sunLight: '#b2c0ff', sunDir: [-0.3, 0.62, 0.55],
  },
];
