// Look: Soft haze. A calm, airy finish: a faint glow round bright things, soft shafts of light when the sun is in
// view, gentle contrast, a light sharpen, fine grain and softly darker corners. It never glares. Works on any
// game, no game code changes.
//
// This is the final picture pipeline of the kit's block meticulai-haze (its real grade pass, with its faint bloom
// and sun shafts). The sun's place comes from palette.json.
// What the full block adds if you build with it: the haze itself, in the air of the world (far things fading into
// a sun-tinted mist that lies in valleys), a sky that melts into it, drifting cloud shadows and a matching light rig.
// The starter's own fog (fogAmount in palette.json) is the simple version of that, and it works with this look.

import * as THREE from 'three';
import { createHazePost } from '../../vendor/meticulai-haze/src/grade.js';
import { announce, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'soft-haze', name: 'Soft haze' };

const OPTIONS = {
  glow: { default: 0.55, min: 0, max: 1, label: 'Glow', help: 'The halo round bright things. Keep it low: this look is restrained on purpose.' },
  glowFrom: { default: 0.75, min: 0.4, max: 3, step: 0.05, label: 'Glow from', help: 'How bright something must be before it glows. Lower = more of the picture glows.' },
  shafts: { default: 0.2, min: 0, max: 0.6, label: 'Sun shafts', help: 'Soft rays when the sun is in or near the frame.' },
  softness: { default: 0.6, min: 0, max: 1, label: 'Softness', help: 'Lower contrast and lifted shadows. 0 = crisp.' },
  grain: { default: 0.02, min: 0, max: 0.1, step: 0.002, label: 'Grain' },
  vignette: { default: 0.3, min: 0, max: 1, label: 'Dark corners' },
};

export function installLook({ view, look }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const before = { toneMapping: renderer.toneMapping };
  const sunDir = new THREE.Vector3();
  let post = null;
  let made = { scene: null, camera: null };
  let dt = 0;

  const fit = () => post?.setSize(view.width || 1, view.height || 1, Math.min(renderer.getPixelRatio(), 1.5));

  return {
    update(step) {
      dt += step;
    },
    resize: fit,
    render(_renderer, scene, camera) {
      if (!post || made.scene !== scene || made.camera !== camera) {
        post?.dispose();
        // 'aces' is the starter's own tone mapping, so the palette's colours stay as they were chosen
        post = createHazePost({ renderer, scene, camera, options: { exposure: renderer.toneMappingExposure, toneMap: 'aces', lift: 0 } });
        made = { scene, camera };
        fit();
      }
      const u = post.uniforms;
      post.bloomPass.strength = o.glow;
      post.bloomPass.threshold = o.glowFrom;
      post.rays.strength = o.shafts;
      u.uContrast.value = 1.08 - 0.3 * o.softness;
      u.uLift.value = 0.06 * o.softness;
      u.uSaturation.value = 1.04;
      u.uGrain.value = o.grain;
      u.uVignette.value = o.vignette;
      const s = look.sunDirection();
      post.updateSun(sunDir.set(s.x, s.y, s.z));
      post.render(dt);
      dt = 0;
    },
    dispose() {
      post?.dispose();
      renderer.toneMapping = before.toneMapping;
    },
  };
}
