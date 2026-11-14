// Soft ground that remembers. A small square of ground around a moving body is simulated on the GPU (in the game,
// Last Drop, the body is a drop of water sliding over desert sand): r = how far the surface is pushed down or heaped
// up (metres), g = how wet the grains are, b = the glossy film of free water just behind the body. Every frame:
//   the body presses a groove along its path since the last frame and shoves the sand into low berms either side
//   (and a little bow wave in front); a hard landing leaves a shallow crater with a rim;
//   water wicks sideways from the track into the dry grains, fast at first and slowing, with a ragged front;
//   dry sand past its angle of repose slides back and the berms slump away in a few seconds, while wet sand is
//   cohesive and keeps the shape for much longer.
// It is visual only: your physics keeps running on its own ground. sand-material.js shades the result on any
// MeshStandardMaterial as normal detail with self-shadowing and wet darkening. The square scrolls by whole texels to
// follow the body, a little more of it behind the body than ahead (that is where a chase camera looks).
//
// From the game Last Drop by Meticulai (meticulai.com). MIT licence.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FULLSCREEN_VERT } from './fullscreen.js';

const FRAG = /* glsl */ `
uniform sampler2D tPrev;
uniform vec2 uShift;      // scroll since the last frame, in uv (whole texels)
uniform float uTexel;     // one texel in uv
uniform vec4 uRect;       // world x0, z0, span, texel size (m)
uniform vec4 uSeg;        // the body's path this frame, from (x, y) to (z, w), in uv
uniform vec4 uPress;      // contact radius (uv), contact 0..1, groove depth (m), berm height (m)
uniform vec4 uImpact;     // landing: centre uv (xy), radius uv, depth (m)
uniform vec3 uDecay;      // per-step multipliers: dry heights, wet heights, wetness (1 between steps)
uniform vec2 uSlump;      // flow rate (0..0.25), wick rate
uniform vec2 uFilm;       // film strength, per-frame film decay
varying vec2 vUv;

vec2 S(vec2 p) {
  return (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? vec2(0.0) : texture2D(tPrev, p).rg;
}
// sand moves between neighbours only where the step between them is steeper than the angle of repose
// (much steeper for wet, cohesive sand); the flux is symmetric, so sand is moved, never made or lost
float flow(vec2 c, vec2 n) {
  float T = uRect.w * mix(0.55, 4.0, smoothstep(0.15, 0.6, max(c.y, n.y)));
  return max(0.0, n.x - c.x - T) - max(0.0, c.x - n.x - T);
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 p = vUv + uShift;
  vec2 c = S(p);
  float film = (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? 0.0 : texture2D(tPrev, p).b * uFilm.y;
  vec2 l = S(p - vec2(uTexel, 0.0));
  vec2 r = S(p + vec2(uTexel, 0.0));
  vec2 d = S(p - vec2(0.0, uTexel));
  vec2 u = S(p + vec2(0.0, uTexel));
  float h = c.x;
  float w = c.y;

  // slumping
  h += (flow(c, l) + flow(c, r) + flow(c, d) + flow(c, u)) * uSlump.x;
  // and settling: dry sand creeps back level within a few seconds, wet sand holds
  h *= mix(uDecay.x, uDecay.y, smoothstep(0.2, 0.7, w));

  // wicking: capillarity pulls water into the dry grains around the track; the front slows as it widens, and its
  // edge is ragged with the grains (a fixed per-texel noise, in world space so it doesn't swim as the map scrolls)
  vec2 world = uRect.xy + vUv * uRect.z;
  float grain = hash(floor(world / uRect.w));
  float nb = (l.y + r.y + d.y + u.y) * 0.25;
  w = max(w, mix(w, nb, uSlump.y * (0.6 + 0.8 * grain)));
  w *= uDecay.z;

  // the body: a groove along its path (shallow under the body itself, full depth once it has passed), berms
  // either side and a bow wave ahead of it
  vec2 a = uSeg.xy;
  vec2 b = uSeg.zw;
  vec2 ab = b - a;
  float t = clamp(dot(vUv - a, ab) / max(dot(ab, ab), 1e-10), 0.0, 1.0);
  // the berms come out in small clumps (only their height varies: a wandering edge read as a squiggly trail)
  float clump = vnoise(world * 41.0) * 0.6 + vnoise(world * 90.0) * 0.4;
  float dist = length(vUv - (a + ab * t)) / max(uPress.x, 1e-6);
  float head = smoothstep(0.0, uPress.x * 0.9, length(vUv - b));
  float k = uPress.y;
  if (k > 0.0) {
    // (not behind where this frame's path starts: that ring would fill in the groove just dug)
    float lab = length(ab);
    float rear = lab > 1e-6 ? smoothstep(-uPress.x, 0.0, dot(vUv - a, ab) / lab) : 1.0;
    float berm = exp(-pow((dist - 1.3) / 0.32, 2.0)) * uPress.w * k * rear * (0.7 + 0.6 * clump);
    if (berm > 2e-4) h = max(h, berm);
    float groove = (1.0 - dist * dist) * uPress.z * k * mix(0.85, 1.0, head);
    if (dist < 1.0) h = min(h, -groove);
    w = max(w, (1.0 - smoothstep(0.6, 1.0, dist)) * k);
    film = max(film, (1.0 - smoothstep(0.55, 1.0, dist)) * k * uFilm.x);
  }
  // a landing: a shallow crater with a rim of thrown sand
  if (uImpact.w > 0.0) {
    float di = length(vUv - uImpact.xy) / uImpact.z;
    float rim = exp(-pow((di - 1.25) / 0.3, 2.0)) * uImpact.w * 0.45;
    if (rim > 2e-4) h = max(h, rim);
    if (di < 1.0) h = min(h, -(1.0 - di * di) * uImpact.w);
    w = max(w, (1.0 - smoothstep(0.5, 1.1, di)) * 0.8);
  }
  gl_FragColor = vec4(h, w, film, 1.0);
}`;

