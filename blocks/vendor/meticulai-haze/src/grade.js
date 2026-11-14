// The final picture for the haze look (Hezarfen's frame pipeline): the world drawn into a multisampled HDR target,
// an optional overlay scene with its own depth range (first-person hands, a cockpit), a faint bloom, sun shafts
// that silhouettes cut, and ONE final pass: exposure, Khronos Neutral tone map (AgX or ACES selectable), a small
// lift, saturation, contrast, warm-highlight/cool-shadow split, light sharpen, vignette, grain, fade to black, and
// a radial "dive" streak at the edges driven by one number (speed).
//
// Needs `three/addons` (EffectComposer, RenderPass, UnrealBloomPass, ShaderPass). Sets renderer.toneMapping to
// NoToneMapping: the tone map happens in the final pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Hezarfen's grade (v5) as it ships. */
export const GRADE_DEFAULTS = Object.freeze({
  exposure: 1.05,
  toneMap: 'neutral', // 'neutral' | 'agx' | 'aces' (Neutral kept the sky's pinks and oranges; AgX and ACES washed them)
  contrast: 1.12,
  saturation: 1.06,
  lift: 0.02, // keeps dark colours out of the neutral tone map's toe (it over-saturates darks)
  sharpen: 0.16,
  vignette: 0.32,
  grain: 0.022,
  tint: [1.0, 0.985, 0.96],
  bloom: true, // faint: strength 0.14, radius 0.7, threshold 1.45, at quarter resolution
  bloomStrength: 0.14,
  bloomRadius: 0.7,
  bloomThreshold: 1.45,
  rays: true, // sun shafts when the sun is in or near the frame
  raysStrength: 0.12,
  samples: 4, // MSAA on the HDR target (0 on weak machines)
});

const TONEMAPS = { agx: 0, aces: 1, neutral: 2 };

const FinalShader = {
  name: 'HazeGrade',
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1.0 },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.022 },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.12 },
    uFade: { value: 0 }, // 0 clear .. 1 black (crash, transitions)
    uSpeed: { value: 0 }, // 0..1 radial streak amount at the edges (dives)
    uTint: { value: new THREE.Vector3(1.0, 0.985, 0.96) },
    uTM: { value: 2 }, // 0 AgX, 1 ACES filmic, 2 Khronos neutral
    uSharpen: { value: 0.16 },
    uLift: { value: 0.02 },
    uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    tRays: { value: null },
    uRays: { value: 0 },
    tBloom: { value: null },
    uBloom: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uFade;
    uniform float uSpeed;
    uniform vec3 uTint;
    uniform int uTM;
    uniform float uSharpen;
    uniform float uLift;
    uniform vec2 uTexel;
    uniform sampler2D tRays;
    uniform float uRays;
    uniform sampler2D tBloom;
    uniform float uBloom;
    varying vec2 vUv;
    #include <tonemapping_pars_fragment>

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (uSpeed > 0.01) {
        // a few taps toward the centre, only near the edges: wind streaks in a dive without smearing the view
        float amt = uSpeed * smoothstep(0.06, 0.42, r2) * 0.05;
        col = vec3(0.0);
        float j = hash(gl_FragCoord.xy + uTime);
        for (int i = 0; i < 6; i++) {
          float t = (float(i) + j) / 6.0;
          col += texture2D(tDiffuse, vUv - c * amt * t).rgb;
        }
        col /= 6.0;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
        if (uSharpen > 0.001) {
          // light unsharp mask against the four neighbours, limited so bright edges do not ring
          vec3 n = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
          vec3 d = col - n * 0.25;
          col = max(col + clamp(d, -0.25 * col - 0.02, 0.25 * col + 0.02) * uSharpen * 2.0, 0.0);
        }
      }
      if (uBloom > 0.5) col += texture2D(tBloom, vUv).rgb;
      if (uRays > 0.005) col += texture2D(tRays, vUv).rgb * uRays;
      col *= uTint;
      // The neutral tone map's toe subtracts the smallest channel, so dark colours come out more saturated than they
      // went in (shaded terracotta turned blood red, brown leather turned orange). A small lift keeps darks out of it.
      col += uLift;
      col = uTM == 1 ? ACESFilmicToneMapping(col) : uTM == 2 ? NeutralToneMapping(col) : AgXToneMapping(col);
      // display-referred grade
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      // warm highlights, cool shadows, very slightly
      col += vec3(0.012, 0.004, -0.01) * smoothstep(0.45, 1.0, l) + vec3(-0.006, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.4, l));
      col *= 1.0 - uVignette * smoothstep(0.1, 0.62, r2);
      col = clamp(col, 0.0, 1.0);
      col = sRGBTransferOETF(vec4(col, 1.0)).rgb;
      col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Sun shafts: keep only the brightest sky near the sun, smear it away from the sun's screen position in two passes at
