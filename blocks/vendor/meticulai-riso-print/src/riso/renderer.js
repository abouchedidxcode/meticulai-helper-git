// Riso view: scene -> ink G-buffer -> overprinted halftone composite.
//
// Three spot inks (blue, pink, yellow) are printed on paper through rotated halftone screens (15, 75, 45 degrees),
// with inked outlines where the role, depth or facing breaks, plate misregistration that grows with `fx.energy`,
// uneven ink, paper tooth and grain. The screen signals in `fx` (freeze, dash, focus, wipe...) are drawn in ink too.
import * as THREE from 'three';
import { inkUniforms } from './materials.js';
import { INK, PALETTES, easePalette, inkDefines } from './inks.js';

const POST_FRAG = /* glsl */`
precision highp float;
${inkDefines(INK)}
uniform sampler2D tG;
uniform sampler2D tD;
uniform vec2 uRes;
uniform float uPx;
uniform float uNear;
uniform float uFar;
uniform vec2 uFade;
uniform vec2 uLineFade;
uniform float uEnergy;
uniform float uFreeze;
uniform float uDead;
uniform float uFlash;
uniform float uDash;
uniform float uReplay;
uniform float uWipe;
uniform float uSpeed;
uniform float uHit;
uniform float uTimeR;
uniform float uFlashScale;
uniform float uFocus;
uniform vec3 uPaper;
uniform vec3 uInkB;
uniform vec3 uInkP;
uniform vec3 uInkY;
varying vec2 vUv;

#define IS(a) (abs(id - (a)) < 0.5)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float lin(float z) {
  float n = z * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - n * (uFar - uNear));
}
float idOf(vec4 g) { return floor(g.g * 255.0 + 0.5); }
bool isZone(float id) { return abs(id - I_ZONE_SLOW) < 0.5 || abs(id - I_ZONE_FAST) < 0.5; }
bool isVm(float id) {
  return abs(id - I_HANDS) < 0.5 || abs(id - I_VM_PICKUP) < 0.5 || abs(id - I_VM_FX) < 0.5 || abs(id - I_SLEEVE) < 0.5;
}
float depthAt(vec2 uv, float id) { return isVm(id) ? 0.4 : lin(texture2D(tD, uv).x); }

// classic AM halftone: rotated grid of dots whose area follows the coverage
float dots(vec2 fc, float ang, float sc, float v) {
  v = clamp(v, 0.0, 1.0);
  if (v < 0.02) return 0.0;
  if (v > 0.98) return 1.0;
  float c = cos(ang), s = sin(ang);
  vec2 p = mat2(c, -s, s, c) * fc / sc;
  vec2 q = fract(p) - 0.5;
  float d = length(q);
  // dot area tracks coverage (r = sqrt(v/pi)), widening at the top end so solids close up
  float r = sqrt(v) * mix(0.5642, 0.75, v * v);
  float aa = 0.9 / sc;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}

// coverage of the three inks (blue, pink, yellow) at uv
vec3 inks(vec2 uv, vec2 fc) {
  vec2 px = 1.25 * uPx / uRes;
  vec4 g = texture2D(tG, uv);
  float id = idOf(g);
  float dc = depthAt(uv, id);
  float edge = 0.0;
  float nearId = id;
  float nearD = dc;
  vec2 offs[4];
  offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0);
  offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
  for (int i = 0; i < 4; i++) {
    vec4 gn = texture2D(tG, uv + offs[i]);
    float idn = idOf(gn);
    float dn = depthAt(uv + offs[i], idn);
    bool zoneInvolved = isZone(id) || isZone(idn);
    if (!zoneInvolved) {
      if (abs(idn - id) > 0.5) edge = 1.0;
      if (abs(dn - dc) > 0.035 * min(dn, dc) + 0.04) edge = 1.0;
      if (abs(idn - id) < 0.5 && abs(gn.a - g.a) > 0.07) edge = 1.0;
    }
    if (dn < nearD) { nearD = dn; nearId = idn; }
  }

  float s = g.r;
  float glow = g.b;
  float sh = 1.0 - s;
  float big = 5.8 * uPx;
  float B = 0.0, P = 0.0, Y = 0.0;
  const float A1 = 0.2618; // 15 deg
  const float A2 = 1.309;  // 75 deg
  const float A3 = 0.7854; // 45 deg

  if (IS(I_SKY)) {
    // the sun prints in blue ink (a pink ring would read as danger)
    B = max(dots(fc, A1, big * 1.25, sh * 0.5), glow * 0.85);
  } else if (IS(I_WALL) || IS(I_DISTANT)) {
    B = dots(fc, A1, big, pow(sh, 1.15) * 0.95);
  } else if (IS(I_SCENERY)) {
    B = dots(fc, A1, big, 0.25 + sh * 0.6);
  } else if (IS(I_FLOOR)) {
    B = dots(fc, A1, big, sh * 0.85);
    Y = 0.1;
  } else if (IS(I_ENEMY)) {
    P = 0.88 + 0.12 * sh;
    B = dots(fc, A2, big, sh * 0.8);
  } else if (IS(I_CORE)) {
    P = 1.0; Y = 0.85;
  } else if (IS(I_SPLAT)) {
    // spent ink: what's left of the dead is a dull plum, never the live pink
    B = 0.5 + 0.2 * sh; P = 0.28;
  } else if (IS(I_MARK)) {
    B = 0.9;
  } else if (IS(I_PICKUP) || IS(I_VM_PICKUP)) {
    Y = 1.0;
    P = dots(fc, A3, big, sh * 0.5);
  } else if (IS(I_ITEM)) {
    Y = 0.75;
    B = dots(fc, A1, big * 0.8, sh * 0.6);
  } else if (IS(I_GLASS)) {
    B = mix(0.3, 0.95, sh);
  } else if (IS(I_ENEMY_SHOT)) {
    P = 1.0; Y = 1.0;
  } else if (IS(I_PLAYER_SHOT)) {
    B = 1.0;
  } else if (IS(I_ZONE_SLOW)) {
    Y = 0.9; P = 0.12;
  } else if (IS(I_ZONE_FAST)) {
    B = 0.75;
  } else if (IS(I_MACHINE)) {
    Y = 1.0; P = max(glow, dots(fc, A3, big, sh * 0.6));
  } else if (IS(I_HANDS) || IS(I_PAPER)) {
    B = dots(fc, A1, big * 0.8, sh * 0.55);
  } else if (IS(I_SLEEVE)) {
    B = dots(fc, A1, big * 0.8, 0.45 + sh * 0.5);
  } else if (IS(I_PLAYER)) {
    // you, from the outside: a highlighter-yellow figure, shaded in blue
    Y = 0.82;
    B = dots(fc, A1, big * 0.75, 0.08 + sh * 0.62);
  } else if (IS(I_FX) || IS(I_VM_FX)) {
    Y = 1.0; P = glow * dots(fc, A2, big, 0.2 + sh * 0.5);
  } else if (IS(I_BEAM)) {
    B = 1.0; P = 0.6;
  } else if (IS(I_LASER)) {
    P = 1.0;
  } else if (IS(I_SHIELD)) {
    B = 0.85; P = dots(fc, A2, big, sh * 0.7);
  } else if (IS(I_TURRET)) {
    P = 1.0; B = dots(fc, A2, big, sh * 0.9); Y = glow;
  }

  // focus: the world drains to a pale proof; what can hurt you and what is yours keep their ink
  bool keepInk = IS(I_ENEMY) || IS(I_TURRET) || IS(I_CORE) || IS(I_ENEMY_SHOT) || IS(I_LASER) || IS(I_SHIELD) ||
    IS(I_PICKUP) || IS(I_VM_PICKUP) || IS(I_ITEM) || IS(I_PLAYER_SHOT) || IS(I_MACHINE) || IS(I_FX) || IS(I_VM_FX);
  if (!keepInk) { B *= 1.0 - 0.62 * uFocus; Y *= 1.0 - 0.8 * uFocus; P *= 1.0 - 0.7 * uFocus; }
  // distance: ink thins out like a print's aerial perspective
  if (!IS(I_SKY) && !isVm(id)) {
    float fade = smoothstep(uFade.x, uFade.y, dc);
    B *= 1.0 - 0.75 * fade; P *= 1.0 - 0.5 * fade; Y *= 1.0 - 0.5 * fade;
  }

  if (edge > 0.5) {
    float lf = 1.0 - smoothstep(uLineFade.x, uLineFade.y, nearD) * 0.7;
    if (abs(nearId - I_ENEMY) < 0.5 || abs(nearId - I_TURRET) < 0.5 || abs(nearId - I_CORE) < 0.5) { P = 1.0; B = max(B, lf); }
    else if (abs(nearId - I_ENEMY_SHOT) < 0.5 || abs(nearId - I_LASER) < 0.5) { P = 1.0; Y = max(Y, 0.6); }
    else if (abs(nearId - I_SPLAT) < 0.5) { B = max(B, lf); }
    else { B = max(B, lf); }
  }
  return vec3(B, P, Y);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  // misregistration: the pink plate drifts off the blue/yellow plates, more with energy, dashes and hits
  float jolt = uEnergy * 1.6 + uDash * 6.0 + uHit * 9.0;
  vec2 mis = vec2(1.3, -0.9) * uPx * (1.0 + jolt) / uRes;
  vec3 a = inks(vUv, fc);
  vec3 b = inks(vUv + mis, fc);
  float B = a.x, P = b.y, Y = a.z;

  vec2 c = vUv - 0.5;
  vec2 ca = c * vec2(uRes.x / uRes.y, 1.0);
  float r = length(ca);
  float vig = smoothstep(0.5, 1.05, r);
  B = max(B, dots(fc, 0.2618, 7.0 * uPx, vig * 0.38 * uFreeze));
  P = max(P, dots(fc, 1.309, 6.0 * uPx, vig * uDash));

  // speed: radial ink streaks
  if (uSpeed > 0.01) {
    float ang = atan(ca.y, ca.x);
    float lane = floor(ang * 38.0);
    float n = hash(vec2(lane, floor(uTimeR * 24.0)));
    float streak = step(0.72, n) * smoothstep(0.22 + n * 0.2, 0.75, r);
    float width = abs(fract(ang * 38.0) - 0.5);
    streak *= 1.0 - smoothstep(0.12, 0.2, width);
    B = max(B, streak * uSpeed);
  }

  // focus: slow time you can see. A heavy ink vignette closes in, and fine still lines
  // (the speed streaks, frozen and thinned) radiate from the edges
  if (uFocus > 0.01) {
    B = max(B, dots(fc, 0.2618, 6.0 * uPx, smoothstep(0.42, 1.0, r) * 0.75 * uFocus));
    float ang = atan(ca.y, ca.x);
    float n = hash(vec2(floor(ang * 64.0), 7.0));
    float line = step(0.55, n) * smoothstep(0.34 + n * 0.25, 0.8, r);
    line *= 1.0 - smoothstep(0.05, 0.1, abs(fract(ang * 64.0) - 0.5));
    B = max(B, line * 0.85 * uFocus);
  }

  // death: everything floods into pink
  B = mix(B, B * 0.35, uDead);
  P = max(P, uDead * dots(fc, 1.309, 5.0 * uPx, 0.35 + 0.6 * vig));
  float fl = uFlash * uFlashScale;
  Y = max(Y, fl * dots(fc, 0.7854, 5.0 * uPx, fl * 0.7));

  // replay: yellow wash at the border
  Y = max(Y, uReplay * dots(fc, 0.7854, 7.0 * uPx, smoothstep(0.55, 1.05, r) * 0.9));

  // ink wipe: big halftone dots grow out of the centre until the page is solid
  if (uWipe > 0.001) {
    float cov = clamp(uWipe * 2.1 - r * 1.05 + (hash(floor(fc / (16.0 * uPx))) - 0.5) * 0.08, 0.0, 1.0);
    B = max(B, dots(fc, 0.2618, 15.0 * uPx, cov));
    P = max(P, dots(fc + 5.0, 1.309, 15.0 * uPx, cov * 0.95));
  }

  // uneven ink + paper tooth
  B *= 0.86 + 0.14 * vnoise(fc / (38.0 * uPx));
  P *= 0.9 + 0.1 * vnoise(fc / (33.0 * uPx) + 7.0);
  Y *= 0.92 + 0.08 * vnoise(fc / (45.0 * uPx) + 3.0);

  vec3 col = uPaper * mix(vec3(1.0), uInkB, B) * mix(vec3(1.0), uInkP, P) * mix(vec3(1.0), uInkY, Y);
  col *= 0.955 + 0.06 * hash(floor(fc / max(uPx, 1.0)));
  gl_FragColor = vec4(col, 1.0);
}`;

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Screen signals, all 0..1 unless noted. Set them every frame from your game; they cost nothing at 0.
 * @typedef {object} RisoFx
 * @property {number} energy   how fast time runs; plates misregister more (Still Life: the time scale)
 * @property {number} freeze   time stopped: a light blue halftone vignette (Still Life: 1 - time scale)
 * @property {number} dash     a burst of speed: pink vignette + a big misregistration jolt
 * @property {number} speed    radial blue ink streaks (moving lines read as fast)
 * @property {number} focus    slow motion: the world fades to a pale proof, danger/pickups keep their ink,
 *                             a heavy blue vignette and still radial lines close in
 * @property {number} hit      you got hit: the biggest misregistration jolt
 * @property {number} flash    a yellow halftone flash; scaled by flashScale (lower it for a "fewer flashes" setting)
 * @property {number} flashScale
 * @property {number} dead     everything floods into pink
 * @property {number} replay   a yellow wash at the border
 * @property {number} wipe     0 -> 1: big halftone dots grow out of the centre until the page is solid ink
 */

