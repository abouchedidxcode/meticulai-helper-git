// Runtime helpers for pixel sprites and particles, all drawn at art resolution (from the game Rootbound).
//   PxSprite     a canvas sprite in a 2d (side-on) view, placed so its pixels land on art pixels
//   PxBillboard  the same in a 3d view: faces the camera, snapped in the camera's axes, depth-tested
//   PxParticles  square 1-3 px palette-coloured points that blink out (ordered dither) instead of fading
import * as THREE from 'three';
import { PX_GLSL, rampTexture } from './glsl.js';
import { PPU, snapSprite } from './snap.js';

const texCache = new WeakMap();
/** A texture for a canvas (re-uploaded when `version` changes). Nearest sampling, no colour space. */
export function canvasTexture(canvas, version = 0) {
  let e = texCache.get(canvas);
  if (e && (e.w !== canvas.width || e.h !== canvas.height)) {
    e.t.dispose();
    e = null;
  }
  if (!e) {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    t.flipY = true;
    e = { t, v: version, w: canvas.width, h: canvas.height };
    texCache.set(canvas, e);
  } else if (e.v !== version) {
    e.v = version;
    e.t.needsUpdate = true;
  }
  return e.t;
}

/** Free the GPU copy of a canvas that won't be drawn again. */
export function releaseCanvas(canvas) {
  const e = canvas && texCache.get(canvas);
  if (e) {
    e.t.dispose();
    texCache.delete(canvas);
  }
}

const SPRITE_FRAG = /* glsl */ `
${PX_GLSL}
uniform sampler2D tMap;
uniform vec2 uSize;     // canvas size in art pixels
uniform float uFade;    // 1 opaque, 0 gone (dithered)
uniform float uFlash;   // 0..1 brighten toward white-ish
uniform float uSway;    // pixels of sway at the top (trees)
uniform float uSwayH;   // canvas row (from bottom) where sway starts
uniform float uTint;    // 0 none, >0 darken toward night
varying vec2 vUv;
void main() {
  vec2 px = floor(vUv * uSize);
  // sway: shift whole rows by whole pixels, more toward the top
  float k = max(0.0, (px.y - uSwayH) / max(1.0, uSize.y - uSwayH));
  px.x -= floor(uSway * k * k + 0.5);
  if (px.x < 0.0 || px.x >= uSize.x) discard;
  vec4 c = texture2D(tMap, (px + 0.5) / uSize);
  if (c.a < 0.5) discard;
  vec2 sp = floor(gl_FragCoord.xy);
  if (uFade < 1.0 && bayer4(sp) > uFade) discard;
  vec3 col = c.rgb;
  if (uFlash > 0.0 && bayer4(sp + 1.0) < uFlash) col = mix(col, vec3(1.0, 0.95, 0.8), 0.6);
  col *= 1.0 - uTint;
  gl_FragColor = vec4(col, 1.0);
}`;

const SPRITE_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

function spriteUniforms() {
  return {
    tRamp: { value: rampTexture() },
    tMap: { value: null },
    uSize: { value: new THREE.Vector2(1, 1) },
    uFade: { value: 1 },
    uFlash: { value: 0 },
    uSway: { value: 0 },
    uSwayH: { value: 0 },
    uTint: { value: 0 },
  };
}

