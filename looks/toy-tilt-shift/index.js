// Look: Toy (tilt-shift). The game photographed like a miniature on a table: a sharp band across the frame
// through whatever is in the middle, everything above and below melting into soft blur, a filmic grade with a
// little more colour, a faint glow on bright things, grain and darker corners. Works on any game, no game code
// changes.
//
// This is the kit's block meticulai-tilt-shift-macro (its real lens, at "medium" quality). The block wants to be
// told what to focus on; this look works that out by itself: it reads how far away the thing in the middle of the
// sharp band is, a few times a second, and focuses there.
// What the block adds if you build with it: focus on your own subject, shots (flyover, podium, diorama...), ambient
// occlusion, a night grade, flashes, and quality that steps down by itself on slow machines.
//
// In flat 2D games (an orthographic camera, like the platformer starter) only the band blur works: there is no
// depth to blur by, so "Depth blur" does nothing there.
//
// While this look is on it draws at most 1.25 pixels per screen pixel and does its own tone mapping (AgX), so
// colours are a touch softer than the plain starter's. Both go back when the look is removed.

import * as THREE from 'three';
import { TiltShiftLens } from '../../vendor/meticulai-tilt-shift-macro/src/lens.js';
import { announce, createPass, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'toy-tilt-shift', name: 'Toy (tilt-shift)' };

const OPTIONS = {
  blur: { default: 1.2, min: 0, max: 2, label: 'Blur', help: 'How strongly the top and bottom of the picture melt away. 0 = off.' },
  band: { default: -0.15, min: -0.8, max: 0.8, label: 'Sharp band height', help: 'Where the sharp band sits: -1 bottom of the screen, 0 middle, 1 top.' },
  bandWidth: { default: 0.16, min: 0.04, max: 0.6, label: 'Sharp band width' },
  depthBlur: { default: 0.6, min: 0, max: 4, step: 0.05, label: 'Depth blur', help: 'Extra blur for things nearer or further than the focus.' },
  grain: { default: 0.03, min: 0, max: 0.12, step: 0.002, label: 'Grain' },
  vignette: { default: 0.5, min: 0, max: 1, label: 'Dark corners' },
};

// Reads the distance to whatever is in the sharp band (the nearest of five points), packed into one 8-bit pixel.
const PROBE = /* glsl */ `
uniform float uBandY;
void main() {
  float z = 1e9;
  for (int i = 0; i < 5; i++) {
    vec2 o = i == 0 ? vec2(0.0) : i == 1 ? vec2(0.04, 0.0) : i == 2 ? vec2(-0.04, 0.0) : i == 3 ? vec2(0.0, 0.05) : vec2(0.0, -0.05);
    z = min(z, viewZ(vec2(0.5, uBandY) + o));
  }
  float t = clamp(log(max(z, uNear) / uNear) / log(uFar / uNear), 0.0, 1.0) * 255.0;
  gl_FragColor = vec4(floor(t) / 255.0, fract(t), 0.0, 1.0);
}`;

export function installLook({ view }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const before = { toneMapping: renderer.toneMapping, pixelRatio: renderer.getPixelRatio() };
  renderer.toneMapping = THREE.NoToneMapping; // the lens grades and tone-maps the picture itself
  const probe = createPass(renderer, PROBE, { uBandY: { value: 0.5 } });
  const probeTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const pixel = new Uint8Array(4);
  let lens = null;
  let focus = 0;
  let reading = false;
  let frame = 0;
  let dt = 0;
  let settled = false;

  function readFocus(camera) {
    probe.uniforms.uBandY.value = o.band * 0.5 + 0.5;
    probe.render({ source: lens.sceneRT.texture, depth: lens.sceneRT.depthTexture, target: probeTarget, camera });
    reading = true;
    const near = camera.near, far = camera.far;
    renderer.readRenderTargetPixelsAsync(probeTarget, 0, 0, 1, 1, pixel).then(() => {
      const t = (pixel[0] + pixel[1] / 255) / 255;
      const z = near * Math.pow(far / near, t);
      if (z < far * 0.6) focus = z; // the sky is not a subject: keep the last focus
    }).catch(() => {}).finally(() => { reading = false; });
  }

  return {
    update(step) {
      dt += step;
    },
    resize(w, h) {
      lens?.setSize(w, h);
    },
    render(_renderer, scene, camera) {
      if (!lens) {
        lens = new TiltShiftLens(renderer, scene, camera, { quality: 'medium', autoQuality: false, adaptive: false });
        lens.setSize(view.width || 1, view.height || 1);
        focus = Math.min(12, camera.far * 0.1);
      }
      lens.scene = scene;
      lens.camera = camera;
      lens.exposure = renderer.toneMappingExposure;
      lens.gradeMat.uniforms.uVignette.value = o.vignette;
      lens.opts.grain = o.grain;
      // A flat (orthographic) camera has no "further away": the lens's depth maths assumes a perspective camera and
      // would blur everything. There only the band blur is used (sharp across the middle, soft above and below).
      const flat = !!camera.isOrthographicCamera;
      lens.setFocusDistance(focus, flat ? 0 : o.depthBlur);
      lens.setTiltShift(o.band, o.bandWidth, o.blur, { roll: 0, up: 0.9, down: 0.5 });
      if (!settled) {
        lens.settle();
        settled = true;
      }
      lens.render(dt);
      dt = 0;
      if (!flat && !reading && frame++ % 6 === 0) readFocus(camera);
    },
    dispose() {
      lens?.dispose();
      probe.dispose();
      probeTarget.dispose();
      renderer.toneMapping = before.toneMapping;
      renderer.setPixelRatio(before.pixelRatio);
      if (view.width && view.height) renderer.setSize(view.width, view.height, false);
    },
  };
}
