// Tiling surfaces for large flat areas (streets, pavements, yards), built on MeshStandardMaterial:
// - parallax occlusion mapping from the height map, so cracks and joints have real depth at grazing angles;
// - anti-tiling: a second, rotated and scaled sample of the albedo blended by low-frequency noise, plus large
//   brightness variation, so a 2 m texture does not repeat visibly across 60 m;
// - grime that collects where the ground meets a wall (an `edge` function in world space);
// - puddles: where the noise is low the surface turns dark, flat and mirror-smooth (and reflects the probe).
// UVs come from world x/z (metres / tile size), so the geometry can be any flat mesh facing +Y.
import * as THREE from 'three';
import { adoptMaterial } from './patch.js';
import { loadTexture } from './assets.js';

export const NOISE = /* glsl */ `
  float srHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 ); }
  float srNoise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( srHash( i ), srHash( i + vec2( 1, 0 ) ), u.x ), mix( srHash( i + vec2( 0, 1 ) ), srHash( i + vec2( 1, 1 ) ), u.x ), u.y );
  }
  float srFbm( vec2 p ) {
    float s = 0.0, a = 0.5;
    for ( int i = 0; i < 4; i ++ ) { s += a * srNoise( p ); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
`;

// Where a ground is wet: 1 in puddles, a little everywhere else, more along the walls. The ground material and
// the renderer's screen-space reflections share this so reflections land exactly on the puddles.
// Defines float srWetMask( vec3 p, out float puddle ) (needs NOISE and srEdge); `wet` is the GLSL
// expression for the wetness (a uniform).
export function wetMaskGlsl(wet = 'srWet') {
  return /* glsl */ `
  float srWetMask( vec3 p, out float puddle ) {
    float edge = srEdge( p );
    float grime = 1.0 - smoothstep( 0.0, 1.4, edge );
    float pn = srFbm( p.xz * 0.35 + 3.7 );
    puddle = ${wet} * smoothstep( 0.62, 0.68, 1.0 - pn ) * smoothstep( 0.3, 1.0, edge );
    return max( puddle, ${wet} * ( 0.35 + grime * 0.4 ) );
  }`;
}

// The four maps of a ground or wall: `maps: { diff, nor, arm, disp }` (URLs or loaded textures; nor is an
// OpenGL-style normal map, arm = ambient occlusion / roughness / metalness in R / G / B, disp = height), or
// `dir`, a folder holding diff.webp, nor.webp, arm.webp, disp.webp (CANDID's layout). Poly Haven's files
// fit directly: <id>_diff_1k.jpg, <id>_nor_gl_1k.jpg, <id>_arm_1k.jpg, <id>_disp_1k.jpg (see polyHavenMaps).
// With neither, the surface is flat colour (tint) and still gets the puddles, grime and macro variation.
function resolveMaps({ dir, maps }) {
  if (maps) return maps;
  if (dir) return { diff: `${dir}/diff.webp`, nor: `${dir}/nor.webp`, arm: `${dir}/arm.webp`, disp: `${dir}/disp.webp` };
  return {};
}
const tex = (v, o) => (v == null ? null : v.isTexture ? v : loadTexture(v, o));

// URLs of a Poly Haven texture set on its CDN (CC0). For a shipped game, download them once with
// `node tools/assets/get.mjs polyhaven:<id>` and pass the local paths instead.
export function polyHavenMaps(id, res = '1k', base = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg') {
  const u = (m) => `${base}/${res}/${id}/${id}_${m}_${res}.jpg`;
  return { diff: u('diff'), nor: u('nor_gl'), arm: u('arm'), disp: u('disp') };
}

