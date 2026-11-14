// The ink-and-paper look from Pop Quiz (meticulai.com/games/pop-quiz/).
//
// The scene is rendered twice (colour + depth, then normals) and a full-screen pass redraws it as a
// hand-inked illustration: outlines from depth and normal breaks that "boil" (their wobble is re-seeded
// 7 times a second, like redrawn animation frames) with uneven pen pressure, cross-hatching in the
// shadows drawn in screen space like pen strokes, paper grain and fibre, a vignette, ink bleeding in
// from the edges when hurt, a flash and a desaturate.
//
//   const ink = createInkPost(renderer, { ink: '#1d2340' });
//   // every frame, instead of renderer.render(scene, camera):
//   ink.render(scene, camera, dt);
//
// It uses your renderer (it does not create one) and follows its drawing-buffer size automatically.
// Every number below is the one Pop Quiz shipped with; they are all options.
import * as THREE from 'three';

/**
 * @typedef {object} InkOptions
 * @property {THREE.ColorRepresentation} [ink]   Line and hatch colour ('#1d2340' at noon in Pop Quiz).
 * @property {THREE.ColorRepresentation} [paper] Warmth soaked into the highlights.
 * @property {number} [paperMix]       How much paper tint (0.18).
 * @property {number} [hatchLevel]     Brightness (linear luminance) below which hatching starts (0.15; 0.07 at night).
 * @property {number} [hatchSpacing]   Hatch line spacing in CSS pixels (6).
 * @property {number} [hatch1]         Strength of the first (diagonal) hatch layer (0.42).
 * @property {number} [hatch2]         Strength of the cross-hatch layer in deep shadow (0.5).
 * @property {number} [boilRate]       Line re-draws per second (7).
 * @property {number} [boilStep]       How far the wobble seed jumps per re-draw (1.618).
 * @property {number} [wobble]         Line wobble in pixels (2.6).
 * @property {number} [edgeStrength]   Ink opacity of outlines (0.92).
 * @property {[number, number]} [depthEdge]  smoothstep range on the relative depth laplacian (0.035, 0.12).
 * @property {[number, number]} [normalEdge] smoothstep range on the normal difference (0.55, 1.1).
 * @property {[number, number]} [pressure]   Pen pressure base and variation (0.75, 0.25).
 * @property {number|null} [skyDepth]  View distance beyond which a pixel is sky (no hatching). null = 0.65 x camera.far
 *                                     (Pop Quiz: 1300 with far 2000). Set it a little below where your sky sits.
 * @property {number} [fadeNear]       Lines and hatching start fading at this view distance (90)...
 * @property {number} [fadeFar]        ...and reach full fade here (520)...
 * @property {number} [fadeAmount]     ...losing this much (0.7). Scale these three to your world's size.
 * @property {number} [grain]          Paper grain amount (1 = as shipped).
 * @property {number} [vignette]       Brightness at the corners (0.72).
 * @property {[number, number]} [vignetteRange] Where the vignette starts and ends (0.45, 1.05).
 * @property {THREE.ColorRepresentation} [hurtColor] Ink that bleeds in when hurt (dark red 0.22, 0, 0.04 linear).
 * @property {number} [maxPixelRatio]  Cap on the pixel ratio used for the buffers (1.5, as shipped).
 * @property {number|null} [noNormalsLayer] Objects only on this layer (particles, dust, glows) get colour but no
 *                                     outlines (1). null = every visible object gets outlines.
 * @property {number} [normalClear]    Clear colour of the normal pass (0x8080ff = facing the camera).
 */

