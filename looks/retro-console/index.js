// Look: Retro console. The picture of a mid-90s 3D console: drawn 240 rows tall and blown up with hard pixels,
// few colour steps with a 4x4 dither pattern, a little grain and dark corners, and (optional) corners of
// objects that snap to the pixel grid, so shapes wobble slightly as they move.
//
// From the kit's block meticulai-ps1-look: the dither, colour steps, grain and vignette are its post pass, and the
// wobble is its real material patch (patchPS1Material), put on the game's ordinary materials as they appear. The
// block's own pipeline is not used because it has no tone mapping (the starter's light needs it) and a fixed
// horror colour grade; here the colours stay the palette's.
// What the full block adds if you build with it: textures that warp like the real thing on your own models,
// 4:3 letterbox, eyes-closed, flash, shake and "dread" screen effects.
//
// Wobble changes the game's materials (it adds a few lines to their shaders). Things drawn with their own
// special shaders (the sky, particles) are left alone. Turn Wobble off and they draw as before.

import { patchPS1Material, setPS1Affine, setPS1Resolution } from '../../vendor/meticulai-ps1-look/src/ps1-material.js';
import { announce, createPass, createStage, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'retro-console', name: 'Retro console' };

const OPTIONS = {
  rows: { default: 240, min: 120, max: 480, step: 8, label: 'Rows', help: 'How many pixel rows tall the picture is (240 is the classic).' },
  levels: { default: 24, min: 4, max: 64, step: 1, label: 'Colour steps', help: 'Steps per colour channel. Fewer = more banding and dither.' },
  dither: { default: 1, min: 0, max: 2, label: 'Dither', help: 'Strength of the 4x4 dither pattern.' },
  wobble: { default: true, label: 'Wobble', help: 'Corners snap to the pixel grid, so shapes jitter as they move.' },
  grain: { default: 0.04, min: 0, max: 0.2, step: 0.005, label: 'Grain' },
  vignette: { default: 0.3, min: 0, max: 1, label: 'Dark corners' },
};

const FRAG = /* glsl */ `
uniform float uLevels, uDither, uGrain, uVignette;
// Ordered dither: 0..15/16, stable per low-res pixel (from meticulai-ps1-look).
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  // everything lives in low-res pixel space so dither and grain are chunky and stable
  vec2 pix = floor(vUv * uSrcRes);
  vec2 suv = (pix + 0.5) / uSrcRes;
  vec3 c = toDisplay(texture2D(tColor, suv).rgb);
  float l = luma(c);
  vec2 d = (suv - 0.5) * vec2(uSrcRes.x / uSrcRes.y, 1.0);
  float r = length(d) / length(vec2(uSrcRes.x / uSrcRes.y, 1.0) * 0.5);
  c *= 1.0 - clamp(uVignette, 0.0, 1.0) * smoothstep(0.25, 1.0, r);
  // grain, re-rolled 24 times a second, weaker in deep black so shadows stay inky
  float g = hash12(pix + floor(uTime * 24.0) * vec2(37.0, 17.0)) - 0.5;
  c += g * uGrain * (0.2 + 0.8 * sqrt(clamp(l, 0.0, 1.0)));
  // ordered dither + colour steps per channel
  float steps = max(uLevels - 1.0, 1.0);
  float b = (bayer4(pix) - 0.5 + 1.0 / 32.0) * uDither;
  c = floor(clamp(c, 0.0, 1.0) * steps + 0.5 + b) / steps;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const canWobble = (m) => m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial || m.isMeshToonMaterial);

export function installLook({ view }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const stage = createStage(renderer, { samples: 0, depth: false, rows: () => o.rows, nearest: true });
  const pass = createPass(renderer, FRAG, { uLevels: { value: 24 }, uDither: { value: 1 }, uGrain: { value: 0.04 }, uVignette: { value: 0.3 } });
  setPS1Affine(0); // texture warping needs models cut into small pieces; off, so any game's textures stay whole
  let time = 0;
  let frame = 0;

  function patchNewMaterials(scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) if (canWobble(m)) patchPS1Material(m);
    });
  }

  return {
    update(dt) {
      time += dt;
    },
    render(_renderer, scene, camera) {
      stage.sync();
      if (o.wobble) {
        if (frame++ % 30 === 0) patchNewMaterials(scene);
        setPS1Resolution(stage.width, stage.height, 1);
      } else setPS1Resolution(65536, 65536, 1); // a grid this fine moves nothing
      const u = pass.uniforms;
      u.uLevels.value = o.levels;
      u.uDither.value = o.dither;
      u.uGrain.value = o.grain;
      u.uVignette.value = o.vignette;
      stage.render(scene, camera);
      pass.render({ source: stage, time });
    },
    dispose() {
      setPS1Resolution(65536, 65536, 1);
      stage.dispose();
      pass.dispose();
    },
  };
}
