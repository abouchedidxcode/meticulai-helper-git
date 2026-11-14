// The haze model as plain numbers: default look, sun directions, the packed uniform array, and CPU copies of the
// shader maths (how much air lies between two points, how dark a cloud shadow is). No three.js import, so it can be
// tested with node and used by game logic (e.g. "can the player still see that tower?").
//
// Units: metres, +Y up, +X east, +Z south (north is -Z). If your world unit is not a metre, pass metresPerUnit.

/**
 * @typedef {[number, number, number]} RGB  linear, scene-referred colour (goes through the tone map)
 * @typedef {{
 *   sunColor: RGB, sunIntensity: number, skyLight: RGB, groundLight: RGB, hemiIntensity: number, envIntensity: number,
 *   fogHeight: number, fogDensity0: number, fogUniform: number, fogHeight2: number, fogDensity1: number, fogBanks: number,
 *   horizonAway: RGB, horizonSun: RGB, skyZenith: RGB, skyLavender: RGB, skyRose: RGB,
 *   cloudShadowScale: number, cloudShadowDark: number, maxRadiance: number,
 *   skyGain: number, skySaturation: number, skyTint: RGB, exposure: number,
 * }} HazeLook
 */

/**
 * Hezarfen's dawn look (grade v5), numbers exactly as the game ships them. Only `skyZenith` is new: it is the top of
 * this block's procedural sky (the game used a photographed panorama there).
 * @type {Readonly<HazeLook>}
 */
export const DAWN = Object.freeze({
  // Key and fill: a strong warm key and a weak cool fill, so lit plaster is three to four times its shadow and
  // shadows go slate blue, not mauve.
  sunColor: [1.0, 0.7, 0.47], // direct light, warm peach-gold
  sunIntensity: 8.6,
  skyLight: [0.5, 0.52, 0.68], // hemisphere from above: cool slate blue
  groundLight: [0.5, 0.36, 0.28], // warm bounce from below
  hemiIntensity: 0.74,
  envIntensity: 0.42,
  // Haze: luminous (far land fades lighter than itself) and low (mist lies on water and in valleys, tall things stand
  // clear of it). Its colour is the sky's horizon colour.
  fogHeight: 24, // metres: scale height of the low mist
  fogDensity0: 0.00137, // extinction per metre at sea level (the mist layer)
  fogUniform: 0.000166, // thin haze everywhere
  fogHeight2: 180, // a second, deep layer keeps aerial perspective at altitude
  fogDensity1: 0.00013,
  fogBanks: 0.75, // 0..1: how patchy the low mist is (slow world-space noise)
  // sky
  horizonAway: [0.8, 0.62, 0.6], // away from the sun: pale rose-grey
  horizonSun: [1.32, 1.0, 0.68], // under the sun: gold-peach, brighter than white so the sun side glows
  skyZenith: [0.36, 0.33, 0.46], // (new) top of the procedural sky: dusky lavender-slate
  skyLavender: [0.55, 0.4, 0.45], // panorama only: gaps between clouds away from the sun
  skyRose: [1.0, 0.66, 0.55], // lit cloud away from the sun
  cloudShadowScale: 560, // metres per noise cell: the size of the drifting light and shade patches
  cloudShadowDark: 0.6, // sunlight left under a cloud
  maxRadiance: 4.0, // no surface may be brighter than this before haze (stops one glinting pixel blooming into a blob)
  skyGain: 1.45,
  skySaturation: 1.28,
  skyTint: [1.08, 0.98, 0.94],
  exposure: 1.05,
});

/** Hezarfen's sun: low in the south-east. The disc sits near the horizon but the light falls from higher up (a
 *  deliberate cheat from the reference frames: long shadows, yet roofs and squares are actually lit). */
export const DAWN_SUN = Object.freeze({ azimuthDeg: 132, elevationDeg: 2.6, lightElevationDeg: 21 });

/**
 * Unit vector toward a compass bearing and elevation. Azimuth 0 = north (-Z), 90 = east (+X).
 * @param {number} azimuthDeg @param {number} elevationDeg @returns {[number, number, number]}
 */