/** @type {Required<Omit<InkOptions, 'ink'|'paper'|'hurtColor'>> & { ink: string, paper: string, hurtColor: number[] }} */
export const INK_DEFAULTS = {
  ink: '#1d2340',
  paper: '#fff4e0',
  paperMix: 0.18,
  hatchLevel: 0.15,
  hatchSpacing: 6,
  hatch1: 0.42,
  hatch2: 0.5,
  boilRate: 7,
  boilStep: 1.618,
  wobble: 2.6,
  edgeStrength: 0.92,
  depthEdge: [0.035, 0.12],
  normalEdge: [0.55, 1.1],
  pressure: [0.75, 0.25],
  skyDepth: null,
  fadeNear: 90,
  fadeFar: 520,
  fadeAmount: 0.7,
  grain: 1,
  vignette: 0.72,
  vignetteRange: [0.45, 1.05],
  hurtColor: [0.22, 0.0, 0.04],
  maxPixelRatio: 1.5,
  noNormalsLayer: 1,
  normalClear: 0x8080ff,
};

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 res;
uniform float near;
uniform float far;
uniform float time;
uniform float boil;
uniform float pr;
uniform vec3 ink;
uniform vec3 paper;
uniform float paperMix;
uniform float hatchLevel;
uniform float hatchSpacing;
uniform vec2 hatchStrength;
uniform float wobbleAmt;
uniform float edgeStrength;
uniform vec2 depthEdge;
uniform vec2 normalEdge;
uniform vec2 pressureAmt;
uniform float skyDepth;
uniform vec3 fadeRange;
uniform float grainAmt;
uniform vec3 vignetteAmt;
uniform vec3 hurtColor;
uniform float hurt;
uniform float flash;
uniform vec3 flashColor;
uniform float desat;

// Common sin-hash value noise.
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  return near * far / (far - z * (far - near));
}
vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

