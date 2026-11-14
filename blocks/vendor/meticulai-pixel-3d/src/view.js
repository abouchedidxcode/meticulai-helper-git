// Pixel-art view (from the game Rootbound): the world is drawn into a small render target at art resolution
// (ppu art pixels per world unit) with an orthographic camera snapped to the art-pixel grid, then blown up to the
// screen with nearest-neighbour sampling at an integer scale. Zoom changes that integer scale, so art pixels are
// always square and crisp. Colours pass through untouched (no tone mapping, no colour-space conversion): the palette
// is exact on screen.
//
// Two camera modes:
//   '2d': side-on, looking down -Z, world x/y = screen x/y (Rootbound's own setup).
//   '3d': an orthographic camera at any yaw/pitch (isometric-style). The snap happens in the camera's own right/up
//         axes, so static things never shimmer while the camera pans.
// Optional extras on the art-resolution image: 1 px depth outlines (3d), a dithered palette sky, a stepped corner
// tint (Rootbound's drought warning), fade to black and pixel shake.
import * as THREE from 'three';
import { RAMPS, RAMP_ROW, RAMP_LEN } from './palette.js';
import { PX_GLSL, rampTexture } from './glsl.js';
import { PPU, ZOOMS, SHAKE_DECAY, SHAKE_PX, artTarget, zoomFor, snapToGrid, blitWindow, followFactor, pixelScale } from './snap.js';

/**
 * A THREE.Color holding sRGB bytes as-is. The art target has no colour space, so whatever is in a uniform or clear
 * colour reaches the screen unchanged; THREE.Color would otherwise convert '#120c10' to linear and darken it.
 * @param {number|string} hex
 */
export function rawColor(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, THREE.LinearSRGBColorSpace);
}

const FULLSCREEN_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BLIT_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uScale;   // screen px -> target uv
  uniform vec2 uOffset;  // sub-art-pixel camera offset in target uv
  uniform float uDanger; // stepped corner tint 0..1
  uniform float uFade;   // 1 = normal, 0 = black
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv * uScale + uOffset;
    vec3 c = texture2D(tScene, uv).rgb;
    // the corners dry out a little (stepped, so it stays pixel-like)
    vec2 q = vUv - 0.5;
    float r = dot(q, q);
    float dry = uDanger * floor(smoothstep(0.12, 0.5, r) * 4.0) / 4.0;
    float l = dot(c, vec3(0.3, 0.5, 0.2));
    c = mix(c, vec3(l) * vec3(1.1, 0.95, 0.75), dry * 0.6);
    c *= uFade;
    gl_FragColor = vec4(c, 1.0);
  }`;

// 1 px outline: an art pixel that sits behind a 4-neighbour by more than uEdge world units takes the outline colour.
const OUTLINE_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uEdge;
  uniform vec3 uInk;
  varying vec2 vUv;
  float vz(vec2 uv) { return uNear + texture2D(tDepth, uv).r * (uFar - uNear); } // orthographic depth is linear
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb;
    float d = vz(vUv);
    float n = min(min(vz(vUv + vec2(uTexel.x, 0.0)), vz(vUv - vec2(uTexel.x, 0.0))),
                  min(vz(vUv + vec2(0.0, uTexel.y)), vz(vUv - vec2(0.0, uTexel.y))));
    if (d - n > uEdge) c = uInk;
    gl_FragColor = vec4(c, 1.0);
  }`;

// Sky: a vertical palette ramp with ordered dithering between entries (screen-fixed, art resolution).
const SKY_FRAG = /* glsl */ `
  ${PX_GLSL}
  uniform float uRow;
  uniform float uLen;
  uniform float uLo;
  uniform float uHi;
  varying vec2 vUv;
  void main() {
    float t = mix(uLo, uHi, vUv.y);
    gl_FragColor = vec4(rampDither(uRow, uLen, t, gl_FragCoord.xy), 1.0);
  }`;

