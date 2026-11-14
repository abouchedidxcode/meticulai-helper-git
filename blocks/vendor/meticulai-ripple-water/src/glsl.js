// GLSL shared by the water surface and anything under it: hashes, value noise, fbm, the caustic net, and the ripple
// focus (light gathered by the live ripples onto the bed). Plain strings: paste them into your own shaders too.
//
// From the game Koi by Meticulai (meticulai.com). MIT licence. hash12 / hash22 are David Hoskins' "Hash without
// Sine" (MIT, https://www.shadertoy.com/view/4djSRW).

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

/** Needs GLSL_NOISE. */
export const GLSL_CAUSTICS = /* glsl */ `
// animated voronoi edges: the bright net of caustics
float causticLayer(vec2 p, float t) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  float e = sqrt(d2) - sqrt(d1);
  return exp(-e * 9.0);
}
float caustics(vec2 p, float t) {
  vec2 w = vec2(fbm3(p * 0.35 + t * 0.05), fbm3(p * 0.35 - 3.1 - t * 0.04)) * 1.4;
  float a = causticLayer(p * 1.25 + w, t * 0.9);
  float b = causticLayer(p * 1.9 - w * 0.7 + 4.0, t * 1.13 + 2.0);
  return a * 0.62 + b * 0.5 + a * b * 1.1;
}
`;

/** Needs the ripple uniforms (uSim, uSimTexel, uSimRect). */
export const GLSL_SIM = /* glsl */ `
uniform sampler2D uSim;
uniform vec2 uSimTexel;
uniform vec4 uSimRect;
vec2 simUv(vec2 xz) { return (xz - uSimRect.xy) / uSimRect.zw; }
float simH(vec2 xz) { return texture2D(uSim, simUv(xz)).r; }
// Caustics from the live ripples: a curved surface focuses the sun on the bed below it (light ~ 1 / (1 + d * lap h)).
// Crests (negative laplacian) focus, troughs spread. Sampled 1.5 cells wide so the bright lines are smooth. d is the
// depth of the point below the surface. Returns a light multiplier around 1.
float rippleFocus(vec2 xz, float d) {
  vec2 su = simUv(xz);
  vec2 e = uSimTexel * 1.5;
  float c = texture2D(uSim, su).r;
  float lap = texture2D(uSim, su + vec2(e.x, 0.0)).r + texture2D(uSim, su - vec2(e.x, 0.0)).r
            + texture2D(uSim, su + vec2(0.0, e.y)).r + texture2D(uSim, su - vec2(0.0, e.y)).r - 4.0 * c;
  float cw = uSimRect.z * e.x;
  lap /= cw * cw;
  return clamp(1.0 - lap * (0.02 + d * 0.05), 0.25, 3.2);
}
`;
