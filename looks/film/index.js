// Look: Film. The game as if shot on film: fine grain, darker corners, a gentle curve, slightly faded blacks
// tinted by the palette's shadow colour, highlights warmed by its light colour, a soft glow round bright things
// and a trace of colour fringing at the frame edges. A pass over the picture: works on any game.
//
// Self-contained (no block). For real photographic rendering (a real sky lighting everything, soft shadows,
// reflections, depth of field) the kit's block meticulai-photoreal is the upgrade; it needs the game built for it.

import { announce, createPass, createStage, displayColor, lookOptions } from './look-kit.js';

export const lookInfo = { id: 'film', name: 'Film' };

const OPTIONS = {
  grain: { default: 0.05, min: 0, max: 0.2, step: 0.005, label: 'Grain' },
  vignette: { default: 0.35, min: 0, max: 1, label: 'Dark corners' },
  fade: { default: 0.35, min: 0, max: 1, label: 'Faded blacks', help: 'Lifts the darkest tones and tints them with the palette shadow colour.' },
  warmth: { default: 0.4, min: 0, max: 1, label: 'Tinted highlights', help: 'Leans the bright tones toward the palette light colour.' },
  contrast: { default: 0.35, min: 0, max: 1, label: 'Contrast', help: 'Strength of the film curve.' },
  glow: { default: 0.3, min: 0, max: 1, label: 'Glow', help: 'A soft halo round the brightest things.' },
  fringe: { default: 0.5, min: 0, max: 2, label: 'Edge fringing', help: 'Colour splitting toward the frame edges, like a real lens.' },
};

const FRAG = /* glsl */ `
uniform vec3 uShadowTint, uLightTint;
uniform float uGrain, uVignette, uFade, uWarm, uContrast, uGlow, uFringe;
void main() {
  vec2 d = vUv - 0.5;
  // lens: red and blue drift apart toward the edges
  vec2 off = d * dot(d, d) * 0.012 * uFringe;
  vec3 hdr;
  hdr.r = texture2D(tColor, vUv - off).r;
  hdr.g = texture2D(tColor, vUv).g;
  hdr.b = texture2D(tColor, vUv + off).b;
  // halation: light from the brightest things spreads a little (12 taps on a spiral)
  if (uGlow > 0.001) {
    vec3 halo = vec3(0.0);
    float a = hash12(gl_FragCoord.xy) * 6.2831853;
    for (int i = 0; i < 12; i++) {
      float rad = (float(i) + 1.0) / 12.0;
      vec2 o = vec2(cos(a), sin(a)) * rad * 0.022 * vec2(uRes.y / uRes.x, 1.0);
      vec3 s = texture2D(tColor, vUv + o).rgb;
      halo += max(s - 1.0, 0.0) * (1.0 - rad * 0.7);
      a += 2.39996323;
    }
    hdr += halo / 12.0 * uGlow * 1.6 * mix(vec3(1.0), uLightTint * 1.2, 0.6);
  }
  vec3 c = toDisplay(hdr);
  // the film curve, then a slightly thinner colour
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  float l = luma(c);
  c = mix(vec3(l), c, 1.0 - 0.1 * uContrast);
  // faded blacks lean to the palette's shadow colour, highlights to its light colour
  c = mix(c, max(c, uShadowTint * 0.5), uFade * 0.5 * (1.0 - smoothstep(0.0, 0.45, l)));
  c += uShadowTint * 0.06 * uFade * (1.0 - smoothstep(0.0, 0.5, l));
  c *= mix(vec3(1.0), mix(vec3(1.0), uLightTint / max(luma(uLightTint), 0.05), 0.22), uWarm * smoothstep(0.4, 0.95, l));
  // corners
  float r = length(d * vec2(uRes.x / uRes.y, 1.0) * 0.82);
  c *= mix(1.0, smoothstep(1.05, 0.25, r), uVignette);
  // grain, re-rolled 24 times a second, strongest in the mid tones
  float g = hash12(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(37.0, 17.0)) - 0.5;
  c += g * uGrain * (1.0 - abs(c - 0.5) * 1.2);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function installLook({ view, look }) {
  announce(lookInfo);
  const o = lookOptions(OPTIONS);
  const renderer = view.renderer;
  const stage = createStage(renderer, { samples: 4, depth: false });
  const pass = createPass(renderer, FRAG, {
    uShadowTint: { value: displayColor(look.shadow) }, uLightTint: { value: displayColor(look.light) },
    uGrain: { value: 0 }, uVignette: { value: 0 }, uFade: { value: 0 }, uWarm: { value: 0 }, uContrast: { value: 0 }, uGlow: { value: 0 }, uFringe: { value: 0 },
  });
  let time = 0;
  return {
    update(dt) {
      time += dt;
    },
    render(_renderer, scene, camera) {
      const u = pass.uniforms;
      u.uGrain.value = o.grain;
      u.uVignette.value = o.vignette;
      u.uFade.value = o.fade;
      u.uWarm.value = o.warmth;
      u.uContrast.value = o.contrast;
      u.uGlow.value = o.glow;
      u.uFringe.value = o.fringe;
      stage.render(scene, camera);
      pass.render({ source: stage, time });
    },
    dispose() {
      stage.dispose();
      pass.dispose();
    },
  };
}
