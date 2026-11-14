// One haze for every material: replaces three.js's fog shader chunks once, so every built-in material (and any
// ShaderMaterial with `fog: true` that includes the usual fog chunks) dissolves into the same air:
//   - a low height mist that lies on water and in valleys (patchy, drifting banks),
//   - a thin uniform haze everywhere,
//   - a deep second layer, so there is still aerial perspective from high up,
// all tinted toward the sun and coloured like the sky's horizon, so far land melts into the sky.
// Optional: drifting cloud shadows on the directional light, and a firefly clamp on very bright pixels.
//
// The numbers reach every shader as ONE uniform array (`vec4 hzP[4]`) whose value is a shared Float32Array. three
// clones uniform values per material but passes typed arrays through by reference, so writing to it changes the air
// in every material at once, live, without recompiling. Edit `haze.look`, then call `haze.sync()`.
//
// Call installHaze() BEFORE any material is compiled (before the first render), and set
// `scene.fog = new THREE.FogExp2(0x000000, 1)`: fog must be on for the chunks to run; its density is a live global
// multiplier (0 = clear air, 2 = twice as thick) and its colour's red channel carries time (see update()).
// Custom shaders must define `vec4 mvPosition` before `#include <fog_vertex>` (three's own shaders do).
import * as THREE from 'three';
import { makeLook, packHaze, dirFromAngles, DAWN_SUN } from './haze-math.js';

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// GLSL shared by the fog chunks and the sky. fogDensity (FogExp2.density) is a live global multiplier.
function hazeGLSL(sun) {
  return /* glsl */ `
    const vec3 HZ_SUN = vec3(${f(sun.x)}, ${f(sun.y)}, ${f(sun.z)});
    uniform vec4 hzP[4]; // live haze parameters (see packHaze in haze-math.js)
    #define HZ_FOG hzP[0].rgb
    #define HZ_H hzP[0].w
    #define HZ_FOG_SUN hzP[1].rgb
    #define HZ_D0 hzP[1].w
    #define HZ_DU hzP[2].x
    #define HZ_H2 hzP[2].y
    #define HZ_D1 hzP[2].z
    #define HZ_BANKS hzP[2].w
    // colour of the haze seen along dir
    vec3 hzFogColor(vec3 dir) {
      float s = max(dot(dir, HZ_SUN), 0.0);
      float s2 = max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-5), normalize(vec3(HZ_SUN.x, 0.0, HZ_SUN.z))), 0.0);
      // looking down, the sun-side glow fades: the haze under you is lit from above, not from behind
      float w = 1.0 - smoothstep(0.08, 0.55, -dir.y);
      vec3 c = mix(HZ_FOG, HZ_FOG_SUN, (0.34 * pow(s2, 3.0) + 0.3 * pow(s2, 14.0)) * w + 0.36 * pow(s, 22.0));
      return c;
    }
    // one exponential layer (scale height H): density integrated from the eye over d metres along a ray of slope dirY
    float hzLayer(float eyeY, float dirY, float d, float H) {
      float ad = dirY / H * d;
      float k = abs(ad) > 1e-4 ? (1.0 - exp(-clamp(ad, -40.0, 40.0))) / ad : 1.0;
      return exp(-max(eyeY, 0.0) / H) * d * k;
    }
    // optical depth from eye to a point d metres away along dir
    float hzDepth(vec3 eye, vec3 dir, float d, float dens) {
      return dens * (HZ_D0 * hzLayer(eye.y, dir.y, d, HZ_H) + HZ_D1 * hzLayer(eye.y, dir.y, d, HZ_H2) + HZ_DU * d);
    }
    float hzHash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.y);
    }
    float hzNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hzHash(i), hzHash(i + vec2(1.0, 0.0)), f.x), mix(hzHash(i + vec2(0.0, 1.0)), hzHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    // the low mist is patchy: slow banks drifting over the water and the low ground (time in t)
    vec3 hzApplyBanked(vec3 col, vec3 eye, vec3 wp, float dens, float t) {
      vec3 v = wp - eye;
      float d = length(v);
      vec3 dir = v / max(d, 1e-3);
      vec2 q = (eye.xz + v.xz * 0.6) * 0.0019 * HZ_BANK_SCALE + t * vec2(-0.0021, 0.0016);
      float bank = 1.0 + HZ_BANKS * (hzNoise(q) * 1.3 + hzNoise(q * 2.7 + 5.3) * 0.7 - 1.0);
      float od = dens * (HZ_D0 * max(bank, 0.15) * hzLayer(eye.y, dir.y, d, HZ_H) + HZ_D1 * (0.7 + 0.3 * bank) * hzLayer(eye.y, dir.y, d, HZ_H2) + HZ_DU * d);
      float tr = exp(-od);
      return col * tr + hzFogColor(dir) * (1.0 - tr);
    }
    // plain version for custom shaders: colour col at world point wp, seen from eye
    vec3 hzApply(vec3 col, vec3 eye, vec3 wp, float dens) {
      vec3 v = wp - eye;
      float d = length(v);
      vec3 dir = v / max(d, 1e-3);
      float t = exp(-hzDepth(eye, dir, d, dens));
      return col * t + hzFogColor(dir) * (1.0 - t);
    }
  `;
}

/** The shared uniform. Add `hzP: hazeUniform` to a custom ShaderMaterial's uniforms if it does not merge UniformsLib.fog. */
export const hazeUniform = { value: new Float32Array(16) };

let installed = null;

