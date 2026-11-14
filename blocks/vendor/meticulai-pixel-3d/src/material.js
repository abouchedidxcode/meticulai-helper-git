// Palette-ramp materials for 3D meshes. A MeshLambertMaterial (so normal three.js lights and shadow maps still work)
// whose final colour is replaced: the light falling on each art pixel picks one tone of a palette ramp, the same way
// the sprite rasteriser resolves its pixels (shade * span - 0.5, rounded; a 2x2 checker only in the narrow band
// between two tones). Output is an exact palette colour, so it must be drawn through PixelView (no tone mapping).
import * as THREE from 'three';
import { RAMP_ROW, RAMP_LEN } from './palette.js';
import { PX_GLSL, rampTexture } from './glsl.js';

/**
 * @typedef {object} PixelMaterialOptions
 * @property {number} [lo=0]          darkest ramp entry used for shading
 * @property {number} [hi=len-1]      lightest ramp entry used for shading
 * @property {number} [gain=1]      light -> shade scale (raise if the scene is dim)
 * @property {number} [lift=0]        added to shade before banding (an ambient floor)
 * @property {number} [grain=0]       world-space value noise added to shade (0.1-0.3 gives grass, soil, stone texture)
 * @property {number} [grainScale=3]  noise cells per world unit
 * @property {'band'|'full'|'none'} [dither='band'] band: checker only near tone borders (sprite rasteriser style,
 *                                    band width 0.16); full: 4x4 ordered dither across each step; none: hard bands
 * @property {number} [ditherBand=0.16]
 * @property {import('./view.js').PixelView} [view] pass the view so dither stays locked to the world while panning
 * @property {object} [lambert]       extra MeshLambertMaterial parameters (e.g. { side: THREE.DoubleSide })
 */

const FRAG_HEAD = /* glsl */ `
${PX_GLSL}
uniform float uRow;
uniform float uLen;
uniform float uLo;
uniform float uHi;
uniform float uGain;
uniform float uLift;
uniform float uDitherMode;
uniform float uDitherBand;
uniform vec2 uPixOrigin;
uniform float uGrain;
uniform float uGrainScale;
varying vec3 vPxWorld;
float bayer2(vec2 px) {
  vec2 p = mod(floor(px), 2.0);
  return p.y < 0.5 ? (p.x < 0.5 ? 0.25 : 0.75) : (p.x < 0.5 ? 1.0 : 0.5);
}
`;

const FRAG_RAMP = /* glsl */ `
  // light reaching this pixel (diffuse is white, so outgoingLight is pure light)
  float shade = dot(outgoingLight, vec3(0.3, 0.5, 0.2)) * uGain + uLift;
  if (uGrain > 0.0) {
    vec3 gp = floor(vPxWorld * uGrainScale);
    shade += (fbm3(gp.xz + gp.y * 7.31) - 0.5) * uGrain * 2.0;
  }
  shade = clamp(shade, 0.0, 1.0);
  vec2 artPx = floor(gl_FragCoord.xy) + uPixOrigin;
  float span = uHi - uLo + 1.0;
  float f = shade * span - 0.5;
  float k = floor(f + 0.5);
  if (uDitherMode > 1.5) {
    k = floor(f) + step(bayer4(artPx), fract(f));
  } else if (uDitherMode > 0.5) {
    float fr = f - floor(f);
    if (abs(fr - 0.5) < uDitherBand) k = floor(f) + (fr > bayer2(artPx) ? 1.0 : 0.0);
  }
  vec3 rampCol = rampAt(uRow, uLen, uLo + clamp(k, 0.0, span - 1.0));
  gl_FragColor = vec4(rampCol, diffuseColor.a);
`;

const DITHER = { none: 0, band: 1, full: 2 };

/**
 * A lit mesh material that draws in one palette ramp.
 * @param {string} ramp  ramp name from palette.js (e.g. 'stone', 'grass')
 * @param {PixelMaterialOptions} [o]
 * @returns {THREE.MeshLambertMaterial & { rampUniforms: object, setRamp: (name: string, lo?: number, hi?: number) => void }}
 */
export function pixelMaterial(ramp, o = {}) {
  const row = RAMP_ROW[ramp];
  if (row === undefined) throw new Error(`unknown ramp: ${ramp}`);
  const len = RAMP_LEN[row];
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, ...(o.lambert || {}) });
  m.fog = false;
  const u = {
    tRamp: { value: rampTexture() },
    uRow: { value: row },
    uLen: { value: len },
    uLo: { value: o.lo ?? 0 },
    uHi: { value: o.hi ?? len - 1 },
    uGain: { value: o.gain ?? 1.0 },
    uLift: { value: o.lift ?? 0 },
    uDitherMode: { value: DITHER[o.dither ?? 'band'] ?? 1 },
    uDitherBand: { value: o.ditherBand ?? 0.16 },
    uGrain: { value: o.grain ?? 0 },
    uGrainScale: { value: o.grainScale ?? 3 },
    uPixOrigin: o.view ? o.view.uPixOrigin : { value: new THREE.Vector2() },
  };
  m.rampUniforms = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vPxWorld;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vPxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${FRAG_HEAD}\nvoid main() {`);
    if (!shader.fragmentShader.includes('#include <opaque_fragment>')) throw new Error('pixelMaterial: three.js shader layout changed (no opaque_fragment)');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', FRAG_RAMP);
  };
  m.customProgramCacheKey = () => 'meticulai-pixel-ramp';
  m.setRamp = (name, lo, hi) => {
    const r = RAMP_ROW[name];
    if (r === undefined) throw new Error(`unknown ramp: ${name}`);
    u.uRow.value = r;
    u.uLen.value = RAMP_LEN[r];
    u.uLo.value = lo ?? 0;
    u.uHi.value = hi ?? RAMP_LEN[r] - 1;
  };
  return m;
}

/** Change the dither mode of a pixelMaterial live ('band' | 'full' | 'none'). */
export function setDither(material, mode) {
  material.rampUniforms.uDitherMode.value = DITHER[mode] ?? 1;
}
