// GLSL shared by the pixel-art shaders (from the game Rootbound): hashing/noise, an ordered (Bayer) dither and palette-ramp lookups.
// Every shader runs at art resolution (one fragment = one art pixel) and outputs palette colours exactly.
import * as THREE from 'three';
import { rampTextureData, RAMP_ROW, RAMP_LEN, RAMP_W } from './palette.js';

let rampTex = null;
export function rampTexture() {
  if (rampTex) return rampTex;
  const { data, width, height } = rampTextureData();
  rampTex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  rampTex.magFilter = rampTex.minFilter = THREE.NearestFilter;
  rampTex.colorSpace = THREE.NoColorSpace;
  rampTex.needsUpdate = true;
  return rampTex;
}

// #define lines for every ramp: R_<NAME> row index and L_<NAME> length
export const RAMP_DEFINES = Object.entries(RAMP_ROW)
  .map(([k, i]) => `#define R_${k.toUpperCase()} ${i}.0\n#define L_${k.toUpperCase()} ${RAMP_LEN[i]}.0`)
  .join('\n');

export const PX_GLSL = /* glsl */ `
uniform sampler2D tRamp;
${RAMP_DEFINES}
#define RAMP_ROWS ${Object.keys(RAMP_ROW).length}.0
#define RAMP_W ${RAMP_W}.0

// hash12 / hash22: Dave Hoskins, "Hash without Sine" (MIT)
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s;
}
vec3 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(n + g + 3.7); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// 4x4 ordered dither threshold in (0, 1) for an integer pixel coordinate
float bayer4(vec2 px) {
  vec2 p = mod(floor(px), 4.0);
  int i = int(p.x) + int(p.y) * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}
// colour of ramp row at entry index i (clamped)
vec3 rampAt(float row, float len, float i) {
  i = clamp(floor(i), 0.0, len - 1.0);
  return texture2D(tRamp, vec2((i + 0.5) / RAMP_W, (row + 0.5) / RAMP_ROWS)).rgb;
}
// ramp by continuous value t (0..1) with ordered dithering between neighbouring entries
vec3 rampDither(float row, float len, float t, vec2 px) {
  float x = clamp(t, 0.0, 1.0) * (len - 1.0);
  float f = fract(x);
  float i = floor(x) + step(bayer4(px), f);
  return rampAt(row, len, i);
}
// ramp by continuous value without dithering (hard bands)
vec3 rampBand(float row, float len, float t) {
  return rampAt(row, len, floor(clamp(t, 0.0, 0.9999) * len));
}
`;
