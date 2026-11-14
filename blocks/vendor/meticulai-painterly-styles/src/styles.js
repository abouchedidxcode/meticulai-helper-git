// The three styles as plain data, plus the small bits of logic around them (which style to start in, remembering the
// player's choice, merging a style's light/sky/grade overrides over your scene's own "look").
// No three.js import here, so it runs (and is tested) in plain Node.
//
// Numbers are exactly as tuned in Kite Race. Its world is a city about 4 km across, lit by a low sun with these units:
// light intensities are three.js intensities, fogDensity is per metre, colours are hex.

/** @typedef {'none'|'miniature'|'gouache'|'clean'} StyleName */

/**
 * A scene's light, sky, haze and grade. Your game can use any subset; `applyLook` (index.js) knows these fields.
 * @typedef {object} Look
 * @property {string} name                 'golden' | 'morning' | 'night' (style overrides are keyed by this)
 * @property {number} sunElev              degrees above the horizon (the sun in the sky)
 * @property {number} sunAz                degrees, 0 = toward -z, + = to the right
 * @property {number} sunColor
 * @property {number} sunIntensity
 * @property {number} [keyElev]            the light that shades the world, if it differs from the visible sun
 * @property {number} [keyAz]
 * @property {number} hemiSky
 * @property {number} hemiGround
 * @property {number} hemiIntensity
 * @property {number} fog                  haze colour
 * @property {number} fogSun               haze colour toward the sun
 * @property {number} fogDensity           per metre
 * @property {number} zenith               sky colour overhead
 * @property {number} horizon              sky colour at the horizon
 * @property {number} sunGlow
 * @property {number} sunDisk              sun disc brightness (0 = none)
 * @property {number} cloudLit
 * @property {number} cloudShade
 * @property {number} cloudCover           0..1
 * @property {number} exposure
 * @property {number} night                0 day .. 1 night
 * @property {{shadow:number[], high:number[], sat:number, contrast:number, curve?:number}} grade
 *   shadow/highlight tints (rgb multipliers), saturation, S-curve contrast 0..1,
 *   tone curve: 0 ACES, 1 hue-keeping filmic curve (opens the shade), 2 Khronos Neutral
 * @property {number} [bounce]             (Kite Race only) warm bounce share
 * @property {number} [cloudShadow]        (Kite Race only)
 * @property {number} [dust]               (Kite Race only)
 */

/**
 * What one style sets.
 * @typedef {object} StyleDef
 * @property {number} id          the shader's uStyle value: 1 miniature, 2 gouache, 3 clean
 * @property {Partial<Record<'all'|'golden'|'morning'|'night', Partial<Look>>>} look   overrides of your look
 * @property {boolean} noAO       the style inks its own contact lines: switch your ambient occlusion pass off
 * @property {number} bloom       bloom strength multiplier
 * @property {number} vignette    the grade pass's vignette (0..1)
 */

/**
 * "miniature": a Mughal / Rajput miniature painting. Flat light from everywhere (a painter's even daylight: the sun is
 * weak, the sky fill strong, so shade is a gentle tonal step, not a dark hole), a pale painted sky, little haze, a flat
 * high-key grade with the jewel colours kept. Palette and ink: style-glsl.js (stPalette) and style-post.js.
 * @type {StyleDef}
 */
