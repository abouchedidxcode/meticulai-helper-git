// The grade pass: Kite Race's final pass (bloom added, exposure, tone curve, split-tone grade, saturation, sRGB,
// S-curve contrast, vignette, a little chromatic fringe at the edges, fine grain), minus its game-only speed lines and
// gust kick. It turns the HDR scene into the 8-bit picture the style pass paints over (or the screen in "Classic").
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse; uniform float time, flash, vignette, saturation, exposure, aberration, contrast;
uniform vec2 resolution; uniform vec3 shadowTint, highTint;
uniform float toneCurve;
uniform sampler2D tBloom; uniform float bloomOn; uniform float grain;
varying vec2 vUv;
// NaN / Inf guard and a cap on single hot pixels
vec3 sanC(vec3 c) {
  if (any(isnan(c)) || any(isinf(c))) return vec3(0.0);
  float pk = max(c.r, max(c.g, c.b));
  return c * min(1.0, 48.0 / max(pk, 1e-4));
}
#include <tonemapping_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// hue-keeping filmic curve: a toe and shoulder applied partly to the brightest channel (a red thing in full sun stays
// red instead of washing to orange) and partly per channel (only the very brightest wash white)
vec3 tcurve(vec3 x) { x *= 0.72; return clamp((x * (2.43 * x + 0.09)) / (x * (2.32 * x + 0.56) + 0.155), 0.0, 1.0); }
vec3 hueTone(vec3 c) {
  c = max(c, 0.0);
  float peak = max(c.r, max(c.g, c.b));
  vec3 hue = c / max(peak, 1e-5) * tcurve(vec3(peak)).r;
  return mix(hue, tcurve(c), 0.55);
}
vec3 aces(vec3 x) {
  const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = m1 * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 off = c * r2 * 0.006 * aberration;
  vec3 col;
  col.r = sanC(texture2D(tDiffuse, vUv - off).rgb).r;
  col.g = sanC(texture2D(tDiffuse, vUv).rgb).g;
  col.b = sanC(texture2D(tDiffuse, vUv + off).rgb).b;
  if (bloomOn > 0.5) col += texture2D(tBloom, vUv).rgb;
  col *= exposure;
  if (toneCurve > 1.5) { col = NeutralToneMapping(col * 0.66); }
  else if (toneCurve > 0.5) { col = hueTone(col * 0.6); }
  else { col = aces(col); }
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(shadowTint, highTint, smoothstep(0.05, 0.75, l));
  col = mix(vec3(l), col, saturation);
  col = toSRGB(col);
  // filmic S-curve: deeper shade, brighter sky, without crushing either end
  col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
  col *= mix(1.0, smoothstep(1.05, 0.2, length(c * vec2(resolution.x / resolution.y, 1.0) * 0.82)), vignette);
  col = mix(col, vec3(1.0, 0.96, 0.88), flash * 0.4);
  col += (hash(vUv * resolution + fract(time * 13.7) * 100.0) - 0.5) * grain;
  gl_FragColor = vec4(col, 1.0);
}`;

export class GradePass {
  constructor() {
    /** @type {THREE.ShaderMaterial} */
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        exposure: { value: 1 },
        flash: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
        shadowTint: { value: new THREE.Color(0.97, 0.99, 1.05) },
        highTint: { value: new THREE.Color(1.05, 1.0, 0.92) },
        vignette: { value: 0.5 },
        saturation: { value: 1.05 },
        contrast: { value: 0.25 },
        aberration: { value: 1 },
        /** 0 ACES, 1 hue-keeping filmic curve, 2 Khronos Neutral */
        toneCurve: { value: 0 },
        tBloom: { value: null },
        bloomOn: { value: 0 },
        /** film grain (the styles bring their own paper instead: 0) */
        grain: { value: 0.024 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  get uniforms() { return this.material.uniforms; }
  /** Set the grade from a Look's `grade` and `exposure`. @param {import('./styles.js').Look} look */
  setFromLook(look) {
    const u = this.material.uniforms, g = look.grade;
    u.exposure.value = look.exposure;
    u.shadowTint.value.setRGB(g.shadow[0], g.shadow[1], g.shadow[2]);
    u.highTint.value.setRGB(g.high[0], g.high[1], g.high[2]);
    u.saturation.value = g.sat;
    u.contrast.value = g.contrast;
    u.toneCurve.value = g.curve ?? 0;
  }
  /** @param {number} w @param {number} h */
  setSize(w, h) { this.material.uniforms.resolution.value.set(w, h); }
  /** @param {THREE.WebGLRenderer} renderer @param {THREE.Texture} hdr @param {THREE.WebGLRenderTarget|null} target */
  render(renderer, hdr, target) {
    this.material.uniforms.tDiffuse.value = hdr;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}
