// The cel-shaded materials Pop Quiz draws under its ink: three.js MeshToonMaterial with a hard three-step
// light ramp (dark 70, mid 150, lit 255 of 255). Three flat tones read like an inked and flatted drawing;
// the shadows fall into the darkest step, which is where the post-process hatches.
import * as THREE from 'three';

/** @type {Map<string, THREE.DataTexture>} */
const ramps = new Map();

/** A shared step-ramp texture (steps 0..255; default Pop Quiz's [70, 150, 255]). */
export function toonRamp(steps = [70, 150, 255]) {
  const key = steps.join();
  let tex = ramps.get(key);
  if (!tex) {
    tex = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    ramps.set(key, tex);
  }
  return tex;
}

/**
 * A toon material on the ink ramp. Takes any MeshToonMaterial parameters (color, vertexColors, emissive...).
 * MeshToonMaterial has no flatShading in three 0.187 (it warns and ignores it).
 * @param {THREE.MeshToonMaterialParameters} [opts]
 * @param {number[]} [steps] ramp steps 0..255 (default [70, 150, 255])
 */
export function inkToon(opts = {}, steps) {
  return new THREE.MeshToonMaterial({ gradientMap: toonRamp(steps), ...opts });
}
