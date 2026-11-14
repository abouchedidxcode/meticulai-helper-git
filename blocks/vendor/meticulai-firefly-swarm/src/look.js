/**
 * The shared "look" of the swarm: one uniforms object read by every shader in this block (time, the dusk palette,
 * depth haze, the camera, and up to MAX_LIGHTS fake point lights), plus the GLSL helpers that use it.
 *
 * The fake local lights are how the glow reaches the world without bloom: the fireflies, the jar and a glowing fist
 * are written into `uLightPos` / `uLightCol` each frame (see `writeLights`), and any of your own shaders that include
 * `GLSL_COMMON` can call `localLight(p, n, wrap)` to be warmed by them (the demo's ground and grass do).
 */
import * as THREE from 'three';
import { COLORS } from './flies.js';

/** How many point lights the shaders sum. Fireflies nearest the camera win the slots. */
export const MAX_LIGHTS = 20;

const C = (/** @type {string} */ h) => new THREE.Color(h);

/** Dusk palette keys (linear colours) at dusk = 0, 0.5, 1. Change these to restyle the evening. */
export const PALETTE = {
  zenith: [C('#41557e'), C('#232c52'), C('#070b1d')],
  mid: [C('#b3808a'), C('#5b4c78'), C('#141a37')],
  horizon: [C('#f2a463'), C('#cf6f52'), C('#2b2d4d')],
  sun: [C('#ffd08a'), C('#ff9a5c'), C('#4a3a58')],
  haze: [C('#c99a86'), C('#6f5a76'), C('#1a1d36')],
  ambient: [C('#6b5f6e'), C('#3a3550'), C('#181b33')],
  ground: [C('#2c2a1c'), C('#1a1a1a'), C('#07090d')],
};

/** @param {THREE.Color[]} a @param {number} d @param {THREE.Color} out */
function key(a, d, out) {
  return d < 0.5 ? out.copy(a[0]).lerp(a[1], d / 0.5) : out.copy(a[1]).lerp(a[2], (d - 0.5) / 0.5);
}

/** Makes a fresh uniforms object. Pass the same one to every part of the block. */
export function createLook() {
  const U = {
    uTime: { value: 0 },
    uDusk: { value: 0 },
    uZenith: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() },
    uAmbient: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.28, -0.03, -1).normalize() },
    uFogDensity: { value: 0.0075 },
    uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -100, 0)) },
    uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, 0, 0)) },
    uCamPos: { value: new THREE.Vector3() },
  };
  setDusk(U, 0);
  return U;
}
/** @typedef {ReturnType<typeof createLook>} Look */

/** Recomputes the palette for a dusk value (0 amber .. 1 deep blue night). @param {Look} U @param {number} d */
export function setDusk(U, d) {
  U.uDusk.value = d;
  key(PALETTE.zenith, d, U.uZenith.value);
  key(PALETTE.mid, d, U.uMid.value);
  key(PALETTE.horizon, d, U.uHorizon.value);
  key(PALETTE.sun, d, U.uSunCol.value);
  key(PALETTE.haze, d, U.uHaze.value);
  key(PALETTE.ambient, d, U.uAmbient.value);
  key(PALETTE.ground, d, U.uGround.value);
  // the sun sinks: its glow drops below the horizon as dusk deepens
  U.uSunDir.value.set(0.28, -0.02 - d * 0.16, -1).normalize();
}

/** GLSL: the uniforms above plus hash/noise, `localLight` and `applyHaze`. Put it at the top of a fragment shader. */
export const GLSL_COMMON = /* glsl */ `
  uniform float uTime, uDusk, uFogDensity;
  uniform vec3 uZenith, uMid, uHorizon, uSunCol, uHaze, uAmbient, uGround, uSunDir, uCamPos;
  uniform vec3 uLightPos[${MAX_LIGHTS}];
  uniform vec3 uLightCol[${MAX_LIGHTS}];

  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }

  /** Warm light from fireflies / jar / fist reaching a point; n is a normal; wrap 0..1 (1 = ignore the normal). */
  vec3 localLight(vec3 p, vec3 n, float wrap) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec3 d = uLightPos[i] - p;
      float d2 = dot(d, d);
      float ndl = wrap > 0.99 ? 1.0 : clamp((dot(n, d * inversesqrt(d2 + 1e-4)) + wrap) / (1.0 + wrap), 0.0, 1.0);
      // soft inverse-square with a small core, faded to zero by ~1.6 units
      float att = 1.0 / (1.0 + d2 * 9.0) * clamp(1.0 - d2 / 2.6, 0.0, 1.0);
      sum += uLightCol[i] * att * ndl;
    }
    return sum;
  }

  /** Depth haze toward the horizon colour (denser low down: mist settles in the meadow). */
  vec3 applyHaze(vec3 col, vec3 wpos) {
    float dist = length(wpos - uCamPos);
    float h = clamp(1.0 - wpos.y / 14.0, 0.0, 1.0);
    float f = 1.0 - exp(-dist * uFogDensity * (0.55 + 0.75 * h));
    vec3 v = normalize(wpos - uCamPos);
    float sunward = pow(max(dot(normalize(vec3(v.x, 0.0, v.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 6.0);
    vec3 hazeCol = mix(uHaze, uHorizon, 0.45 * sunward * (1.0 - uDusk * 0.6));
    return mix(col, hazeCol, clamp(f, 0.0, 1.0));
  }
`;

/**
 * Fills the light slots: each fist's glow first, then the jar, then the free fireflies nearest / brightest first.
 * Unused slots are switched off.
 * @param {Look} U
 * @param {{ flies: import('./flies.js').Fly[], camera: THREE.Camera, jar?: { center: THREE.Vector3, glow: number, pulse: number } | null,
 *   fists?: { pos: THREE.Vector3, glow: number }[] }} o
 */
export function writeLights(U, { flies, camera, jar = null, fists = [] }) {
  const pos = U.uLightPos.value, col = U.uLightCol.value;
  let n = 0;
  for (const f of fists) {
    if (n >= MAX_LIGHTS) break;
    if (f.glow > 0.02) { pos[n].copy(f.pos); col[n].set(1.0, 0.62, 0.3).multiplyScalar(f.glow * 0.9); n++; }
  }
  if (jar && n < MAX_LIGHTS) { pos[n].copy(jar.center); col[n].set(1.0, 0.66, 0.32).multiplyScalar(jar.glow * 2.4 + jar.pulse * 1.2); n++; }
  const cam = camera.getWorldPosition(new THREE.Vector3());
  const ranked = flies.filter((f) => f.state !== 'caught' && f.bright > 0.02)
    .map((f) => ({ f, s: f.bright / (1 + f.pos.distanceTo(cam) * 0.25) }))
    .sort((a, b) => b.s - a.s);
  for (const { f } of ranked) {
    if (n >= MAX_LIGHTS) break;
    const c = COLORS[f.kind];
    pos[n].copy(f.pos); col[n].set(c.r, c.g, c.b).multiplyScalar(f.bright * (f.kind === 'gold' ? 1.1 : 0.8));
    n++;
  }
  for (; n < MAX_LIGHTS; n++) { pos[n].set(0, -100, 0); col[n].set(0, 0, 0); }
}