/** 2d sprite (side-on view, world x/y). Rootbound draws these without depth, ordered by renderOrder. */
export class PxSprite {
  constructor(order = 20, { ppu = PPU } = {}) {
    this.ppu = ppu;
    this.uniforms = spriteUniforms();
    this.geom = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.Mesh(this.geom, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, depthTest: false, depthWrite: false, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.ax = 0;
    this.ay = 0;
    this.w = 1;
    this.h = 1;
  }
  /** canvas in art pixels; (ax, ay) anchor in canvas pixels from the top-left */
  set(canvas, ax, ay, version = 0) {
    this.uniforms.tMap.value = canvasTexture(canvas, version);
    this.uniforms.uSize.value.set(canvas.width, canvas.height);
    this.w = canvas.width;
    this.h = canvas.height;
    this.ax = ax;
    this.ay = ay;
    this.mesh.scale.set(canvas.width / this.ppu, canvas.height / this.ppu, 1);
    this.place(this.x ?? 0, this.y ?? 0);
  }
  /** world position of the anchor, snapped so sprite pixels land on art pixels */
  place(x, y) {
    this.x = x;
    this.y = y;
    const s = snapSprite(x, y, this.ax, this.ay, this.w, this.h, this.ppu);
    this.mesh.position.set(s.u, s.v, 0);
  }
  dispose() {
    this.geom.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * 3d billboard: always faces the view's camera and is snapped in the camera's right/up axes, so a sprite pixel is
 * exactly one art pixel. Depth-tested against the 3D world (transparent pixels are discarded).
 * Call place(vec3) after moving it, and update() once per frame (or after the camera turns).
 */
export class PxBillboard {
  /** @param {import('./view.js').PixelView} view */
  constructor(view, { order = 0, depthTest = true } = {}) {
    this.view = view;
    this.uniforms = spriteUniforms();
    this.geom = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.Mesh(this.geom, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, depthTest, depthWrite: depthTest, toneMapped: false }));
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.pos = new THREE.Vector3();
    this.ax = 0;
    this.ay = 0;
    this.w = 1;
    this.h = 1;
  }
  /** @param {{ canvas: HTMLCanvasElement, ax: number, ay: number }} sprite  e.g. the result of mushrooms(seed) */
  set(sprite, version = 0) {
    const { canvas, ax, ay } = sprite;
    this.uniforms.tMap.value = canvasTexture(canvas, version);
    this.uniforms.uSize.value.set(canvas.width, canvas.height);
    this.w = canvas.width;
    this.h = canvas.height;
    this.ax = ax;
    this.ay = ay;
    const ppu = this.view.ppu;
    this.mesh.scale.set(canvas.width / ppu, canvas.height / ppu, 1);
    this.update();
    return this;
  }
  /** world position of the sprite's anchor (e.g. the ground point under a mushroom) */
  place(x, y, z) {
    this.pos.set(x, y, z);
    this.update();
    return this;
  }
  update() {
    const { right, up, forward } = this.view.axes;
    const ppu = this.view.ppu;
    const s = snapSprite(this.pos.dot(right), this.pos.dot(up), this.ax, this.ay, this.w, this.h, ppu);
    this.mesh.quaternion.copy(this.view.camera.quaternion);
    this.mesh.position.copy(right).multiplyScalar(s.u).addScaledVector(up, s.v).addScaledVector(forward, this.pos.dot(forward));
  }
  dispose() {
    this.geom.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * Pixel particles: square points 1-3 art pixels wide, palette colours; they blink out (dither) instead of fading.
 * Positions are 3D; each point is snapped to an art-pixel centre in clip space, so it works in 2d and 3d views.
 * Gravity pulls along -Y.
 */
export class PxParticles {
  /**
   * @param {THREE.Object3D} scene
   * @param {import('./view.js').PixelView} view
   * @param {{ n?: number, depthTest?: boolean }} [o]
   */
  constructor(scene, view, { n = 2400, depthTest = false } = {}) {
    this.N = n;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.c = new Float32Array(n * 3);
    this.s = new Float32Array(n);
    this.a = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aC', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aS', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    this.g = g;
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: { tRamp: { value: rampTexture() }, uTarget: view.uTarget },
        vertexShader: `attribute vec3 aC; attribute float aS; attribute float aA; uniform vec2 uTarget; varying vec3 vC; varying float vA;
          void main(){
            vC = aC; vA = aA; gl_PointSize = aS;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            // snap to an art-pixel centre (odd sizes) or corner (even sizes)
            vec2 s = (p.xy / p.w * 0.5 + 0.5) * uTarget;
            s = mod(aS, 2.0) > 0.5 ? floor(s) + 0.5 : floor(s + 0.5);
            p.xy = (s / uTarget * 2.0 - 1.0) * p.w;
            gl_Position = p;
          }`,
        fragmentShader: `${PX_GLSL}
          varying vec3 vC; varying float vA;
          void main(){ if (vA <= 0.0 || bayer4(floor(gl_FragCoord.xy)) > vA) discard; gl_FragColor = vec4(vC, 1.0); }`,
        depthTest,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 80;
    scene.add(this.points);
  }
  /** o: { x, y, z, vx, vy, vz, life, size (px), color: [r,g,b] 0..1 sRGB, grav, drag } */
  emit(o) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.N;
    this.p[i * 3] = o.x;
    this.p[i * 3 + 1] = o.y;
    this.p[i * 3 + 2] = o.z || 0;
    this.v[i * 3] = o.vx || 0;
    this.v[i * 3 + 1] = o.vy || 0;
    this.v[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.max[i] = o.life || 1;
    this.s[i] = o.size || 1;
    this.c.set(o.color || [1, 1, 1], i * 3);
    this.grav[i] = o.grav || 0;
    this.drag[i] = o.drag || 0;
  }
  /** n particles from (x, y, z) in random directions (in the x/y plane, plus `spreadZ` depth jitter for 3d) */
  burst(x, y, n, base, z = 0) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (base.speed || 1) * (0.3 + Math.random() * 0.7);
      this.emit({ ...base, x: x + (Math.random() - 0.5) * (base.spread || 0.2), y: y + (Math.random() - 0.5) * (base.spread || 0.2), z: z + (Math.random() - 0.5) * (base.spreadZ || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (base.up || 0), vz: (Math.random() - 0.5) * sp * (base.spreadZ ? 1 : 0), life: (base.life || 1) * (0.6 + Math.random() * 0.6), size: base.size ?? (Math.random() < 0.3 ? 2 : 1) });
    }
  }
  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) {
        this.a[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= dr;
      this.v[i * 3 + 1] = this.v[i * 3 + 1] * dr - this.grav[i] * dt;
      this.v[i * 3 + 2] *= dr;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.a[i] = Math.min(1, t * 3);
    }
    for (const n of ['position', 'aC', 'aS', 'aA']) this.g.attributes[n].needsUpdate = true;
  }
}
