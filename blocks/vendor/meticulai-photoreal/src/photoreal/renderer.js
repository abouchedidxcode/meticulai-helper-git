// PhotoRenderer: renders a three.js scene so it reads as a photograph.
//
//   const pr = new PhotoRenderer({ canvas, quality: 'high' });  // or { renderer, scene, camera } to use your own
//   await pr.setSky('sky.hdr');                       // sun, sky and image-based light from one HDRI
//   pr.setShadowArea(box3);                           // the area the sun's shadow map covers
//   pr.scene.add(world); adoptObject(world);         // PBR materials get PCSS shadows + box-projected reflections
//   await pr.captureProbe(position, boxMin, boxMax);  // light bounced by the level itself (two bounces)
//   pr.render(dt);
//
// The frame: HDR render (MSAA) -> ambient occlusion (N8AO) -> camera motion blur + auto exposure ->
// depth of field + bloom + tone mapping (ACES by default; 'agx' and 'neutral' are options: CANDID compared
// AgX and ACES side by side and kept ACES) -> [SMAA when there is no MSAA] -> lens and film (aberration,
// distortion, vignetting, sharpening, grade, grain) -> sRGB.
//
// Every number below is the one CANDID shipped with. The `tune` option overrides any of them (see DEFAULT_TUNE).
import * as THREE from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { shared } from './patch.js';
import { Sky } from './sky.js';
import { AtmosphereEffect, AutoExposureEffect, FilmEffect, MotionBlurEffect, WetReflectionEffect } from './effects.js';
import { NOISE, wetMaskGlsl } from './surfaces.js';
import { QUALITY, pickQuality } from './quality.js';
import { adaptScale, dofFocusRange } from './maths.js';

const SUN_RADIUS = 0.0087; // tan of ~0.5°: the sun's disk plus a little atmospheric spread

// The look as CANDID shipped it. Pass `tune: { bloom: { intensity: 0.3 } }` (any subset) to change a number.
export const DEFAULT_TUNE = {
  ao: { aoRadius: 1.4, distanceFalloff: 1.0, intensity: 6.5, denoiseRadius: 10 },
  exposure: { key: 0.16, minEV: -10, maxEV: 8, speed: 1.4 },
  motionBlur: { shutter: 0.5 },
  dof: { worldFocusRange: 8 },
  bloom: { intensity: 0.22, luminanceThreshold: 0.85, luminanceSmoothing: 0.4, radius: 0.72 },
  // FilmEffect's own defaults (grain comes from the quality preset)
  film: { aberration: 0.0016, distortion: 0.025, vignette: 0.35, sharpen: 0.12, saturation: 1.06, contrast: 1.06, warmth: 0.0 },
  sun: { bias: -0.00015, normalBias: 0.02 },
};

function mergeTune(t = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULT_TUNE)) out[k] = { ...DEFAULT_TUNE[k], ...(t[k] || {}) };
  return out;
}