/**
 * @typedef {object} PixelViewOptions
 * @property {HTMLCanvasElement} [canvas]        canvas for a new renderer (ignored when `renderer` is given)
 * @property {THREE.WebGLRenderer} [renderer]   reuse an existing renderer (e.g. the starter's); its pixel ratio is used
 * @property {'2d'|'3d'} [mode='2d']
 * @property {number} [ppu=12]                   art pixels per world unit
 * @property {number[]} [zooms=[1..6]]           CSS px per art px
 * @property {number} [zoom=3]
 * @property {number} [maxDpr=3]
 * @property {number} [yaw=0]                    3d: radians around +Y (0 = looking down -Z)
 * @property {number} [pitch=0]                  3d: radians looking down (0.52 = 30 degrees)
 * @property {number} [depth=100]                half depth range of the ortho camera around the focus (world units)
 * @property {number|string} [clearColor=0x120c10]
 * @property {string|null} [sky=null]            ramp name for a dithered sky gradient (e.g. 'skyDay'), or null
 * @property {[number, number]} [skyRange=[0, 1]] fraction of the ramp from screen bottom to top
 * @property {boolean} [outline=false]           1 px depth outlines (best in 3d)
 * @property {string} [outlineColor='#120c10']
 * @property {number} [outlineEdge=0.35]         world units of depth step that counts as an edge
 * @property {number} [followRate=8]
 * @property {boolean} [listenResize=true]
 */

