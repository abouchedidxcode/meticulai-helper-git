// GLSL shared by everything that draws the field: where a point is on the maps, the ground under it, the wind,
// the light. Every material includes COMMON and binds the same uniform objects (shared.js), so one change to the
// wind or the sun moves the whole picture.

export const COMMON = /* glsl */ `
precision highp float;
precision highp sampler2D;

uniform float uTime;
uniform vec4 uWind;          // direction x, z (unit), speed m/s, gust 0..1
uniform vec2 uWindScroll;    // how far the gust field has travelled, metres
uniform vec2 uExtentMin;     // corner of the ground the field knows (height, growth)
uniform float uExtentInv;    // 1 / its side
uniform float uHeightRes;    // texels across tHeight
uniform vec2 uStateMin;      // corner of the part that reacts and remembers
uniform float uStateInv;     // 1 / its side
uniform sampler2D tHeight;   // R32F, metres
uniform sampler2D tMap;      // dry, growth, wet, flowers
uniform sampler2D tState;    // bend x, bend z (128 = none), cut height in metres (255 = uncut), spare
uniform sampler2D tFire;     // heat, char, smoulder, ash
uniform sampler2D tGlow;     // where fire is (2 m cells, spread out), its light, spare, spare
uniform sampler2D tNoise;    // smooth, tiling: four different fields
uniform sampler2D tNoiseHi;  // the same fields at 16 bits, for reading stretched wide (wind, clouds)
uniform sampler2D tWhite;    // white noise, tiling, nearest

uniform vec3 uSunDir;        // towards the sun
uniform vec3 uSunColor;
uniform vec3 uSkyColor;      // light from above
uniform vec3 uBounceColor;   // light from below
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;   // the haze towards the sun
uniform float uFogDensity;
uniform vec3 uFireColor;     // the colour fire throws on things, times its flicker
uniform vec3 uCamPos;
uniform vec4 uPushers[6];    // things standing in the grass: centre xyz, radius (0 for none)
uniform float uCloudShade;   // how dark a cloud's shadow is, 0 for none
uniform vec4 uLamp;          // a flame carried through the field: where it is, how bright (0 for none)

// The carried flame's light at p, in the same measure as tGlow's.
float lampAt(vec3 p) {
  vec3 d = p - uLamp.xyz;
  return uLamp.w / (1.0 + dot(d, d) * 0.9);
}

const float TAU = 6.28318531;

vec4 hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

// Four random numbers for a cell of the world, the same every frame and on every machine.
vec4 cellRand(vec2 cell, float salt) {
  uvec3 a = pcg3d(uvec3(ivec3(int(cell.x) + 65536, int(cell.y) + 65536, int(salt))));
  uvec3 b = pcg3d(a + 7u);
  return vec4(vec3(a >> 8u), float(b.x >> 8u)) / 16777216.0;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 extentUv(vec2 xz) { return (xz - uExtentMin) * uExtentInv; }
vec2 stateUv(vec2 xz) { return (xz - uStateMin) * uStateInv; }

// The ground's height, read the same way the CPU reads it (field.heightAt): bilinear between texel centres.
float groundAt(vec2 xz) {
  vec2 p = extentUv(xz) * uHeightRes - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  ivec2 lo = ivec2(0);
  ivec2 hi = ivec2(int(uHeightRes) - 1);
  ivec2 a = clamp(ivec2(i), lo, hi);
  ivec2 b = clamp(ivec2(i) + 1, lo, hi);
  float h00 = texelFetch(tHeight, a, 0).r;
  float h10 = texelFetch(tHeight, ivec2(b.x, a.y), 0).r;
  float h01 = texelFetch(tHeight, ivec2(a.x, b.y), 0).r;
  float h11 = texelFetch(tHeight, b, 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// 0 in a lull to 1 in a gust: two fields riding the wind, the broad one faster.
float gustAt(vec2 xz) {
  vec2 a = (xz - uWindScroll) / 61.0;
  vec2 b = (xz - uWindScroll * 0.62) / 17.0;
  float g = texture(tNoiseHi, a).r * 0.68 + texture(tNoiseHi, b + 0.37).g * 0.32;
  return smoothstep(0.26, 0.78, g);
}

// 1 in the open, less under a cloud. The clouds drift with the wind, slowly.
float cloudAt(vec2 xz) {
  vec2 p = (xz - uWindScroll * 0.35) / 420.0;
  float c = texture(tNoiseHi, p).b * 0.7 + texture(tNoiseHi, p * 2.7 + 0.19).a * 0.3;
  return 1.0 - uCloudShade * smoothstep(0.50, 0.68, c);
}

// Distance haze, warmer towards the sun.
vec3 applyFog(vec3 c, vec3 world) {
  vec3 d = world - uCamPos;
  float dist = length(d);
  float f = 1.0 - exp(-dist * uFogDensity * (1.0 + dist * 0.0003));
  float toSun = pow(max(dot(d / max(dist, 1e-3), uSunDir), 0.0), 6.0);
  return mix(c, mix(uFogColor, uFogSunColor, toSun), clamp(f, 0.0, 1.0));
}

// What grass is, as colour: green where it's lush, straw where it's dry. s is 0 at the root and 1 at the tip.
vec3 grassColor(float dry, float s) {
  vec3 green = mix(vec3(0.020, 0.042, 0.011), vec3(0.118, 0.190, 0.038), s);
  vec3 straw = mix(vec3(0.095, 0.076, 0.034), vec3(0.390, 0.325, 0.170), s);
  return mix(green, straw, dry);
}
`;

