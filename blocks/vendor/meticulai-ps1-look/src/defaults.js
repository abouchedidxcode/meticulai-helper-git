// Every number of the PS1 look, exactly as Don't Blink shipped it. No three.js import: safe to test in Node.

/**
 * @typedef {object} PS1Options
 * @property {number} width              Low-res render target width in pixels (320).
 * @property {number} height             Low-res render target height in pixels (240).
 * @property {boolean} letterbox         true: fixed width/height aspect (4:3) with black bars. false: the target
 *                                       keeps `height` rows and widens to the screen's aspect.
 * @property {number} vertexSnap         Vertex snapping grid in low-res pixels (lower = finer grid, less jitter).
 * @property {number} affineStrength     0 = perspective-correct textures, 1 = full affine (PS1) warping.
 * @property {number} colorLevels        Colour levels per channel after quantisation.
 * @property {number} ditherStrength     Ordered (4x4 Bayer) dither strength, in quantisation steps.
 * @property {number} grain              Film grain amplitude.
 * @property {number} vignetteBase       Resting vignette darkness (0..1).
 * @property {number} vignettePulse      Extra vignette at the moment the eyes open.
 * @property {number} vignettePulseMs    How long that pulse takes to fade.
 * @property {number} fadeInMs           Fade from black after the eyes open.
 * @property {number} lidOpenMs          Eyelids opening from a slit on every reveal.
 * @property {number} punchVignette      Extra vignette for punch(1).
 * @property {number} punchDecaySec      How fast the punch fades.
 * @property {number} afterimageStrength Eyes closed: the brightest parts of the last frame linger (0 = pure black).
 * @property {number} afterimageFadeMs   How long the afterimage takes to fade.
 * @property {number} pixelRatioCap      Device pixel ratio cap for a renderer the pipeline creates itself.
 * @property {{ saturation: number, tint: number[], contrast: number }} grade
 *   Horror grade: mix toward grey (1 = untouched colour), multiply by tint, S-curve amount (0 = none).
 * @property {{ swim: number, split: number, grain: number, edge: number }} dread
 *   How far dread (setDread 0..1) swims rows (low-res px), splits colour (px), boosts grain, darkens edges.
 * @property {{ shakePx: number, flashColor: number[], ghostColor: number[] }} fx
 *   Shake reach in low-res px at shake 1, flash colour, afterimage tint.
 */

/** @type {PS1Options} */
export const PS1_DEFAULTS = Object.freeze({
  width: 320,
  height: 240,
  letterbox: true,
  vertexSnap: 1.0,
  affineStrength: 0.85,
  colorLevels: 20,
  ditherStrength: 1.0,
  grain: 0.05,
  vignetteBase: 0.35,
  vignettePulse: 0.65,
  vignettePulseMs: 450,
  fadeInMs: 150,
  lidOpenMs: 190,
  punchVignette: 0.5,
  punchDecaySec: 0.7,
  afterimageStrength: 0.35,
  afterimageFadeMs: 1400,
  pixelRatioCap: 1,
  grade: Object.freeze({ saturation: 0.55, tint: Object.freeze([0.94, 1.0, 0.8]), contrast: 0.35 }),
  dread: Object.freeze({ swim: 1.4, split: 2.5, grain: 2.5, edge: 0.25 }),
  fx: Object.freeze({ shakePx: 10, flashColor: Object.freeze([1.0, 0.92, 0.86]), ghostColor: Object.freeze([1.0, 0.55, 0.4]) }),
});

/** A grade that leaves colours alone (use instead of the horror grade). */
export const NEUTRAL_GRADE = Object.freeze({ saturation: 1, tint: Object.freeze([1, 1, 1]), contrast: 0 });

/** Don't Blink's air: black background, dense black FogExp2 and a barely-there ambient light. */
export const ATMOSPHERE_DEFAULTS = Object.freeze({
  background: 0x000000,
  fogColor: 0x020203,
  fogDensity: 0.16,
  ambientColor: 0x30303a,
  ambientIntensity: 0.035,
});

/** Game-side numbers Don't Blink used with the look (not used by the pipeline itself). */
export const GAME_NOTES = Object.freeze({
  /** Narrow the camera FOV by this many degrees on a reveal punch, easing back. */
  punchFovDeg: 6,
  /** Dread starts inside this distance (m) from the monster and peaks at the catch radius. */
  dreadRange: 6,
  /** Hand-held flashlight (SpotLight on the camera). */
  flashlight: Object.freeze({ color: 0xffe2b0, intensity: 26, distance: 16, angleDeg: 26, penumbra: 0.55, decay: 1.6, flickerDepth: 0.08 }),
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Defaults merged with your overrides (one level deep for grade / dread / fx). Unknown keys throw, so a typo
 * never silently does nothing.
 * @param {Partial<PS1Options>} [overrides]
 * @param {object} [base]
 * @returns {PS1Options}
 */
export function resolveOptions(overrides = {}, base = PS1_DEFAULTS) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(base[k]) ? { ...base[k] } : base[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in base)) throw new Error(`ps1-look: unknown option "${k}"`);
    if (v === undefined) continue;
    if (isObj(base[k])) {
      if (!isObj(v)) throw new Error(`ps1-look: option "${k}" must be an object`);
      for (const [kk, vv] of Object.entries(v)) {
        if (!(kk in base[k])) throw new Error(`ps1-look: unknown option "${k}.${kk}"`);
        if (vv !== undefined) out[k][kk] = vv;
      }
    } else out[k] = v;
  }
  return out;
}