/** The numbers the game shipped with (desktop High: { size: 512, span: 12 }; phones on High: { size: 256, span: 12 }). */
export const SAND_DEFAULTS = Object.freeze({
  /** texels a side */
  size: 512,
  /** metres the square covers */
  span: 12,
  /** the square leads the body by this share of its span, behind it (chase camera) */
  lead: 0.22,
  /** speed (m/s) at which the body ploughs its deepest groove */
  ploughSpeed: 12,
  /** groove depth = radius * (grooveSlow + grooveFast * plough) */
  grooveSlow: 0.1, grooveFast: 0.1,
  /** berm height = radius * (bermSlow + bermFast * plough) */
  bermSlow: 0.025, bermFast: 0.05,
  /** slumping (0..0.25) and wicking rates per 60 Hz frame */
  slump: 0.12, wick: 0.14,
  /** time constants (s): dry heights settle, wet heights hold, wetness dries, the glossy film dries */
  dryHeightTau: 2.2, wetHeightTau: 45, wetnessTau: 60, filmTau: 1.6,
});

export class SandMap {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {Partial<typeof SAND_DEFAULTS>} [tuning]
   */
  constructor(renderer, tuning = {}) {
    this.renderer = renderer;
    /** live tuning (copy of SAND_DEFAULTS plus your overrides); size and span change through configure() */
    this.tuning = { ...SAND_DEFAULTS, ...tuning };
    this.rts = null;
    this.size = 0;
    this.span = 10;
    this.cur = 0;
    // shared by reference with the ground material: world x0, z0, span, texel (m); and whether the map is running
    this.rect = { value: new THREE.Vector4(-5, -5, 10, 10 / 256) };
    this.on = { value: 0 };
    this.tex = { value: null };
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uTexel: { value: 1 / 256 }, uRect: { value: new THREE.Vector4() },
        uSeg: { value: new THREE.Vector4() }, uPress: { value: new THREE.Vector4() }, uImpact: { value: new THREE.Vector4() },
        uDecay: { value: new THREE.Vector3(1, 1, 1) }, uSlump: { value: new THREE.Vector2() }, uFilm: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fsq = new FullScreenQuad(this.mat);
    this.last = new THREE.Vector2();
    this.hasLast = false;
    this.impact = new THREE.Vector4();
    this.stepAcc = 0;
    this.configure({ size: this.tuning.size, span: this.tuning.span });
  }

  /** Quality: { size, span } runs the simulation at that resolution over that many metres; null turns it off. */
  configure(cfg) {
    const size = cfg ? cfg.size : 0;
    if (size === this.size && (!cfg || cfg.span === this.span)) return;
    if (this.rts) for (const rt of this.rts) rt.dispose();
    this.rts = null;
    this.size = size;
    this.on.value = size ? 1 : 0;
    this.tex.value = null;
    if (!size) return;
    this.span = cfg.span;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rts = [new THREE.WebGLRenderTarget(size, size, opts), new THREE.WebGLRenderTarget(size, size, opts)];
    this.rect.value.z = this.span;
    this.rect.value.w = this.span / size;
    this.clear();
  }

