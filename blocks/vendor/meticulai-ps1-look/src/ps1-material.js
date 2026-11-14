// PS1-style materials: vertex positions snap to a low-res pixel grid, and textures warp affinely (no perspective
// correction). Lighting, fog and shadows come from the stock three.js material, so lights, FogExp2 and shadows
// behave exactly as normal. From Don't Blink by Meticulai.
//
// Affine mapping trick: three's varyings are perspective-correct, so we pass (uv * w, w). Perspective-correct
// interpolation of both, followed by the divide, gives screen-linear UVs, which is exactly what the PS1
// rasteriser did. (GLSL ES 3.00 has no `noperspective`, so this is the portable way to get it.) Warping is
// strong on big polygons: subdivide large floors and walls to roughly 1 m segments to keep it charming
// rather than broken.
import * as THREE from 'three';
import { PS1_DEFAULTS } from './defaults.js';
import { snapResolution } from './ps1-state.js';

/** Shared by every PS1 material. PS1Pipeline keeps uSnapRes in step with its low-res target. */
export const ps1Uniforms = {
  uSnapRes: { value: new THREE.Vector2(...snapResolution(PS1_DEFAULTS.width, PS1_DEFAULTS.height, PS1_DEFAULTS.vertexSnap)) },
  uAffine: { value: PS1_DEFAULTS.affineStrength },
};

/** Snap resolution follows the low-res render target size. */
export function setPS1Resolution(width, height, vertexSnap = PS1_DEFAULTS.vertexSnap) {
  ps1Uniforms.uSnapRes.value.set(...snapResolution(width, height, vertexSnap));
}

/** 0 = perspective-correct textures, 1 = full PS1 affine warp (Don't Blink: 0.85). */
export function setPS1Affine(strength) {
  ps1Uniforms.uAffine.value = strength;
}

const VERT_PARS = /* glsl */ `
#include <common>
uniform vec2 uSnapRes;
#ifdef USE_MAP
varying vec3 vPs1AffineUv;
#endif
`;

const VERT_PROJECT = /* glsl */ `
#include <project_vertex>
#ifdef USE_MAP
vPs1AffineUv = vec3( vMapUv * gl_Position.w, gl_Position.w );
#endif
if ( gl_Position.w > 0.0 ) {
	vec2 ps1Grid = uSnapRes * 0.5;
	vec2 ps1Ndc = gl_Position.xy / gl_Position.w;
	ps1Ndc = floor( ps1Ndc * ps1Grid + 0.5 ) / ps1Grid;
	gl_Position.xy = ps1Ndc * gl_Position.w;
}
`;

const FRAG_PARS = /* glsl */ `
#include <common>
uniform float uAffine;
#ifdef USE_MAP
varying vec3 vPs1AffineUv;
#endif
`;

const FRAG_MAP = /* glsl */ `
#ifdef USE_MAP
	vec2 ps1MapUv = mix( vMapUv, vPs1AffineUv.xy / vPs1AffineUv.z, uAffine );
	vec4 sampledDiffuseColor = texture2D( map, ps1MapUv );
	diffuseColor *= sampledDiffuseColor;
#endif
`;

const FRAG_EMISSIVE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
	#ifdef USE_MAP
	vec4 emissiveColor = texture2D( emissiveMap, ps1MapUv );
	#else
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`;

/** The shader edit. Each replace targets a three.js chunk name (checked on three 0.187). */
function patchShader(shader) {
  shader.uniforms.uSnapRes = ps1Uniforms.uSnapRes;
  shader.uniforms.uAffine = ps1Uniforms.uAffine;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', VERT_PARS)
    .replace('#include <project_vertex>', VERT_PROJECT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAG_PARS)
    .replace('#include <map_fragment>', FRAG_MAP)
    .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE);
}

/**
 * Turn an existing built-in mesh material (Lambert, Phong, Standard, Physical, Basic, Toon) into a PS1 one,
 * in place. Lambert is what Don't Blink used and is the cheapest. Returns the same material.
 * @template {THREE.Material} M
 * @param {M} material
 * @returns {M}
 */
export function patchPS1Material(material) {
  if (material.userData.ps1) return material;
  const prev = material.onBeforeCompile;
  const own = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
  const prevKey = own ? material.customProgramCacheKey.bind(material) : () => prev.toString();
  material.onBeforeCompile = (shader, renderer) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(material, shader, renderer);
    patchShader(shader);
  };
  material.customProgramCacheKey = () => `meticulai-ps1-v1|${prevKey()}`;
  material.userData.ps1 = true;
  material.needsUpdate = true;
  return material;
}

const repeatCache = new Map();

function repeatedTexture(map, repeat) {
  const key = `${map.uuid}|${repeat[0]}|${repeat[1]}`;
  let tex = repeatCache.get(key);
  if (!tex) {
    tex = map.clone(); // shares the image source, only the UV transform differs
    tex.repeat.set(repeat[0], repeat[1]);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    repeatCache.set(key, tex);
  }
  return tex;
}

/**
 * @typedef {object} PS1MaterialOptions
 * @property {THREE.Texture} [map]
 * @property {THREE.ColorRepresentation} [color]
 * @property {THREE.ColorRepresentation} [emissive]  With `map`, the map also drives the emissive (glowing signs).
 * @property {number} [emissiveIntensity]
 * @property {THREE.Side} [side]
 * @property {[number, number]} [repeat]  Texture repeat; textures are shared per repeat value.
 * @property {boolean} [transparent]
 * @property {number} [opacity]
 * @property {boolean} [fog]
 */

/**
 * Lambert material with PS1 vertex snap + affine texture warp.
 * @param {PS1MaterialOptions} [opts]
 * @returns {THREE.MeshLambertMaterial}
 */
export function createPS1Material(opts = {}) {
  let map = opts.map ?? null;
  if (map && opts.repeat) map = repeatedTexture(map, opts.repeat);
  const mat = new THREE.MeshLambertMaterial({
    map,
    color: opts.color ?? 0xffffff,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    fog: opts.fog ?? true,
  });
  if (map && opts.emissive !== undefined) mat.emissiveMap = map;
  return patchPS1Material(mat);
}
