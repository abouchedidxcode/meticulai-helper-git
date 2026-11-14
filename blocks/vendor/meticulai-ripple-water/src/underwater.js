// What is under the water: a render pass of the scene without the surface (the water refracts it), and a patch for
// any MeshStandardMaterial under the water (a pond bed, stones, fish) that lights it with caustics focused by the
// live ripples and takes the colour away with depth (reds first, the deep goes jade).
//
// From the game Koi by Meticulai (meticulai.com). MIT licence.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_CAUSTICS, GLSL_SIM } from './glsl.js';

/** The game's water colours (linear RGB) and absorption. */
export const UNDERWATER_DEFAULTS = Object.freeze({
  deep: [0.03, 0.1, 0.1],
  shallow: [0.25, 0.32, 0.25],
  /** per-channel absorption along the light + view path: reds go first; a little less blue lost than green: teal */
  absorb: [0.9, 0.44, 0.62],
});

/**
 * Renders the scene minus the water surface into a half-float target the water material refracts. In the game it
 * ran at about one sample per CSS pixel (half resolution per axis at a pixel ratio of 2): it is only ever seen
 * through rippling water, and at full resolution it took a quarter of the frame.
 */
export class UnderPass {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ scale?: number, samples?: number, clearColor?: THREE.ColorRepresentation }} [opts]
   *   scale: of the drawing buffer (default min(1, 1.1 / pixelRatio)); samples: MSAA (the game used 4 at pixel ratio < 1.5)
   */
  constructor(renderer, { scale, samples = 0, clearColor = new THREE.Color(...UNDERWATER_DEFAULTS.deep) } = {}) {
    this.renderer = renderer;
    this.scale = scale;
    this.clearColor = new THREE.Color(clearColor);
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
  }
  get texture() { return this.target.texture; }
  /** Call on resize (and once at start). Returns the drawing buffer size (feed it to the water's uRes). */
  setSize() {
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const s = this.scale ?? Math.min(1, 1.1 / this.renderer.getPixelRatio());
    this.target.setSize(Math.max(4, Math.round(db.x * s)), Math.max(4, Math.round(db.y * s)));
    return db;
  }
  /** Draw everything except `hide` (the water surface and anything floating on it) into the target. */
  render(scene, camera, hide = []) {
    const r = this.renderer;
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    const prev = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.target);
    r.setClearColor(this.clearColor, 1);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(prev);
    r.setClearColor(prevClear, prevAlpha);
    hide.forEach((o, i) => { o.visible = was[i]; });
  }
}

const PARS = /* glsl */ `
${GLSL_NOISE}
${GLSL_CAUSTICS}
${GLSL_SIM}
uniform float uUwTime, uUwSun, uUwMist, uWaterY;
uniform vec3 uUwSunDir, uUwDeep, uUwShallow, uUwAbsorb;
varying vec3 vUwWorld;
`;

/**
 * Light a material that sits under the water with ripple caustics, and fade it with depth.
 * @param {THREE.MeshStandardMaterial} material
 * @param {import('./ripples.js').Ripples} ripples
 * @param {object} [opts]
 * @param {number} [opts.waterY] the water level (default 0)
 * @param {THREE.Vector3} [opts.sunDir] toward the sun (by reference)
 * @param {{ value: number }} [opts.time] a shared clock uniform (seconds)
 * @param {Partial<typeof UNDERWATER_DEFAULTS>} [opts.colours]
 * @returns {{ uniforms: object }} uniforms: uUwSun (0..1 sun strength), uUwMist (0..1) and the rest
 */
export function applyUnderwater(material, ripples, { waterY = 0, sunDir, time, colours = {} } = {}) {
  const C = { ...UNDERWATER_DEFAULTS, ...colours };
  const uniforms = {
    ...ripples.uniforms,
    uUwTime: time ?? { value: 0 },
    uUwSun: { value: 1 }, uUwMist: { value: 0 }, uWaterY: { value: waterY },
    uUwSunDir: { value: sunDir ?? new THREE.Vector3(-0.5, 0.6, -0.6).normalize() },
    uUwDeep: { value: new THREE.Color(...C.deep) }, uUwShallow: { value: new THREE.Color(...C.shallow) },
    uUwAbsorb: { value: new THREE.Vector3(...C.absorb) },
  };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUwWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vUwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
  float uwD = max(0.0, uWaterY - vUwWorld.y);
  float uwWet = smoothstep(0.02, -0.03, vUwWorld.y - uWaterY);
  {
    // caustics: a soft animated net (kept faint: strong Voronoi caustics read as pool tiles) times the focus of the
    // live ripples, which is what makes the bed answer every touch with moving rings of light
    vec2 cp = vUwWorld.xz + uUwSunDir.xz / max(0.3, uUwSunDir.y) * uwD * 0.6; // where the sunlight came through
    float ca = caustics(cp * 0.95, uUwTime * 0.75);
    float focus = rippleFocus(cp, uwD);
    float sunK = (0.35 + 0.65 * uUwSun) * (1.0 - uUwMist * 0.55);
    float caK = ca * sunK * (0.22 + 0.22 * smoothstep(0.05, 0.5, uwD)) * uwWet;
    float k = (0.62 + caK) / 0.62 * mix(1.0, focus, uwWet * (0.55 + 0.45 * sunK));
    reflectedLight.directDiffuse *= k;
    reflectedLight.directSpecular *= k;
  }`)
      .replace('#include <opaque_fragment>', /* glsl */ `{
    // absorption along the view + light path: clear in the shallows, falling off fast in the deep
    float path = uwD * (1.7 + 1.1 * uwD);
    vec3 tr = exp(-uUwAbsorb * path);
    vec3 scatter = mix(uUwShallow, uUwDeep, smoothstep(0.05, 1.1, uwD));
    outgoingLight = outgoingLight * tr + scatter * (1.0 - exp(-path * 1.1));
  }
  #include <opaque_fragment>`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|meticulai-underwater';
  material.needsUpdate = true;
  return { uniforms };
}
