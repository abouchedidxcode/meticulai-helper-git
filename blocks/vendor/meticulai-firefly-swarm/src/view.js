/**
 * Firefly rendering: soft points with a tiny hot core, a warm inner glow and a wide faint halo. The glow is drawn,
 * not bloomed, so it stays soft and controlled. Three point sets:
 *   free   catchable fireflies, depth-tested (they dip behind grass blades)
 *   held   fireflies inside a fist, drawn on top (no depth test), dimmer, so a fist glows from within
 *   swarm  a few hundred distant decorative fireflies over the far meadow, animated entirely on the GPU
 */
import * as THREE from 'three';
import { COLORS } from './flies.js';

/** @typedef {import('./flies.js').Fly} Fly */

const pointVS = /* glsl */ `
  attribute vec3 aColor; attribute float aSize; attribute float aBright;
  uniform float uPx;
  varying vec3 vColor; varying float vBright;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uPx / max(-mv.z, 0.1), 360.0);
    vColor = aColor; vBright = aBright;
  }`;

const pointFS = /* glsl */ `
  uniform float uCore, uHalo;
  varying vec3 vColor; varying float vBright;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 220.0) * uCore;
    float glow = exp(-r2 * 34.0) * 0.42;
    float halo = exp(-r2 * 6.5) * uHalo * (1.0 - r2);
    vec3 col = vColor * (glow + halo) + mix(vColor, vec3(1.0, 0.97, 0.85), 0.6) * core;
    gl_FragColor = vec4(col * vBright, 0.0); // alpha 0: adds light, never hides what is behind
  }`;

/** @param {number} core @param {number} halo @param {boolean} depthTest */
function pointsMaterial(core, halo, depthTest) {
  return new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 800 }, uCore: { value: core }, uHalo: { value: halo } },
    vertexShader: pointVS, fragmentShader: pointFS,
    transparent: true, depthWrite: false, depthTest,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
}

