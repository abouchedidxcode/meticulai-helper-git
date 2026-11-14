// The sonar sketch: each ping casts ~900 rays through a rock field and leaves a glowing point wherever one meets a
// wall, so for a few seconds the sound draws the shape of the space in 3D: the chamber round you, the passage on, the
// ledge below. A point appears the moment the ping's front reaches its wall (the rays march outward with the front, a
// little each frame, so there is no spike on the ping), flashes, then cools from teal to black over ~4 s. Near walls
// are teal, far ones deep blue; targets in range (loot, pickups) come back as a small amber knot.
//
// A ghost contact comes back as a body: a big shape sketched in colder, dimmer, red-tinged points where the front
// reaches it, drifting along its path as it fades, with one or two fainter returns a second apart further along, the
// tail swept differently each time. Rock in front dims the part behind it to a faint trace (the bright points are
// depth-tested; a second layer, `xray`, draws ghost points only, at a fraction of the strength, through the rock), so
// it reads as something moving beyond the wall even when the wall hides all of it.
//
// One THREE.Points with a preallocated ring buffer. Each point carries its birth time; the fade runs in the shader
// off a clock uniform, so a frame only uploads the points born in it.
//
// The field: `density(x, y, z)` is POSITIVE inside rock and negative in open space (water, air), roughly the
// distance to the nearest wall. That is the signed distance function of the open space. If you have an SDF of the
// solid things instead (negative inside a solid), pass `fromSolidSdf(sdf)`.
//
// From the game Abyssal by Meticulai (meticulai.com). MIT licence.
import * as THREE from 'three';

/** @typedef {(x: number, y: number, z: number) => number} DensityFn  positive in rock, negative in open space */
/** @typedef {{ x: number, y: number, z: number }} V3 */
/** @typedef {{ pos: V3, taken?: boolean }} SketchTarget  something marked in amber when the ping reaches it */
/** @typedef {{ x: number, y: number, z: number, t0: number, range: number, decoy?: boolean }} SketchPing
 *  where the ping came from, when (on the sketch's clock), how far it reaches (m); decoys draw nothing */

/**
 * @typedef {object} SketchGhost  something big the ping finds beyond the walls
 * @property {{ x: number, y: number, z: number, t0: number }} ping  the ping that finds it: each point appears as that front reaches it
 * @property {V3} head  the snout at time `at`
 * @property {V3} vel   the velocity it swims with (the body trails behind it along -vel)
 * @property {number} at
 * @property {Float32Array} shape  body-space points: x forward (snout at 0, tail at -length), y up, z to the side
 * @property {number} [length]  body length (m; for the tail's wave), default 40
 * @property {number} [sway]    how far the tail sweeps (m), default 1.3
 * @property {number} [echoes]  fainter returns after the first, default 2
 * @property {number} [echoGap] seconds between returns, default 1
 * @property {number} [gain]    brightness 0..1, default 1
 * @property {number} [drift]   fraction of its velocity the sketch keeps drifting with as it fades, default 0.85
 */

export const KIND_ROCK = 0;
export const KIND_TARGET = 1;
export const KIND_GHOST = 2;

/** The numbers the game shipped with. The ping itself (speed, range) lives in the game; these are its values. */
export const SONAR_DEFAULTS = Object.freeze({
  /** speed of the ping's front (m/s) */
  speed: 46,
  /** how far a ping reaches (m) */
  range: 34,
  /** rays per ping */
  rays: 900,
  /** marching budget per frame (ms); rays that run out wait for the next frame */
  budgetMs: 2,
  /** seconds a rock point glows (target marks last 1.5x) */
  life: 4,
  /** points in the ring buffer */
  capacity: 8192,
  /** the fog density the fade uses (exp2 fog, the point only loses its edge: f = dist * fog * 0.4) */
  fogDensity: 0.021,
});