// opts: maps or dir (see above), tile (metres per repeat), pomDepth (metres of relief),
// wetness (0..1 amount of puddles), edgeGlsl (float srEdge(vec3 p): distance in metres to the nearest wall),
// tint, roughness (only without an arm map), smoothPuddles (see below; default false = CANDID's look),
// quality ({ pom, maxAnisotropy })
export function createGroundMaterial(opts) {
  const { tile = 2, pomDepth = 0.02, wetness = 0, edgeGlsl = 'float srEdge( vec3 p ) { return 100.0; }', tint = 0xffffff, quality = {} } = opts;
  const aniso = quality.maxAnisotropy || 8;
  const m = resolveMaps(opts);
  const diff = tex(m.diff, { srgb: true, anisotropy: aniso });
  const nor = tex(m.nor, { anisotropy: aniso });
  const arm = tex(m.arm, { anisotropy: aniso });
  const disp = quality.pom !== false ? tex(m.disp, { anisotropy: 1 }) : null;

  const mat = new THREE.MeshStandardMaterial({
    map: diff,
    normalMap: nor,
    roughnessMap: arm,
    metalnessMap: arm,
    aoMap: arm,
    color: tint,
    roughness: arm ? 1 : opts.roughness ?? 0.85,
    metalness: arm ? 1 : 0, // arm.b carries it (all zero for these surfaces)
    normalScale: new THREE.Vector2(1, 1),
  });
  mat.aoMapIntensity = 1;
  const uniforms = {
    srTile: { value: 1 / tile },
    srDepth: { value: pomDepth / tile },
    srWet: { value: wetness },
    srDisp: { value: disp },
  };
  mat.userData.surface = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSrWorld;\nvarying vec3 vSrViewDirT;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 srW = modelMatrix * vec4( transformed, 1.0 );
        vSrWorld = srW.xyz;
        // tangent frame of a +Y plane with u = x, v = -z: T = +x, B = -z, N = +y
        vec3 srV = cameraPosition - srW.xyz;
        vSrViewDirT = vec3( srV.x, -srV.z, srV.y );`,
      );
    const uvVars = ['vMapUv', 'vNormalMapUv', 'vRoughnessMapUv', 'vMetalnessMapUv', 'vAoMapUv'];
    let frag = shader.fragmentShader;
    // Mirror-smooth, flat puddles in the material itself. In CANDID these two edits came after the chunks
    // below were inlined, so they found nothing and never applied: the shipped look got its puddle
    // reflections from the screen-space pass alone. Off by default to keep that look; smoothPuddles: true
    // turns them on (sharper sun glints and probe reflections in the puddles).
    if (opts.smoothPuddles) {
      frag = frag
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
      roughnessFactor = mix( roughnessFactor, 0.09, srPuddle );
      roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.65, srWet * 0.5 );`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
      normal = normalize( mix( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ), srPuddle ) );`,
        );
    }
    // the material's samplers read srUv instead of the mesh's UVs
    const chunks = ['map_fragment', 'normal_fragment_begin', 'normal_fragment_maps', 'roughnessmap_fragment', 'metalnessmap_fragment', 'aomap_fragment'];
    for (const c of chunks) {
      let src = THREE.ShaderChunk[c];
      for (const v of uvVars) src = src.replaceAll(v, 'srUv');
      frag = frag.replace(`#include <${c}>`, src);
    }
    frag = frag.replace(
      '#include <common>',
      `#include <common>
      uniform float srTile, srDepth, srWet;
      uniform sampler2D srDisp;
      varying vec3 vSrWorld;
      varying vec3 vSrViewDirT;
      ${NOISE}
      ${opts.edgeGlsl || edgeGlsl}
      vec2 srUv;
      float srPuddle;
      float srGrime;`,
    );
    const pom = disp
      ? `{
          // parallax occlusion: march the height field along the view ray, then refine linearly
          vec3 V = normalize( vSrViewDirT );
          float steps = mix( 24.0, 8.0, clamp( V.z, 0.0, 1.0 ) );
          float layer = 1.0 / steps;
          vec2 dUv = V.xy / max( V.z, 0.15 ) * srDepth * layer;
          float h = 1.0, mapH = texture2D( srDisp, srUv ).r;
          vec2 uv = srUv;
          float prevMapH = mapH, prevH = h;
          for ( int i = 0; i < 24; i ++ ) {
            if ( float( i ) >= steps || h <= mapH ) break;
            prevH = h; prevMapH = mapH;
            uv -= dUv; h -= layer;
            mapH = texture2D( srDisp, uv ).r;
          }
          float after = mapH - h, before = prevMapH - prevH;
          float t = after / ( after - before + 1e-5 );
          srUv = mix( uv, uv + dUv, t );
        }`
      : '';
    frag = frag.replace(
      'void main() {',
      `void main() {
        srUv = vec2( vSrWorld.x, -vSrWorld.z ) * srTile;
        float edge = srEdge( vSrWorld );
        srGrime = 1.0 - smoothstep( 0.0, 1.4, edge );
        // puddles sit in low spots away from the walls' drip line
        float pn = srFbm( vSrWorld.xz * 0.35 + 3.7 );
        srPuddle = srWet * smoothstep( 0.62, 0.68, 1.0 - pn ) * smoothstep( 0.3, 1.0, edge );
        ${pom}`,
    );
    // albedo: anti-tiling blend + macro variation + grime + wet darkening
    frag = frag.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        #ifdef USE_MAP
          float n = srFbm( vSrWorld.xz * 0.11 );
          vec2 ruv = mat2( 0.8, -0.6, 0.6, 0.8 ) * srUv * 0.73 + 0.31;
          vec3 alt = texture2D( map, ruv ).rgb;
          diffuseColor.rgb = mix( diffuseColor.rgb, alt, smoothstep( 0.35, 0.65, n ) * 0.65 );
        #endif
        float macro = srFbm( vSrWorld.xz * 0.045 + 11.0 );
        diffuseColor.rgb *= mix( 0.82, 1.12, macro );
        diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.55, 0.52, 0.47 ), srGrime * 0.7 );
        float damp = max( srPuddle, srWet * 0.35 + srGrime * srWet * 0.4 );
        diffuseColor.rgb *= mix( 1.0, 0.45, damp );
      }`,
    );
    shader.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => `ground|${disp ? 1 : 0}|${diff ? 1 : 0}|${opts.smoothPuddles ? 1 : 0}|${opts.edgeGlsl ? opts.edgeGlsl.length : 0}`;
  adoptMaterial(mat);
  return mat;
}

// A wall material for plain flat walls (box faces), with world-space UVs on the wall plane.
// (Only the material; give the mesh UVs in metres / tile, or set the textures' repeat.)
export function createTiledMaterial({ dir, maps, tile = 2, tint = 0xffffff, quality = {} }) {
  const aniso = quality.maxAnisotropy || 8;
  const m = resolveMaps({ dir, maps });
  const mat = new THREE.MeshStandardMaterial({
    map: tex(m.diff, { srgb: true, anisotropy: aniso }),
    normalMap: tex(m.nor, { anisotropy: aniso }),
    roughnessMap: tex(m.arm, { anisotropy: aniso }),
    aoMap: tex(m.arm, { anisotropy: aniso }),
    color: tint,
  });
  mat.userData.tile = tile;
  adoptMaterial(mat);
  return mat;
}