  clear() {
    if (!this.rts) return;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    for (const rt of this.rts) {
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
    }
    r.setRenderTarget(prev);
    this.hasLast = false;
    this.tex.value = this.rts[this.cur].texture;
  }

  /** A landing at (x, z): the crater's radius and depth in metres (applied on the next update). */
  land(x, z, radius, depth) {
    this.impact.set(x, z, radius, Math.max(this.impact.w, depth));
  }

  /**
   * One simulation step. Call once per rendered frame.
   * @param {number} dt seconds
   * @param {number} x @param {number} z the body's centre (world)
   * @param {number} vx @param {number} vz its velocity
   * @param {number} radius contact radius (m)
   * @param {number} contact 0 (airborne, or in water) .. 1 (pressing; the game used up to 1.5 for a hard dive)
   * @param {number} speed m/s
   * @param {number} [film] how much free water it sheds (0..1; 0 for a dry ball or a boot)
   */
  update(dt, x, z, vx, vz, radius, contact, speed, film = 1) {
    if (!this.rts) return;
    const T = this.tuning;
    const rect = this.rect.value;
    const span = this.span;
    const texel = span / this.size;
    // keep the body a little ahead of the centre: the trail behind it is what the camera sees
    const sp = Math.hypot(vx, vz);
    const lead = sp > 0.5 ? (span * T.lead) / sp : 0;
    const tx = Math.round((x - vx * lead - span / 2 - rect.x) / texel);
    const tz = Math.round((z - vz * lead - span / 2 - rect.y) / texel);
    const u = this.mat.uniforms;
    if (Math.abs(tx) > this.size * 0.6 || Math.abs(tz) > this.size * 0.6) {
      // teleport (a new run): start over
      rect.x += tx * texel;
      rect.y += tz * texel;
      this.clear();
      u.uShift.value.set(0, 0);
    } else {
      rect.x += tx * texel;
      rect.y += tz * texel;
      u.uShift.value.set(tx / this.size, tz / this.size);
    }
    const ax = this.hasLast ? this.last.x : x;
    const az = this.hasLast ? this.last.y : z;
    u.uSeg.value.set((ax - rect.x) / span, (az - rect.y) / span, (x - rect.x) / span, (z - rect.y) / span);
    // a sliding body ploughs deeper the faster it goes; sitting still it barely dents the sand
    const plough = Math.min(1, speed / T.ploughSpeed);
    u.uPress.value.set(radius / span, contact, radius * (T.grooveSlow + T.grooveFast * plough), radius * (T.bermSlow + T.bermFast * plough));
    const im = this.impact;
    if (im.w > 0) {
      u.uImpact.value.set((im.x - rect.x) / span, (im.y - rect.y) / span, im.z / span, im.w);
      im.w = 0;
    } else u.uImpact.value.w = 0;
    u.uTexel.value = 1 / this.size;
    u.uFilm.value.set(film, Math.exp(-dt / T.filmTau));
    u.uRect.value.copy(rect);
    // slumping and wicking per frame, scaled to 60 Hz; the slow decays are applied in tenth-of-a-second steps (one
    // frame's worth is below a half-float step on wet sand and would round away)
    const f = Math.min(2, dt * 60);
    u.uSlump.value.set(T.slump * f, T.wick * f);
    this.stepAcc += dt;
    if (this.stepAcc >= 0.1) {
      u.uDecay.value.set(Math.exp(-this.stepAcc / T.dryHeightTau), Math.exp(-this.stepAcc / T.wetHeightTau), Math.exp(-this.stepAcc / T.wetnessTau));
      this.stepAcc = 0;
    } else u.uDecay.value.set(1, 1, 1);
    u.tPrev.value = this.rts[this.cur].texture;
    this.cur ^= 1;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rts[this.cur]);
    this.fsq.render(r);
    r.setRenderTarget(prev);
    this.tex.value = this.rts[this.cur].texture;
    this.last.set(x, z);
    this.hasLast = true;
  }

  dispose() {
    if (this.rts) for (const rt of this.rts) rt.dispose();
    this.rts = null;
    this.mat.dispose();
    this.fsq.dispose();
  }
}