export const MINIATURE = {
  id: 1,
  noAO: true,
  bloom: 0.4,
  vignette: 0.12,
  look: {
    all: { bounce: 0.05, cloudShadow: 0, dust: 0.0003 },
    golden: {
      sunIntensity: 3.0, hemiIntensity: 3.4, hemiSky: 0xd8d2c0, hemiGround: 0xc8a880,
      fogDensity: 0.0009, fog: 0xe6d6b4, fogSun: 0xf4d49a,
      zenith: 0x4a7cc4, horizon: 0xf0e2c0, sunGlow: 0xf8d898, sunDisk: 6, cloudCover: 0.6,
      exposure: 1.18,
      grade: { shadow: [1.0, 0.98, 0.96], high: [1.03, 1.0, 0.95], sat: 1.05, contrast: 0.12 },
    },
    morning: {
      sunIntensity: 2.8, hemiIntensity: 3.0, hemiSky: 0xd4dce4, hemiGround: 0xd0b48c,
      fogDensity: 0.0005, zenith: 0x7aa4d4, horizon: 0xf0ead8, sunDisk: 6, exposure: 1.12,
      grade: { shadow: [0.99, 0.99, 1.0], high: [1.02, 1.0, 0.96], sat: 1.05, contrast: 0.12 },
    },
    night: {
      sunIntensity: 1.5, hemiIntensity: 2.3, hemiSky: 0x5c70b8, exposure: 1.6,
      grade: { shadow: [0.95, 0.96, 1.06], high: [1.05, 0.99, 0.92], sat: 1.1, contrast: 0.14, curve: 1 },
    },
  },
};

/**
 * "gouache" (shown to players as "Painterly"): a picture-book background painting. Warm sun, cool blue shade (a bluer,
 * stronger sky fill), thicker atmosphere so the distance melts into the sky in layers, soft painted clouds; the brush
 * (Kuwahara) filter and paper grain are in style-post.js.
 * @type {StyleDef}
 */
export const GOUACHE = {
  id: 2,
  noAO: true,
  bloom: 0.8,
  vignette: 0.28,
  look: {
    all: { cloudShadow: 0.25 },
    golden: {
      sunColor: 0xffc070, sunIntensity: 4.8, hemiSky: 0x9cb4e4, hemiGround: 0xc09070, hemiIntensity: 3.6,
      fogDensity: 0.0026, fog: 0xdcccb8, fogSun: 0xffc884,
      zenith: 0x3c74c8, horizon: 0xf8d8a8, sunGlow: 0xffd088, cloudLit: 0xfff4e0, cloudCover: 0.55, exposure: 1.16, bounce: 0.16,
      grade: { shadow: [0.9, 0.98, 1.14], high: [1.08, 1.0, 0.86], sat: 1.16, contrast: 0.14 },
    },
    morning: {
      zenith: 0x3a78d0, cloudCover: 0.55, hemiIntensity: 2.6, fogDensity: 0.0011, exposure: 1.06,
      grade: { shadow: [0.92, 0.98, 1.1], high: [1.05, 1.0, 0.93], sat: 1.08, contrast: 0.2 },
    },
    night: {
      // a painted night: deep blue, the walls still read as shapes in a cool moonlit fill, the lamps warm
      hemiIntensity: 3.6, hemiSky: 0x5a70b8, hemiGround: 0x5a4a58, exposure: 1.75,
      grade: { shadow: [0.9, 0.96, 1.16], high: [1.08, 1.0, 0.86], sat: 1.12, contrast: 0.12, curve: 1 },
    },
  },
};

/**
 * "clean": calm stylised low-poly. Untextured surfaces with a gradient by height, a two-step toon light, soft shade,
 * layered pastel fog by distance, a big smooth gradient sky with few clouds, very soft outlines. Low contrast, pastel.
 * @type {StyleDef}
 */
export const CLEAN = {
  id: 3,
  noAO: false,
  bloom: 0.6,
  vignette: 0.15,
  look: {
    all: { cloudShadow: 0, dust: 0.0004 },
    golden: {
      sunColor: 0xffd0a0, sunIntensity: 3.6, hemiSky: 0xbcc4e4, hemiGround: 0xf0b890, hemiIntensity: 3.2,
      fogDensity: 0.0017, fog: 0xf0d0c0, fogSun: 0xffd6a8,
      zenith: 0x7898d8, horizon: 0xffdcc0, sunGlow: 0xffe0b0, sunDisk: 10, cloudCover: 0.3,
      exposure: 1.14, bounce: 0.15,
      grade: { shadow: [0.98, 0.97, 1.04], high: [1.03, 1.0, 0.96], sat: 1.08, contrast: 0.1 },
    },
    morning: {
      sunIntensity: 3.2, hemiIntensity: 2.8, fog: 0xe0e4ec, cloudCover: 0.3, exposure: 1.08,
      grade: { shadow: [0.97, 0.98, 1.04], high: [1.02, 1.0, 0.97], sat: 0.98, contrast: 0.08 },
    },
    night: {
      hemiIntensity: 2.6, exposure: 1.6,
      grade: { shadow: [0.95, 0.96, 1.06], high: [1.04, 0.99, 0.94], sat: 1.05, contrast: 0.1, curve: 1 },
    },
  },
};

