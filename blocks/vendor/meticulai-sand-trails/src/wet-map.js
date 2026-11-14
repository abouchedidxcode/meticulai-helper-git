// The long damp trail. A big square of ground around the moving body is kept in a small render target (r = how damp
// the ground is, g = a fresh film of water that dries in a second or two). Every frame the body's path since the last
// frame is stamped in as a capsule, and everything slowly dries. When the body wanders off-centre the square follows
// it, shifting by whole texels so the trail never blurs. It is the coarse partner of sand-map.js: the sand map is
// fine and short (12 m), this one is coarse and long (44 m), so the trail stays visible far behind.
//
// From the game Last Drop by Meticulai (meticulai.com). MIT licence.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FULLSCREEN_VERT } from './fullscreen.js';


const FRAG = /* glsl */ `
uniform sampler2D tPrev;
uniform vec2 uShift;
uniform vec2 uDecay;
uniform vec4 uSeg;      // capsule from (x, y) to (z, w), in uv
uniform vec2 uRad;      // capsule radius in uv, strength
uniform vec2 uFilm;     // film strength
varying vec2 vUv;
void main() {
  vec2 p = vUv + uShift;
  vec2 prev = (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? vec2(0.0) : texture2D(tPrev, p).rg;
  vec2 a = uSeg.xy;
  vec2 b = uSeg.zw;
  vec2 ab = b - a;
  float t = clamp(dot(vUv - a, ab) / max(dot(ab, ab), 1e-10), 0.0, 1.0);
  float d = length(vUv - (a + ab * t)) / max(uRad.x, 1e-6);
  // a soft-edged band, slightly darker at its edges where the water wicks out sideways
  float band = (1.0 - smoothstep(0.55, 1.0, d)) * uRad.y;
  float edge = smoothstep(0.5, 0.85, d) * (1.0 - smoothstep(0.85, 1.05, d)) * uRad.y * 0.25;
  vec2 o = prev * uDecay;
  o.r = max(o.r, band * 0.95 + edge);
  o.g = max(o.g, band * uFilm.x);
  gl_FragColor = vec4(o, 0.0, 1.0);
}`;

/** The numbers the game shipped with. */
export const WET_DEFAULTS = Object.freeze({
  /** texels a side (phones on High used 256, or skipped this map: the fine sand map draws the trail near the body) */
  size: 512,
  /** metres covered */
  span: 44,
  /** damp ground dries over about a minute; the surface film in a couple of seconds (time constants, s) */
  dryTau: 70, filmTau: 1.6,
});

export class WetMap {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {Partial<typeof WET_DEFAULTS>} [tuning]
   */
  constructor(renderer, tuning = {}) {
    this.renderer = renderer;
    this.tuning = { ...WET_DEFAULTS, ...tuning };
    const size = this.tuning.size;
    const SPAN = this.tuning.span;
    this.size = size;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rts = [new THREE.WebGLRenderTarget(size, size, opts), new THREE.WebGLRenderTarget(size, size, opts)];
    this.cur = 0;
    this.rect = { value: new THREE.Vector3(-SPAN / 2, -SPAN / 2, SPAN) };
    this.texture = this.rts[0].texture;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uDecay: { value: new THREE.Vector2(1, 1) },
        uSeg: { value: new THREE.Vector4() }, uRad: { value: new THREE.Vector2() }, uFilm: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fsq = new FullScreenQuad(this.mat);
    this.last = null;
    this.clear();
  }

  // size 0 turns the map off (phones on High: the fine sand map draws the trail there); it stays cleared
  setSize(size) {
    this.off = !size;
    this.last = null;
    size = size || 64;
    if (size === this.size) return;
    this.size = size;
    for (const rt of this.rts) rt.setSize(size, size);
    this.clear();
  }

  clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    for (const rt of this.rts) {
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
    }
    r.setRenderTarget(prev);
    this.last = null;
  }

  // x, z: body centre now; radius: contact radius; strength: 0 when airborne; film: how much free water it sheds.
  update(dt, x, z, radius, strength, film = 1) {
    const SPAN = this.tuning.span;
    if (this.off) {
      this.texture = this.rts[this.cur].texture;
      return;
    }
    const rect = this.rect.value;
    const SIZE = this.size;
    const texel = SPAN / SIZE;
    // Recentre on the drop once it wanders, by a whole number of texels.
    let sx = 0;
    let sz = 0;
    const cx = rect.x + SPAN / 2;
    const cz = rect.y + SPAN / 2;
    if (Math.abs(x - cx) > SPAN * 0.18 || Math.abs(z - cz) > SPAN * 0.18) {
      const tx = Math.round((x - cx) / texel);
      const tz = Math.round((z - cz) / texel);
      if (Math.abs(tx) > SIZE * 0.6 || Math.abs(tz) > SIZE * 0.6) {
        // teleport (a new run): start over
        rect.x = Math.round((x - SPAN / 2) / texel) * texel;
        rect.y = Math.round((z - SPAN / 2) / texel) * texel;
        this.clear();
      } else {
        sx = tx / SIZE;
        sz = tz / SIZE;
        rect.x += tx * texel;
        rect.y += tz * texel;
      }
    }
    const u = this.mat.uniforms;
    const toUv = (wx, wz) => [(wx - rect.x) / SPAN, (wz - rect.y) / SPAN];
    const a = this.last ? toUv(this.last[0], this.last[1]) : toUv(x, z);
    const b = toUv(x, z);
    u.uSeg.value.set(a[0], a[1], b[0], b[1]);
    u.uRad.value.set(radius / SPAN, strength);
    u.uFilm.value.set(film, 0);
    u.uShift.value.set(sx, sz);
    // Damp sand dries over about a minute, the surface film in a couple of seconds. The slow drying is applied in
    // quarter-second steps: a single frame's worth is smaller than a half-float step and would round away.
    this.dryAcc = (this.dryAcc || 0) + dt;
    let dry = 1;
    if (this.dryAcc >= 0.25) {
      dry = Math.exp(-this.dryAcc / this.tuning.dryTau);
      this.dryAcc = 0;
    }
    u.uDecay.value.set(dry, Math.exp(-dt / this.tuning.filmTau));
    u.tPrev.value = this.rts[this.cur].texture;
    this.cur ^= 1;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rts[this.cur]);
    this.fsq.render(r);
    r.setRenderTarget(prev);
    this.texture = this.rts[this.cur].texture;
    this.last = [x, z];
  }

  dispose() {
    for (const rt of this.rts) rt.dispose();
    this.mat.dispose();
    this.fsq.dispose();
  }
}