export class PhotoRenderer {
  // canvas: draw into this canvas with a new WebGLRenderer; or renderer: reuse yours (the kit's starter).
  // scene / camera: yours, or new ones. quality: 'low' | 'medium' | 'high' | 'ultra' (default: pickQuality()).
  // toneMapping: 'aces' (default) | 'agx' | 'neutral'. tune: overrides of DEFAULT_TUNE.
  // preserveDrawingBuffer: keep the last frame readable (photos, screenshots); only for a new renderer.
  // autoResize: follow the canvas's CSS size every frame (off if you call resize() yourself).
  constructor({ canvas, renderer, scene, camera, quality, fov = 50, near = 0.05, far = 1200, toneMapping = 'aces', tune, preserveDrawingBuffer = true, autoResize = true } = {}) {
    this.toneMappingMode = toneMapping;
    this.tune = mergeTune(tune);
    this.autoResize = autoResize;
    this.quality = QUALITY[quality] ? quality : pickQuality();
    const q = (this.q = QUALITY[this.quality]);
    this.renderer =
      renderer ||
      new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        stencil: false,
        depth: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer, // photos are read back from the canvas
      });
    const r = this.renderer;
    canvas = r.domElement;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // done in post
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.BasicShadowMap; // raw depth; patch.js filters it (PCSS)
    r.shadowMap.autoUpdate = true;
    r.info.autoReset = false;

    this.scene = scene || new THREE.Scene();
    this.camera = camera || new THREE.PerspectiveCamera(fov, 1, near, far);
    if (!camera) this.camera.position.set(0, 1.7, 5);
    this.focusDistance = 5;
    this.adaptive = true;
    this.aperture = q.aperture; // f-number used for depth of field
    this.sensorHeight = 0.024; // full frame, metres

    this.sky = new Sky();
    this.scene.add(this.sky.createDome());
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.sun.shadow.bias = this.tune.sun.bias;
    this.sun.shadow.normalBias = this.tune.sun.normalBias;
    this.sun.shadow.radius = 1;
    this.scene.add(this.sun, this.sun.target);
    this.shadowArea = new THREE.Box3(new THREE.Vector3(-20, -1, -20), new THREE.Vector3(20, 20, 20));

    this.pmrem = new THREE.PMREMGenerator(r);
    this.envSky = null; // PMREM of the sky alone
    this.envProbe = null; // PMREM of the captured probe
    this.probeTarget = null;

    this.buildPost();
    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  }

  buildPost() {
    const r = this.renderer;
    const q = this.q;
    const gl2 = r.capabilities.isWebGL2;
    const samples = gl2 ? q.msaa : 0;
    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: samples });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    if (q.ao) {
      this.ao = new N8AOPostPass(this.scene, this.camera, 1, 1);
      // transparency-aware mode re-renders the scene and washes the occlusion out; foliage is alpha-tested anyway
      this.ao.autoDetectTransparency = false;
      const t = this.tune.ao;
      Object.assign(this.ao.configuration, {
        transparencyAware: false,
        aoRadius: t.aoRadius,
        distanceFalloff: t.distanceFalloff,
        intensity: t.intensity,
        aoSamples: q.ao.samples,
        denoiseSamples: q.ao.denoise,
        denoiseRadius: t.denoiseRadius,
        halfRes: q.ao.half,
        gammaCorrection: false,
        color: new THREE.Color(0, 0, 0),
      });
      this.composer.addPass(this.ao);
    }

    // air and wet-ground reflections work on the lit HDR image, before exposure
    this.atmosphere = new AtmosphereEffect();
    this.prePass = new EffectPass(this.camera, this.atmosphere);
    this.composer.addPass(this.prePass);

    this.exposure = new AutoExposureEffect({ ...this.tune.exposure });
    this.motionBlur = q.motionBlur ? new MotionBlurEffect({ shutter: this.tune.motionBlur.shutter, samples: q.motionBlur }) : null;
    this.composer.addPass(new EffectPass(this.camera, ...(this.motionBlur ? [this.motionBlur] : []), this.exposure));

    const effects = [];
    if (q.dof) {
      this.dof = new DepthOfFieldEffect(this.camera, {
        worldFocusDistance: 5,
        worldFocusRange: this.tune.dof.worldFocusRange,
        bokehScale: q.dof.bokeh,
        resolutionScale: q.dof.scale,
      });
      effects.push(this.dof);
    }
    this.bloom = new BloomEffect({ mipmapBlur: true, ...this.tune.bloom });
    effects.push(this.bloom);
    this.toneMapping = new ToneMappingEffect({ mode: { agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, neutral: ToneMappingMode.NEUTRAL }[this.toneMappingMode] ?? ToneMappingMode.ACES_FILMIC });
    effects.push(this.toneMapping);
    this.composer.addPass(new EffectPass(this.camera, ...effects));

    if (!samples) {
      this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
      this.composer.addPass(new EffectPass(this.camera, this.smaa));
    }
    this.film = new FilmEffect({ ...this.tune.film, grain: this.tune.film.grain ?? q.grain });
    this.composer.addPass(new EffectPass(this.camera, this.film));
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.scale ??= 1;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.maxPixelRatio) * this.q.renderScale * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Loads an HDRI as sky + sun + sky light. opts: see Sky.load; also `exposure` compensation (EV).
  async setSky(url, opts = {}) {
    await this.sky.load(url, opts);
    this.sun.color.copy(this.sky.sunIrradiance);
    const m = Math.max(this.sun.color.r, this.sun.color.g, this.sun.color.b);
    this.sun.intensity = m > 0 ? 1 : 0;
    if (m > 0) this.sun.color.multiplyScalar(1); // colour carries the strength (linear, can exceed 1)
    this.sun.visible = this.sky.hasSun && m > 0;
    this.envSky?.dispose();
    this.envSky = this.pmrem.fromEquirectangular(this.sky.lighting);
    this.scene.environment = this.envProbe?.texture || this.envSky.texture;
    this.exposure.compensation = opts.exposure || 0;
    // the air takes the colour of the sky it scatters (dimmed: in a street most of the sky is walls)
    const air = this.sky.skyRadiance.clone().multiplyScalar(opts.airScale ?? 0.3);
    this.atmosphere.set({ sunDir: this.sky.sunDir, sunColor: this.sky.sunIrradiance, airColor: air, density: opts.haze ?? 0.003, glow: opts.glow ?? 0.25 });
    this.exposure.reset = true;
    this.fitShadow();
  }

  // Screen-space reflections on a wet ground plane. edgeGlsl defines float srEdge( vec3 p ) (distance to the
  // nearest wall, as given to createGroundMaterial). Keep the wetness in step with the ground's (setWetness).
  setWetGround({ edgeGlsl, groundY = 0 }) {
    if (!this.q.ssr) return;
    const maskGlsl = NOISE + edgeGlsl + wetMaskGlsl('uWet');
    this.wet = new WetReflectionEffect({ maskGlsl, groundY, steps: this.q.ssr });
    const passes = this.composer.passes;
    const i = passes.indexOf(this.prePass);
    this.composer.removePass(this.prePass);
    this.prePass.dispose();
    this.prePass = new EffectPass(this.camera, this.wet, this.atmosphere);
    this.composer.addPass(this.prePass, i);
  }

  // How wet the ground is (0 dry .. 1 just rained), for the reflections; ground materials take the same value
  // through their userData.surface.srWet uniform.
  setWetness(w) {
    if (this.wet) this.wet.uniforms.get('uWet').value = w;
  }

  // Limits auto exposure (EV, log2 of the multiplier). A night scene needs a low ceiling or the camera
  // "sees in the dark" and turns it into day.
  setExposureRange(minEV = -10, maxEV = 8) {
    this.exposure.uniforms.get('uMin').value = minEV;
    this.exposure.uniforms.get('uMax').value = maxEV;
  }

  // The sun's orthographic shadow camera is fitted around this box, looking down the sun direction.
  setShadowArea(box) {
    this.shadowArea.copy(box);
    this.fitShadow();
  }

  fitShadow() {
    const dir = this.sky.sunDir;
    const center = this.shadowArea.getCenter(new THREE.Vector3());
    const size = this.shadowArea.getSize(new THREE.Vector3());
    const radius = size.length() / 2;
    this.sun.position.copy(center).addScaledVector(dir, radius + 10);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    // project the box corners into light space to get a tight frustum
    const view = new THREE.Matrix4().lookAt(this.sun.position, center, new THREE.Vector3(0, 1, 0));
    view.setPosition(this.sun.position);
    const inv = view.clone().invert();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? this.shadowArea.max.x : this.shadowArea.min.x, i & 2 ? this.shadowArea.max.y : this.shadowArea.min.y, i & 4 ? this.shadowArea.max.z : this.shadowArea.min.z);
      p.applyMatrix4(inv);
      min.min(p);
      max.max(p);
    }
    const cam = this.sun.shadow.camera;
    cam.left = min.x;
    cam.right = max.x;
    cam.bottom = min.y;
    cam.top = max.y;
    cam.near = Math.max(0.1, -max.z - 1);
    cam.far = -min.z + 1;
    cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
    // PCSS scale: shadow-map UV of penumbra per unit of (normalised) depth difference
    const width = Math.max(cam.right - cam.left, cam.top - cam.bottom);
    shared.pcss.value.set(((cam.far - cam.near) * SUN_RADIUS) / width, (0.35 / width) * 1.0);
  }

  // Captures the lit level from `position` into a cube map and lights the scene with it. The first capture
  // sees only the sun's direct light and the sky through the gaps (no image-based light yet), so the probe
  // carries the level's own occlusion: an alley's floor sees a strip of sky, not the whole dome. Each further
  // capture adds a bounce (sunlit brick lighting the shaded wall opposite). boxMin/boxMax: the room the probe
  // stands for, for parallax-corrected reflections.
  async captureProbe(position, boxMin, boxMax, { size = this.q.probeSize, bounces = 3 } = {}) {
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cube = new THREE.CubeCamera(0.05, 1000, rt);
    cube.position.copy(position);
    shared.probeBoxMin.value.copy(boxMin);
    shared.probeBoxMax.value.copy(boxMax);
    shared.probePos.value.copy(position);
    shared.probeBlend.value = 1;
    // a black environment (same shader variant as the real one, so nothing recompiles)
    if (!this.envBlack) {
      const black = new THREE.Scene();
      black.background = new THREE.Color(0, 0, 0);
      this.envBlack = this.pmrem.fromScene(black, 0, 0.1, 10);
    }
    this.scene.environment = this.envBlack.texture;
    for (let i = 0; i < bounces; i++) {
      cube.update(this.renderer, this.scene);
      const next = this.pmrem.fromCubemap(rt.texture);
      this.envProbe?.dispose();
      this.envProbe = next;
      this.scene.environment = next.texture;
      await new Promise((res) => setTimeout(res, 0));
    }
    rt.dispose();
  }

  // Keeps an explicit point in focus (world space), or pass a distance.
  focusOn(target) {
    this.focusDistance = typeof target === 'number' ? target : this.camera.position.distanceTo(target);
  }

  // Applies a still photograph's settings for the next render: flash, exposure, desaturation...
  setFilm(name, value) {
    this.film.set(name, value);
  }

  updateDof() {
    if (!this.dof) return;
    // focal length from the field of view and a full-frame sensor, 30 µm circle of confusion (maths.js)
    const d = dofFocusRange({ fovDeg: this.camera.fov, sensorHeight: this.sensorHeight, aperture: this.aperture, focusDistance: this.focusDistance });
    const coc = this.dof.cocMaterial;
    coc.worldFocusDistance = d.focus;
    coc.worldFocusRange = d.range;
  }

  // Dynamic resolution: if frames take too long the render scale drops (down to 60 %), and it climbs back
  // when there is headroom, so a weaker GPU keeps a steady frame rate instead of the full pixel count.
  // (Below 38 fps for 2 s: -10 %; above 58 fps: +5 %; see maths.js adaptScale.) Set `adaptive = false` to stop it.
  adapt(dt) {
    if (!this.adaptive) return;
    this.adaptState ??= { scale: this.scale ?? 1 };
    if (adaptScale(this.adaptState, dt)) {
      this.scale = this.adaptState.scale;
      this.resize(this.width, this.height);
    }
  }

  render(dt = 1 / 60) {
    if (this.autoResize) {
      const c = this.renderer.domElement;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w > 0 && h > 0 && (w !== this.width || h !== this.height)) this.resize(w, h);
    }
    this.adapt(dt);
    this.renderer.info.reset();
    this.camera.updateMatrixWorld();
    this.motionBlur?.track(this.camera, dt);
    this.atmosphere.track(this.camera);
    this.wet?.track(this.camera);
    this.updateDof();
    this.composer.render(dt);
  }

  // The last frame as a canvas-sized image (the canvas keeps its drawing buffer).
  snapshot(type = 'image/jpeg', quality = 0.9) {
    return this.renderer.domElement.toDataURL(type, quality);
  }
}