// The light on a thin leaf. N faces the viewer; light from behind it comes through, yellower.
export const LEAF_LIGHT = /* glsl */ `
// up: 0 at the ground to 1 at the top of the sward. shade: cloudAt there. glow: tGlow's light there.
vec3 leafLight(vec3 albedo, vec3 N, vec3 V, float up, float gloss, float shade, float glow) {
  float ndl = dot(N, uSunDir);
  // low sun reaches the tips and little else: the blades in front stand in the way
  float reach = pow(clamp(up, 0.0, 1.0), mix(3.0, 0.55, clamp(uSunDir.y * 2.2, 0.0, 1.0)));
  float sun = shade * mix(0.05, 1.0, reach);
  vec3 through = albedo * vec3(1.0, 1.16, 0.36) + vec3(0.012, 0.02, 0.0);
  vec3 c = albedo * uSunColor * max(ndl, 0.0) * sun;
  c += through * uSunColor * max(-ndl, 0.0) * 0.72 * sun;
  vec3 H = normalize(uSunDir + V);
  c += uSunColor * pow(abs(dot(N, H)), 42.0) * gloss * sun;
  float ao = mix(0.22, 1.0, clamp(up, 0.0, 1.0));
  c += albedo * mix(uBounceColor, uSkyColor, N.y * 0.5 + 0.5) * ao;
  c += albedo * uFireColor * glow * (0.35 + 0.65 * up);
  return c;
}
`;

export const FIRE_RAMP = /* glsl */ `
// dark red, red, orange, yellow, white-hot, in linear light (from Patch's fire block)
vec3 fireRamp(float T) {
  vec3 c = mix(vec3(0.05, 0.002, 0.0), vec3(0.42, 0.028, 0.002), smoothstep(0.0, 0.25, T));
  c = mix(c, vec3(1.1, 0.13, 0.008), smoothstep(0.25, 0.45, T));
  c = mix(c, vec3(1.6, 0.34, 0.018), smoothstep(0.45, 0.65, T));
  c = mix(c, vec3(2.25, 0.9, 0.07), smoothstep(0.65, 0.85, T));
  c = mix(c, vec3(5.0, 3.6, 1.6), smoothstep(0.85, 1.1, T));
  return c;
}
`;
