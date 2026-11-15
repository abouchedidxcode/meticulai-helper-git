// Look: Ink. The game redrawn as a pen-and-ink illustration on paper: outlines wherever the shape or depth
// breaks, lines that "boil" a little like hand-drawn animation, hatching in the shadows, paper grain and soft
// dark corners. Works on any game without touching the game's code.
//
// This is the kit's block meticulai-ink-illustration (its real post pass), with the ink and paper colours taken
// from palette.json: ink is a dark version of `shadow`, paper a pale version of `light`.
// What the block adds if you build with it: three-tone "toon" materials that make it read even more as a drawing,
// ink bleeding in when hurt, and colour sets that cross-fade (levels, time of day).

import * as THREE from 'three';
import { createInkPost } from '../../vendor/meticulai-ink-illustration/src/ink-post.js';
import { announce, createPass, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'ink', name: 'Ink' };

const OPTIONS = {
  lines: { default: 0.92, min: 0, max: 1, label: 'Lines', help: 'How strongly outlines are inked.' },
  hatching: { default: 1, min: 0, max: 2, label: 'Hatching', help: 'Pen strokes in the shadows. 0 = none.' },
  hatchFrom: { default: 0.15, min: 0.02, max: 0.5, label: 'Hatch from', help: 'How dark a place must be before it gets hatched. Higher = more hatching.' },
  wobble: { default: 2.6, min: 0, max: 6, step: 0.1, label: 'Line wobble', help: 'How much the lines shake, in pixels. 0 = still, ruled lines.' },
  paper: { default: 0.18, min: 0, max: 0.6, label: 'Paper tint', help: 'How much the paper colour soaks into the picture.' },
  grain: { default: 1, min: 0, max: 2, label: 'Paper grain' },
  vignette: { default: 0.2, min: 0, max: 0.6, label: 'Dark corners' },
};

// Glows, sparks and other see-through things would otherwise be outlined as solid shapes.
const noOutline = (obj) => {
  if (obj.isPoints || obj.isSprite || obj.isLine) return true;
  const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
  return !!m && m.transparent === true && m.depthWrite === false;
};

export function installLook({ view, look }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const ink = createInkPost(renderer, {
    ink: look.shade(look.shadow, -0.5),
    paper: look.mix(look.shade(look.light, 0.6), '#fff4e0', 0.4),
    maxPixelRatio: 1.5,
  });
  // The block draws light values; this last pass turns them into screen colours the way the starter does.
  const drawn = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
  const toScreen = createPass(renderer, /* glsl */ `void main() { gl_FragColor = vec4(toDisplay(texture2D(tColor, vUv).rgb), 1.0); }`);
  const size = new THREE.Vector2();
  const hidden = [];
  let dt = 0;

  return {
    update(step) {
      dt += step;
    },
    render(_renderer, scene, camera) {
      ink.set({
        edgeStrength: o.lines,
        hatch1: 0.42 * o.hatching,
        hatch2: 0.5 * o.hatching,
        hatchLevel: o.hatchFrom,
        wobble: o.wobble,
        paperMix: o.paper,
        grain: o.grain,
        vignette: 1 - o.vignette,
        // lines and hatching thin out with distance; scaled to how far this game's camera sees
        fadeNear: camera.far * 0.2,
        fadeFar: camera.far * 0.8,
      });
      const pr = Math.min(renderer.getPixelRatio(), 1.5);
      renderer.getSize(size);
      const w = Math.max(1, Math.floor(size.x * pr));
      const h = Math.max(1, Math.floor(size.y * pr));
      if (drawn.width !== w || drawn.height !== h) drawn.setSize(w, h);

      // While the block draws its outline pass (the scene in one flat material), hide what should have no outline.
      const before = scene.onBeforeRender;
      const after = scene.onAfterRender;
      scene.onBeforeRender = function (...args) {
        before.apply(this, args);
        if (!scene.overrideMaterial) return;
        scene.traverseVisible((obj) => {
          if (noOutline(obj)) hidden.push(obj);
        });
        for (const obj of hidden) obj.visible = false;
      };
      scene.onAfterRender = function (...args) {
        for (const obj of hidden) obj.visible = true;
        hidden.length = 0;
        after.apply(this, args);
      };
      const prev = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(drawn);
        ink.render(scene, camera, dt);
      } finally {
        scene.onBeforeRender = before;
        scene.onAfterRender = after;
        renderer.setRenderTarget(prev);
      }
      dt = 0;
      toScreen.render({ source: drawn.texture });
    },
    dispose() {
      ink.dispose();
      drawn.dispose();
      toScreen.dispose();
    },
  };
}
