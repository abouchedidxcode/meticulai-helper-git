// Shade the trails on your own ground: patches a MeshStandardMaterial / MeshPhysicalMaterial (onBeforeCompile) so it
// reads the sand map (grooves, berms, craters as normal detail, with the shadows their walls throw in a low sun, and
// the water wicking into the grains) and, optionally, the long wet map (damp darkening and a glossy film).
// The ground's geometry and your physics are untouched: it is all in the fragment shader.
//
// The shading is the game's terrain shader cut down to what any ground needs. Last Drop also used the groove depth to
// shift its own grain and ripple textures (parallax); that part belonged to its terrain, see HOW-TO-USE.md.
//
// From the game Last Drop by Meticulai (meticulai.com). MIT licence.
import * as THREE from 'three';

const PARS = /* glsl */ `
uniform sampler2D tSand;    // sand-map.js: r = pushed down/up (m), g = wet grains, b = film
uniform vec4 uSandRect;     // x0, z0 (min corner), size, texel (m)
uniform float uSandOn;
uniform sampler2D tWet;     // wet-map.js: r = damp, g = film
uniform vec3 uWetRect;      // x0, z0, size (m)
uniform float uWetOn;
uniform vec3 uSandSun;      // world direction toward the sun (normalised)
uniform vec3 uWetTint;      // albedo multiplier on soaked ground
uniform vec2 uWetRough;     // roughness of damp ground, of a fresh film
varying vec3 vSandWorld;
`;

const FRAG_NORMAL = /* glsl */ `
float sandShade = 1.0;
float sandW = 0.0;
float sandF = 0.0;
if (uSandOn > 0.5) {
  vec2 xz = vSandWorld.xz;
  vec2 suv = (xz - uSandRect.xy) / uSandRect.z;
  if (suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0) {
    vec3 s0 = texture2D(tSand, suv).rgb;
    // (heights decay toward zero but never reach it: only sand that is visibly touched takes the full path)
    if (abs(s0.x) > 6e-4 || s0.y > 0.03 || s0.z > 0.03) {
      float fade = smoothstep(0.0, 0.12, min(min(suv.x, suv.y), min(1.0 - suv.x, 1.0 - suv.y)));
      float tu = uSandRect.w / uSandRect.z;
      float hx = texture2D(tSand, suv + vec2(tu, 0.0)).r - texture2D(tSand, suv - vec2(tu, 0.0)).r;
      float hz = texture2D(tSand, suv + vec2(0.0, tu)).r - texture2D(tSand, suv - vec2(0.0, tu)).r;
      vec2 g = vec2(hx, hz) / (2.0 * uSandRect.w) * fade;
      // the slope of the trail tilts the ground's normal (worked in world space, then back to view space)
      vec3 Nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
      Nw = normalize(Nw - vec3(g.x, 0.0, g.y) * Nw.y);
      normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
      float sandH = s0.x * fade;
      sandW = s0.y * fade;
      sandF = s0.z * fade;
      // the shadows the groove's wall and the berms throw in a low sun: march three texels toward the sun
      vec2 ld = normalize(uSandSun.xz + vec2(1e-5));
      float tanE = uSandSun.y / max(length(uSandSun.xz), 1e-3);
      float occ = 0.0;
      for (int k = 1; k <= 3; k++) {
        float st = float(k) * uSandRect.w * 1.5;
        float hk = texture2D(tSand, suv + ld * (st / uSandRect.z)).r * fade;
        occ = max(occ, (hk - sandH) / st - tanE);
      }
      sandShade = 1.0 - 0.85 * smoothstep(0.0, 0.3, occ);
    }
  }
}
vec2 wetM = vec2(0.0);
if (uWetOn > 0.5) {
  vec2 wuv = (vSandWorld.xz - uWetRect.xy) / uWetRect.z;
  if (wuv.x > 0.0 && wuv.y > 0.0 && wuv.x < 1.0 && wuv.y < 1.0) {
    float fade = smoothstep(0.0, 0.08, min(min(wuv.x, wuv.y), min(1.0 - wuv.x, 1.0 - wuv.y)));
    wetM = texture2D(tWet, wuv).rg * fade;
  }
}
// (the wicked water has a front: a soft edge that darkens quickly once the grains are wet through)
float sandDamp = clamp(max(wetM.r, smoothstep(0.04, 0.4, sandW) * 0.92), 0.0, 1.0);
float sandFilm = clamp(max(wetM.g, sandF), 0.0, 1.0);
// wet sand: darker and richer; a fresh film is a mirror
diffuseColor.rgb *= mix(vec3(1.0), uWetTint, sandDamp);
roughnessFactor = mix(roughnessFactor, uWetRough.x, sandDamp);
roughnessFactor = mix(roughnessFactor, uWetRough.y, sandFilm);
`;

/**
 * Make a ground material draw the trails. Call once, before the material is first used.
 * @param {THREE.MeshStandardMaterial} material
 * @param {object} maps
 * @param {import('./sand-map.js').SandMap} [maps.sand]
 * @param {import('./wet-map.js').WetMap} [maps.wet]
 * @param {object} [opts]
 * @param {THREE.Vector3} [opts.sunDir] world direction TOWARD the sun (kept by reference: move your sun, it follows)
 * @param {[number, number, number]} [opts.wetTint] albedo multiplier on soaked ground (the game: 0.46, 0.42, 0.40)
 * @param {[number, number]} [opts.wetRoughness] damp ground, fresh film (the game: 0.55, 0.06)
 * @returns {{ uniforms: object }} the uniforms, to change at runtime
 */
export function applySandTrails(material, { sand, wet } = {}, opts = {}) {
  const sun = opts.sunDir ?? new THREE.Vector3(0.6, 0.35, 0.7).normalize();
  const tint = opts.wetTint ?? [0.46, 0.42, 0.4];
  const rough = opts.wetRoughness ?? [0.55, 0.06];
  const uniforms = {
    tSand: sand ? sand.tex : { value: null },
    uSandRect: sand ? sand.rect : { value: new THREE.Vector4(0, 0, 1, 1) },
    uSandOn: sand ? sand.on : { value: 0 },
    tWet: wet ? { get value() { return wet.texture; } } : { value: null },
    uWetRect: wet ? wet.rect : { value: new THREE.Vector3(0, 0, 1) },
    uWetOn: { get value() { return wet && !wet.off ? 1 : 0; } },
    uSandSun: { value: sun },
    uWetTint: { value: new THREE.Vector3(...tint) },
    uWetRough: { value: new THREE.Vector2(...rough) },
  };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vSandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= sandShade;\n  reflectedLight.directSpecular *= sandShade;');
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|meticulai-sand-trails';
  material.needsUpdate = true;
  return { uniforms };
}
