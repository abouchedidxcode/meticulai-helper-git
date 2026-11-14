// The styles' post pass, exactly as in Kite Race. It reads the graded, tone-mapped picture (8-bit, sRGB) and the
// scene's depth, and draws the style over it:
//
//   miniature   fine ink outlines from the depth (silhouettes and creases: the Laplacian of 1/z, which is zero on any
//               plane) and faint ones on colour edges; a soft tonal ramp; paper fibre; a narrow ivory margin with a
//               fine gold and vermilion double rule like a miniature's border
//   gouache     a 4-sector Kuwahara brush sized by distance (broad near, fine far; thin near things and points of
//               light kept), pigment at the edges of strokes, soft dark edges, paper tooth, warm lights and cool darks
//   clean       very soft outlines (darker by a share of the colour, not black), nothing else
//
// Cost per pixel: 9 taps (miniature), 5 (clean), 25 colour + ~10 depth taps (gouache). Distances are metres.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { STYLE_U } from './patch-material.js';

export const STYLE_POST_FRAG = /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform float uStyle, near, far, time, hasDepth;
uniform vec2 resolution;
varying vec2 vUv;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return near * far / max(far - d * (far - near), 1e-6);
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// ink: x = silhouette (near side of a depth step), y = crease (bend of a surface), both 0..1, faded with distance
vec2 edges(vec2 uv, vec2 px, float fadeNear, float fadeFar, float silFar) {
  if (hasDepth < 0.5) return vec2(0.0);
  float zc = viewZ(uv);
  if (zc > far * 0.9) return vec2(0.0);
  float zl = viewZ(uv - vec2(px.x, 0.0)), zr = viewZ(uv + vec2(px.x, 0.0));
  float zd = viewZ(uv - vec2(0.0, px.y)), zu = viewZ(uv + vec2(0.0, px.y));
  // silhouette: a neighbour much further away (the line sits on the near object)
  float jump = max(max(zl, zr), max(zd, zu)) / zc - 1.0;
  float sil = smoothstep(0.04 + zc * 0.00006, 0.12 + zc * 0.00012, jump);
  // crease: 1/z is linear across a plane in screen space, so its second difference is zero there and not at a bend
  float wc = 1.0 / zc;
  float lap = abs(1.0 / zl + 1.0 / zr - 2.0 * wc) + abs(1.0 / zd + 1.0 / zu - 2.0 * wc);
  float cr = smoothstep(0.004, 0.02, lap / wc);
  float fade = 1.0 - smoothstep(fadeNear, fadeFar, zc);
  return vec2(sil * mix(silFar, 1.0, fade), cr * fade);
}
float paper(vec2 fc) {
  float n = n2(fc * 0.9) * 0.35 + n2(fc * 0.22 + 3.1) * 0.4 + n2(fc * 0.05 + 7.7) * 0.25;
  // fibres: long thin streaks at a few angles
  float f = n2(vec2(fc.x * 0.04 + fc.y * 0.9, fc.y * 0.03)) * n2(vec2(fc.x * 0.8 - fc.y * 0.05, fc.x * 0.02 + 5.0));
  return n + f * 0.6;
}
// a soft 4-sector Kuwahara over a 5x5 window (each quadrant 3x3, sharing the centre row and column): each pixel takes
// the mean of its calmest quadrants, weighted by calm, so flat fields become even strokes and edges stay put
vec3 kuwahara(vec2 uv, vec2 px) {
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec3 c = texture2D(tDiffuse, uv + vec2(float(i), float(j)) * px).rgb;
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m0 += c; s0 += c2; }
      if (i >= 0 && j <= 0) { m1 += c; s1 += c2; }
      if (i <= 0 && j >= 0) { m2 += c; s2 += c2; }
      if (i >= 0 && j >= 0) { m3 += c; s3 += c2; }
    }
  }
  vec3 acc = vec3(0.0); float wsum = 0.0;
  #define KQ(M, S) { vec3 mu = M / 9.0; vec3 v = abs(S / 9.0 - mu * mu); float w = 1.0 / (1.0 + pow((v.r + v.g + v.b) * 600.0, 2.0)); acc += mu * w; wsum += w; }
  KQ(m0, s0) KQ(m1, s1) KQ(m2, s2) KQ(m3, s3)
  return acc / wsum;
}
void main() {
  vec2 px = 1.0 / resolution;
  // lines about a pixel wide at 720p, a little wider at 1080p and above
  vec2 lp = px * max(1.0, resolution.y / 900.0);
  vec2 fc = gl_FragCoord.xy * (1080.0 / max(resolution.y, 1.0));
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  if (uStyle < 1.5) {
    // ---- miniature
    // ink: crisp near, thinning with distance and gone on the far city (no scribble on tiny far things)
    vec2 e = edges(vUv, lp, 45.0, 420.0, 0.0);
    float zc = hasDepth > 0.5 ? viewZ(vUv) : 50.0;
    float nearInk = 1.0 - smoothstep(30.0, 260.0, zc);
    // faint ink on colour edges too (a painter outlines colour fields), near only
    vec3 cl = texture2D(tDiffuse, vUv - vec2(lp.x, 0.0)).rgb, cr = texture2D(tDiffuse, vUv + vec2(lp.x, 0.0)).rgb;
    vec3 cd = texture2D(tDiffuse, vUv - vec2(0.0, lp.y)).rgb, cu = texture2D(tDiffuse, vUv + vec2(0.0, lp.y)).rgb;
    float ce = length(cr - cl) + length(cu - cd);
    float ink = clamp(max(e.x, e.y * 0.7) + smoothstep(0.2, 0.42, ce) * 0.22 * nearInk, 0.0, 1.0);
    // a gentle tonal ramp: values settle onto a few soft steps (flat fields) without banding
    float l = lum(col);
    float q = l * 7.0;
    float lq = (floor(q) + smoothstep(0.25, 0.75, fract(q))) / 7.0;
    col *= mix(1.0, lq / max(l, 1e-3), 0.4);
    // jewels: the most saturated colours (the kites, the awnings, the clothes) a little richer still
    float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
    float sat = (mx - mn) / max(mx, 1e-3);
    col = max(vec3(0.0), mix(vec3(lum(col)), col, 1.0 + 0.18 * smoothstep(0.7, 0.92, sat)));
    // pigment on a warm wasli paper: the paper shows a little through thin paint, a fine tooth (subtle)
    float p = paper(fc);
    vec3 paperC = vec3(0.97, 0.92, 0.82);
    col = mix(col, col * paperC * 1.03, 0.25);
    col *= 0.965 + 0.05 * p;
    // the ink: a warm brown-black, its weight a little irregular (a brush, not a ruler)
    float wob = 0.8 + 0.2 * n2(fc * 0.15);
    col = mix(col, vec3(0.13, 0.075, 0.045), ink * 0.78 * wob);
    // the border: a narrow ivory margin, a fine gold rule and a finer vermilion one inside it, a whisper of warmth
    // toward the edge (elegant, not heavy)
    vec2 c = vUv - 0.5;
    vec2 dpx = (0.5 - abs(c)) * resolution;  // pixels to the nearest edge
    float de = min(dpx.x, dpx.y) * (1080.0 / resolution.y);
    col *= mix(0.95, 1.0, smoothstep(0.0, 60.0, de - 10.0));
    float r1 = 1.0 - smoothstep(0.5, 1.4, abs(de - 12.5));
    float r2 = 1.0 - smoothstep(0.3, 0.9, abs(de - 16.5));
    col = mix(col, vec3(0.86, 0.66, 0.26), r1 * 0.85);
    col = mix(col, vec3(0.62, 0.14, 0.07), r2 * 0.6);
    col = mix(col, vec3(0.93, 0.87, 0.73) * (0.96 + 0.04 * p), 1.0 - smoothstep(10.0, 11.0, de));
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  if (uStyle < 2.5) {
    // ---- gouache. The brush is sized by distance: broad strokes on the near walls (about 2 px between samples at
    // 1080p), fine ones far away (under a pixel: the far city, its people and wires keep their shapes)
    float zc = hasDepth > 0.5 ? viewZ(vUv) : 50.0;
    float sky = zc > far * 0.9 ? 1.0 : 0.0;
    float spacing = mix(2.1, 0.55, smoothstep(12.0, 140.0, zc)) * max(1.0, resolution.y / 1080.0);
    spacing = mix(spacing, 2.2, sky);
    vec2 bp = px * spacing;
    vec3 br = kuwahara(vUv, bp);
    // thin near things (a wire, a pole, a figure, a pennant) in front of something further: keep the pixel, the brush
    // would paint them out
    float keep = 0.0;
    if (hasDepth > 0.5 && sky < 0.5) {
      vec2 o = bp * 2.0;
      float zl = viewZ(vUv - vec2(o.x, 0.0)), zr = viewZ(vUv + vec2(o.x, 0.0));
      float zd = viewZ(vUv - vec2(0.0, o.y)), zu = viewZ(vUv + vec2(0.0, o.y));
      float thin = max(min(zl, zr), min(zd, zu)) / zc - 1.0;
      keep = smoothstep(0.04, 0.15, thin);
    }
    // points of light (lamps, festival bulbs, lit windows, stars) brighter than the stroke around them: keep them too
    keep = max(keep, smoothstep(0.08, 0.25, lum(col) - lum(br)));
    float ed = length(col - br);
    col = mix(br, col, keep * 0.85);
    // gouache dries with a little more pigment at the edge of a stroke: the edges of colour fields darken a touch
    col *= 1.0 - 0.25 * smoothstep(0.03, 0.2, ed) * (1.0 - keep);
    // paint laid unevenly: broad, soft pools of a little more or less pigment
    float pool = n2(fc * 0.006 + 2.0) * 0.6 + n2(fc * 0.017 + 5.0) * 0.4;
    col *= 0.96 + 0.08 * pool;
    // soft dark edges where one thing stands before another: a darker shade of the colour, not grey
    vec2 e = edges(vUv, lp * 1.25, 50.0, 420.0, 0.0);
    col = mix(col, col * col * 0.6, 0.5 * max(e.x, e.y * 0.45));
    // a cold-press tooth, strongest in the light washes
    float tooth = n2(fc * 0.7) * 0.6 + n2(fc * 0.23 + 1.0) * 0.4;
    col *= 1.0 - 0.06 * tooth * smoothstep(0.3, 0.8, lum(col));
    // warm light, cool shade: lights toward a warm cream, darks toward blue-violet
    float L = lum(col);
    col *= mix(vec3(0.93, 0.96, 1.08), vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.7, L));
    // gouache is opaque paint, it never glares: the brightest whites (a sunlit marble court) roll off softly
    float L2 = lum(col);
    col *= (L2 > 0.8 ? 0.8 + (L2 - 0.8) * 0.45 : L2) / max(L2, 1e-3);
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  // ---- clean: soft outlines, a share darker than the colour beneath
  vec2 e = edges(vUv, lp, 80.0, 700.0, 0.35);
  col *= 1.0 - 0.28 * e.x - 0.1 * e.y;
  gl_FragColor = vec4(col, 1.0);
}`;

/** Draws the style over an 8-bit picture, with the scene's depth (perspective camera). */
export class StylePass {
  constructor() {
    /** @type {THREE.ShaderMaterial} */
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, hasDepth: { value: 0 },
        near: { value: 0.5 }, far: { value: 30000 }, time: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
        uStyle: STYLE_U.uStyle,
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: STYLE_POST_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  /** @param {number} w @param {number} h drawing-buffer pixels */
  setSize(w, h) { this.material.uniforms.resolution.value.set(w, h); }
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Texture} picture   the graded 8-bit picture
   * @param {THREE.Texture|null} depth the scene's depth texture (null: no outlines, brush at one size)
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.WebGLRenderTarget|null} target null = the screen
   * @param {number} [time]
   */
  render(renderer, picture, depth, camera, target = null, time = 0) {
    const u = this.material.uniforms;
    u.tDiffuse.value = picture;
    u.tDepth.value = depth;
    u.hasDepth.value = depth ? 1 : 0;
    u.near.value = camera.near; u.far.value = camera.far;
    u.time.value = time;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}
