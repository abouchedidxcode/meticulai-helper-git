// The water surface. Everything reads the simulated height field (ripples.js): the under-water pass is refracted
// through its slopes (with a whisper of dispersion), ripple flanks catch the bright sky and the sun as glints, ring
// crests catch light and troughs hold a little shadow, fine wind ripples drift over it and fade as it calms, and
// Fresnel comes from the simulated surface only. On top: splash foam rings and up to two touch markers (a lit
// meniscus where a finger or cursor touches; a breathing dotted ring where it hovers).
//
// From the game Koi by Meticulai (meticulai.com). MIT licence.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_SIM } from './glsl.js';
import { RECT_SHORE } from './ripples.js';

/** How strongly the simulated slopes shade the surface (glints, sheen, Fresnel). The game raised it from 0.55:
 * rings must read from a metre away. Refraction is scaled down separately so things under water never turn to glass. */
export const NORMAL_K = 0.95;
export const MAX_SPLASHES = 4;
export const MAX_TOUCHES = 2;

const frag = (shoreGlsl) => /* glsl */ `
uniform float uTime, uMist, uSun, uCalm;
uniform vec3 uSunDir, uSunCol, uAmb, uSkyTop, uSkyLow;
uniform vec2 uRes;
uniform vec4 uRect;
uniform sampler2D uUnder, uWind;
uniform vec4 uSplashes[${MAX_SPLASHES}];
uniform vec4 uTips[${MAX_TOUCHES}];
${GLSL_NOISE}
${GLSL_SIM}
${shoreGlsl}
varying vec3 vW;

vec3 skyCol(vec3 r) {
  float h = clamp(r.y, 0.0, 1.0);
  vec3 c = mix(uSkyLow, uSkyTop, smoothstep(0.1, 0.95, h));
  // brighter toward the sun
  float s = max(0.0, dot(normalize(r), uSunDir));
  c += uSunCol * pow(s, 12.0) * 0.12 + uSunCol * pow(s, 2500.0) * 4.0;
  return c;
}

void main() {
  vec3 wp = vW;
  float sdf = shoreSdf(wp.xz);
  if (sdf > 0.04) discard;
  vec2 su = simUv(wp.xz);
  float hL = texture2D(uSim, su - vec2(uSimTexel.x, 0.0)).r, hR = texture2D(uSim, su + vec2(uSimTexel.x, 0.0)).r;
  float hD = texture2D(uSim, su - vec2(0.0, uSimTexel.y)).r, hU = texture2D(uSim, su + vec2(0.0, uSimTexel.y)).r;
  float cell = uSimRect.z * uSimTexel.x;
  // slope of the simulated surface (world units): every effect below reads it
  // (the sim runs at a larger amplitude than it is drawn: robust waves, gentle shading; NORMAL_K tunes the look)
  vec2 g = vec2(hR - hL, hU - hD) / (2.0 * cell) * ${NORMAL_K.toFixed(3)};
  float slope = length(g);
  // wind ripples: fine, drifting; they fade as the water settles and in still, misty air
  float wind = (0.35 + 0.65 * (1.0 - uCalm)) * (0.45 + 0.55 * smoothstep(0.5, 0.1, uMist));
  vec2 q = wp.xz * 2.2 + vec2(uTime * 0.18, uTime * 0.07);
  vec2 q2 = wp.xz * 6.0 - vec2(uTime * 0.31, -uTime * 0.12);
  // the noise gradients come from a tileable texture baked once (createWindTexture): two taps instead of 9 noises
  vec2 wg = (texture2D(uWind, q / 8.0).rg * 0.05 + texture2D(uWind, q2 / 8.0).ba * 0.012) * wind;
  vec3 n = normalize(vec3(-g.x - wg.x, 1.0, -g.y - wg.y));

  vec3 V = normalize(cameraPosition - wp);
  // refraction: what is under the surface, displaced by its slope (more where it is deep), with a whisper of
  // dispersion so steep rings show a faint warm/cool fringe the way real ripples do
  float depth = max(0.0, -sdf);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec2 refr = vec2(n.x, -n.z) * (0.011 + 0.013 * smoothstep(0.0, 1.5, depth));
  vec3 under;
  under.r = texture2D(uUnder, clamp(suv + refr * 0.94, 0.001, 0.999)).r;
  under.g = texture2D(uUnder, clamp(suv + refr, 0.001, 0.999)).g;
  under.b = texture2D(uUnder, clamp(suv + refr * 1.08, 0.001, 0.999)).b;

  vec3 R = reflect(-V, n);
  vec3 sky = skyCol(R);
  // Fresnel from the simulated surface only: the fine wind normals would lift the reflection everywhere and wash the
  // whole pond milky
  vec3 nS = normalize(vec3(-g.x, 1.0, -g.y));
  float ndv = clamp(dot(nS, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // artistic: the sky is only a whisper at a steep view (more washes the water milky), except on the flanks of
  // ripples, which tilt toward the bright sky and catch it: that sheen is what draws every ring
  float reflK = clamp(fres * 1.3 + 0.012 + 0.04 * uCalm + min(0.2, max(0.0, slope - 0.03) * 0.4), 0.0, 0.5);
  vec3 col = mix(under, sky, reflK);

  // glints. The real sun (tight; only steep facets reach it from above) and the bright sky around it: a broad light
  // just off the flat-water reflection toward the sun, so gently tilted ripple flanks sparkle and flat water never does
  vec3 Hh = normalize(uSunDir + V);
  float nh = max(dot(n, Hh), 0.0);
  float spec = pow(nh, 1600.0) * 2.5 + pow(nh, 300.0) * 0.05;
  vec3 Rf = reflect(-V, vec3(0.0, 1.0, 0.0));
  vec3 Lg = normalize(Rf + normalize(vec3(uSunDir.x, 0.0, uSunDir.z)) * 0.3);
  float gl = max(dot(R, Lg), 0.0);
  float sparkle = pow(gl, 500.0) * 1.8 + pow(gl, 60.0) * 0.16;
  float sunUp = (0.35 + 0.65 * uSun) * (1.0 - uMist * 0.6);
  col += uSunCol * (spec + sparkle * smoothstep(0.02, 0.1, slope)) * sunUp;
  // ring crests catch the light and troughs hold a little shadow: this is what makes every ring readable as a ring
  // from across the room (curvature of the simulated surface, not noise)
  float hC = texture2D(uSim, su).r;
  float lapW = (hL + hR + hD + hU - 4.0 * hC) / (cell * cell);
  float crest = smoothstep(0.0, 1.0, -lapW * 0.35), trough = smoothstep(0.0, 1.0, lapW * 0.35);
  vec3 skyLit = mix(uSkyLow, vec3(1.0, 0.95, 0.85), 0.5) * (0.4 + 0.6 * uSunCol);
  col += skyLit * crest * 0.16;
  col *= 1.0 - trough * 0.14;
  // a faint film of pollen and dust in the still corners
  float film = smoothstep(0.55, 0.85, fbm(wp.xz * 0.8 + 2.0)) * 0.06 * (1.0 - smoothstep(0.05, 0.3, slope));
  col = mix(col, vec3(0.75, 0.7, 0.5) * (uAmb + uSunCol * 0.4), film * smoothstep(-0.2, -1.5, sdf));

  // splashes: a broken ring of white water that spreads and fades, aerated foam at the centre
  vec3 foamC = vec3(0.93, 0.94, 0.9) * (uAmb * 0.9 + uSunCol * 0.7);
  for (int i = 0; i < ${MAX_SPLASHES}; i++) {
    vec4 sp = uSplashes[i];
    if (sp.w <= 0.0) continue;
    vec2 dv = wp.xz - sp.xy;
    float d = length(dv);
    float age = sp.z;
    float rr = 0.12 + age * 0.75 * sp.w;
    float ring = exp(-pow((d - rr) / (0.05 + age * 0.07), 2.0));
    float broken = smoothstep(0.3, 0.62, fbm(dv * 7.0 + sp.xy * 3.1 + age * 0.6));
    float core = exp(-d * d / (0.04 + age * 0.06)) * smoothstep(0.7, 0.0, age);
    float foam = (ring * broken * 1.5 + core * (0.5 + 0.7 * broken)) * exp(-age * 1.9) * min(1.0, sp.w);
    col = mix(col, foamC, clamp(foam, 0.0, 0.85));
  }

  // touches. In the water (w < 1.5): a crisp meniscus where the water climbs the finger (lit on the sun side,
  // darker opposite) and a soft warm presence so the touch point is findable at a glance even over dark water.
  // Near but not touching (w >= 1.5): a faint breathing dotted ring and a dot, so the player knows where they would touch.
  for (int i = 0; i < ${MAX_TOUCHES}; i++) {
    vec4 t = uTips[i];
    if (t.z <= 0.001) continue;
    vec2 dv = wp.xz - t.xy;
    float d = length(dv);
    float ang = atan(dv.y, dv.x);
    // the marker keeps a floor of brightness so it reads in a pale dawn as well as a warm late sun
    vec3 warm = vec3(1.0, 0.93, 0.8) * (0.55 + 0.45 * (uAmb * 0.6 + uSunCol * 0.5));
    if (t.w < 1.5) {
      vec2 sxz = normalize(uSunDir.xz);
      float side = 0.55 + 0.45 * dot(normalize(dv + 1e-4), -sxz);
      float men = exp(-pow((d - 0.17) / 0.04, 2.0));
      float inner = 1.0 - smoothstep(0.09, 0.15, d);
      col = mix(col, col * 0.6, inner * t.z * 0.55);
      col += warm * men * (0.35 + 0.65 * side) * t.z * 1.0;
      float hot = exp(-dot(dv - sxz * 0.08, dv - sxz * 0.08) / 0.0016);
      col += uSunCol * hot * t.z * (0.6 + 0.6 * uSun);
      col += warm * exp(-pow((d - 0.34) / 0.03, 2.0)) * t.z * 0.14;
      col += warm * exp(-d * d / 0.3) * t.z * 0.08;
    } else {
      float br = 0.5 + 0.5 * sin(uTime * 2.6);
      float dots = smoothstep(0.3, 0.8, 0.5 + 0.5 * cos(ang * 14.0 + uTime * 0.5));
      float ring = exp(-pow((d - (0.24 + 0.02 * br)) / 0.026, 2.0)) * dots;
      float dotC = exp(-d * d / 0.0016);
      col = mix(col, col * 0.8, exp(-d * d / 0.05) * 0.4 * t.z);
      col += warm * (ring * (0.5 + 0.15 * br) + dotC * 0.55) * t.z;
    }
  }
  // the shoreline: a thin wet meniscus fading into the bank
  float edge = smoothstep(-0.25, 0.04, sdf);
  col = mix(col, col * 0.75 + vec3(0.02, 0.025, 0.02), edge * 0.6);
  float a = 1.0 - smoothstep(-0.02, 0.04, sdf);
  gl_FragColor = vec4(col, a);
  // linear light in; three's tone mapping and output colour space when drawn to the screen
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Tileable noise gradients for the wind ripples, baked once: RG = gradient of a 3-octave value-noise fbm, BA =
 * gradient of one octave, per unit of noise space, one tile = 8 lattice cells (the shader samples q / 8).
 */
export function createWindTexture(N = 256) {
  const hash = (x, y, p) => {
    x = ((x % p) + p) % p; y = ((y % p) + p) % p;
    let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const vn = (x, y, p) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, p), b = hash(ix + 1, iy, p), c = hash(ix, iy + 1, p), d = hash(ix + 1, iy + 1, p);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (x, y) => 0.5 * vn(x, y, 8) + 0.25 * vn(x * 2, y * 2, 16) + 0.125 * vn(x * 4, y * 4, 32);
  const one = (x, y) => vn(x, y, 8);
  const data = new Uint16Array(N * N * 4);
  const s = 8 / N, e = s * 0.5;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * s, y = j * s, k = (j * N + i) * 4;
    data[k] = THREE.DataUtils.toHalfFloat((fbm(x + e, y) - fbm(x - e, y)) / (2 * e));
    data[k + 1] = THREE.DataUtils.toHalfFloat((fbm(x, y + e) - fbm(x, y - e)) / (2 * e));
    data[k + 2] = THREE.DataUtils.toHalfFloat((one(x + e, y) - one(x - e, y)) / (2 * e));
    data[k + 3] = THREE.DataUtils.toHalfFloat((one(x, y + e) - one(x, y - e)) / (2 * e));
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; // half-float mip generation is not portable
  t.needsUpdate = true;
  return t;
}

/** The light the game played in (late morning, linear RGB). */
export const WATER_LIGHT = Object.freeze({
  sunDir: [-0.5, 0.6, -0.6],
  sunCol: [1, 0.9, 0.75],
  amb: [0.4, 0.46, 0.55],
  skyTop: [0.6, 0.7, 0.85],
  skyLow: [0.95, 0.85, 0.75],
});

/**
 * The water surface material. Put it on a flat mesh at the water level (y of the mesh = the water's y); it discards
 * outside the shore.
 * @param {import('./ripples.js').Ripples} ripples
 * @param {object} [opts]
 * @param {THREE.Texture} [opts.under] the scene under the surface, rendered without the water (UnderPass.texture)
 * @param {string} [opts.shoreGlsl] the same shore you gave Ripples
 * @param {Partial<typeof WATER_LIGHT>} [opts.light]
 * @param {{ value: number }} [opts.time] a shared clock uniform (seconds)
 */
export function createWaterMaterial(ripples, { under = null, shoreGlsl = RECT_SHORE, light = {}, time } = {}) {
  const L = { ...WATER_LIGHT, ...light };
  const col = (a) => ({ value: new THREE.Color(a[0], a[1], a[2]) });
  const uniforms = {
    ...ripples.uniforms,
    uRect: ripples.uniforms.uSimRect,
    uTime: time ?? { value: 0 },
    uMist: { value: 0 }, uSun: { value: 1 }, uCalm: { value: 0 },
    uSunDir: { value: new THREE.Vector3(...L.sunDir).normalize() },
    uSunCol: col(L.sunCol), uAmb: col(L.amb), uSkyTop: col(L.skyTop), uSkyLow: col(L.skyLow),
    uRes: { value: new THREE.Vector2(1, 1) },
    uUnder: { value: under },
    uWind: { value: createWindTexture() },
    uSplashes: { value: Array.from({ length: MAX_SPLASHES }, () => new THREE.Vector4()) },
    uTips: { value: Array.from({ length: MAX_TOUCHES }, () => new THREE.Vector4()) },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: frag(shoreGlsl),
    transparent: true,
    depthWrite: true,
  });
}