export class PixelView {
  /** @param {PixelViewOptions} [o] */
  constructor(o = {}) {
    this.ppu = o.ppu ?? PPU;
    this.zooms = o.zooms ?? ZOOMS;
    this.zoom = o.zoom ?? 3;
    this.maxDpr = o.maxDpr ?? 3;
    this.mode = o.mode ?? '2d';
    this.yaw = o.yaw ?? 0;
    this.pitch = o.pitch ?? 0;
    this.depth = o.depth ?? 100;
    this.followRate = o.followRate ?? 8;
    this.ownsRenderer = !o.renderer;
    if (o.renderer) {
      this.renderer = o.renderer;
      this.canvas = o.renderer.domElement;
    } else {
      this.canvas = o.canvas ?? document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
      r.outputColorSpace = THREE.LinearSRGBColorSpace; // palette bytes go straight to the screen
      r.toneMapping = THREE.NoToneMapping;
      r.setPixelRatio(1);
      this.renderer = r;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -this.depth, this.depth);
    /** camera focus (world). In 2d only x, y matter. */
    this.cam = { x: 0, y: 0, z: 0, h: 40 };
    this.goal = { x: 0, y: 0, z: 0, h: 40 };
    this.shake = 0;
    this.clearColor = rawColor(o.clearColor ?? 0x120c10);

    // blit
    this.blitScene = new THREE.Scene();
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitUniforms = { tScene: { value: null }, uScale: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2() }, uDanger: { value: 0 }, uFade: { value: 1 } };
    this.blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: BLIT_FRAG, uniforms: this.blitUniforms, depthTest: false, depthWrite: false, toneMapped: false }));
    this.blit.frustumCulled = false;
    this.blitScene.add(this.blit);

    // sky
    this.skyUniforms = { tRamp: { value: rampTexture() }, uRow: { value: 0 }, uLen: { value: 1 }, uLo: { value: 0 }, uHi: { value: 1 } };
    this.skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms, depthTest: false, depthWrite: false, toneMapped: false }));
    this.skyMesh.frustumCulled = false;
    this.skyScene = new THREE.Scene();
    this.skyScene.add(this.skyMesh);
    this.setSky(o.sky ?? null, o.skyRange);

    // outline
    this.outline = !!o.outline;
    this.outlineUniforms = { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0 }, uFar: { value: 1 }, uEdge: { value: o.outlineEdge ?? 0.35 }, uInk: { value: rawColor(o.outlineColor ?? RAMPS.outline[0]) } };
    this.outlineMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: OUTLINE_FRAG, uniforms: this.outlineUniforms, depthTest: false, depthWrite: false, toneMapped: false }));
    this.outlineMesh.frustumCulled = false;
    this.outlineScene = new THREE.Scene();
    this.outlineScene.add(this.outlineMesh);

    /** shared uniforms for things that snap in clip space (particles): target size in art px, grid origin */
    this.uTarget = { value: new THREE.Vector2(1, 1) };
    this.uPixOrigin = { value: new THREE.Vector2() };

    this._right = new THREE.Vector3(1, 0, 0);
    this._up = new THREE.Vector3(0, 1, 0);
    this._fwd = new THREE.Vector3(0, 0, -1);
    this._q = new THREE.Quaternion();
    this.updateOrientation();
    this.resize();
    this.cam.h = this.goal.h = this.viewH; // start at the requested zoom (updateCamera eases toward goal.h)
    if (o.listenResize !== false && typeof window !== 'undefined') window.addEventListener('resize', () => this.resize());
  }

  /** Raw sRGB bytes -> uniform (no colour management), so the outline is an exact palette colour. */
  setOutlineColor(hex) {
    this.outlineUniforms.uInk.value.copy(rawColor(hex));
  }
  /** set the clear colour (exact palette bytes) */
  setClearColor(hex) {
    this.clearColor = rawColor(hex);
  }

  /** Sky gradient from a ramp (null = plain clear colour). range = ramp fraction at the bottom and top of the screen. */
  setSky(ramp, range = [0, 1]) {
    this.sky = ramp;
    if (!ramp) return;
    const row = RAMP_ROW[ramp];
    if (row === undefined) throw new Error(`unknown ramp: ${ramp}`);
    this.skyUniforms.uRow.value = row;
    this.skyUniforms.uLen.value = RAMP_LEN[row];
    this.skyUniforms.uLo.value = range[0];
    this.skyUniforms.uHi.value = range[1];
  }

  /** 3d: recompute the camera axes from yaw/pitch (call after changing them). */
  updateOrientation() {
    if (this.mode === '3d') this._q.setFromEuler(new THREE.Euler(-this.pitch, this.yaw, 0, 'YXZ'));
    else this._q.identity();
    this.camera.quaternion.copy(this._q);
    this._right.set(1, 0, 0).applyQuaternion(this._q);
    this._up.set(0, 1, 0).applyQuaternion(this._q);
    this._fwd.set(0, 0, -1).applyQuaternion(this._q);
  }

  /** camera axes (world): right, up and forward (into the screen) */
  get axes() {
    return { right: this._right, up: this._up, forward: this._fwd };
  }

  resize() {
    const r = this.renderer;
    if (this.ownsRenderer) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
      r.setSize(Math.round(w * this.dpr), Math.round(h * this.dpr), false);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.cssW = w;
      this.cssH = h;
    } else {
      const v = r.getDrawingBufferSize(new THREE.Vector2());
      this.dpr = r.getPixelRatio();
      this.cssW = v.x / this.dpr;
      this.cssH = v.y / this.dpr;
    }
    this.aspect = this.cssW / this.cssH;
    this.rect = this.canvas.getBoundingClientRect();
    this.allocTarget();
  }

  /** device pixels per art pixel for the current zoom */
  get k() {
    return pixelScale(this.zoom, this.dpr);
  }

  allocTarget() {
    const dw = Math.round(this.cssW * this.dpr);
    const dh = Math.round(this.cssH * this.dpr);
    const { tw, th } = artTarget(dw, dh, this.zoom, this.dpr);
    if (!this.rt || this.rt.width !== tw || this.rt.height !== th) {
      this.rt?.dispose();
      this.rt2?.dispose();
      const opts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, colorSpace: THREE.NoColorSpace };
      this.rt = new THREE.WebGLRenderTarget(tw, th, opts);
      this.rt.depthTexture = new THREE.DepthTexture(tw, th);
      this.rt2 = new THREE.WebGLRenderTarget(tw, th, { ...opts, depthBuffer: false });
      this.uTarget.value.set(tw, th);
    }
    this.tw = tw;
    this.th = th;
    // the visible window in world units follows the zoom
    this.viewH = dh / this.k / this.ppu;
    this.viewW = dw / this.k / this.ppu;
  }

  /** zoom level whose visible height is closest to h world units */
  zoomFor(h) {
    return zoomFor(h, this.cssH * this.dpr, { zooms: this.zooms, ppu: this.ppu, dpr: this.dpr, current: this.zoom });
  }

  /** set the zoom (one of `zooms`) */
  setZoom(z) {
    this.zoom = z;
    this.allocTarget();
    this.goal.h = this.viewH;
  }

  /** 2d: one zoom step in (dir < 0) or out (dir > 0), keeping the world point under (sx, sy) where it is */
  zoomStep(dir, sx, sy) {
    const i = this.zooms.indexOf(this.zoom);
    const ni = Math.max(0, Math.min(this.zooms.length - 1, i - Math.sign(dir)));
    if (ni === i) return false;
    const r = this.rect;
    const keep = this.mode === '2d' && sx !== undefined;
    const [wx, wy] = keep ? this.pick(sx, sy) : [0, 0];
    this.zoom = this.zooms[ni];
    this.allocTarget();
    this.goal.h = this.viewH;
    if (keep) {
      const nx = (sx - r.left) / r.width - 0.5;
      const ny = (sy - r.top) / r.height - 0.5;
      this.goal.x = this.cam.x = wx - nx * this.viewW;
      this.goal.y = this.cam.y = wy + ny * this.viewH;
    }
    return true;
  }

  heightAt(z) {
    return (this.cssH * this.dpr) / pixelScale(z, this.dpr) / this.ppu;
  }

  /** 2d: screen point -> world [x, y] */
  pick(clientX, clientY) {
    const r = this.rect;
    const nx = (clientX - r.left) / r.width - 0.5;
    const ny = (clientY - r.top) / r.height - 0.5;
    return [this.cam.x + nx * this.viewW, this.cam.y - ny * this.viewH];
  }
  /** 2d: world (x, y) -> screen [x, y] */
  project(x, y) {
    const r = this.rect;
    return [r.left + ((x - this.cam.x) / this.viewW + 0.5) * r.width, r.top + (0.5 - (y - this.cam.y) / this.viewH) * r.height, true];
  }
  /** any mode: world Vector3 -> CSS pixels [x, y] (uses the last rendered camera) */
  worldToScreen(v) {
    const p = v.clone().project(this.camera);
    const r = this.rect;
    return [r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (0.5 - p.y * 0.5) * r.height];
  }
  worldPerPixel() {
    return this.viewH / this.rect.height;
  }

  /** set where the camera eases to (world). In 2d z is ignored. */
  follow(x, y, z = 0) {
    this.goal.x = x;
    this.goal.y = y;
    this.goal.z = z;
  }
  /** jump the camera to its goal now */
  snapToGoal() {
    this.cam.x = this.goal.x;
    this.cam.y = this.goal.y;
    this.cam.z = this.goal.z;
  }

  updateCamera(dt) {
    // zoom is discrete: snap to the level nearest the goal height, keeping the camera centre
    const z = this.zoomFor(this.goal.h);
    if (z !== this.zoom) {
      this.zoom = z;
      this.allocTarget();
    }
    this.goal.h = this.viewH;
    const kk = followFactor(dt, this.followRate);
    const c = this.cam;
    c.x += (this.goal.x - c.x) * kk;
    c.y += (this.goal.y - c.y) * kk;
    c.z += (this.goal.z - c.z) * kk;
    c.h = this.viewH;
    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);
  }

  /**
   * Render into the art-resolution target and blit to the screen.
   * @param {THREE.Scene | ((renderer: THREE.WebGLRenderer, camera: THREE.OrthographicCamera) => void)} [world]
   *        a scene (default this.scene) or a draw function
   */
  render(world = this.scene) {
    const r = this.renderer;
    if (!this.ownsRenderer) {
      // someone else sizes the canvas (e.g. the starter): follow its drawing buffer
      const v = r.getDrawingBufferSize(this._buf || (this._buf = new THREE.Vector2()));
      if (Math.round(this.cssW * this.dpr) !== v.x || Math.round(this.cssH * this.dpr) !== v.y || this.dpr !== r.getPixelRatio()) this.resize();
    }
    const ppu = this.ppu;
    const prevAuto = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.autoClear = false;
    const sx = this.shake ? Math.round((Math.random() - 0.5) * this.shake * SHAKE_PX) / ppu : 0;
    const cam = this.camera;
    const { right, up, forward } = this.axes;
    // focus in camera axes
    let u, v, w;
    if (this.mode === '3d') {
      const f = new THREE.Vector3(this.cam.x, this.cam.y, this.cam.z);
      u = f.dot(right) + sx;
      v = f.dot(up);
      w = f.dot(forward);
    } else {
      u = this.cam.x + sx;
      v = this.cam.y;
      w = 0;
    }
    // snap the camera to whole art pixels; the remainder becomes a sub-pixel blit offset so panning is smooth
    const s = snapToGrid(u, v, ppu);
    const hw = this.tw / 2 / ppu;
    const hh = this.th / 2 / ppu;
    cam.position.copy(right).multiplyScalar(s.ox).addScaledVector(up, s.oy).addScaledVector(forward, w);
    cam.left = -hw;
    cam.right = hw;
    cam.top = hh;
    cam.bottom = -hh;
    cam.near = -this.depth;
    cam.far = this.depth;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.snapped = { x: s.ox, y: s.oy, hw, hh };
    // art-pixel index of the target's bottom-left corner: keeps dither patterns locked to the world, not the screen
    this.uPixOrigin.value.set(s.pxX - this.tw / 2, s.pxY - this.th / 2);

    r.setRenderTarget(this.rt);
    r.setClearColor(this.clearColor, 1);
    r.clear(true, true, false);
    if (this.sky) r.render(this.skyScene, this.blitCam);
    if (typeof world === 'function') world(r, cam);
    else r.render(world, cam);

    let src = this.rt;
    if (this.outline) {
      const ou = this.outlineUniforms;
      ou.tColor.value = this.rt.texture;
      ou.tDepth.value = this.rt.depthTexture;
      ou.uTexel.value.set(1 / this.tw, 1 / this.th);
      ou.uNear.value = cam.near;
      ou.uFar.value = cam.far;
      r.setRenderTarget(this.rt2);
      r.render(this.outlineScene, this.blitCam);
      src = this.rt2;
    }
    r.setRenderTarget(null);
    // blit: the screen covers visW x visH art pixels of the target, shifted by the sub-pixel remainder
    const dw = Math.round(this.cssW * this.dpr);
    const dh = Math.round(this.cssH * this.dpr);
    const k = this.k;
    const b = blitWindow(this.tw, this.th, dw / k, dh / k, s.fx, s.fy);
    this.blitUniforms.tScene.value = src.texture;
    this.blitUniforms.uScale.value.set(b.scaleX, b.scaleY);
    this.blitUniforms.uOffset.value.set(b.offsetX, b.offsetY);
    r.clear(true, true, false);
    r.render(this.blitScene, this.blitCam);
    r.autoClear = prevAuto;
    r.setClearColor(prevClear, prevAlpha);
  }

  /** compile the scene's shaders for the art target (avoids a first-frame hitch) */
  warmUp(scene = this.scene) {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.compile(scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  dispose() {
    this.rt?.dispose();
    this.rt2?.dispose();
    for (const m of [this.blit, this.skyMesh, this.outlineMesh]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    if (this.ownsRenderer) this.renderer.dispose();
  }
}
