// Shader patches applied to every lit material the engine adopts (MeshStandardMaterial and MeshPhysicalMaterial):
//
// - PCSS soft shadows. The sun's shadow map is a plain depth map (BasicShadowMap); a blocker search measures
//   how far each pixel is from its occluder and widens the filter with that distance, so shadows are sharp
//   where an object touches the ground and soften further away, like real sunlight (the sun is 0.5° wide).
// - Box-projected reflections. The scene's environment map is a probe captured inside the level; reflections
//   are parallax-corrected against the probe's box, so a wet street or a steel can reflects the walls where
//   they really are instead of at infinity.
// - A world-position varying for both.
//
// All patched materials share the same uniform objects, so the engine changes them in one place.
import * as THREE from 'three';

export const shared = {
  // Probe box (world space) and the point it was captured from. Size 0 turns box projection off.
  probeBoxMin: { value: new THREE.Vector3() },
  probeBoxMax: { value: new THREE.Vector3() },
  probePos: { value: new THREE.Vector3() },
  probeBlend: { value: 0 },
  // PCSS: shadow-map UV per unit of shadow depth difference (frustum depth * tan(sun radius) / frustum width),
  // and the largest filter radius in UV.
  pcss: { value: new THREE.Vector2(0.0, 0.004) },
};

const PCSS = /* glsl */ `
	#define PR_BLOCKER_SAMPLES 12
	#define PR_PCF_SAMPLES 20

	float prIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }

	vec2 prVogel( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float t = float( i ) * 2.399963229728653 + phi;
		return vec2( cos( t ), sin( t ) ) * r;
	}

	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		shadowCoord.xyz /= shadowCoord.w;
		#ifdef USE_REVERSED_DEPTH_BUFFER
			shadowCoord.z -= shadowBias;
		#else
			shadowCoord.z += shadowBias;
		#endif
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z <= 1.0;
		if ( ! inFrustum ) return 1.0;

		float phi = prIGN( gl_FragCoord.xy ) * PI2;
		vec2 texel = 1.0 / shadowMapSize;
		float minR = max( shadowRadius, 1.0 ) * texel.x;
		float maxR = max( prPcss.y, minR );

		// 1. Blocker search: average depth of the occluders inside the largest possible penumbra.
		float blockerSum = 0.0;
		float blockers = 0.0;
		for ( int i = 0; i < PR_BLOCKER_SAMPLES; i ++ ) {
			vec2 o = prVogel( i, PR_BLOCKER_SAMPLES, phi ) * maxR;
			float d = texture2D( shadowMap, shadowCoord.xy + o ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				bool occ = d > shadowCoord.z;
			#else
				bool occ = d < shadowCoord.z;
			#endif
			if ( occ ) { blockerSum += d; blockers += 1.0; }
		}
		if ( blockers < 0.5 ) return 1.0;
		float blocker = blockerSum / blockers;

		// 2. Penumbra width grows with the receiver-to-blocker distance.
		float radius = clamp( abs( shadowCoord.z - blocker ) * prPcss.x, minR, maxR );

		// 3. Filter.
		float lit = 0.0;
		for ( int i = 0; i < PR_PCF_SAMPLES; i ++ ) {
			vec2 o = prVogel( i, PR_PCF_SAMPLES, phi + 1.7 ) * radius;
			float d = texture2D( shadowMap, shadowCoord.xy + o ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				lit += step( d, shadowCoord.z );
			#else
				lit += step( shadowCoord.z, d );
			#endif
		}
		return mix( 1.0, lit / float( PR_PCF_SAMPLES ), shadowIntensity );
	}
`;

// three's shadow chunk with the basic (unfiltered) getShadow replaced by PCSS. The basic variant is the last
// `getShadow( sampler2D ...` in the chunk (the PCF one takes a sampler2DShadow, the VSM one comes before it);
// its body is found by brace matching. Checked against three 0.186 and 0.187 (test/patch.test.mjs).
export function pcssShadowChunk(src = THREE.ShaderChunk.shadowmap_pars_fragment) {
  const fnStart = src.lastIndexOf('float getShadow( sampler2D shadowMap');
  if (fnStart < 0) return warnOnce('pcss', src); // three changed its chunk: keep its own filtering
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', fnStart); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return warnOnce('pcss', src);
  return src.slice(0, fnStart) + PCSS + src.slice(end);
}

