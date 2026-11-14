// GPU height-field ripple simulation: two half-float targets ping-pong; R = height, G = vertical velocity.
// Each step every cell accelerates toward the weighted average of its eight neighbours (a discrete wave equation
// with a 9-point stencil, so rings come out round), is damped, and is clamped to zero outside the water (the shore
// reflects the rings back instead of soaking them into a soft margin).
//
// Two ways to disturb the water:
//  - drops: smooth cosine bumps added once (wakes, food landing, leaves, a spout, droplets, splashes, a tap);
//  - bodies: things that sit IN the surface every step (a fingertip, a cursor, floating pellets, a fish mouth). A body
//    pulls the height under it toward a dimple of its own shape. Held still it makes a quiet dimple with a meniscus
//    ring; moved, it pushes a bow wave and leaves a real V-shaped wake behind it that grows with speed, because that
//    is what a moving obstacle in a wave equation does.
//
// Quality: grid resolution and steps per frame. The wave coefficient k is rescaled so ripples travel at the same
// speed in world units at every quality: only the detail changes.
//
// From the game Koi by Meticulai (meticulai.com). MIT licence.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const MAX_DROPS = 48;
export const MAX_BODIES = 24;

/**
 * The game's presets: cells across its 19.2 x 12.4 m simulation rectangle, steps per frame, and the wave coefficient
 * k (<= ~1.8 for stability). `cell` is the size of one cell in metres: the block keeps it, so on a rectangle of a
 * different size the ripples still travel at the game's speed in metres per second.
 */
export const SIM_QUALITY = Object.freeze({
  low: { w: 256, h: 166, steps: 2, k: 0.76, cell: 19.2 / 256 },
  med: { w: 384, h: 248, steps: 2, k: 1.7, cell: 19.2 / 384 },
  high: { w: 576, h: 372, steps: 3, k: 1.7, cell: 19.2 / 576 },
});

/** A shore that is just the edge of the rectangle (GLSL; negative in the water, in metres). */
export const RECT_SHORE = /* glsl */ `
float shoreSdf(vec2 p) {
  vec2 c = uRect.xy + uRect.zw * 0.5;
  vec2 d = abs(p - c) - (uRect.zw * 0.5 - 0.05);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}`;

/**
 * Grid size for a rectangle at a quality: the game's cell size, so wave speed in m/s matches the game.
 * @param {{ x0: number, z0: number, x1: number, z1: number }} rect @param {'low'|'med'|'high'} quality
 */
export function gridFor(rect, quality = 'med') {
  const q = SIM_QUALITY[quality];
  return {
    w: Math.max(8, Math.round((rect.x1 - rect.x0) / q.cell)),
    h: Math.max(8, Math.round((rect.z1 - rect.z0) / q.cell)),
    steps: q.steps,
    k: q.k,
  };
}

/** Wave speed in metres per second at 60 frames a second (for tests and tuning). */
export function waveSpeed(cell, k, steps, fps = 60) {
  return Math.sqrt(k) * cell * steps * fps;
}