// quarter resolution, and add it back faintly. Silhouettes cut the shafts.
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uThreshold: { value: 1.25 }, uFirst: { value: 1 }, uStep: { value: 0.012 }, uAspect: { value: 1.78 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uThreshold;
    uniform float uFirst;
    uniform float uStep;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec2 d = (uSun - vUv);
      float len = length(d * vec2(uAspect, 1.0));
      vec2 stepv = d / max(len, 1e-4) * uStep * min(len / (uStep * 12.0), 1.0);
      vec3 acc = vec3(0.0);
      float w = 0.0;
      for (int i = 0; i < 12; i++) {
        vec2 uv = vUv + stepv * float(i);
        vec3 c = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        if (uFirst > 0.5) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c *= smoothstep(uThreshold, uThreshold * 2.2, l);
          // only the sky around the sun may start a shaft: highlights on the ground or water lower down must not
          c *= 1.0 - smoothstep(0.09, 0.19, length((uv - uSun) * vec2(uAspect, 1.0)));
          c = min(c, vec3(6.0));
        }
        float k = 1.0 - float(i) / 12.0;
        acc += c * k;
        w += k;
      }
      gl_FragColor = vec4(acc / w, 1.0);
    }`,
};


/**
 * @param {object} o
 * @param {THREE.WebGLRenderer} o.renderer
 * @param {THREE.Scene} o.scene
 * @param {THREE.Camera} o.camera
 * @param {THREE.Scene} [o.overlayScene] drawn after the world with cleared depth (first-person rig, cockpit)
 * @param {THREE.Camera} [o.overlayCamera]
 * @param {Partial<typeof GRADE_DEFAULTS>} [o.options]
 */
export function createHazePost({ renderer, scene, camera, overlayScene = null, overlayCamera = null, options = {} }) {
  const opt = { ...GRADE_DEFAULTS, ...options };
  renderer.toneMapping = THREE.NoToneMapping;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // (the frame is fill-bound and the multisampled float target is the dearest thing in it. Depth is never read back,
  // so it is not resolved.)
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: opt.samples, depthBuffer: true, resolveDepthBuffer: false });
  const composer = new EffectComposer(renderer, target);

  const worldPass = new RenderPass(scene, camera);
  composer.addPass(worldPass);

  let overlayPass = null;
  if (overlayScene) {
    overlayPass = new RenderPass(overlayScene, overlayCamera);
    overlayPass.clear = false;
    overlayPass.clearDepth = true;
    composer.addPass(overlayPass);
  }

  let bloomPass = null;
  if (opt.bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), opt.bloomStrength, opt.bloomRadius, opt.bloomThreshold);
    // The bloom here is a faint glow, so it does not need the pass's usual half-resolution chain: start it at a quarter.
    const bloomSetSize = bloomPass.setSize.bind(bloomPass);
    bloomPass.resScale = 0.5;
    bloomPass.setSize = (w, h) => bloomSetSize(Math.max(8, Math.round(w * bloomPass.resScale)), Math.max(8, Math.round(h * bloomPass.resScale)));
    // The stock pass ends by blending its result back over the frame: one more render into the multisampled target
    // and one more resolve. The final shader adds the glow instead (tBloom), so this is the pass's own render()
    // (three r186/r187) without that last step.
    bloomPass.render = function (renderer, writeBuffer, readBuffer) {
      renderer.getClearColor(this._oldClearColor);
      this._oldClearAlpha = renderer.getClearAlpha();
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setClearColor(this.clearColor, 0);
      this.highPassUniforms.tDiffuse.value = readBuffer.texture;
      this.highPassUniforms.luminosityThreshold.value = this.threshold;
      this._fsQuad.material = this.materialHighPassFilter;
      renderer.setRenderTarget(this.renderTargetBright);
      renderer.clear();
      this._fsQuad.render(renderer);
      let input = this.renderTargetBright;
      for (let i = 0; i < this.nMips; i++) {
        const m = this.separableBlurMaterials[i];
        this._fsQuad.material = m;
        m.uniforms.colorTexture.value = input.texture;
        m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
        renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
        renderer.clear();
        this._fsQuad.render(renderer);
        m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
        m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
        renderer.setRenderTarget(this.renderTargetsVertical[i]);
        renderer.clear();
        this._fsQuad.render(renderer);
        input = this.renderTargetsVertical[i];
      }
      this._fsQuad.material = this.compositeMaterial;
      this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
      this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
      this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
      renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
      renderer.clear();
      this._fsQuad.render(renderer);
      renderer.setClearColor(this._oldClearColor, this._oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    };
    composer.addPass(bloomPass);
  }

  // sun shafts (two quarter-resolution targets, ping-pong)
  const raysA = new THREE.WebGLRenderTarget(Math.max(2, size.x >> 2), Math.max(2, size.y >> 2), { type: THREE.HalfFloatType, depthBuffer: false });
  const raysB = raysA.clone();
  const raysMat = new THREE.ShaderMaterial({ ...RaysShader, uniforms: THREE.UniformsUtils.clone(RaysShader.uniforms), depthTest: false, depthWrite: false });
  const raysQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), raysMat);
  raysQuad.frustumCulled = false;
  const raysScene = new THREE.Scene();
  raysScene.add(raysQuad);
  const raysCam = new THREE.Camera();
  const sunNdc = new THREE.Vector3();
  const fwdV = new THREE.Vector3();
  const rays = { enabled: opt.bloom && opt.rays, strength: opt.raysStrength, amount: 0 };
  const raysPass = {
    enabled: true, needsSwap: false, clear: false, renderToScreen: false,
    setSize() {}, dispose() {},
    render(rendererArg, writeBuffer, readBuffer) {
      if (!rays.enabled || rays.amount < 0.01) return;
      const ru = raysMat.uniforms;
      ru.uAspect.value = readBuffer.width / readBuffer.height;
      ru.tDiffuse.value = readBuffer.texture;
      ru.uFirst.value = 1;
      ru.uStep.value = 0.016;
      rendererArg.setRenderTarget(raysA);
      rendererArg.render(raysScene, raysCam);
      ru.tDiffuse.value = raysA.texture;
      ru.uFirst.value = 0;
      ru.uStep.value = 0.045;
      rendererArg.setRenderTarget(raysB);
      rendererArg.render(raysScene, raysCam);
    },
  };
  composer.addPass(raysPass);

  const finalPass = new ShaderPass(new THREE.ShaderMaterial({ ...FinalShader, uniforms: THREE.UniformsUtils.clone(FinalShader.uniforms), defines: { AGX_TONE_MAPPING: '' } }));
  composer.addPass(finalPass);
  const u = finalPass.material.uniforms;
  u.uSharpen.value = opt.sharpen;
  u.uLift.value = opt.lift;
  u.uContrast.value = opt.contrast;
  u.uSaturation.value = opt.saturation;
  u.uVignette.value = opt.vignette;
  u.uGrain.value = opt.grain;
  u.uTint.value.set(opt.tint[0], opt.tint[1], opt.tint[2]);
  u.uTM.value = TONEMAPS[opt.toneMap] ?? 2;
  u.toneMappingExposure.value = opt.exposure;

  let lastTime = 0;
  const api = {
    composer, worldPass, overlayPass, bloomPass, uniforms: u, rays,
    set exposure(v) { u.toneMappingExposure.value = v; renderer.toneMappingExposure = v; },
    get exposure() { return u.toneMappingExposure.value; },
    /** 0..1 (up to 1.6): radial wind streaks at the edges, e.g. smoothstep(24, 44, speed) in a dive */
    set speed(v) { u.uSpeed.value = v; },
    get speed() { return u.uSpeed.value; },
    /** 0 clear .. 1 black (crash, transitions) */
    set fade(v) { u.uFade.value = v; },
    get fade() { return u.uFade.value; },
    set toneMap(name) { u.uTM.value = TONEMAPS[name] ?? 2; },
    /** call on resize with CSS pixels and the renderer's pixel ratio */
    setSize(w, h, pixelRatio = renderer.getPixelRatio()) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      u.uTexel.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
      raysA.setSize(Math.max(2, (w * pixelRatio) >> 2), Math.max(2, (h * pixelRatio) >> 2));
      raysB.setSize(Math.max(2, (w * pixelRatio) >> 2), Math.max(2, (h * pixelRatio) >> 2));
    },
    /** sunDir: unit vector toward the sun disc. Shafts only when the sun is in or near the frame. Call each frame. */
    updateSun(sunDir) {
      sunNdc.copy(sunDir).multiplyScalar(10000).add(camera.position).project(camera);
      const fwd = camera.getWorldDirection(fwdV).dot(sunDir);
      const on = fwd > 0.15 ? 1 - Math.min(1, Math.max(0, (Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)) - 1.1) / 0.6)) : 0;
      rays.amount = on * rays.strength;
      raysMat.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
      u.tRays.value = raysB.texture;
      u.uRays.value = rays.enabled ? rays.amount : 0;
    },
    /** replaces renderer.render(scene, camera). time in seconds (animates grain and the streak jitter) */
    render(dt, time = lastTime + dt) {
      lastTime = time;
      u.uTime.value = time;
      u.uBloom.value = bloomPass && bloomPass.enabled ? 1 : 0;
      if (bloomPass) u.tBloom.value = bloomPass.renderTargetsHorizontal[0].texture;
      composer.render(dt);
    },
    dispose() {
      composer.dispose();
      raysA.dispose();
      raysB.dispose();
      raysMat.dispose();
      finalPass.material.dispose();
    },
  };
  api.exposure = opt.exposure;
  return api;
}