void main() {
  vec2 px = 1.0 / res;
  // Lines "boil": their wobble is re-seeded a few times a second, like redrawn animation frames.
  vec2 wob = vec2(noise(vUv * vec2(11.0, 7.0) + boil * 7.13), noise(vUv * vec2(8.0, 12.0) - boil * 3.71)) - 0.5;
  vec2 uv = vUv + wob * px * wobbleAmt * pr;
  vec2 o = px * max(1.0, pr * 0.9);

  float d0 = linDepth(uv);
  float dl = linDepth(uv - vec2(o.x, 0.0)), dr = linDepth(uv + vec2(o.x, 0.0));
  float dd = linDepth(uv - vec2(0.0, o.y)), du = linDepth(uv + vec2(0.0, o.y));
  float lap = abs(dl + dr - 2.0 * d0) + abs(dd + du - 2.0 * d0);
  float edgeD = smoothstep(depthEdge.x, depthEdge.y, lap / d0);

  vec3 n0 = nrm(uv);
  float nd = length(n0 - nrm(uv - vec2(o.x, 0.0))) + length(n0 - nrm(uv + vec2(o.x, 0.0)))
           + length(n0 - nrm(uv - vec2(0.0, o.y))) + length(n0 - nrm(uv + vec2(0.0, o.y)));
  float edgeN = smoothstep(normalEdge.x, normalEdge.y, nd);

  bool sky = d0 > skyDepth;
  float fade = 1.0 - smoothstep(fadeRange.x, fadeRange.y, d0) * fadeRange.z;
  // Uneven pressure along the stroke.
  float pressure = pressureAmt.x + pressureAmt.y * noise(gl_FragCoord.xy * 0.045 + boil * 13.0);
  float edge = clamp(max(edgeD, edgeN) * fade * pressure, 0.0, 1.0);

  vec3 col = texture2D(tColor, vUv).rgb;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

  // Cross-hatching in the shadows, drawn in screen space like pen strokes on the page.
  vec2 fc = gl_FragCoord.xy / pr;
  float s1 = abs(fract((fc.x + fc.y) / hatchSpacing + wob.x * 0.35) - 0.5);
  float s2 = abs(fract((fc.x - fc.y) / hatchSpacing + wob.y * 0.35) - 0.5);
  float l1 = 1.0 - smoothstep(0.07, 0.17, s1);
  float l2 = 1.0 - smoothstep(0.07, 0.17, s2);
  float shade1 = smoothstep(hatchLevel, hatchLevel * 0.6, lum);
  float shade2 = smoothstep(hatchLevel * 0.6, hatchLevel * 0.28, lum);
  float hatch = sky ? 0.0 : (l1 * shade1 * hatchStrength.x + l2 * shade2 * hatchStrength.y) * fade;

  // Paper: fibre, grain, and a little warmth soaked into the highlights.
  float grain = (hash(floor(fc)) * 0.05 + noise(fc * 0.018) * 0.05 + noise(fc * vec2(0.004, 0.09)) * 0.025) * grainAmt;
  col *= 1.0 - grain;
  col = mix(col, col * paper * 1.06, paperMix);

  if (desat > 0.0) col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), desat);

  col = mix(col, ink, hatch);
  col = mix(col, ink, edge * edgeStrength);

  if (flash > 0.0) col = mix(col, flashColor, flash * (0.35 + 0.65 * (1.0 - lum)) * 0.7);

  // Vignette, then ink bleeding in from the edges when hurt.
  vec2 c = vUv - 0.5;
  float r = length(c * vec2(res.x / res.y, 1.0));
  col *= mix(1.0, vignetteAmt.x, smoothstep(vignetteAmt.y, vignetteAmt.z, r));
  if (hurt > 0.0) {
    float bleed = smoothstep(0.95 - hurt * 0.55, 1.15 - hurt * 0.4, r + (noise(vUv * 7.0 + time * 0.6) - 0.5) * 0.35);
    col = mix(col, hurtColor, bleed * min(1.0, hurt * 1.4));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Create the ink post-process for an existing WebGLRenderer.
 * @param {THREE.WebGLRenderer} renderer
 * @param {InkOptions} [options]
 */
export function createInkPost(renderer, options = {}) {
  const o = { ...INK_DEFAULTS, ...options };

  const depthTex = new THREE.DepthTexture(4, 4);
  depthTex.type = THREE.UnsignedIntType;
  const colorRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthTexture: depthTex });
  const normalRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType });
  const normalMat = new THREE.MeshNormalMaterial();

  const post = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: colorRT.texture },
      tDepth: { value: depthTex },
      tNormal: { value: normalRT.texture },
      res: { value: new THREE.Vector2(4, 4) },
      near: { value: 0.05 },
      far: { value: 2000 },
      time: { value: 0 },
      boil: { value: 0 },
      pr: { value: 1 },
      ink: { value: new THREE.Color(o.ink) },
      paper: { value: new THREE.Color(o.paper) },
      paperMix: { value: o.paperMix },
      hatchLevel: { value: o.hatchLevel },
      hatchSpacing: { value: o.hatchSpacing },
      hatchStrength: { value: new THREE.Vector2(o.hatch1, o.hatch2) },
      wobbleAmt: { value: o.wobble },
      edgeStrength: { value: o.edgeStrength },
      depthEdge: { value: new THREE.Vector2(...o.depthEdge) },
      normalEdge: { value: new THREE.Vector2(...o.normalEdge) },
      pressureAmt: { value: new THREE.Vector2(...o.pressure) },
      skyDepth: { value: 1300 },
      fadeRange: { value: new THREE.Vector3(o.fadeNear, o.fadeFar, o.fadeAmount) },
      grainAmt: { value: o.grain },
      vignetteAmt: { value: new THREE.Vector3(o.vignette, ...o.vignetteRange) },
      hurtColor: { value: Array.isArray(o.hurtColor) ? new THREE.Color().fromArray(o.hurtColor) : new THREE.Color(o.hurtColor) },
      hurt: { value: 0 },
      flash: { value: 0 },
      flashColor: { value: new THREE.Color('#ffffff') },
      desat: { value: 0 },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const size = new THREE.Vector2();
  const clear = new THREE.Color();
  let boilClock = 0;

  /** Match the buffers to the renderer's canvas (called by render(); cheap when nothing changed). */
  function syncSize() {
    const pr = Math.min(renderer.getPixelRatio(), o.maxPixelRatio);
    renderer.getSize(size);
    const bw = Math.max(1, Math.floor(size.x * pr));
    const bh = Math.max(1, Math.floor(size.y * pr));
    const u = post.uniforms;
    if (u.res.value.x !== bw || u.res.value.y !== bh) {
      colorRT.setSize(bw, bh);
      normalRT.setSize(bw, bh);
      u.res.value.set(bw, bh);
    }
    u.pr.value = pr;
  }

  /** Effects the game drives: hurt 0..1 (ink bleed), flash 0..1 (+ flashColor), desat 0..1. Decay them yourself. */
  const fx = { hurt: 0, flash: 0, flashColor: post.uniforms.flashColor.value, desat: 0 };

  /**
   * Draw one frame. Replaces renderer.render(scene, camera).
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} dt seconds since the last frame (0 when paused: the lines stop boiling)
   */
  function render(scene, camera, dt) {
    syncSize();
    const u = post.uniforms;
    u.time.value += dt;
    boilClock += dt;
    if (boilClock > 1 / o.boilRate) { boilClock = 0; u.boil.value = (u.boil.value + o.boilStep) % 97; }
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.skyDepth.value = o.skyDepth ?? camera.far * 0.65;
    u.hurt.value = fx.hurt;
    u.flash.value = fx.flash;
    u.desat.value = fx.desat;

    // Shadows are drawn once per frame, for the colour pass only.
    const autoShadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    const mask = camera.layers.mask;
    if (o.noNormalsLayer != null) camera.layers.enable(o.noNormalsLayer);
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(colorRT);
    renderer.render(scene, camera);

    // Normals: everything except the no-outline layer, against a "facing the camera" clear.
    camera.layers.mask = mask;
    if (o.noNormalsLayer != null) camera.layers.disable(o.noNormalsLayer);
    scene.overrideMaterial = normalMat;
    const bg = scene.background;
    scene.background = null;
    renderer.getClearColor(clear);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(o.normalClear, 1);
    renderer.setRenderTarget(normalRT);
    renderer.render(scene, camera);
    renderer.setClearColor(clear, clearAlpha);
    scene.overrideMaterial = null;
    scene.background = bg;
    camera.layers.mask = mask;
    renderer.shadowMap.autoUpdate = autoShadows;

    renderer.setRenderTarget(prevTarget);
    renderer.render(postScene, postCam);
  }

  /** Change options live (ink, paper, hatchLevel, wobble, fade..., skyDepth). */
  function set(changes) {
    Object.assign(o, changes);
    const u = post.uniforms;
    if ('ink' in changes) u.ink.value.set(o.ink);
    if ('paper' in changes) u.paper.value.set(o.paper);
    u.paperMix.value = o.paperMix;
    u.hatchLevel.value = o.hatchLevel;
    u.hatchSpacing.value = o.hatchSpacing;
    u.hatchStrength.value.set(o.hatch1, o.hatch2);
    u.wobbleAmt.value = o.wobble;
    u.edgeStrength.value = o.edgeStrength;
    u.depthEdge.value.set(...o.depthEdge);
    u.normalEdge.value.set(...o.normalEdge);
    u.pressureAmt.value.set(...o.pressure);
    u.fadeRange.value.set(o.fadeNear, o.fadeFar, o.fadeAmount);
    u.grainAmt.value = o.grain;
    u.vignetteAmt.value.set(o.vignette, ...o.vignetteRange);
  }

  function dispose() {
    colorRT.dispose();
    normalRT.dispose();
    depthTex.dispose();
    normalMat.dispose();
    post.dispose();
    quad.geometry.dispose();
  }

  return {
    render,
    set,
    fx,
    dispose,
    options: o,
    /** The live uniforms: ink and paper are THREE.Colors you can .copy() into every frame (palette blending). */
    uniforms: post.uniforms,
    colorTarget: colorRT,
  };
}