/** rays start this far out (clear of the hull) */
const T_START = 1.4;
/** sphere-trace step: a fraction of the distance to rock (the field is not a true distance, detail noise makes it
 * steeper than 1, so stay well under it), clamped */
const STEP_K = 0.4;
const STEP_MIN = 0.35;
const STEP_MAX = 3.2;
const BISECT = 5;
/** points sit this far in front of the surface (toward the ping) so the rock does not hide them */
const LIFT = 0.22;
/** each hit adds this many dimmer satellite points across the surface, filling the gaps between rays */
const SATS = 2;
const AMBER_PTS = 12;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const UP = new THREE.Vector3(0, 1, 0);

/** Turn an SDF of SOLID things (negative inside a solid) into the field the sketch wants (positive in rock). */
export const fromSolidSdf = (sdf) => (x, y, z) => -sdf(x, y, z);

/**
 * Ray directions on a Fibonacci sphere (near uniform), squashed toward the horizontal and pulled a little toward
 * `fwd` (the view), then turned by `rot` about the vertical so successive pings land between each other's rays.
 * Writes unit vectors into out (3 floats each).
 * @param {number} n @param {V3} fwd @param {number} rot @param {Float32Array} out
 * @param {number} [flat] vertical squash (1 = a round sphere) @param {number} [pull] lean toward fwd
 */
