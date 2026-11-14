// Painterly styles: three switchable art styles for an ordinary three.js scene (from Kite Race by Meticulai).
//
//   gouache    "Painterly": a picture-book painting (Kuwahara brush sized by distance, pigment at stroke edges,
//              paper tooth, warm light / cool shade, the distance melting into a painted sky)
//   miniature  an ink-outlined miniature painting (flat jewel palette, ink from depth, paper, ruled border)
//   clean      calm toon (two-step light ramp, pastel layered fog, very soft outlines)
//   none       "Classic": your scene as it was, with the same grade
//
// Switching is live: one shared uniform (uStyle) changes, no shader recompiles, no reload.
//
//   const styles = createPainterlyStyles(renderer, { storageKey: 'mygame.style' });
//   patchStyleScene(scene, kindOf);           // or patchStyleMaterial(mat, 'flat'|'hero'|'figure'|'textured'|'ground')
//   const sky = createStyleSky(); scene.add(sky);
//   styles.applyLook(BASE_LOOKS.golden, { sun, hemi, scene, sky });   // light, haze, sky, grade for the current style
//   every frame: styles.render(scene, camera, seconds);                // instead of renderer.render
//   settings:    styles.choose('miniature');                            // live, and remembered
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GradePass } from './grade.js';
import { StylePass } from './style-post.js';
import { STYLE_U, patchStyleMaterial, patchStyleScene, guessKind } from './patch-material.js';
import { createStyleSky } from './sky.js';
import {
  STYLES, STYLE_NAMES, STYLE_LABELS, STYLE_CHOICES, STYLE_DEFAULT, BASE_LOOKS, KINDS,
  parseStyle, startStyle, saveStyle, styleLook, styleId, nextStyle, sunDirection,
} from './styles.js';

export {
  STYLES, STYLE_NAMES, STYLE_LABELS, STYLE_CHOICES, STYLE_DEFAULT, BASE_LOOKS, KINDS, STYLE_U,
  parseStyle, startStyle, saveStyle, styleLook, styleId, nextStyle, sunDirection,
  patchStyleMaterial, patchStyleScene, guessKind, createStyleSky, GradePass, StylePass,
};

/** Kite Race's bloom (round 2): bright points stay points; the small mips carry the glow, the wide ones a trace. */
export const BLOOM = { factors: [1.0, 0.62, 0.3, 0.12, 0.05], radius: 0, threshold: 2.6, strength: 0.3 };

/**
 * @typedef {object} PainterlyOptions
 * @property {import('./styles.js').StyleName} [style]  start in this style (default: ?style=, else saved, else gouache)
 * @property {string} [storageKey]     where the player's choice is remembered (localStorage), default 'game.style'
 * @property {boolean} [remember]      read/write the choice in localStorage (default true)
 * @property {number} [samples]        MSAA samples of the scene target (default 4; 0 on weak GPUs)
 * @property {boolean} [bloom]         default true
 * @property {number} [fogDensityScale]  multiplies a Look's fogDensity for scene.fog (FogExp2). Default 1.
 * @property {number} [fogDistanceScale] how far the styles' haze thinks things are, per your unit (Kite Race: 1 = metres
 *                                     in a 4 km city; a 150 m scene looks right at ~8). Default 1.
 */

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {PainterlyOptions} [opts]
 */