/** @type {Record<Exclude<StyleName,'none'>, StyleDef>} */
export const STYLES = { miniature: MINIATURE, gouache: GOUACHE, clean: CLEAN };
/** @type {StyleName[]} */
export const STYLE_NAMES = ['none', 'miniature', 'gouache', 'clean'];
/** the names a settings menu shows */
export const STYLE_LABELS = { gouache: 'Painterly', miniature: 'Miniature', clean: 'Clean', none: 'Classic' };
/** the order a settings menu lists them in */
/** @type {StyleName[]} */
export const STYLE_CHOICES = ['gouache', 'miniature', 'clean', 'none'];
/** the style with nothing chosen (Kite Race's maker picked the painterly gouache) */
/** @type {StyleName} */
export const STYLE_DEFAULT = 'gouache';

/**
 * Kite Race's own base looks (before any style), as an example of what a style's overrides sit on. Your game will have
 * its own; these are a fine start for a sunny outdoor scene.
 * @type {Record<'golden'|'morning'|'night', Look>}
 */
export const BASE_LOOKS = {
  morning: {
    name: 'morning',
    sunElev: 21, sunAz: -38, sunColor: 0xffe6c4, sunIntensity: 3.9,
    hemiSky: 0xa4c2ec, hemiGround: 0xd4b088, hemiIntensity: 2.0,
    fog: 0xdcdcd6, fogSun: 0xffe8c2, fogDensity: 0.00066,
    zenith: 0x3f7ccc, horizon: 0xeae4d6, sunGlow: 0xfff0d2, sunDisk: 30,
    cloudLit: 0xfffaf2, cloudShade: 0x9aaac4, cloudCover: 0.46,
    exposure: 1.05, night: 0,
    grade: { shadow: [0.94, 0.98, 1.07], high: [1.04, 1.0, 0.94], sat: 1.1, contrast: 0.3 },
  },
  golden: {
    name: 'golden',
    sunElev: 14, sunAz: -55, sunColor: 0xffc684, sunIntensity: 4.8, keyElev: 20, keyAz: -115,
    hemiSky: 0x9cb2d2, hemiGround: 0xa48668, hemiIntensity: 2.8,
    fog: 0xdcc6a6, fogSun: 0xffc678, fogDensity: 0.0015,
    zenith: 0x4f80c0, horizon: 0xf6d6a4, sunGlow: 0xffd486, sunDisk: 24,
    cloudLit: 0xfff0d6, cloudShade: 0xa8a6b4, cloudCover: 0.5,
    exposure: 1.12, night: 0,
    grade: { shadow: [0.94, 0.98, 1.07], high: [1.06, 0.99, 0.9], sat: 1.06, contrast: 0.28 },
  },
  night: {
    name: 'night',
    sunElev: 38, sunAz: -60, sunColor: 0xa6baee, sunIntensity: 1.5,
    hemiSky: 0x5670b0, hemiGround: 0x4a3e3e, hemiIntensity: 2.2,
    fog: 0x1e2648, fogSun: 0x2a3460, fogDensity: 0.0011,
    zenith: 0x050a1c, horizon: 0x1c2644, sunGlow: 0x2c3654, sunDisk: 0,
    cloudLit: 0x2c2f44, cloudShade: 0x0c0d16, cloudCover: 0.22,
    exposure: 1.55, night: 1,
    grade: { shadow: [0.92, 0.95, 1.1], high: [1.06, 0.98, 0.9], sat: 1.12, contrast: 0.2, curve: 1 },
  },
};

