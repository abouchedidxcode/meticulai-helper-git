// Tilt-shift macro lens: makes a three.js scene look like a macro photograph of a toy.
//   scene (linear HDR, MSAA, depth) -> ground-truth ambient occlusion -> tilt-shift lens (depth of field focused on
//   your subject, with the plane of focus tilted into a thin band across the frame) -> bloom -> filmic grade (AgX,
//   white balance, contrast, grain, vignette, lens fringing).
// Quality presets trade those passes off, and the lens steps down automatically when frames run long.
// From Lost Marbles by Meticulai (meticulai.com). three 0.187, WebGL2.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import {
  QUALITY, TILT_PREF, LENS_DEFAULTS, TILT_SHOTS, shotCore, dofNumbers, createLensState, easeLens, settleLens, createPerfGovernor,
} from './quality.js';

export { QUALITY, TILT_PREF, LENS_DEFAULTS, TILT_SHOTS, RES_MIN, createPerfGovernor } from './quality.js';

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Single-pass gather bokeh (technique after Dennis Gustafsson, reimplemented): samples on a golden-angle spiral,
// each weighted by whether its own circle of confusion reaches the centre pixel, so sharp foreground never smears.
//
// Tilt-shift: a shifted, tilted lens turns the plane of focus so it cuts the scene in a thin band, and the world
// reads as a miniature. The circle of confusion is the larger of the ordinary depth term and a tilt term that grows
// with screen distance from a band through the subject (the ramp above and below the band can differ). Both feed
// the same occlusion-aware gather, so a sharp subject never bleeds and blurred foreground smears over the band the
// way a real lens does. Toward the corners the bokeh discs are clipped into cat's eyes (optical vignetting).
// Taps read a mip level matched to their spacing and the spiral is rotated per pixel, so even a wide blur with few
// taps comes out as smooth bokeh rather than stacked copies of the sharp image.
const DOF_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uFgK;
  uniform float uMaxBlur;
  uniform float uNear;
  uniform float uFar;
  uniform float uRadScale;
  uniform vec4 uTilt;      // band centre (ndc y), sharp half-width, tilt blur (px), band roll (radians)
  uniform vec2 uTiltSpan;  // ramp length above / below the band (ndc)
  uniform float uAspect;
  uniform float uCatEye;
  uniform float uLod;
  varying vec2 vUv;
  float linDepth(float d) {
    float z = d * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
  }
  float tiltCoc(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    float d = (p.y - uTilt.x) * cos(uTilt.w) - p.x * uAspect * sin(uTilt.w);
    float t = d > 0.0 ? (d - uTilt.y) / uTiltSpan.x : (-d - uTilt.y) / uTiltSpan.y;
    t = clamp(t, 0.0, 1.0);
    return uTilt.z * t * t * (3.0 - 2.0 * t);
  }
  float coc(float z, vec2 uv) {
    float k = z < uFocus ? uFgK : 1.0;
    float c = uAperture * k * abs(1.0 / uFocus - 1.0 / z);
    return clamp(max(c, tiltCoc(uv)), 0.0, uMaxBlur);
  }
  void main() {
    float cz = linDepth(texture2D(tDepth, vUv).x);
    float cs = coc(cz, vUv);
    vec3 col = textureLod(tColor, vUv, 0.0).rgb;
    float tot = 1.0;
    // Interleaved gradient noise: a different spiral rotation and start radius for every pixel.
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float radius = uRadScale * (0.5 + n);
    float ang = n * 6.2831853;
    vec2 cat = (vUv - 0.5) * vec2(uAspect, 1.0) * uCatEye;
    for (int i = 0; i < 160; i++) {
      if (radius >= uMaxBlur) break;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 tc = vUv + dir * uTexel * radius;
      vec3 sc = textureLod(tColor, tc, uLod).rgb;
      float sz = linDepth(texture2D(tDepth, tc).x);
      float ss = coc(sz, tc);
      if (sz > cz) ss = clamp(ss, 0.0, cs * 2.0);
      float m = smoothstep(radius - 0.5, radius + 0.5, ss);
      // Cat's-eye bokeh: the sample's disc is the overlap of two circles, the second pushed toward the edge.
      m *= 1.0 - smoothstep(ss - 0.5, ss + 0.5, length(dir * radius + cat * ss));
      col += mix(col / tot, sc, m);
      tot += 1.0;
      radius += uRadScale / radius;
      ang += 2.39996323;
    }
    // Alpha: how far this pixel is out of focus, used to blend a half-resolution blur over the sharp frame. It ramps
    // in only once the blur is a few pixels wide, where the half-resolution image no longer shows its own pixels.
    gl_FragColor = vec4(col / tot, clamp((cs - 1.0) / 2.5, 0.0, 1.0));
  }`;

const GRADE_FRAG = /* glsl */ `
  #include <common>
  #include <tonemapping_pars_fragment>
  uniform sampler2D tColor;
  uniform sampler2D tBlur;
  uniform float uHalf;
  uniform vec2 uBlurTexel;
  uniform float uTime;
  uniform float uFlash;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uFringe;
  uniform float uMini;
  uniform vec3 uBalance;
  uniform float uNightSat;
  uniform float uSat;
  uniform float uSatMini;
  uniform float uCurve;
  uniform float uCurveMini;
  uniform vec2 uRes;
  varying vec2 vUv;
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 srgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec2 d = vUv - 0.5;
    // Lateral chromatic aberration toward the frame edges, like a real lens.
    vec2 off = d * dot(d, d) * uFringe;
    vec3 c;
    c.r = texture2D(tColor, vUv - off).r;
    c.g = texture2D(tColor, vUv).g;
    c.b = texture2D(tColor, vUv + off).b;
    if (uHalf > 0.5) {
      // Four bilinear taps (a tent filter) so the half-resolution blur upsamples smoothly instead of in blocks.
      vec2 h = uBlurTexel * 0.5;
      vec4 b = 0.25 * (texture2D(tBlur, vUv + vec2(-h.x, -h.y)) + texture2D(tBlur, vUv + vec2(h.x, -h.y))
        + texture2D(tBlur, vUv + vec2(-h.x, h.y)) + texture2D(tBlur, vUv + vec2(h.x, h.y)));
      c = mix(c, b.rgb, b.a);
    }
    c += vec3(uFlash);
    c *= uBalance;
    #ifdef NIGHT
    // Night: a little less saturated, as a photograph taken at night is.
    c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uNightSat);
    #endif
    c = AgXToneMapping(c);
    // Gentle S-curve and a touch of saturation back (AgX is neutral by design). Miniature photographs read as toys
    // partly through richer colour and contrast; uMini follows the tilt amount.
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat + uSatMini * uMini);
    c = clamp(c, 0.0, 1.0);
    c = c * c * (3.0 - 2.0 * c) * (uCurve + uCurveMini * uMini) + c * (1.0 - uCurve - uCurveMini * uMini);
    // Optical vignette.
    float v = smoothstep(1.05, 0.25, length(d * vec2(uRes.x / uRes.y, 1.0) * 0.82));
    c *= mix(1.0, v, uVignette);
    vec3 o = srgb(clamp(c, 0.0, 1.0));
    // Film grain in display space, strongest in the mids.
    float g = hash12(vUv * uRes + fract(uTime * 37.0) * 97.0) - 0.5;
    o += g * uGrain * (1.0 - abs(o - 0.5) * 1.2);
    gl_FragColor = vec4(o, 1.0);
  }`;

/**
 * A WebGLRenderer set up the way the lens wants it: no canvas antialias (the scene target has MSAA), no tone
 * mapping (the grade does AgX itself), sRGB output, PCF shadows.
 * @param {HTMLCanvasElement} [canvas]
 */
export function createLensRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NoToneMapping;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

export class TiltShiftLens {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} [options]
   * @param {'high'|'medium'|'low'} [options.quality='high']
   * @param {THREE.DirectionalLight} [options.sun] if given, presets set its shadow map size and softness, and `low`
   *   redraws its shadow map every 2nd frame (redrawn at once when the sun's target moves more than 4 units)
   * @param {boolean} [options.autoQuality=true] step presets down when slow (dynamic resolution always runs)
   * @param {boolean} [options.adaptive=true] dynamic resolution on/off
   * @param {number} [options.frameBudget=1/60] seconds per frame to aim for
   * @param {number} [options.tilt=1] the player's tilt setting (TILT_PREF.off / on / strong)
   * Any key of LENS_DEFAULTS overrides that number.
   */
  constructor(renderer, scene, camera, options = {}) {
    const { quality = 'high', sun = null, autoQuality = true, adaptive = true, frameBudget = 1 / 60, tilt = TILT_PREF.on, ...rest } = options;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sun = sun;
    this.opts = { ...LENS_DEFAULTS, ...rest, bloom: { ...LENS_DEFAULTS.bloom, ...(rest.bloom || {}) } };
    this.lens = createLensState();
    this.lens.fgK = this.opts.fgK;
    this.tiltPref = tilt;
    this.exposure = this.opts.exposure;
    this.flashAmount = 0;
    this.time = 0;
    this.frozen = false;
    this.night = false;
    this.width = 0;
    this.height = 0;
    this.frameNo = 0;
    this.rtFrames = 0;
    this.shadowEveryOverride = null;
    this.shadowFocus = new THREE.Vector3(Infinity, 0, 0);
    /** Called with the new preset name when auto quality steps down. */
    this.onQualityChange = null;
    /** Called once when even the lowest preset at the lowest resolution stays slow (lock the game to 30 fps). */
    this.onSustainedSlow = null;
    this.perf = createPerfGovernor({ quality, frameBudget, autoQuality, adaptive, now: performance.now() });
    this.resScale = 1;
    this.quality = null;
    this.fsq = new FullScreenQuad(null);
    const o = this.opts;
    this.dofMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 10 },
        uAperture: { value: 100 }, uFgK: { value: o.fgK }, uMaxBlur: { value: 14 }, uNear: { value: 0.3 }, uFar: { value: 2400 }, uRadScale: { value: 2 },
        uTilt: { value: new THREE.Vector4(-0.2, 0.2, 0, 0) }, uTiltSpan: { value: new THREE.Vector2(0.85, 0.5) }, uAspect: { value: 1 },
        uCatEye: { value: o.catEye }, uLod: { value: 1 },
      },
      vertexShader: VERT, fragmentShader: DOF_FRAG, depthTest: false, depthWrite: false,
    });
    this.gradeMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tBlur: { value: null }, uHalf: { value: 0 }, uBlurTexel: { value: new THREE.Vector2(1, 1) },
        toneMappingExposure: { value: 1 }, uTime: { value: 0 }, uFlash: { value: 0 }, uVignette: { value: o.vignette },
        uGrain: { value: o.grain }, uFringe: { value: o.fringe }, uMini: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        uBalance: { value: new THREE.Vector3(...o.whiteBalance) }, uNightSat: { value: o.nightSaturation },
        uSat: { value: o.saturation }, uSatMini: { value: o.saturationMini }, uCurve: { value: o.curve }, uCurveMini: { value: o.curveMini },
      },
      vertexShader: VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false,
    });
    const size = renderer.getSize(new THREE.Vector2());
    this.width = size.x || 1;
    this.height = size.y || 1;
    this.setQuality(quality);
  }

  /** The current preset object. */
  get Q() {
    return QUALITY[this.quality];
  }

  /** 'high' | 'medium' | 'low'. Rebuilds the render targets. */
  setQuality(q) {
    if (!QUALITY[q]) q = 'medium';
    if (q === this.quality) return;
    this.quality = q;
    this.perf.quality = q;
    this.shadowFocus.set(Infinity, 0, 0); // the shadow map is recreated: redraw it on the next frame
    const Q = QUALITY[q];
    if (this.sun) {
      const s = this.sun.shadow;
      if (s.map) {
        s.map.dispose();
        s.map = null;
      }
      s.mapSize.set(Q.shadow, Q.shadow);
      s.radius = q === 'low' ? 1 : 2.5;
    }
    this.applyPixelRatio();
    this.buildTargets();
  }

  applyPixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.Q.pixelRatio) * this.resScale);
    this.renderer.setSize(this.width, this.height, false);
  }

  buildTargets() {
    const Q = this.Q;
    const o = this.opts;
    for (const t of [this.sceneRT, this.rtA, this.rtB, this.rtDof]) if (t) t.dispose();
    if (this.gtao) this.gtao.dispose();
    if (this.bloom) this.bloom.dispose();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    // The depth-of-field source (the scene, or the AO output) keeps mips for the wide bokeh taps.
    const mips = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.msaa, depthTexture: depth, ...(Q.ao ? {} : mips) });
    this.rtA = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, ...(Q.ao ? mips : {}) });
    this.rtB = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtDof = Q.dof && Q.dof.half ? new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), { type: THREE.HalfFloatType, depthBuffer: false }) : null;
    this.gtao = null;
    if (Q.ao) {
      const g = new GTAOPass(this.scene, this.camera, Math.ceil(w / 2), Math.ceil(h / 2));
      // Reuse the scene depth: no second geometry pass (normals are rebuilt from depth).
      g.setGBuffer(this.sceneRT.depthTexture);
      g.updateGtaoMaterial(o.ao);
      g.updatePdMaterial(o.aoDenoise);
      g.blendIntensity = o.aoBlend;
      this.gtao = g;
    }
    this.bloom = Q.bloom ? new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), o.bloom.strength, o.bloom.radius, o.bloom.threshold) : null;
    if (this.bloom) this.bloom.threshold = this.night ? o.bloom.nightThreshold : o.bloom.threshold;
    this.rtFrames = 0;
    this.syncSizes();
  }

  /** Call when the canvas changes size (CSS pixels). Does not touch the camera: set its aspect yourself. */
  setSize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.syncSizes();
  }

  syncSizes() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const W = Math.max(1, size.x), H = Math.max(1, size.y);
    if (this.sceneRT && (this.sceneRT.width !== W || this.sceneRT.height !== H)) {
      this.sceneRT.setSize(W, H);
      this.rtA.setSize(W, H);
      this.rtB.setSize(W, H);
      if (this.rtDof) this.rtDof.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
      if (this.gtao) this.gtao.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
      if (this.bloom) this.bloom.setSize(W / 2, H / 2);
    }
    this.dofMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this.dofMat.uniforms.uAspect.value = W / H;
    this.gradeMat.uniforms.uRes.value.set(W, H);
  }

  /**
   * Focus distance (world units from the camera), smoothed like a focus puller.
   * aperture: 1 normal; ~0.25-0.5 deep focus (the band does the work); ~10 a macro lens's shallow focus.
   * fgK: foreground blur relative to background.
   */
  setFocusDistance(d, aperture = 1, fgK = this.opts.fgK) {
    this.lens.fgK = fgK;
    this.lens.focusTarget = Math.max(1e-3, d);
    this.lens.aperture = aperture;
  }

  /**
   * Tilt-shift band. y: band centre in NDC (-1 bottom .. 1 top), core: half-width kept sharp (NDC),
   * amount: 0 none, 1 normal, ~1.6 cinematic; roll tilts the band (radians); up/down: ramp lengths above / below.
   */
  setTiltShift(y, core, amount, { roll = 0, up = 0.85, down = 0.5 } = {}) {
    const t = this.lens;
    t.yT = Math.max(-0.95, Math.min(0.95, y));
    t.coreT = core;
    t.amtT = amount;
    t.rollT = roll;
    t.up = up;
    t.down = down;
  }

  /**
   * One call per frame for the common case: focus on a world point and put the band through it.
   * shot: a TILT_SHOTS name or object. subjectRadius: the subject's size in world units (bands that grow with it).
   * roll: overrides the shot's roll (animate it with a slow sine for flyovers).
   */
  focusOn(point, shot = 'play', { subjectRadius = 0.5, roll } = {}) {
    const s = typeof shot === 'string' ? TILT_SHOTS[shot] : shot;
    const cam = this.camera;
    cam.updateMatrixWorld();
    const d = cam.position.distanceTo(point);
    const v = point.clone().project(cam);
    if (v.z > 1 || !Number.isFinite(v.y)) return;
    const halfTan = Math.tan((cam.fov * Math.PI) / 360);
    const subject = subjectRadius / Math.max(1e-3, d * halfTan);
    this.setFocusDistance(d, s.aperture ?? 1, s.fgK ?? this.opts.fgK);
    this.setTiltShift(v.y, shotCore(s, subject), s.amount, { roll: roll ?? s.roll ?? 0, up: s.up, down: s.down });
  }

  /** Jump the focus and band to their targets now (first frame, camera cuts, screenshots). */
  settle() {
    settleLens(this.lens, this.tiltPref);
  }

  /** A short white flash (hits, pickups, a camera flash). */
  flash(amount = 1) {
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  /** Night grade: near neutral, less saturated, a stronger vignette, bloom only from what is really bright. */
  setNight(on) {
    on = !!on;
    if (on === this.night) return;
    this.night = on;
    const o = this.opts;
    const m = this.gradeMat;
    if (on) m.defines.NIGHT = '';
    else delete m.defines.NIGHT;
    m.needsUpdate = true;
    m.uniforms.uVignette.value = on ? o.vignetteNight : o.vignette;
    m.uniforms.uBalance.value.set(...(on ? o.nightBalance : o.whiteBalance));
    if (this.bloom) this.bloom.threshold = on ? o.bloom.nightThreshold : o.bloom.threshold;
  }

  /** Holds lens time still and turns film grain off, so two runs give the same pixels (tests, screenshots). */
  setFrozen(on) {
    this.frozen = !!on;
  }

  /** The frame time to aim for (1/30 at a 30 fps cap). adapt false holds the resolution (e.g. behind menus). */
  setFrameBudget(seconds, adapt = true) {
    this.perf.setFrameBudget(seconds, adapt, performance.now());
  }

  /** Last frame's scene before bloom and grade (AO output on high, else the half-res blur), for glass/refraction. */
  lastFrameTexture() {
    if (this.rtFrames < 2) return null;
    if (this.gtao) return this.rtA.texture;
    return this.rtDof ? this.rtDof.texture : null;
  }

  /**
   * Draw everything once off screen with culling off, so every geometry, texture and shader (shadow variants
   * included) is uploaded and compiled now instead of mid-play. Objects with userData.noWarm are left alone.
   */
  warmUp() {
    const r = this.renderer;
    const touched = [];
    this.scene.traverse((o) => {
      if (o.isLight || o.userData.noWarm) return;
      if (!o.visible || ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled)) {
        touched.push([o, o.visible, o.frustumCulled]);
        o.visible = true;
        o.frustumCulled = false;
      }
    });
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
    const prev = r.getRenderTarget();
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    rt.dispose();
    for (const [o, vis, fc] of touched) {
      o.visible = vis;
      o.frustumCulled = fc;
    }
  }

  /** Draw a frame. Replaces renderer.render(scene, camera). dt in seconds. */
  render(dt) {
    if (this.frozen) dt = 0;
    this.time += dt;
    const o = this.opts;
    if (this.flashAmount > 0) this.flashAmount = Math.max(0, this.flashAmount - dt * o.flashDecay);
    const r = this.renderer;
    const Q = this.Q;
    const camera = this.camera;
    const t = easeLens(this.lens, dt, this.tiltPref, o);
    if (this.gtao) this.gtao.camera = camera;
    this.rtFrames++;
    this.frameNo++;
    // The sun's shadow map is a second render of the scene. On low it is redrawn every other frame: static shadows
    // stay exactly in place and only moving things' shadows trail by a frame. A jump of the sun's target (a camera
    // cut) redraws at once. At a 30 fps budget every frame already counts double, so redraw it every frame there.
    const sm = r.shadowMap;
    const every = this.shadowEveryOverride || (this.perf.frameBudget > 1 / 45 ? 1 : Q.shadowEvery || 1);
    if (this.sun && every > 1) {
      sm.autoUpdate = false;
      const tp = this.sun.target.position;
      if (this.frameNo % every === 0 || this.shadowFocus.distanceToSquared(tp) > 16) {
        sm.needsUpdate = true;
        this.shadowFocus.copy(tp);
      }
    } else sm.autoUpdate = true;
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(this.scene, camera);
    let src = this.sceneRT;
    if (this.gtao) {
      this.gtao.render(r, this.rtA, this.sceneRT);
      src = this.rtA;
    }
    if (Q.dof) {
      const u = this.dofMat.uniforms;
      const n = dofNumbers(Q.dof, this.sceneRT.height, t.aperture, t.amt, o);
      u.tColor.value = src.texture;
      u.tDepth.value = this.sceneRT.depthTexture;
      u.uFocus.value = t.focus;
      u.uMaxBlur.value = n.maxBlur;
      u.uAperture.value = n.aperturePx;
      u.uFgK.value = t.fgK;
      u.uRadScale.value = n.radScale;
      u.uLod.value = n.lod;
      u.uTilt.value.set(t.y, t.core, n.tiltPx, t.roll);
      u.uTiltSpan.value.set(t.up, t.down);
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      const dst = this.rtDof || (src === this.rtA ? this.rtB : this.rtA);
      this.fsq.material = this.dofMat;
      r.setRenderTarget(dst);
      this.fsq.render(r);
      if (!this.rtDof) src = dst;
    }
    if (this.bloom) this.bloom.render(r, null, src, dt, false);
    const g = this.gradeMat.uniforms;
    g.tColor.value = src.texture;
    g.tBlur.value = this.rtDof ? this.rtDof.texture : null;
    g.uHalf.value = this.rtDof ? 1 : 0;
    if (this.rtDof) g.uBlurTexel.value.set(1 / this.rtDof.width, 1 / this.rtDof.height);
    g.toneMappingExposure.value = this.exposure;
    g.uTime.value = this.time;
    g.uFlash.value = this.flashAmount * o.flashGain;
    g.uMini.value = Q.dof ? Math.min(1, t.amt) : 0;
    g.uGrain.value = this.frozen ? 0 : this.quality === 'low' ? o.grainLow : o.grain;
    this.fsq.material = this.gradeMat;
    r.setRenderTarget(null);
    this.fsq.render(r);
    this.trackPerf(dt);
  }

  // Dynamic resolution: when frames run long, render fewer pixels and creep back up once there is headroom. Only at
  // the lowest scale does auto quality drop a whole preset.
  trackPerf(dt) {
    if (this.frozen) return;
    const a = this.perf.tick(dt, performance.now());
    if (!a) return;
    if (a.type === 'res') {
      this.resScale = a.scale;
      this.applyPixelRatio();
      this.syncSizes();
    } else if (a.type === 'quality') {
      this.resScale = a.scale;
      this.setQuality(a.quality);
      if (this.onQualityChange) this.onQualityChange(a.quality);
    } else if (a.type === 'slow' && this.onSustainedSlow) this.onSustainedSlow();
  }

  dispose() {
    for (const t of [this.sceneRT, this.rtA, this.rtB, this.rtDof]) if (t) t.dispose();
    if (this.gtao) this.gtao.dispose();
    if (this.bloom) this.bloom.dispose();
    this.dofMat.dispose();
    this.gradeMat.dispose();
    this.fsq.dispose();
  }
}