export function createPainterlyStyles(renderer, opts = {}) {
  const storageKey = opts.storageKey ?? 'game.style';
  const remember = opts.remember ?? true;
  const storage = remember && typeof localStorage !== 'undefined' ? localStorage : null;
  const search = typeof location !== 'undefined' ? location.search : '';
  const fogDensityScale = opts.fogDensityScale ?? 1;
  STYLE_U.uStyleFogScale.value = opts.fogDistanceScale ?? 1;

  renderer.toneMapping = THREE.NoToneMapping; // the grade pass tone-maps and converts to sRGB itself

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: opts.samples ?? 4,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });
  const ldrRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, depthBuffer: false });
  const grade = new GradePass();
  const stylePass = new StylePass();
  let bloom = null;
  if (opts.bloom ?? true) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    const bf = bloom.compositeMaterial.uniforms.bloomFactors.value;
    for (let i = 0; i < bf.length; i++) bf[i] = BLOOM.factors[i] ?? bf[i];
    // the bloom is added inside the grade pass (before exposure), not blended over the scene by its own pass
    bloom.blendMaterial.visible = false;
  }

  /** @type {import('./styles.js').StyleName} */
  let current = 'none';
  /** @type {null | { look: import('./styles.js').Look, targets: any }} */
  let lastLook = null;
  const listeners = new Set();

  const api = {
    sceneTarget: sceneRT,
    grade,
    stylePass,
    bloom,
    uniforms: STYLE_U,
    /** the current style's name */
    get style() { return current; },
    /** the current style's table (null in 'none') */
    get def() { return current === 'none' ? null : STYLES[current]; },
    /** Switch live, this page only (not remembered). Re-applies the last look with the new style's overrides. */
    setStyle(name) {
      const n = parseStyle(name) ?? 'none';
      const changed = n !== current;
      current = n;
      STYLE_U.uStyle.value = styleId(n);
      const d = api.def;
      grade.uniforms.grain.value = d ? 0 : 0.024;
      grade.uniforms.vignette.value = d ? d.vignette : 0.5;
      if (lastLook) api.applyLook(lastLook.look, lastLook.targets);
      if (changed) for (const fn of listeners) fn(n);
      return n;
    },
    /** The settings menu's choice: switch live and remember it. */
    choose(name) {
      const n = api.setStyle(name);
      if (remember) saveStyle(n, { storage, storageKey });
      return n;
    },
    /** Be told when the style changes (e.g. to switch your own AO pass with `def.noAO`). Returns an unsubscribe. */
    onStyle(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /**
     * Apply a Look with the current style's overrides: the sun (colour, intensity), hemisphere light, scene.fog
     * (FogExp2), the sky dome's uniforms, the haze's sun tint and the grade. Any target may be left out.
     * @param {import('./styles.js').Look} base
     * @param {{ sun?: THREE.DirectionalLight, hemi?: THREE.HemisphereLight, scene?: THREE.Scene, sky?: THREE.Mesh, ahead?: [number,number,number] }} [targets]
     */
    applyLook(base, targets = {}) {
      lastLook = { look: base, targets };
      const look = styleLook(base, current);
      const { sun, hemi, scene, sky } = targets;
      if (sun) { sun.color.set(look.sunColor); sun.intensity = look.sunIntensity; }
      if (hemi) { hemi.color.set(look.hemiSky); hemi.groundColor.set(look.hemiGround); hemi.intensity = look.hemiIntensity; }
      if (scene) {
        if (scene.fog && /** @type {any} */ (scene.fog).isFogExp2) {
          scene.fog.color.set(look.fog);
          /** @type {THREE.FogExp2} */ (scene.fog).density = look.fogDensity * fogDensityScale;
        } else scene.fog = new THREE.FogExp2(look.fog, look.fogDensity * fogDensityScale);
      }
      const dir = sunDirection(look.sunElev, look.sunAz, targets.ahead);
      STYLE_U.uStSunDir.value.set(dir[0], dir[1], dir[2]);
      STYLE_U.uStFogSun.value.set(look.fogSun);
      STYLE_U.uNight.value = look.night ?? 0;
      if (sky) {
        const u = /** @type {THREE.ShaderMaterial} */ (sky.material).uniforms;
        u.uSunDir.value.set(dir[0], dir[1], dir[2]);
        u.uZenith.value.set(look.zenith); u.uHorizon.value.set(look.horizon); u.uSunGlow.value.set(look.sunGlow);
        u.uCloudLit.value.set(look.cloudLit); u.uCloudShade.value.set(look.cloudShade);
        u.uFogColor.value.set(look.fog); u.uFogSun.value.set(look.fogSun);
        u.uSunDisk.value = look.sunDisk; u.uCloudCover.value = look.cloudCover;
        u.uFogDensity.value = look.fogDensity;
      }
      grade.setFromLook(look);
      return look;
    },
    /** Resize the targets (call from your resize handler, after renderer.setSize). */
    setSize() {
      renderer.getDrawingBufferSize(size);
      sceneRT.setSize(size.x, size.y);
      ldrRT.setSize(size.x, size.y);
      grade.setSize(size.x, size.y);
      stylePass.setSize(size.x, size.y);
      bloom?.setSize(size.x, size.y);
    },
    /**
     * Draw a frame: scene -> HDR target (+ depth) -> bloom -> grade -> (style pass) -> screen. Replaces renderer.render.
     * @param {THREE.Scene} scene @param {THREE.PerspectiveCamera} camera @param {number} [time] seconds
     */
    render(scene, camera, time = 0) {
      const cur = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (cur.x !== size.x || cur.y !== size.y) api.setSize();
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);
      const d = api.def;
      if (bloom) {
        bloom.strength = BLOOM.strength * (d ? d.bloom : 1);
        bloom.render(renderer, null, sceneRT, 0, false);
        grade.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
        grade.uniforms.bloomOn.value = 1;
      } else grade.uniforms.bloomOn.value = 0;
      grade.uniforms.time.value = time;
      if (!d) {
        grade.render(renderer, sceneRT.texture, null);
      } else {
        grade.render(renderer, sceneRT.texture, ldrRT);
        stylePass.render(renderer, ldrRT.texture, sceneRT.depthTexture, camera, null, time);
      }
      renderer.setRenderTarget(null);
    },
    /** Compile every shader now (all styles share one program per material, so this covers switching too). */
    warmUp(scene, camera) {
      renderer.setRenderTarget(sceneRT);
      renderer.compile(scene, camera);
      renderer.setRenderTarget(null);
    },
    dispose() {
      sceneRT.dispose(); sceneRT.depthTexture?.dispose(); ldrRT.dispose();
      grade.dispose(); stylePass.dispose(); bloom?.dispose();
    },
  };

  api.setStyle(opts.style ?? startStyle({ search, storage, storageKey }));
  api.setSize();
  return api;
}
