// Patch a built-in lit material (MeshStandardMaterial / MeshPhysicalMaterial) so the styles can repaint it.
// With uStyle 0 every branch is skipped and the material draws as before (so "Classic" is your normal look).
//
// In a style, the material's painted detail (textures, normal maps) is replaced by its flat base colour (material
// colour x vertex colour x the texture's average colour), snapped toward the style's palette, lit by the style's light
// ramp, with no specular. Its fog becomes the style's haze (needs scene.fog). Basic, line and point materials are left
// alone (only the uniforms are added).
import * as THREE from 'three';
import { STYLE_GLSL, STYLE_RAMP } from './style-glsl.js';
import { KINDS } from './styles.js';

/**
 * The style uniforms, shared by reference with every patched material, the sky and the post pass (one set per page).
 * uStyle: 0 none, 1 miniature, 2 gouache, 3 clean. uNight: 0 day .. 1 night.
 * uStyleFogScale: multiplies the distance the styles' haze sees (Kite Race's haze bands sit at 60-1600 m; a 150 m
 * scene wants ~8). uStFogSun / uStSunDir / uStFogSunPow: the haze warms toward the sun like Kite Race's air.
 */
export const STYLE_U = {
  uStyle: { value: 0 },
  uNight: { value: 0 },
  uStyleFogScale: { value: 1 },
  uStFogSun: { value: new THREE.Color(0xffc678) },
  uStSunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  uStFogSunPow: { value: 4 },
};

/** @typedef {'flat'|'hero'|'figure'|'textured'|'ground'} SurfaceKind */

/**
 * What kind of surface a material is, for the style:
 *  - 'flat'     world built from flat colours (material x vertex colour x texture average)  (the default)
 *  - 'textured' world painted with a texture you want to keep: the texture is read from small mips, so it melts into
 *               fields of colour (default when the material has a `map` and no vertex colours)
 *  - 'hero'     the star of the game (Kite Race's kites): keeps its own paint, gets the style's light
 *  - 'figure'   people / creatures: keep their colours, flat shading so a figure reads as a silhouette
 *  - 'ground'   a large ground: flat colour, a lighter palette snap in the miniature, warm earth in the gouache
 * @param {THREE.Material} mat
 * @returns {SurfaceKind}
 */
export function guessKind(mat) {
  const m = /** @type {THREE.MeshStandardMaterial} */ (mat);
  if (m.vertexColors) return 'flat';
  return m.map ? 'textured' : 'flat';
}

const RAMP_AFTER = [
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getPointLightInfo( pointLight, directLight );',
  'getSpotLightInfo( spotLight, directLight );',
];
let LIGHTS_WITH_RAMP = THREE.ShaderChunk.lights_fragment_begin;
for (const s of RAMP_AFTER) LIGHTS_WITH_RAMP = LIGHTS_WITH_RAMP.replace(s, s + STYLE_RAMP);