// The line in three's envmap_physical_pars_fragment where the (world space) reflection vector samples the
// environment. three 0.186 and 0.187 wrote it differently; box projection goes in just before it.
const ENV_LINES = [
  'vec4 envMapColor = textureLod( envMap, envMapRotation * reflectVec, roughnessToMip( roughness ) );', // r187
  'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );', // r186 and older
];

// three's environment chunk with box projection added. Returns the chunk unchanged (plain, infinitely
// distant reflections) if three changed it.
export function boxProjectedEnvChunk(src = THREE.ShaderChunk.envmap_physical_pars_fragment) {
  for (const line of ENV_LINES) {
    if (src.includes(line)) return src.replace(line, 'reflectVec = prBoxProject( reflectVec );\n\t\t\t' + line);
  }
  return warnOnce('box', src);
}

const warned = new Set();
function warnOnce(what, src) {
  if (!warned.has(what)) {
    warned.add(what);
    console.warn(
      what === 'pcss'
        ? 'photoreal: this three.js version changed its shadow chunk; PCSS soft shadows are off (plain shadows instead).'
        : 'photoreal: this three.js version changed its environment chunk; box-projected reflections are off.',
    );
  }
  return src;
}

const BOX_PROJECT = /* glsl */ `
	uniform vec3 prProbeBoxMin;
	uniform vec3 prProbeBoxMax;
	uniform vec3 prProbePos;
	uniform float prProbeBlend;
	varying vec3 vPrWorld;

	vec3 prBoxProject( vec3 dir ) {
		if ( prProbeBlend <= 0.0 ) return dir;
		// outside the probe's room the box means nothing: plain (infinitely distant) lookup
		if ( any( lessThan( vPrWorld, prProbeBoxMin - 0.5 ) ) || any( greaterThan( vPrWorld, prProbeBoxMax + 0.5 ) ) ) return dir;
		vec3 rbmax = ( prProbeBoxMax - vPrWorld ) / dir;
		vec3 rbmin = ( prProbeBoxMin - vPrWorld ) / dir;
		vec3 rbminmax = mix( rbmin, rbmax, step( vec3( 0.0 ), dir ) );
		float t = min( min( rbminmax.x, rbminmax.y ), rbminmax.z );
		vec3 hit = vPrWorld + dir * max( t, 0.0 );
		return normalize( mix( dir, hit - prProbePos, prProbeBlend ) );
	}
`;

let pcssChunk = null;
let envChunk = null;

// Adds the patches to a material. Safe to call more than once.
export function adoptMaterial(material) {
  if (!material || material.userData.prAdopted) return material;
  if (!(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) return material;
  material.userData.prAdopted = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    pcssChunk ??= pcssShadowChunk();
    envChunk ??= boxProjectedEnvChunk();
    shader.uniforms.prProbeBoxMin = shared.probeBoxMin;
    shader.uniforms.prProbeBoxMax = shared.probeBoxMax;
    shader.uniforms.prProbePos = shared.probePos;
    shader.uniforms.prProbeBlend = shared.probeBlend;
    shader.uniforms.prPcss = shared.pcss;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPrWorld;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 prW = vec4( transformed, 1.0 );
          #ifdef USE_BATCHING
            prW = batchingMatrix * prW;
          #endif
          #ifdef USE_INSTANCING
            prW = instanceMatrix * prW;
          #endif
          vPrWorld = ( modelMatrix * prW ).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 prPcss;\n' + BOX_PROJECT)
      .replace('#include <shadowmap_pars_fragment>', pcssChunk)
      .replace('#include <envmap_physical_pars_fragment>', envChunk);
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => 'pr1|' + (prevKey ? prevKey.call(material) : '');
  material.needsUpdate = true;
  return material;
}

export function adoptObject(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) adoptMaterial(m);
  });
  return root;
}
