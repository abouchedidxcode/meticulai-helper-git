// Riso print look, with a live look switch. Entry point.
//
//   import { createLookSwitch, risoLook, createPlainLook, INK, MODE, skyDome } from '.../src/index.js';
//   const looks = createLookSwitch({ looks: { riso: risoLook(), plain: createPlainLook() }, renderer });
//   mesh.material = looks.mat(INK.WALL, MODE.WOOD);
//   scene.add(skyDome(looks));
//   looks.view.render(scene, camera);
import * as THREE from 'three';
import { mat } from './riso/materials.js';
import { RisoView } from './riso/renderer.js';
import { INK, MODE } from './riso/inks.js';

export { createLookSwitch, pickLook } from './look-switch.js';
export { INK, MODE, PALETTES, easePalette, overprint, ROLE_COVERAGE } from './riso/inks.js';
export { mat as risoMat, decalMat, vmMaterial, inkUniforms } from './riso/materials.js';
export { RisoView } from './riso/renderer.js';
export { createPlainLook } from './plain/look.js';

/** The riso look for createLookSwitch. `viewOptions` go to RisoView (palette, fade, maxPixelRatio...). */
export function risoLook(viewOptions = {}) {
  return {
    mat,
    createView: (renderer) => new RisoView({ ...viewOptions, renderer }),
  };
}

/**
 * The sky as a role: a big inside-out sphere. In riso it prints pale dots, horizon bands and the sun disc
 * (direction: inkUniforms.uSunDir). Centred on the world origin; keep the radius under camera.far.
 * @param {{ mat: Function }} looks  a look switch (or any object with mat())
 */
export function skyDome(looks, radius = 320) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 20), looks.mat(INK.SKY, MODE.SKY, 0, THREE.BackSide));
  m.name = 'skyDome';
  m.frustumCulled = false;
  return m;
}
