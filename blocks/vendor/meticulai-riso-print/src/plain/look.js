// The plain look: the same roles as lit, shadowed three.js materials. It exists to prove the switch (and as a
// fallback, or a "clean" option in settings). Each role keeps its riso colour meaning: a role's colour is what
// its inks would overprint to at mid shade, so ENEMY is still pink and PICKUP still yellow.
// Replace it with your own photographic or toon look: keep the same mat() and view interface.
import * as THREE from 'three';
import { INK, PALETTES, ROLE_COVERAGE, overprint } from '../riso/inks.js';

/** @param {{ palette?: object, sky?: number|string, exposure?: number }} [o] */
export function createPlainLook({ palette = PALETTES.classic, sky = null, exposure = 1.0 } = {}) {
  const cache = new Map();
  const colorOf = (id) => {
    const [r, g, b] = overprint(ROLE_COVERAGE[id] || [0.3, 0, 0], palette);
    return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  };

  function mat(id, mode = 0, glow = 0, side = THREE.FrontSide) {
    const key = `${id}|${mode}|${glow}|${side}`;
    let m = cache.get(key);
    if (m) return m;
    if (id === INK.SKY) {
      m = new THREE.MeshBasicMaterial({ color: sky ?? colorOf(id), side, fog: false, depthWrite: false });
    } else {
      m = new THREE.MeshStandardMaterial({
        color: colorOf(id),
        roughness: id === INK.GLASS || id === INK.PICKUP ? 0.3 : 0.75,
        side,
        emissive: glow > 0 ? colorOf(id) : 0x000000,
        emissiveIntensity: glow,
      });
    }
    cache.set(key, m);
    return m;
  }

  function createView(renderer) {
    return {
      renderer,
      fx: {}, // the plain look ignores the print signals; add your own grade if you need them
      activate() {
        renderer.autoClear = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = exposure;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.resize(this.width, this.height);
      },
      resize(w = window.innerWidth, h = window.innerHeight) {
        renderer.setSize(w, h, false);
        this.width = w; this.height = h;
      },
      setPixelRatio(px) { renderer.setPixelRatio(px); },
      setPalette() {},
      tickPalette() {},
      render(scene, camera, vmScene, vmCamera) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        if (vmScene) {
          renderer.autoClear = false;
          renderer.clearDepth();
          renderer.render(vmScene, vmCamera);
          renderer.autoClear = true;
        }
      },
    };
  }

  return { mat, createView };
}