export function dirFromAngles(azimuthDeg, elevationDeg) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/** @param {Partial<HazeLook>} [overrides] @returns {HazeLook} a fresh, editable copy of DAWN with overrides */
export function makeLook(overrides = {}) {
  const look = /** @type {any} */ ({});
  for (const k of Object.keys(DAWN)) {
    const v = /** @type {any} */ (DAWN)[k];
    look[k] = Array.isArray(v) ? v.slice() : v;
  }
  for (const [k, v] of Object.entries(overrides)) look[k] = Array.isArray(v) ? v.slice() : v;
  return look;
}

/**
 * Pack the haze numbers into the 16 floats every shader reads (`uniform vec4 hzP[4]`).
 * metresPerUnit rescales distances so the same air works in a world built in other units (or a small diorama:
 * pass 10 to make a 100-unit scene feel like a kilometre).
 * @param {HazeLook} look @param {number} [metresPerUnit] @param {Float32Array} [out]
 */
export function packHaze(look, metresPerUnit = 1, out = new Float32Array(16)) {
  const s = metresPerUnit;
  const a = look.horizonAway;
  const b = look.horizonSun;
  out.set([
    a[0], a[1], a[2], look.fogHeight / s,
    b[0], b[1], b[2], look.fogDensity0 * s,
    look.fogUniform * s, look.fogHeight2 / s, look.fogDensity1 * s, look.fogBanks,
    s / look.cloudShadowScale, look.cloudShadowDark, look.maxRadiance, 0,
  ]);
  return out;
}

// ---- CPU copies of the shader maths (same formulas as the GLSL in haze.js) ----

/** Density of one exponential layer (scale height H) integrated from the eye over d along a ray of slope dirY. */
export function hzLayer(eyeY, dirY, d, H) {
  const ad = (dirY / H) * d;
  const c = Math.min(40, Math.max(-40, ad));
  const k = Math.abs(ad) > 1e-4 ? (1 - Math.exp(-c)) / ad : 1;
  return Math.exp(-Math.max(eyeY, 0) / H) * d * k;
}

/**
 * Optical depth between eye and point p (without the patchy banks), read from a packed array.
 * @param {ArrayLike<number>} P packed haze (packHaze) @param {number[]} eye @param {number[]} p @param {number} [dens] live multiplier (scene.fog.density)
 */
export function opticalDepth(P, eye, p, dens = 1) {
  const vx = p[0] - eye[0], vy = p[1] - eye[1], vz = p[2] - eye[2];
  const d = Math.hypot(vx, vy, vz);
  const dirY = d > 1e-3 ? vy / d : 0;
  return dens * (P[7] * hzLayer(eye[1], dirY, d, P[3]) + P[10] * hzLayer(eye[1], dirY, d, P[9]) + P[8] * d);
}

/** How much of a surface's own colour survives the air between eye and p (1 = clear, 0 = all haze). */
export function transmittance(P, eye, p, dens = 1) {
  return Math.exp(-opticalDepth(P, eye, p, dens));
}

/** Distance along a level line of sight at height y where half the colour is gone (handy for level design). */
export function halfwayDistance(P, y = 0, dens = 1) {
  let lo = 0, hi = 1e7;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (transmittance(P, [0, y, 0], [mid, y, 0], dens) > 0.5) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const fr = (v) => v - Math.floor(v);
function hash(x, y) {
  let px = fr(x * 0.1031);
  let py = fr(y * 0.103);
  const d = px * (py + 33.33) + py * (px + 33.33);
  px += d;
  py += d;
  return fr((px + py) * py);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Sunlight left at a world point under the drifting cloud shadows (cloudShadowDark .. 1), matching the shaders.
 * @param {ArrayLike<number>} P packed haze @param {number[]} lightDir unit vector toward the light @param {number} time seconds
 */
export function cloudShadowAt(P, lightDir, x, y, z, time) {
  const t = time % 20000;
  const px = (x - (lightDir[0] / lightDir[1]) * y) * P[12] + t * -0.014;
  const pz = (z - (lightDir[2] / lightDir[1]) * y) * P[12] + t * 0.011;
  const n = vnoise(px, pz) * 0.62 + vnoise(px * 2.3 + 7.1, pz * 2.3 + 7.1) * 0.28 + vnoise(px * 5.3 + 3.7, pz * 5.3 + 3.7) * 0.1;
  const k = Math.min(1, Math.max(0, (n - 0.36) / 0.24));
  return P[13] + (1 - P[13]) * k * k * (3 - 2 * k);
}