// three's own fog factor, then the style's haze (stFog) instead of the plain mix while a style is on
const FOG_STYLED = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  if (uStyle > 0.5) {
    vec3 stD = vStWorld - cameraPosition;
    float stDist = length(stD);
    vec3 stRd = stD / max(stDist, 1e-4);
    vec3 stFc = mix(fogColor, uStFogSun, pow(max(dot(stRd, uStSunDir), 0.0), uStFogSunPow));
    gl_FragColor.rgb = stFog(gl_FragColor.rgb, stFc, vec3(fogFactor), stDist * uStyleFogScale, stRd);
  } else {
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
#endif`;

/** The surface treatment, verbatim from Kite Race minus its paved-ground mask (ST_KIND 4 here is a plain ground). */
const SURFACE = /* glsl */ `
      if (uStyle > 0.5) {
        vec3 stAlb = diffuseColor.rgb;
        #if ST_KIND == 0 || ST_KIND == 4
          stAlb = stA;
          #ifdef USE_MAP
            stAlb *= texture(map, vMapUv, 12.0).rgb; // the texture's average colour
          #endif
          #if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR )
            stAlb *= vColor.rgb;
          #endif
        #endif
        #if ST_KIND != 1
          stAlb = stPalette(stAlb, vStWorld, float(ST_KIND));
        #endif
        #if ST_KIND == 0 || ST_KIND == 3 || ST_KIND == 4
          if (uStyle > 1.5 && uStyle < 2.5) stAlb = stBrush(stAlb, vStWorld);
        #endif
        diffuseColor.rgb = stAlb;
        #if ST_KIND == 0 || ST_KIND == 3 || ST_KIND == 4
          normal = stN0;
        #elif ST_KIND == 2
          normal = normalize(vec3(0.0, 0.3, 1.0));
        #endif
        #if ST_KIND != 1
          roughnessFactor = 1.0; metalnessFactor = 0.0;
        #endif
      }
      #include <lights_physical_fragment>
      #if ST_KIND != 1
        if (uStyle > 0.5) { material.specularColor *= 0.15; material.specularF90 *= 0.15; }
        // the night's lights (windows, lamps) a little stronger against the painted walls
        #if ST_KIND == 0
          if (uStyle > 0.5) totalEmissiveRadiance *= 1.0 + uNight * 1.2;
        #endif
      #else
        // the heroes are the jewels: after dark they glow a little with their own colour
        if (uStyle > 0.5) totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.3;
      #endif
`;

/**
 * Patch a material for the styles. Safe to call once per material; chains any onBeforeCompile already set.
 * @template {THREE.Material} M
 * @param {M} mat
 * @param {SurfaceKind} [kind] default: guessKind(mat)
 * @returns {M}
 */
export function patchStyleMaterial(mat, kind) {
  if (/** @type {any} */ (mat).userData.painterlyKind != null) return mat;
  const k = kind ?? guessKind(mat);
  const kindId = KINDS[k];
  if (kindId == null) throw new Error(`patchStyleMaterial: unknown kind "${k}" (use ${Object.keys(KINDS).join(', ')})`);
  mat.userData.painterlyKind = k;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    Object.assign(shader.uniforms, STYLE_U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 stW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            stW = instanceMatrix * stW;
          #endif
          vStWorld = (modelMatrix * stW).xyz;
        }`,
      );
    let fs = shader.fragmentShader;
    fs = `#define ST_KIND ${kindId}\n` + fs;
    fs = fs.replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vStWorld;\nuniform float uStyleFogScale; uniform vec3 uStFogSun; uniform vec3 uStSunDir; uniform float uStFogSunPow;\n${STYLE_GLSL}`,
    );
    fs = fs.replace('#include <fog_fragment>', FOG_STYLED);
    // only lit materials (standard/physical) get the surface treatment; basic, line and point materials keep theirs
    const lit = fs.includes('#include <lights_physical_fragment>');
    if (lit) {
      // the material's own colour before any paint, and the normal before any normal map or painted relief
      fs = fs.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity );\nvec3 stA = diffuseColor.rgb;');
      fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 stN0 = normal;');
      if (kindId === 3 && !(/** @type {any} */ (mat).alphaMap)) {
        // textured world: its textures are read from small mips, so fine detail melts into fields of colour
        fs = fs.replace('void main() {', '#undef texture2D\n#define texture2D(s, c) texture(s, c, uStyle > 0.5 ? 5.5 : 0.0)\nvoid main() {');
      }
      fs = fs.replace('#include <lights_fragment_begin>', LIGHTS_WITH_RAMP);
      fs = fs.replace('#include <lights_physical_fragment>', SURFACE);
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `${prevKey()}|painterly:${kindId}`;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Patch every mesh material in a tree. `kindOf(mesh, material)` may return a kind (or undefined for the default).
 * @param {THREE.Object3D} root
 * @param {(mesh: THREE.Mesh, mat: THREE.Material) => SurfaceKind|undefined} [kindOf]
 */
export function patchStyleScene(root, kindOf) {
  root.traverse((o) => {
    const mesh = /** @type {THREE.Mesh} */ (o);
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) patchStyleMaterial(m, kindOf?.(mesh, m));
  });
}