export function rayDirs(n, fwd, rot, out, flat = 0.78, pull = 0.25) {
  const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
  const fx = fwd.x / fl, fy = fwd.y / fl, fz = fwd.z / fl;
  for (let i = 0; i < n; i++) {
    const y0 = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const a = i * GOLDEN + rot;
    let x = Math.cos(a) * r, y = y0 * flat, z = Math.sin(a) * r;
    let l = Math.hypot(x, y, z);
    x = x / l + fx * pull; y = y / l + fy * pull; z = z / l + fz * pull;
    l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  return out;
}

const VERT = /* glsl */ `
attribute vec4 aInfo;
attribute vec3 aVel;
uniform float uTime, uPx, uMinPx, uMaxPx, uLife, uFogDensity, uXray;
uniform vec3 uNear, uFar, uFlash, uTarget, uGhostA, uGhostB;
varying vec3 vCol;
void main() {
  float age = uTime - aInfo.x;
  bool ghost = aInfo.z > 1.5;
  bool amber = aInfo.z > 0.5 && !ghost;
  float life = amber ? uLife * 1.5 : uLife;
  if (age < 0.0 || age > life || (uXray > 0.5 && !ghost)) { vCol = vec3(0.0); gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 mv = modelViewMatrix * vec4(position + aVel * age, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float k = age / life;
  float body = (1.0 - k) * (1.0 - k);
  float flash = exp(-age * 7.0);
  // teal near, cooling to deep blue toward the edge of the ping's reach
  vec3 c = mix(uNear, uFar, smoothstep(0.12, 0.95, aInfo.y));
  if (amber) c = uTarget;
  c = mix(c, uFlash, flash * 0.35);
  // walls facing the ping read brighter than ones it grazes, which gives the sketch its depth;
  // the far edge dims a little, and fog only takes the edge off (the points are the reveal)
  float b = (0.4 + 0.6 * aInfo.w) * (body * 0.6 + flash * 0.85) * mix(1.0, 0.72, aInfo.y);
  float f = dist * uFogDensity * 0.4;
  b *= exp(-f * f) * smoothstep(0.6, 2.4, dist);
  if (amber) b *= 1.25;
  if (ghost) {
    // the thing beyond the wall: colder and dimmer than the rock, a little red in it, and it lingers rather than
    // flashing (aInfo.w is the return's strength). Wholly behind rock it first read as nothing at all (a trace of
    // ~17/255 in 3 px dots at 35 m), so it is brighter, bigger and longer-lived than the rock; in open water the
    // two layers add up to about a flashed wall point, never more
    c = mix(uGhostA, uGhostB, flash * 0.4);
    b = aInfo.w * (body * 0.8 + flash * 0.45) * exp(-f * f * 0.6) * smoothstep(0.6, 2.4, dist);
    // (the through-rock layer: a faint trace; where nothing is in front it adds to the bright one)
    b *= mix(0.7, 0.5, uXray);
  }
  vCol = c * b;
  float h = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float m = (0.1 + 0.05 * h) * (1.0 + flash * 0.7) * (amber ? 1.4 : ghost ? 2.0 : 1.0);
  // (a ghost's points never shrink under 4 px: it is far, and it should read as a body, not dust)
  gl_PointSize = clamp(m * uPx / max(dist, 0.5), ghost ? max(uMinPx, 4.0) : uMinPx, uMaxPx);
}`;

const FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float a = (exp(-r2 * 3.2) - 0.04) / 0.96;
  gl_FragColor = vec4(vCol * a, 1.0);
  // linear light in; three's tone mapping and output colour space when drawn to the screen (the game did both in
  // its own finishing pass, after bloom)
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The colours the game shipped with (linear RGB, as the shader uses them). */
export const SONAR_COLOURS = Object.freeze({
  near: [0.2, 0.95, 0.85],
  far: [0.08, 0.3, 1.0],
  flash: [0.75, 1.0, 1.0],
  target: [1.0, 0.6, 0.2],
  ghost: [0.62, 0.42, 0.72],
  ghostFlash: [0.88, 0.74, 0.94],
});

export class SonarSketch {
  /**
   * @param {object} [opts]
   * @param {number} [opts.capacity] points in the ring buffer (8192)
   * @param {number} [opts.rays] rays per ping (900)
   * @param {number} [opts.budgetMs] marching budget per frame (2 ms)
   * @param {number} [opts.life] seconds a rock point glows (4)
   * @param {number} [opts.fogDensity] (0.021)
   * @param {{ value: number }} [opts.time] a shared clock uniform (seconds); else the sketch keeps its own
   * @param {Partial<typeof SONAR_COLOURS>} [opts.colours]
   */
  constructor(opts = {}) {
    const capacity = opts.capacity ?? SONAR_DEFAULTS.capacity;
    /** rays per ping */
    this.rays = opts.rays ?? SONAR_DEFAULTS.rays;
    /** marching budget per frame (ms); rays that run out wait for the next frame */
    this.budgetMs = opts.budgetMs ?? SONAR_DEFAULTS.budgetMs;
    /** seconds a rock point glows (target marks last 1.5x) */
    this.life = opts.life ?? SONAR_DEFAULTS.life;
    this.capacity = capacity;
    /** the wall clock for the budget (ms). Tests swap it for a fake one. */
    this.clock = () => performance.now();
    /** the clock uniform the fade runs on (seconds) */
    this.time = opts.time ?? { value: 0 };
    /** the sketch's clock (seconds): the time uniform unless a test drives it */
    this.now = () => this.time.value;

    this._pos = new Float32Array(capacity * 3);
    // per point: birth time, distance / range, kind, facing (1 = the wall faces the ping)
    this._info = new Float32Array(capacity * 4);
    // per point: drift velocity (m/s; zero for rock and targets, the swimmer's for a ghost)
    this._vel = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i++) { this._pos[i * 3 + 1] = -1e4; this._info[i * 4] = -1e6; }
    const g = new THREE.BufferGeometry();
    this._posAttr = new THREE.BufferAttribute(this._pos, 3).setUsage(THREE.DynamicDrawUsage);
    this._infoAttr = new THREE.BufferAttribute(this._info, 4).setUsage(THREE.DynamicDrawUsage);
    this._velAttr = new THREE.BufferAttribute(this._vel, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this._posAttr);
    g.setAttribute('aInfo', this._infoAttr);
    g.setAttribute('aVel', this._velAttr);

    const C = { ...SONAR_COLOURS, ...(opts.colours || {}) };
    const v3 = (a) => ({ value: new THREE.Vector3(a[0], a[1], a[2]) });
    /** @type {THREE.ShaderMaterial} */
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.time, uFogDensity: { value: opts.fogDensity ?? SONAR_DEFAULTS.fogDensity },
        uPx: { value: 1000 }, uMinPx: { value: 2.5 }, uMaxPx: { value: 9 }, uLife: { value: this.life }, uXray: { value: 0 },
        uNear: v3(C.near), uFar: v3(C.far), uFlash: v3(C.flash), uTarget: v3(C.target), uGhostA: v3(C.ghost), uGhostB: v3(C.ghostFlash),
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    /** add this to your scene */
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    // ghost points again, faint and not depth-tested: what lies behind rock still shows as a trace. The same
    // buffers and uniform objects, so one update drives both, with x-ray switched on
    const U = this.mat.uniforms;
    this.xrayMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uXray: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.xray = new THREE.Points(g, this.xrayMat);
    this.xray.frustumCulled = false;
    this.xray.renderOrder = 5;
    this.points.add(this.xray);

    this._ghosts = [];
    this._pv = { x: 0, y: 0, z: 0 };
    this._head = 0;
    this._dirtyAll = false;
    this._frameStart = 0;
    this._frameCount = 0;
    this._casts = [];
    this._rot = 0;
    this._st = { live: 0, raysLastPing: 0, hitsLastPing: 0, pending: 0, msFrame: 0, msAvg: 0, msMax: 0, callsFrame: 0, callsLastPing: 0 };
    this._lastCast = null;
    this._lastCalls = 0;
  }

  /**
   * Start a sketch for a ping. `fwd` is the view direction (rays bias a little toward it); targets in range are
   * marked in amber when the front reaches them. Decoy pings draw nothing.
   * @param {SketchPing} p @param {DensityFn | null} density @param {V3} fwd @param {readonly SketchTarget[]} [targets]
   */
  ping(p, density, fwd, targets = []) {
    if (p.decoy || !density) return;
    const n = this.rays;
    this._rot = (this._rot + 2.39996 * 0.37) % (Math.PI * 2);
    const dir = rayDirs(n, fwd, this._rot, new Float32Array(n * 3));
    const marks = [];
    for (const it of targets) {
      if (it.taken) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.y - p.y, it.pos.z - p.z);
      if (d <= p.range) marks.push({ x: it.pos.x, y: it.pos.y, z: it.pos.z, d });
    }
    marks.sort((a, b) => a.d - b.d);
    const c = {
      ox: p.x, oy: p.y, oz: p.z, t0: p.t0, range: p.range, n, dir,
      // how far each ray has marched, and the last distance it found open space
      t: new Float32Array(n).fill(T_START), wet: new Float32Array(n).fill(T_START), done: new Uint8Array(n),
      left: n, hits: 0, marks,
      // rays are visited from a rotating start, so a frame that runs out of budget does not always starve the same ones
      cursor: 0, density,
    };
    // keep at most three sketches marching (rapid pings can stack them)
    if (this._casts.length >= 3) this._casts.shift();
    this._casts.push(c);
    this._lastCast = c;
    this._st.raysLastPing = n;
    this._st.hitsLastPing = 0;
    this._st.callsLastPing = 0;
    this._st.msMax = 0;
  }

  /**
   * Sketch something big the ping finds (a ghost contact): its body appears in points as the ping's front reaches
   * each part, then fainter returns follow along its path.
   * @param {SketchGhost} g
   */
  ghost(g) {
    const n = Math.floor(g.shape.length / 3);
    if (n === 0) return;
    const fwd = new THREE.Vector3(g.vel.x, g.vel.y, g.vel.z);
    if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0);
    fwd.normalize();
    const side = new THREE.Vector3().crossVectors(fwd, UP);
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, fwd).normalize();
    if (this._ghosts.length >= 3) this._ghosts.shift();
    this._ghosts.push({ g, n, shown: new Uint8Array(n), left: n, first: -1, echo: 0, fwd, side, up });
  }

  /** Forget every sketch (between levels, on a restart). */
  clear() {
    this._casts.length = 0;
    this._ghosts.length = 0;
    this._lastCast = null;
    for (let i = 0; i < this.capacity; i++) this._info[i * 4] = -1e6;
    this._dirtyAll = true;
  }

  /**
   * March every live sketch's rays out to its ping's front. Call once per frame.
   * @param {number} speed the front speed (m/s; the game used 46)
   * @param {number} [pxH] the drawing buffer's height in pixels (sizes the points)
   */
  update(speed, pxH = 1000) {
    const t0 = this.clock();
    const now = this.now();
    const u = this.mat.uniforms;
    u.uPx.value = pxH * 0.9;
    u.uMinPx.value = Math.max(1.6, pxH / 420);
    u.uMaxPx.value = Math.max(6, pxH / 110);
    u.uLife.value = this.life;
    this._frameStart = this._head;
    this._frameCount = 0;
    let calls = 0;
    const deadline = t0 + this.budgetMs;
    for (let ci = 0; ci < this._casts.length; ci++) {
      const c = this._casts[ci];
      if (ci > 0 && this.clock() > deadline) break;
      const R = Math.min(c.range, Math.max(0, (now - c.t0) * speed));
      while (c.marks.length && c.marks[0].d <= R) this._amber(c.marks.shift(), now);
      const f = c.density;
      const n = c.n;
      let visited = 0;
      for (let k = 0; k < n; k++) {
        const i = (c.cursor + k) % n;
        if (c.done[i]) continue;
        // check the clock every 24 rays: rays that miss this frame catch up on the next
        if (++visited % 24 === 0 && this.clock() > deadline) { c.cursor = i; break; }
        const dx = c.dir[i * 3], dy = c.dir[i * 3 + 1], dz = c.dir[i * 3 + 2];
        let t = c.t[i];
        while (t <= R) {
          const d = f(c.ox + dx * t, c.oy + dy * t, c.oz + dz * t);
          calls++;
          if (d > 0) {
            let lo = c.wet[i], hi = t;
            for (let b = 0; b < BISECT; b++) {
              const m = (lo + hi) * 0.5;
              if (f(c.ox + dx * m, c.oy + dy * m, c.oz + dz * m) > 0) hi = m; else lo = m;
            }
            calls += BISECT;
            calls += this._hit(c, dx, dy, dz, hi, now);
            c.done[i] = 1; c.left--; c.hits++;
            break;
          }
          c.wet[i] = t;
          t += Math.min(STEP_MAX, Math.max(STEP_MIN, -d * STEP_K));
        }
        c.t[i] = t;
        if (!c.done[i] && t > c.range) { c.done[i] = 1; c.left--; }
      }
      if (c === this._lastCast) this._st.hitsLastPing = c.hits;
    }
    for (let ci = this._casts.length - 1; ci >= 0; ci--) {
      const c = this._casts[ci];
      if (c.left <= 0 && c.marks.length === 0) this._casts.splice(ci, 1);
    }
    for (let gi = this._ghosts.length - 1; gi >= 0; gi--) if (this._runGhost(this._ghosts[gi], now, speed)) this._ghosts.splice(gi, 1);
    this._flush();
    const ms = this.clock() - t0;
    const st = this._st;
    st.msFrame = ms;
    st.msAvg = st.msAvg * 0.95 + ms * 0.05;
    st.msMax = Math.max(st.msMax, ms);
    st.callsFrame = calls;
    if (this._lastCast) st.callsLastPing += calls;
    this._lastCalls = calls;
  }

  /** Is any sketch still marching (or a ghost still to come back)? */
  get busy() { return this._casts.length > 0 || this._ghosts.length > 0; }

  /** Draw what is due of a ghost: points the front has reached, then each echo. True when it is done. */
  _runGhost(r, now, speed) {
    const g = r.g, p = g.ping;
    const gain = g.gain ?? 1, drift = g.drift ?? 0.85, echoes = g.echoes ?? 2, gap = g.echoGap ?? 1;
    if (r.left > 0) {
      const R = (now - p.t0) * speed;
      if (R <= 0) return false;
      // a front that has long passed the whole body (a stalled frame, a late call): draw the rest now
      const late = R > 400;
      for (let i = 0; i < r.n; i++) {
        if (r.shown[i]) continue;
        const q = this._ghostPoint(r, i, now, 0);
        if (!late && Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) > R) continue;
        r.shown[i] = 1; r.left--;
        if (r.first < 0) r.first = now;
        this._put(q.x, q.y, q.z, now, 0, KIND_GHOST, gain, g.vel, drift);
      }
      return false;
    }
    if (r.echo >= echoes) return true;
    if (now < r.first + gap * (r.echo + 1)) return false;
    r.echo++;
    // each return a little fainter and sparser, the body further along its path, the tail swept on
    const every = r.echo + 1, k = gain * Math.pow(0.55, r.echo);
    for (let i = r.echo % every; i < r.n; i += every) {
      const q = this._ghostPoint(r, i, now, r.echo);
      this._put(q.x, q.y, q.z, now, 0, KIND_GHOST, k, g.vel, drift);
    }
    return r.echo >= echoes;
  }

  /** body point i of a ghost at time `now` (world), its tail swept by a swimming wave */
  _ghostPoint(r, i, now, pass) {
    const g = r.g, s = g.shape, L = g.length ?? 40, sway = g.sway ?? 1.3;
    const dt = now - g.at;
    const bx = s[i * 3], by = s[i * 3 + 1];
    // the head barely moves, the tail sweeps metres
    const px = bx + L / 2;
    const w = 0.12 + 0.88 * (1 - THREE.MathUtils.smoothstep(px, -L * 0.5, L * 0.3));
    const bz = s[i * 3 + 2] + Math.sin(px * ((Math.PI * 2) / (L * 0.85)) + now * 1.7 + pass * 0.9) * sway * w;
    const o = this._pv, f = r.fwd, sd = r.side, u = r.up;
    o.x = g.head.x + g.vel.x * dt + f.x * bx + u.x * by + sd.x * bz;
    o.y = g.head.y + g.vel.y * dt + f.y * bx + u.y * by + sd.y * bz;
    o.z = g.head.z + g.vel.z * dt + f.z * bx + u.z * by + sd.z * bz;
    return o;
  }

  /** Counters for a debug panel or a test. */
  stats() {
    const now = this.now();
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const age = now - this._info[i * 4];
      const kind = this._info[i * 4 + 2];
      const life = kind > 0.5 && kind < 1.5 ? this.life * 1.5 : this.life;
      // (births are stored as 32-bit floats, so one born this frame can sit a hair after now)
      if (age >= -0.01 && age <= life) live++;
    }
    let pending = 0;
    for (const c of this._casts) pending += c.left;
    const st = this._st;
    return { ...st, live, pending, msFrame: +st.msFrame.toFixed(3), msAvg: +st.msAvg.toFixed(3), msMax: +st.msMax.toFixed(3), callsFrame: this._lastCalls };
  }

  /** a ray met rock at distance th: its point, plus satellites across the surface. Returns density calls used. */
  _hit(c, dx, dy, dz, th, now) {
    const f = c.density;
    const hx = c.ox + dx * th, hy = c.oy + dy * th, hz = c.oz + dz * th;
    // surface normal by forward differences (the hit sits on the surface, so its density is ~0)
    const e = 0.3;
    const d0 = f(hx, hy, hz);
    let nx = f(hx + e, hy, hz) - d0, ny = f(hx, hy + e, hz) - d0, nz = f(hx, hy, hz + e) - d0;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const facing = Math.abs(nx * dx + ny * dy + nz * dz);
    const dn = th / c.range;
    const lift = th - LIFT;
    this._put(c.ox + dx * lift, c.oy + dy * lift, c.oz + dz * lift, now, dn, KIND_ROCK, facing);
    // tangent frame on the surface (from the normal alone: n x up, or n x x where the wall is level)
    const level = Math.abs(ny) > 0.9;
    let ux = level ? 0 : -nz, uy = level ? nz : 0, uz = level ? -ny : nx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    // spacing between neighbouring rays at this distance is ~0.12 rad * th; satellites split it
    const s = th * 0.042;
    for (let k = 0; k < SATS; k++) {
      const a = (k / SATS) * Math.PI * 2 + th * 1.7;
      const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
      // lifted off the surface along the normal (out of the rock) as well as toward the ping
      this._put(hx + ux * ca + vx * sa - nx * LIFT - dx * LIFT * 0.5, hy + uy * ca + vy * sa - ny * LIFT - dy * LIFT * 0.5,
        hz + uz * ca + vz * sa - nz * LIFT - dz * LIFT * 0.5, now, dn, KIND_ROCK, facing * 0.7);
    }
    return 4;
  }

  /** a small amber knot round a target */
  _amber(m, now) {
    for (let k = 0; k < AMBER_PTS; k++) {
      const y = 1 - (2 * (k + 0.5)) / AMBER_PTS, r = Math.sqrt(1 - y * y), a = k * GOLDEN;
      this._put(m.x + Math.cos(a) * r * 0.55, m.y + 0.35 + y * 0.45, m.z + Math.sin(a) * r * 0.55, now, 0, KIND_TARGET, 1);
    }
  }

  _put(x, y, z, birth, dn, kind, facing, v, drift = 0) {
    const i = this._head;
    this._pos[i * 3] = x; this._pos[i * 3 + 1] = y; this._pos[i * 3 + 2] = z;
    this._info[i * 4] = birth; this._info[i * 4 + 1] = dn; this._info[i * 4 + 2] = kind; this._info[i * 4 + 3] = facing;
    this._vel[i * 3] = v ? v.x * drift : 0; this._vel[i * 3 + 1] = v ? v.y * drift : 0; this._vel[i * 3 + 2] = v ? v.z * drift : 0;
    this._head = (i + 1) % this.capacity;
    this._frameCount++;
  }

  /** upload only the slots written this frame (one range, or two where the ring wrapped) */
  _flush() {
    const n = Math.min(this._frameCount, this.capacity);
    const pa = this._posAttr, ia = this._infoAttr, va = this._velAttr;
    if (this._dirtyAll) {
      this._dirtyAll = false;
      pa.clearUpdateRanges(); ia.clearUpdateRanges(); va.clearUpdateRanges();
      pa.needsUpdate = true; ia.needsUpdate = true; va.needsUpdate = true;
      return;
    }
    if (n === 0) return;
    pa.clearUpdateRanges(); ia.clearUpdateRanges(); va.clearUpdateRanges();
    const s = n === this.capacity ? 0 : this._frameStart;
    const a = Math.min(n, this.capacity - s);
    pa.addUpdateRange(s * 3, a * 3); ia.addUpdateRange(s * 4, a * 4); va.addUpdateRange(s * 3, a * 3);
    if (n > a) { pa.addUpdateRange(0, (n - a) * 3); ia.addUpdateRange(0, (n - a) * 4); va.addUpdateRange(0, (n - a) * 3); }
    pa.needsUpdate = true; ia.needsUpdate = true; va.needsUpdate = true;
  }

  dispose() { this.points.geometry.dispose(); this.mat.dispose(); this.xrayMat.dispose(); }
}