export class Ripples {
  /**
   * @param {object} [opts]
   * @param {{ x0: number, z0: number, x1: number, z1: number }} [opts.rect] world rectangle simulated (y = water level).
   *   Default: the game's 19.2 x 12.4 m.
   * @param {'low'|'med'|'high'} [opts.quality] default 'med'
   * @param {string} [opts.shoreGlsl] GLSL defining `float shoreSdf(vec2 xz)` (negative in the water). It may read
   *   `uniform vec4 uRect` (x0, z0, width, depth). Default: the rectangle's edge.
   */
  constructor({ rect = { x0: -9.6, x1: 9.6, z0: -6.2, z1: 6.2 }, quality = 'med', shoreGlsl = RECT_SHORE } = {}) {
    const g = gridFor(rect, quality);
    this.quality = quality;
    this.rect = rect;
    this.w = g.w; this.h = g.h; this.steps = g.steps;
    /** Calm (0..1) makes the water a little more damped, so it goes glassy. */
    this.calm = 0;
    this._drops = [];
    this._bodies = [];
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    this._a = new THREE.WebGLRenderTarget(g.w, g.h, opts);
    this._b = new THREE.WebGLRenderTarget(g.w, g.h, opts);
    /** Uniforms other materials read: the height texture, one cell in uv, and the rectangle (x0, z0, width, depth). */
    this.uniforms = {
      uSim: { value: this._a.texture },
      uSimTexel: { value: new THREE.Vector2(1 / g.w, 1 / g.h) },
      uSimRect: { value: new THREE.Vector4(rect.x0, rect.z0, rect.x1 - rect.x0, rect.z1 - rect.z0) },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / g.w, 1 / g.h) },
        uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
        uN: { value: 0 },
        uBodies: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
        uNB: { value: 0 },
        uDamp: { value: 0.992 },
        uK: { value: g.k },
        uRect: { value: this.uniforms.uSimRect.value },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uPrev; uniform vec2 uTexel; uniform vec4 uDrops[${MAX_DROPS}]; uniform int uN;
        uniform vec4 uBodies[${MAX_BODIES}]; uniform int uNB; uniform float uDamp, uK; uniform vec4 uRect;
        varying vec2 vUv;
        ${shoreGlsl}
        void main() {
          vec4 c = texture2D(uPrev, vUv);
          float h = c.r, v = c.g;
          float n = texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r + texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r
                  + texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r;
          float d = texture2D(uPrev, vUv + uTexel).r + texture2D(uPrev, vUv - uTexel).r
                  + texture2D(uPrev, vUv + vec2(uTexel.x, -uTexel.y)).r + texture2D(uPrev, vUv + vec2(-uTexel.x, uTexel.y)).r;
          float avg = n * 0.15 + d * 0.1; // 9-point stencil: rounder rings than the 4-point one
          v += (avg - h) * uK;
          v *= uDamp;
          h += v;
          h *= 0.9995;
          vec2 xz = uRect.xy + vUv * uRect.zw;
          for (int i = 0; i < ${MAX_DROPS}; i++) {
            if (i >= uN) break;
            vec4 dr = uDrops[i];
            float r = length(xz - dr.xy) / dr.z;
            if (r < 1.0) h += dr.w * (0.5 + 0.5 * cos(r * 3.14159));
          }
          // bodies: pull the surface toward a dimple of depth w, radius z (negative w lifts a hump)
          for (int i = 0; i < ${MAX_BODIES}; i++) {
            if (i >= uNB) break;
            vec4 b = uBodies[i];
            float r = length(xz - b.xy) / b.z;
            if (r < 1.0) {
              float prof = 0.5 + 0.5 * cos(r * 3.14159);
              float target = -b.w * prof;
              h = mix(h, target, 0.4 * prof);
            }
          }
          // a sharp shore: rings reflect off it instead of soaking into a soft margin
          float m = 1.0 - smoothstep(-0.03, 0.02, shoreSdf(xz));
          gl_FragColor = vec4(h * m, v * m, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this._quad = new FullScreenQuad(this.mat);
  }

  /** The height texture to sample this frame (R = height, G = velocity). */
  get texture() { return this._a.texture; }

  /** Add a drop at world (x, z): radius (m), strength (negative pushes the water down). Applied on the next step. */
  drop(x, z, radius, strength) {
    if (this._drops.length >= MAX_DROPS) this._drops.shift();
    this._drops.push(new THREE.Vector4(x, z, radius, strength));
  }

  /** A body sitting in the surface this frame: radius, dimple depth (m). Cleared after every step. */
  body(x, z, radius, depth) {
    if (this._bodies.length >= MAX_BODIES) return;
    this._bodies.push(new THREE.Vector4(x, z, radius, depth));
  }

  /**
   * Bodies along a stroke from (ax, az) to (bx, bz) this frame, the way the game placed a moving fingertip: one
   * every 7 cm (at most 5), so a fast stroke is a continuous furrow. `speed` is in m/s.
   */
  stroke(ax, az, bx, bz, speed) {
    const seg = Math.hypot(bx - ax, bz - az);
    const n = Math.min(5, Math.max(1, Math.ceil(seg / 0.07)));
    const dip = 0.05 + Math.min(0.05, speed * 0.012);
    const rad = 0.16 + Math.min(0.06, speed * 0.008);
    for (let k = 1; k <= n; k++) this.body(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, rad, dip);
  }

  /** Run this frame's steps. Call once per rendered frame, before drawing anything that reads the texture. */
  step(renderer) {
    const u = this.mat.uniforms;
    // the same damping per second at every step count; light damping, so a slow trail leaves a long wake and a
    // tap's rings cross the pond (calm settles it a little faster: glassy water)
    u.uDamp.value = Math.pow(0.9955 + 0.0025 * (1 - this.calm), 2 / this.steps);
    const nb = this._bodies.length;
    for (let i = 0; i < nb; i++) u.uBodies.value[i].copy(this._bodies[i]);
    u.uNB.value = nb;
    const prev = renderer.getRenderTarget();
    for (let s = 0; s < this.steps; s++) {
      const n = s === 0 ? this._drops.length : 0;
      for (let i = 0; i < n; i++) u.uDrops.value[i].copy(this._drops[i]);
      u.uN.value = n;
      u.uPrev.value = this._a.texture;
      renderer.setRenderTarget(this._b);
      this._quad.render(renderer);
      const t = this._a; this._a = this._b; this._b = t;
    }
    this._drops.length = 0;
    this._bodies.length = 0;
    renderer.setRenderTarget(prev);
    this.uniforms.uSim.value = this._a.texture;
  }

  dispose() { this._a.dispose(); this._b.dispose(); this.mat.dispose(); this._quad.dispose(); }
}