/**
 * Install the haze into three's shader chunks (global, once per page). Returns the controller.
 * @param {object} [o]
 * @param {THREE.Vector3|number[]} [o.sunDir] unit vector toward the sun disc (tints the haze). Default: Hezarfen's dawn sun.
 * @param {THREE.Vector3|number[]} [o.lightDir] unit vector the directional light comes from (cloud shadows). Default: sunDir's
 *   azimuth at Hezarfen's light elevation (21 degrees).
 * @param {Partial<import('./haze-math.js').HazeLook>} [o.look] overrides of the DAWN look
 * @param {number} [o.metresPerUnit] 1 if your world is in metres. 10 makes a small scene hazy like a big one.
 * @param {boolean} [o.cloudShadows] dim directional light under drifting cloud patches (default true)
 * @param {boolean} [o.clampBright] firefly clamp at look.maxRadiance before the haze (default true)
 */
export function installHaze(o = {}) {
  const look = makeLook(o.look);
  const metresPerUnit = o.metresPerUnit ?? 1;
  const sun = toVec3(o.sunDir ?? dirFromAngles(DAWN_SUN.azimuthDeg, DAWN_SUN.elevationDeg));
  const light = toVec3(o.lightDir ?? lightFromSun(sun));
  const cloudShadows = o.cloudShadows ?? true;
  const clampBright = o.clampBright ?? true;
  if (installed) console.info('meticulai-haze: installHaze called again; materials compiled before keep the old sun direction.');
  packHaze(look, metresPerUnit, hazeUniform.value);

  // every built-in material and every ShaderMaterial that merges UniformsLib.fog gets the live haze array
  THREE.UniformsLib.fog.hzP = hazeUniform;
  for (const k in THREE.ShaderLib) THREE.ShaderLib[k].uniforms.hzP = hazeUniform;
  const bankScale = `const float HZ_BANK_SCALE = ${f(metresPerUnit)};`;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
    #ifdef USE_FOG
      varying vec3 vFogWorldPos;
    #endif`;
  // world position from the view-space position: works with instancing, skinning, batching, sprites and points
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
    #ifdef USE_FOG
      vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
    #endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
    #ifdef USE_FOG
      varying vec3 vFogWorldPos;
      uniform vec3 fogColor;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear;
        uniform float fogFar;
        const float fogDensity = 1.0;
      #endif
      ${bankScale}
      ${hazeGLSL(sun)}
      // drifting cloud shadows on the sunlight. Time arrives in fogColor.r (the haze has its own colours).
      const vec3 HZ_LIGHT = vec3(${f(light.x)}, ${f(light.y)}, ${f(light.z)});
      float hzCloudShadow(vec3 wp) {
        vec2 p = (wp.xz - HZ_LIGHT.xz / HZ_LIGHT.y * wp.y) * hzP[3].x + fogColor.r * vec2(-0.014, 0.011);
        float n = hzNoise(p) * 0.62 + hzNoise(p * 2.3 + 7.1) * 0.28 + hzNoise(p * 5.3 + 3.7) * 0.1;
        return mix(hzP[3].y, 1.0, smoothstep(0.36, 0.6, n));
      }
    #endif`;
  // sunlight is dimmed by the cloud shadows wherever the haze is on (every world material)
  if (cloudShadows && !THREE.ShaderChunk.lights_fragment_begin.includes('hzCloudShadow')) {
    const hook = 'getDirectionalLightInfo( directionalLight, directLight );';
    if (!THREE.ShaderChunk.lights_fragment_begin.includes(hook)) {
      console.warn('meticulai-haze: this three.js version changed lights_fragment_begin; cloud shadows are off.');
    } else {
      THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
        hook,
        `${hook}
		#ifdef USE_FOG
		directLight.color *= hzCloudShadow( vFogWorldPos );
		#endif`,
      );
    }
  }
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
    #ifdef USE_FOG
      ${clampBright ? '// firefly clamp: one sun glint on a mirror-smooth surface would otherwise bloom into a white blob\n      gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(hzP[3].z));' : ''}
      gl_FragColor.rgb = hzApplyBanked(gl_FragColor.rgb, cameraPosition, vFogWorldPos, fogDensity, fogColor.r);
    #endif`;

  installed = {
    look,
    sunDir: sun,
    lightDir: light,
    metresPerUnit,
    /** the 16 live floats (same object every shader reads) */
    params: hazeUniform.value,
    uniform: hazeUniform,
    /** re-pack after editing `look` (or pass overrides); every material updates on the next frame */
    sync(overrides) {
      if (overrides) Object.assign(look, overrides);
      packHaze(look, this.metresPerUnit, hazeUniform.value);
    },
    /** GLSL for custom shaders: hzFogColor(dir), hzDepth(eye, dir, d, dens), hzApply(col, eye, worldPos, dens) */
    chunk: () => `${bankScale}\n${hazeGLSL(sun)}`,
    /** call every frame: drives the drifting banks and cloud shadows (time goes through scene.fog.color.r) */
    update(scene, time) {
      if (scene.fog) scene.fog.color.setRGB(time % 20000, 0, 0);
    },
  };
  return installed;
}

/** GLSL for a custom shader (after installHaze). Declares `uniform vec4 hzP[4]`; give the material `hzP: hazeUniform`. */
export const hazeChunk = () => {
  if (!installed) throw new Error('meticulai-haze: call installHaze() before hazeChunk()');
  return installed.chunk();
};

/** The light direction Hezarfen used: the sun's azimuth, but from 21 degrees up instead of the disc's 2.6. */
export function lightFromSun(sun, elevationDeg = DAWN_SUN.lightElevationDeg) {
  const s = toVec3(sun);
  const h = Math.hypot(s.x, s.z) || 1;
  const el = (elevationDeg * Math.PI) / 180;
  return new THREE.Vector3((s.x / h) * Math.cos(el), Math.sin(el), (s.z / h) * Math.cos(el));
}

function toVec3(v) {
  return (v.isVector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2])).normalize();
}