/**
 * Read a style name the forgiving way: 'painterly' = gouache, 'classic' / 'current' = none. Unknown -> null.
 * @param {string|null|undefined} v
 * @returns {StyleName|null}
 */
export function parseStyle(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  const n = s === 'current' || s === 'classic' ? 'none' : s === 'painterly' ? 'gouache' : s;
  return /** @type {StyleName[]} */ (STYLE_NAMES).includes(/** @type {StyleName} */ (n)) ? /** @type {StyleName} */ (n) : null;
}

/**
 * The style a page starts in: `?style=` in the URL, else the player's saved choice, else the default.
 * @param {{ search?: string, storage?: {getItem(k:string):string|null}|null, storageKey?: string, fallback?: StyleName }} [o]
 * @returns {StyleName}
 */
export function startStyle({ search = '', storage = null, storageKey = 'game.style', fallback = STYLE_DEFAULT } = {}) {
  const fromUrl = parseStyle(new URLSearchParams(search).get('style'));
  if (fromUrl) return fromUrl;
  let saved = null;
  try { saved = storage ? storage.getItem(storageKey) : null; } catch { saved = null; }
  return parseStyle(saved) ?? fallback;
}

/**
 * Remember the player's choice (no-op without storage; never throws).
 * @param {StyleName} name
 * @param {{ storage?: {setItem(k:string,v:string):void}|null, storageKey?: string }} [o]
 */
export function saveStyle(name, { storage = null, storageKey = 'game.style' } = {}) {
  try { storage?.setItem(storageKey, name); } catch { /* private mode / no storage */ }
}

/**
 * Your look with the style's overrides on top (a copy; `base` is untouched): the style's `all` table, then the table
 * for this look's name. `grade` merges field by field.
 * @param {Look} base
 * @param {StyleName} style
 * @returns {Look}
 */
export function styleLook(base, style) {
  const d = style === 'none' ? null : STYLES[style];
  if (!d) return base;
  const all = d.look.all ?? {};
  const own = d.look[/** @type {'golden'} */ (base.name)] ?? {};
  return { ...base, ...all, ...own, grade: { ...base.grade, ...(all.grade ?? {}), ...(own.grade ?? {}) } };
}

/** The uStyle value for a name (0 = off). @param {StyleName} name */
export const styleId = (name) => (name === 'none' ? 0 : STYLES[name]?.id ?? 0);

/** Next style in the settings order (for a "cycle look" key). @param {StyleName} name @returns {StyleName} */
export function nextStyle(name) {
  const i = STYLE_CHOICES.indexOf(name);
  return STYLE_CHOICES[(i + 1) % STYLE_CHOICES.length];
}

/**
 * Sun direction (unit vector, y up) from elevation and azimuth in degrees; azimuth 0 looks toward `ahead` (default -z),
 * + turns to the right. Same maths as Kite Race's wind-relative frame.
 * @param {number} elevDeg @param {number} azDeg @param {[number,number,number]} [ahead]
 * @returns {[number, number, number]}
 */
export function sunDirection(elevDeg, azDeg, ahead = [0, 0, -1]) {
  const el = (elevDeg * Math.PI) / 180, az = (azDeg * Math.PI) / 180;
  const right = [-ahead[2], 0, ahead[0]];
  const c = Math.cos(el);
  const d = [
    (ahead[0] * Math.cos(az) + right[0] * Math.sin(az)) * c,
    Math.sin(el),
    (ahead[2] * Math.cos(az) + right[2] * Math.sin(az)) * c,
  ];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / len, d[1] / len, d[2] / len];
}

/** Surface kinds for patchStyleMaterial (the shader's ST_KIND). */
export const KINDS = { flat: 0, hero: 1, figure: 2, textured: 3, ground: 4 };
