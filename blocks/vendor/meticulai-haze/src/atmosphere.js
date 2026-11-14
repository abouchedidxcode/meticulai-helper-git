// Everything at once: the haze, the sky, a warm key + cool fill light rig and an environment map made from the sky.
// This is how Hezarfen sets up its whole outdoor look in one call. Use installHaze() alone if you want only the air.
import * as THREE from 'three';
import { installHaze, lightFromSun } from './haze.js';
import { createSky } from './sky.js';
import { cloudShadowAt, dirFromAngles, DAWN_SUN } from './haze-math.js';

/**
 * Call once, before any material is compiled (before the first render).
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {THREE.WebGLRenderer} o.renderer
 * @param {THREE.Vector3|number[]} [o.sunDir] toward the sun disc (default: Hezarfen's dawn, azimuth 132, elevation 2.6)
 * @param {THREE.Vector3|number[]} [o.lightDir] where light and shadows come from (default: same azimuth, 21 degrees up)
 * @param {Partial<import('./haze-math.js').HazeLook>} [o.look] overrides of the DAWN look
 * @param {number} [o.metresPerUnit] world units -> metres (default 1)
 * @param {THREE.Texture} [o.panorama] optional photographed sky (see sky.js); default procedural
 * @param {boolean} [o.lights] add the sun + hemisphere rig (default true)
 * @param {boolean} [o.shadows] the sun casts shadows (default true)
 * @param {number} [o.shadowSize] shadow map size (Hezarfen: 4096 high, 2048 medium)
 * @param {number} [o.shadowRadius] half-size of the shadow box in world units (Hezarfen: 520 for a city)
 * @param {number} [o.shadowDistance] how far the light sits from its target (Hezarfen: 2400)
 * @param {boolean} [o.environment] reflections from the sky itself (default true)
 * @param {boolean} [o.cloudShadows] drifting cloud shadows (default true)
 */
export function createHazeAtmosphere(o) {
  const { scene, renderer } = o;
  const sunIn = o.sunDir ?? dirFromAngles(DAWN_SUN.azimuthDeg, DAWN_SUN.elevationDeg);
  const haze = installHaze({
    sunDir: sunIn,
    lightDir: o.lightDir ?? lightFromSun(sunIn),
    look: o.look,
    metresPerUnit: o.metresPerUnit,
    cloudShadows: o.cloudShadows,
  });
  const { look, sunDir, lightDir } = haze;
  scene.fog = new THREE.FogExp2(0x000000, 1.0); // density is the live multiplier of the haze model

  const sky = createSky({ sunDir, look, panorama: o.panorama });
  scene.add(sky);

  let sun = null;
  let hemi = null;
  const shadowSize = o.shadowSize ?? 4096;
  const R = o.shadowRadius ?? 520;
  const lightDistance = o.shadowDistance ?? 2400;
  if (o.lights ?? true) {
    sun = new THREE.DirectionalLight(new THREE.Color(...look.sunColor), look.sunIntensity);
    sun.name = 'haze-sun';
    sun.castShadow = o.shadows ?? true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6 * (R / 520);
    const sc = sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
    sc.near = 50 * (lightDistance / 2400); sc.far = 4200 * (lightDistance / 2400);
    sun.position.copy(lightDir).multiplyScalar(lightDistance);
    scene.add(sun, sun.target);
    hemi = new THREE.HemisphereLight(new THREE.Color(...look.skyLight), new THREE.Color(...look.groundLight), look.hemiIntensity);
    hemi.name = 'haze-hemi';
    scene.add(hemi);
  }

  let envRT = null;
  if (o.environment ?? true) {
    // reflections: the sky itself, prefiltered (the sun disc scaled down to avoid fireflies)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = createSky({ sunDir, look, panorama: o.panorama });
    envSky.material.uniforms.uSunScale.value = 0.12;
    envScene.add(envSky);
    envRT = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = envRT.texture;
    scene.environmentIntensity = look.envIntensity;
    pmrem.dispose();
    envSky.geometry.dispose();
    envSky.material.dispose();
  }

  const texel = (2 * R) / shadowSize;
  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lightDir).normalize();
  const upv = new THREE.Vector3().crossVectors(lightDir, right).normalize();
  const L = [lightDir.x, lightDir.y, lightDir.z];
  let now = 0;

  return {
    haze, look, sunDir, lightDir, sun, hemi, sky,
    /** live: edit look's haze numbers, then sync() (or pass overrides) */
    sync: (overrides) => haze.sync(overrides),
    /** the haze's global thickness: 0 clear .. 1 as tuned .. 3 pea soup */
    get density() { return scene.fog.density; },
    set density(v) { scene.fog.density = v; },
    /** the same cloud shadow the shaders draw, on the CPU (0.6 under cloud .. 1 in sun) */
    cloudShadowAt: (x, y, z) => cloudShadowAt(haze.params, L, x, y, z, now),
    /**
     * Every frame. time: seconds (drives drifting banks and cloud shadows). focus: keeps the shadow box around a
     * point (the player, or ahead of them), snapped to shadow texels so shadows do not shimmer.
     */
    update(time, focus) {
      now = time;
      haze.update(scene, time);
      sky.material.uniforms.uTime.value = time;
      sky.material.uniforms.uDensity.value = scene.fog.density;
      if (sun && focus) {
        const a = Math.round(focus.dot(right) / texel) * texel;
        const b = Math.round(focus.dot(upv) / texel) * texel;
        const c = focus.dot(lightDir);
        tmp.copy(right).multiplyScalar(a).addScaledVector(upv, b).addScaledVector(lightDir, c);
        sun.target.position.copy(tmp);
        sun.position.copy(tmp).addScaledVector(lightDir, lightDistance);
        sun.target.updateMatrixWorld();
      }
    },
    dispose() {
      envRT?.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
    },
  };
}
