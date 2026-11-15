// Look: Pixels. The game is drawn small and blown up with crisp square pixels. Optionally every pixel is snapped
// to a short list of colours made from palette.json (each role in a few shades), with ordered dithering between
// them, the way pixel art is coloured. A pass over the picture: works on any game, no game code changes.
//
// The ordered (Bayer) dither is the one in the kit's block meticulai-pixel-3d. That block is the full version:
// true pixel art (a camera snapped to whole pixels, objects lit through hand-made colour ramps, sprites drawn in
// code), which needs the game built for it.

import { announce, createBuffer, createPass, createStage, displayColor, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'pixel', name: 'Pixels' };

const OPTIONS = {
  rows: { default: 180, min: 90, max: 360, step: 2, label: 'Rows', help: 'How many pixel rows tall the picture is. Fewer = bigger pixels.' },
  usePalette: { default: true, label: 'Palette colours only', help: 'Snap every pixel to colours made from palette.json.' },
  dither: { default: 0.6, min: 0, max: 1.5, label: 'Dither', help: 'Checker patterns between neighbouring colours. 0 = hard bands.' },
  levels: { default: 12, min: 2, max: 32, step: 1, label: 'Colour steps', help: 'Used when "Palette colours only" is off: steps per colour channel.' },
};

const MAX_COLOURS = 72;

const QUANT = /* glsl */ `
uniform vec3 uPal[${MAX_COLOURS}];
uniform int uPalN;
uniform float uUsePal, uDither, uLevels;
// 4x4 ordered dither threshold in (0, 1) (from meticulai-pixel-3d)
float bayer4(vec2 px) {
  vec2 p = mod(floor(px), 4.0);
  int i = int(p.x) + int(p.y) * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}
void main() {
  vec3 c = toDisplay(texture2D(tColor, vUv).rgb);
  float b = bayer4(gl_FragCoord.xy) - 0.5;
  if (uUsePal > 0.5) {
    vec3 q = c + b * uDither * 0.16;
    float best = 1e9;
    vec3 pick = c;
    for (int i = 0; i < ${MAX_COLOURS}; i++) {
      if (i >= uPalN) break;
      vec3 d = q - uPal[i];
      float dist = dot(d * d, vec3(0.3, 0.5, 0.2)) + 0.6 * pow(luma(q) - luma(uPal[i]), 2.0);
      if (dist < best) { best = dist; pick = uPal[i]; }
    }
    c = pick;
  } else {
    float steps = max(uLevels - 1.0, 1.0);
    c = floor(clamp(c, 0.0, 1.0) * steps + 0.5 + b * uDither) / steps;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// Enlarge with square pixels whose edges stay sharp at any window size (no shimmering rows).
const BLOWUP = /* glsl */ `
void main() {
  vec2 p = vUv * uSrcRes;
  vec2 seam = floor(p + 0.5);
  vec2 perPx = uSrcRes / uRes;
  p = seam + clamp((p - seam) / perPx, -0.5, 0.5);
  gl_FragColor = vec4(texture2D(tColor, p / uSrcRes).rgb, 1.0);
}`;

/** The colour list: every role in four shades (toward the palette's shadow and light), plus the sky and the fog. */
function paletteColours(look) {
  const out = new Set();
  const ramp = (c) => {
    out.add(look.mix(c, look.shade(look.shadow, -0.35), 0.62));
    out.add(look.mix(c, look.shadow, 0.3));
    out.add(c);
    out.add(look.mix(c, look.shade(look.light, 0.35), 0.38));
  };
  for (const c of [...look.base, ...look.accent, look.danger, look.player]) ramp(c);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) out.add(look.mix(look.sky.top, look.sky.horizon, t));
  for (const t of [0.35, 0.7]) out.add(look.mix(look.sky.horizon, look.sky.sun, t));
  out.add(look.sky.below);
  out.add(look.lighting.fog);
  out.add(look.mix(look.lighting.fog, look.sky.horizon, 0.5));
  out.add(look.shadow);
  out.add(look.shade(look.shadow, -0.55));
  out.add(look.light);
  out.add(look.shade(look.light, 0.6));
  return [...out].slice(0, MAX_COLOURS).map(displayColor);
}

export function installLook({ view, look }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const stage = createStage(renderer, { samples: 0, depth: false, rows: () => o.rows, nearest: true });
  const small = createBuffer();
  const colours = paletteColours(look);
  const pal = Array.from({ length: MAX_COLOURS }, (_, i) => colours[i] ?? colours[0]);
  const quant = createPass(renderer, QUANT, {
    uPal: { value: pal }, uPalN: { value: colours.length }, uUsePal: { value: 1 }, uDither: { value: 0.6 }, uLevels: { value: 12 },
  });
  const blowup = createPass(renderer, BLOWUP);
  return {
    render(_renderer, scene, camera) {
      quant.uniforms.uUsePal.value = o.usePalette ? 1 : 0;
      quant.uniforms.uDither.value = o.dither;
      quant.uniforms.uLevels.value = o.levels;
      stage.render(scene, camera);
      if (small.width !== stage.width || small.height !== stage.height) small.setSize(stage.width, stage.height);
      quant.render({ source: stage, target: small });
      blowup.render({ source: small.texture });
    },
    dispose() {
      stage.dispose();
      small.dispose();
      quant.dispose();
      blowup.dispose();
    },
  };
}