class PointSet {
  /** @param {THREE.ShaderMaterial} mat @param {number} max */
  constructor(mat, max) {
    this.mat = mat;
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.bright = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aBright', new THREE.BufferAttribute(this.bright, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }
  /** @param {Fly[]} list @param {number} scale @param {number} [dim] @param {(f: Fly) => number} [each] */
  write(list, scale, dim = 1, each) {
    const n = Math.min(this.max, list.length);
    for (let i = 0; i < n; i++) {
      const f = list[i];
      this.pos.set([f.pos.x, f.pos.y, f.pos.z], i * 3);
      const c = COLORS[f.kind];
      this.col.set([c.r * 2.2, c.g * 2.2, c.b * 2.2], i * 3);
      this.size[i] = 0.52 * f.size * scale;
      this.bright[i] = f.bright * dim * (each ? each(f) : 1);
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aSize', 'aBright']) /** @type {THREE.BufferAttribute} */ (this.geo.getAttribute(k)).needsUpdate = true;
  }
}

/**
 * @typedef {object} ViewOptions
 * @property {number} [max]        most fireflies drawn per set (48)
 * @property {number} [core]       hot core strength of free fireflies (5)
 * @property {number} [halo]       wide halo strength of free fireflies (0.11; the owner's bloom limit at full night)
 * @property {number} [heldCore]   (2.2)
 * @property {number} [heldHalo]   (0.1)
 * @property {number} [swarmCount] distant decorative fireflies (340; 0 = none)
 * @property {number} [swarmSeed]  (99)
 */

export class FireflyView {
  /** @param {import('./look.js').Look} look @param {ViewOptions} [opts] */
  constructor(look, opts = {}) {
    const max = opts.max ?? 48;
    this.group = new THREE.Group();
    this.free = new PointSet(pointsMaterial(opts.core ?? 5, opts.halo ?? 0.11, true), max);
    this.held = new PointSet(pointsMaterial(opts.heldCore ?? 2.2, opts.heldHalo ?? 0.1, false), max);
    this.held.points.renderOrder = 20;
    this.free.points.renderOrder = 5;
    this.group.add(this.free.points, this.held.points);

    // distant swarm, laid out in front of a camera near the origin looking down -z (move `view.swarm` to place it)
    const N = opts.swarmCount ?? 340;
    let s = opts.swarmSeed ?? 99;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const z = -4 - Math.pow(r(), 1.3) * 52;
      const half = 4 + (-z) * 0.9;
      pos.set([(r() * 2 - 1) * half, 0.25 + Math.pow(r(), 1.6) * (1.4 + (-z) * 0.05), z], i * 3);
      seed.set([r() * 100, 2.5 + r() * 3.5, r(), 0.7 + r() * 0.6], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.swarmMat = new THREE.ShaderMaterial({
      uniforms: { uTime: look.uTime, uDusk: look.uDusk, uPx: { value: 800 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uDusk, uPx;
        attribute vec4 aSeed;
        varying float vB; varying float vWarm;
        void main() {
          vec3 p = position;
          float s = aSeed.x;
          p.x += sin(uTime * 0.21 + s) * 0.9 + sin(uTime * 0.53 + s * 2.1) * 0.3;
          p.y += sin(uTime * 0.33 + s * 1.7) * 0.35;
          p.z += cos(uTime * 0.17 + s * 0.7) * 0.8;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float ph = fract((uTime + s) / aSeed.y);
          float flash = ph < 0.18 ? pow(sin(ph / 0.18 * 3.14159), 2.0) : 0.0;
          // fewer show early; the meadow fills with them as it gets dark
          float awake = smoothstep(aSeed.z * 0.7, aSeed.z * 0.7 + 0.25, uDusk + 0.12);
          vB = (0.12 + flash) * awake;
          vWarm = aSeed.w;
          gl_PointSize = min(0.5 * uPx / max(-mv.z, 0.1), 64.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vB; varying float vWarm;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
          if (r2 > 1.0 || vB < 0.002) discard;
          float k = exp(-r2 * 70.0) * 2.4 + exp(-r2 * 9.0) * 0.22;
          vec3 col = mix(vec3(1.0, 0.72, 0.3), vec3(0.95, 0.9, 0.45), vWarm - 0.7);
          gl_FragColor = vec4(col * k * vB, 1.0);
        }`,
    });
    this.swarm = new THREE.Points(g, this.swarmMat);
    this.swarm.frustumCulled = false;
    if (N > 0) this.group.add(this.swarm);
  }

  /**
   * Point sizes are in world units: call on resize with the drawing buffer height in pixels and the camera's
   * vertical field of view. @param {number} bufferHeightPx @param {number} fovDeg
   */
  resize(bufferHeightPx, fovDeg) {
    this.setPixelScale(bufferHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)));
  }

  /** @param {number} px pixels per world unit at distance 1 */
  setPixelScale(px) {
    this.free.mat.uniforms.uPx.value = px;
    this.held.mat.uniforms.uPx.value = px;
    this.swarmMat.uniforms.uPx.value = px;
  }

  /** Writes this frame's fireflies. `veil` dims free fireflies (e.g. behind a results panel). @param {Fly[]} list @param {(f: Fly) => number} [veil] */
  update(list, veil) {
    /** @type {Fly[]} */ const free = [];
    /** @type {Fly[]} */ const held = [];
    /** @type {Map<number, number>} */ const perHand = new Map();
    for (const f of list) {
      (f.state === 'caught' ? held : free).push(f);
      if (f.state === 'caught' && f.hand !== null) perHand.set(f.hand, (perHand.get(f.hand) ?? 0) + 1);
    }
    this.free.write(free, 1, 1, veil);
    // several in one fist overlap and add up to a white blob: the fist's light grows with the square root of the
    // count instead (one held firefly looks exactly as before)
    this.held.write(held, 0.8, 0.55, (f) => 1 / Math.sqrt(perHand.get(f.hand ?? -1) ?? 1));
  }

  dispose() {
    for (const p of [this.free, this.held]) { p.geo.dispose(); p.mat.dispose(); }
    this.swarm.geometry.dispose(); this.swarmMat.dispose();
  }
}