export class RisoView {
  /**
   * @param {object} [opts]
   * @param {THREE.WebGLRenderer} [opts.renderer]  share a renderer (needed to switch looks on one canvas)
   * @param {HTMLCanvasElement} [opts.canvas]       or make one on this canvas
   * @param {number} [opts.maxPixelRatio=1.5]       dot screens are sized in device pixels x this
   * @param {Record<string, object>} [opts.palettes=PALETTES]
   * @param {string} [opts.palette='classic']
   * @param {[number, number]} [opts.fade=[24, 95]]      metres over which ink thins with distance
   * @param {[number, number]} [opts.lineFade=[30, 100]] metres over which outlines thin with distance
   * @param {string} [opts.frag]   replace the composite shader (dither / ASCII looks can reuse the G-buffer)
   * @param {object} [opts.uniforms] extra uniforms for `frag`
   */
  constructor(opts = {}) {
    this.renderer = opts.renderer || new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: 'high-performance' });
    this.maxPx = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio ?? 1.5);
    this.px = this.maxPx;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: true,
    });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.target.depthTexture.format = THREE.DepthStencilFormat;
    this.target.depthTexture.type = THREE.UnsignedInt248Type;

    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.palettes = opts.palettes || PALETTES;
    const p = this.palettes[opts.palette] || this.palettes.classic;
    this.paletteTarget = p;
    this.inks = { paper: [...p.paper], B: [...p.B], P: [...p.P], Y: [...p.Y] };
    const fade = opts.fade || [24, 95];
    const lineFade = opts.lineFade || [30, 100];
    this.uniforms = {
      tG: { value: this.target.texture },
      tD: { value: this.target.depthTexture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPx: { value: this.px },
      uNear: { value: 0.05 },
      uFar: { value: 400 },
      uFade: { value: new THREE.Vector2(fade[0], fade[1]) },
      uLineFade: { value: new THREE.Vector2(lineFade[0], lineFade[1]) },
      uEnergy: { value: 0 },
      uFreeze: { value: 0 },
      uDead: { value: 0 },
      uFlash: { value: 0 },
      uFlashScale: { value: 1 },
      uDash: { value: 0 },
      uReplay: { value: 0 },
      uWipe: { value: 0 },
      uSpeed: { value: 0 },
      uHit: { value: 0 },
      uTimeR: { value: 0 },
      uFocus: { value: 0 },
      uPaper: { value: new THREE.Vector3(...p.paper) },
      uInkB: { value: new THREE.Vector3(...p.B) },
      uInkP: { value: new THREE.Vector3(...p.P) },
      uInkY: { value: new THREE.Vector3(...p.Y) },
      ...(opts.uniforms || {}),
    };
    /** @type {RisoFx} */
    this.fx = { energy: 0, freeze: 0, dash: 0, speed: 0, focus: 0, hit: 0, flash: 0, flashScale: 1, dead: 0, replay: 0, wipe: 0 };
    this.postMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: POST_VERT, fragmentShader: opts.frag || POST_FRAG,
      depthTest: false, depthWrite: false,
    });
    const tri = new THREE.Mesh(geo, this.postMat);
    tri.frustumCulled = false;
    this.postScene.add(tri);
    if (!opts.renderer) this.activate();
    else this.resize();
  }

  /** Put the shared renderer in this look's state (called by the look switch). */
  activate() {
    const r = this.renderer;
    r.autoClear = false;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x000000, 0);
    this.setPixelRatio(this.px);
  }

  /** Change the ink set; eased over ~1 s by tickPalette(dt) unless instant. */
  setPalette(name, instant = false) {
    const p = this.palettes[name] || this.palettes.classic;
    this.paletteTarget = p;
    if (instant) this.inks = { paper: [...p.paper], B: [...p.B], P: [...p.P], Y: [...p.Y] };
    this._pushInks();
  }

  /** Ease the inks toward the target set (re-inking the press). Call every frame. */
  tickPalette(dt) {
    easePalette(this.inks, this.paletteTarget, dt);
    this._pushInks();
  }

  _pushInks() {
    const u = this.uniforms;
    u.uPaper.value.set(...this.inks.paper);
    u.uInkB.value.set(...this.inks.B);
    u.uInkP.value.set(...this.inks.P);
    u.uInkY.value.set(...this.inks.Y);
  }

  setPixelRatio(px) {
    this.px = px;
    this.renderer.setPixelRatio(px);
    inkUniforms.uPx.value = px;
    this.uniforms.uPx.value = px;
    this.resize(this.width, this.height);
  }

  resize(w = window.innerWidth, h = window.innerHeight) {
    this.renderer.setSize(w, h, false);
    const W = Math.max(1, Math.floor(w * this.px)), H = Math.max(1, Math.floor(h * this.px));
    this.target.setSize(W, H);
    this.uniforms.uRes.value.set(W, H);
    this.width = w; this.height = h;
  }

  /**
   * Draw a frame. `vmScene`/`vmCamera`: an optional first-person view model (hands, held items) drawn first;
   * its materials must come from vmMaterial().
   * Perspective cameras only (depth is linearised with camera.near/far).
   */
  render(scene, camera, vmScene, vmCamera) {
    const r = this.renderer;
    const u = this.uniforms;
    const fx = this.fx;
    u.uEnergy.value = fx.energy; u.uFreeze.value = fx.freeze; u.uDash.value = fx.dash; u.uSpeed.value = fx.speed;
    u.uFocus.value = fx.focus; u.uHit.value = fx.hit; u.uFlash.value = fx.flash; u.uFlashScale.value = fx.flashScale;
    u.uDead.value = fx.dead; u.uReplay.value = fx.replay; u.uWipe.value = fx.wipe;
    u.uTimeR.value = performance.now() / 1000;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    // the G-buffer holds role ids, so a background colour or texture must not be drawn into it
    const bg = scene.background;
    scene.background = null;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    if (vmScene) {
      // hands first (they mark the stencil), then the world everywhere else,
      // so the depth buffer keeps real world depth for the post pass
      r.render(vmScene, vmCamera);
      r.clearDepth();
    }
    r.render(scene, camera);
    scene.background = bg;
    r.setRenderTarget(null);
    r.clear(true, true, true);
    r.render(this.postScene, this.postCam);
  }

  dispose() {
    this.target.dispose();
    this.target.depthTexture.dispose();
    this.postMat.dispose();
  }
}
