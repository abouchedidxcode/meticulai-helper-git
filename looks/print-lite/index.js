// Look: Print (lite). The finished picture is "printed": flat colour on paper, with the shading carried by a
// screen of halftone dots in one dark ink, thin inked outlines, a plate that sits slightly off, uneven ink and
// paper grain. It is a pass over the picture, so it works on any game without touching the game's code.
//
// The halftone dot, the misregistration and the uneven ink follow the kit's block meticulai-riso-print. That block
// is the full version: every object prints in its own spot ink by ROLE, which needs the game to ask for its
// materials by role. This lite look keeps the game's own colours instead.
//
// Paper and ink come from palette.json: paper is a pale version of `light`, ink a dark version of `shadow`.

import { announce, createPass, createStage, displayColor, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'print-lite', name: 'Print (lite)' };

const OPTIONS = {
  dotSize: { default: 6.5, min: 3, max: 14, step: 0.1, label: 'Dot size', help: 'Size of the halftone dots, in pixels at 720p.' },
  ink: { default: 0.85, min: 0, max: 1, label: 'Ink', help: 'How dark the dots and lines print.' },
  flatten: { default: 0.8, min: 0, max: 1, label: 'Flat colour', help: 'How much shading is taken out of the colours and given to the dots.' },
  lines: { default: 0.7, min: 0, max: 1, label: 'Outlines', help: 'Inked outlines round things. 0 = none.' },
  misprint: { default: 1, min: 0, max: 4, step: 0.05, label: 'Misprint', help: 'How far the ink plate sits off the colour plate.' },
  grain: { default: 1, min: 0, max: 2, label: 'Paper grain', help: 'Paper texture and uneven ink.' },
};

const FRAG = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uDot, uInkAmt, uFlat, uLines, uMis, uGrain, uPx;

// classic AM halftone: a rotated grid of dots whose area follows the coverage (from meticulai-riso-print)
float dots(vec2 fc, float ang, float sc, float v) {
  v = clamp(v, 0.0, 1.0);
  if (v < 0.02) return 0.0;
  if (v > 0.98) return 1.0;
  float c = cos(ang), s = sin(ang);
  vec2 p = mat2(c, -s, s, c) * fc / sc;
  vec2 q = fract(p) - 0.5;
  float d = length(q);
  float r = sqrt(v) * mix(0.5642, 0.75, v * v);
  float aa = 0.9 / sc;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}
vec3 pic(vec2 uv) { return toDisplay(texture2D(tColor, uv).rgb); }
// an outline wherever the depth jumps (the same rule as the riso block), thinning with distance
float outline(vec2 uv) {
  vec2 px = 1.25 * uPx / uRes;
  float zc = viewZ(uv);
  if (zc > uFar * 0.9) return 0.0;
  float e = 0.0, nearD = zc;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
    float dn = viewZ(uv + o);
    if (abs(dn - zc) > 0.05 * min(dn, zc) + 0.05) e = 1.0;
    nearD = min(nearD, dn);
  }
  return e * (1.0 - 0.7 * smoothstep(uFar * 0.15, uFar * 0.6, nearD));
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  const float LEVEL = 0.5; // tones darker than this are printed as dots

  // the colour plate: the picture with its shading lifted out, a few flat steps, printed on the paper
  vec3 c = pic(vUv);
  float L = max(luma(c), 0.02);
  float lifted = mix(L, max(L, LEVEL), uFlat);
  float stepped = (floor(lifted * 5.0) + smoothstep(0.35, 0.65, fract(lifted * 5.0))) / 5.0;
  lifted = mix(lifted, stepped, 0.5 * uFlat);
  vec3 plate = clamp(c * (lifted / L), 0.0, 1.0);
  // very dark colours have little colour left to lift: let them lean to the paper's mid tone
  plate = mix(plate, vec3(lifted), 0.25 * uFlat * smoothstep(0.25, 0.0, L));
  plate *= uPaper;

  // the ink plate, a little out of register: dots for the shade, lines round things
  vec2 mis = vec2(1.3, -0.9) * uPx * uMis / uRes;
  float L2 = luma(pic(vUv + mis));
  float shade = clamp(1.0 - L2 / LEVEL, 0.0, 1.0);
  float d = dots(fc, 0.2618, uDot * uPx, pow(shade, 1.1) * 0.9 * uFlat);
  float cover = max(d, outline(vUv + mis) * uLines);
  float uneven = 1.0 - uGrain * 0.3 * vnoise(fc / (38.0 * uPx) + 7.0) - uGrain * 0.12 * hash12(floor(fc / uPx));
  cover *= uInkAmt * clamp(uneven, 0.0, 1.0);
  vec3 col = mix(plate, plate * uInk * 0.9 + uInk * 0.1, cover);

  // paper: fibre and tooth
  vec2 pc = fc / uPx;
  float tooth = hash12(floor(pc)) * 0.045 + vnoise(pc * 0.02) * 0.05 + vnoise(pc * vec2(0.005, 0.11)) * 0.03;
  col *= 1.0 - tooth * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

export function installLook({ view, look }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const stage = createStage(renderer, { samples: 4, depth: true });
  const pass = createPass(renderer, FRAG, {
    uPaper: { value: displayColor(look.mix(look.shade(look.light, 0.8), '#fff6e6', 0.4)) },
    uInk: { value: displayColor(look.shade(look.shadow, -0.45)) },
    uDot: { value: 6.5 }, uInkAmt: { value: 1 }, uFlat: { value: 1 }, uLines: { value: 1 }, uMis: { value: 1 }, uGrain: { value: 1 }, uPx: { value: 1 },
  });
  return {
    render(_renderer, scene, camera) {
      const u = pass.uniforms;
      u.uDot.value = o.dotSize;
      u.uInkAmt.value = o.ink;
      u.uFlat.value = o.flatten;
      u.uLines.value = o.lines;
      u.uMis.value = o.misprint;
      u.uGrain.value = o.grain;
      u.uPx.value = Math.max(0.5, renderer.domElement.height / 720);
      stage.render(scene, camera);
      pass.render({ source: stage, camera });
    },
    dispose() {
      stage.dispose();
      pass.dispose();
    },
  };
}
