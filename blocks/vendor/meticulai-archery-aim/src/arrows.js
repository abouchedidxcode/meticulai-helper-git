// ARROWS (three.js, WebGL2): every arrow in flight and every arrow left standing, drawn.
//
//   const arrows = createArrows({ scene, camera, renderer, targets, heightAt?, normalAt?, emit?, listener?, options? });
//   arrows.spawn({ pos, vel, byPlayer?, perfect?, power?, hero?, guide? }) -> arrow record or null
//       pos, vel: world m and m/s (add the shooter's own velocity yourself: aimShot() does). guide: see flight.js.
//       The player's arrows, and others that will land near the listener, are "hero" arrows: a real mesh, a streak,
//       tested against every target, they stick and stay. Everything else is a "volley" arrow: thousands of them,
//       drawn and flown entirely on the GPU with the same ballistics, landing on the ground only.
//   arrows.update(dt, time)        every frame (or every fixed step), with the game clock in seconds
//   arrows.volley({ x, z, radius | (width, depth, yaw), tx, tz, tr, count, speed?, high?, arc?, stagger?, carry?, seed?, height? })
//       a whole volley in one call -> { flight (s until the middle of the rain lands), count }
//   arrows.anchor()  -> { matrixWorld, userData: { still, gone }, set12(rows) }: something for arrows to ride that is
//       not an Object3D (a bone of an instanced, skinned rider). Keep its matrixWorld current every frame BEFORE
//       arrows.update. userData.still = true while it does not move (the arrows then cost nothing), userData.gone =
//       true when the body is removed (its arrows shrink away over 0.8 s).
//   arrows.stuckIn(attach) -> how many arrows stand in it now        arrows.clear()
//   arrows.strike(kind, point, dir?, attach?)  the burst that marks a strike ('armor'|'helm'|'shield'|'wood'|'horse'|'target')
//   arrows.predict(arrow) -> where it will end (flight.js)
// Hits: a target's hit can carry `attach` (an Object3D or an anchor) for the stuck arrow to ride: it keeps its pose
// in that frame, so it stays in a body through the fall and on the ground.
// Events through emit(name, data): 'arrow:hit' { kind, pos, speed, dist, byPlayer, key, targetId, dir, normal, ... }
// and 'arrow:near' { pos } (a real arrow within 4 m of the listener's head, or a volley arrow whose path will pass
// within 3.4 m). Every real arrow in flight leaves a STREAK: a bright line along the path it has just flown that
// fades in a fraction of a second, so the eye can follow the shot from the bow to the mark.
import * as THREE from 'three';
import { at, solve, flightTime as flightTimeOn, speedForArc, DRAG, VT } from './ballistics.js';
import { createFlight } from './flight.js';

/** The code-built arrow: nock at the origin, point at +Z (metres). */
export const ARROW = { length: 0.84, shaftR: 0.0046, headLen: 0.058, fletchFrom: 0.034, fletchTo: 0.150, fletchH: 0.0175 };

/** The look and cost numbers, exactly as tuned in the source game. Live: change them any time. */
export const ARROWS_DEFAULTS = {
  thick: 2.0,            // px: the shaft is held to about this width on screen at any distance
  volleyThick: 0.62, volleyMinLen: 26, volleyMaxStretch: 8, volleyDark: 0.16,
  hitMark: 0.95, hitMarkPx: 4.5, hitMarkSecs: 2.2,
  shadow: 0.26, shadowWidth: 0.16, shadowSpread: 0.035, shadowLen: 2.2,
  streak: 1, streakFade: 0.32, streakPx: 3.6, streakGlow: 2.4, streakOthers: 0.5,
  flash: 0.9, flashPx: 3.0,
  burst: 1, burstPx: 30, burstNear: 0.5, burstSecs: 0.42,
  hero: 420,             // hero arrows alive at once (in flight + stuck); the oldest standing ones fade to make room
  volley: 8192,          // GPU volley arrows (a ring: the oldest are overwritten)
};
const VOLLEY_STAND = 45, VOLLEY_SINK = 3;  // seconds a volley arrow stands in the ground, then sinks away
const DEPTH = { ground: 0.16, target: 0.20, shield: 0.07, wood: 0.06, armor: 0.04, helm: 0.02, horse: 0.10, stone: 0.03, body: 0.10 };

/** A small seeded random (mulberry32) -> () => 0..1 */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashSeed = (x) => { let h = 2166136261; for (const ch of String(x)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/** The arrow mesh, built in code: shaft, nock, leaf head, three vanes. Vertex colours, no textures. */
export function arrowGeometry({ sides = 6, colors = {} } = {}) {
  const wood = colors.shaft || [0.56, 0.42, 0.24], nock = colors.nock || [0.16, 0.12, 0.09], iron = colors.head || [0.62, 0.62, 0.60], feather = colors.vanes || [0.93, 0.90, 0.82], tip = colors.vaneTip || [0.55, 0.20, 0.14];
  const P = [], N = [], C = [], I = [];
  const L = ARROW.length, shaftEnd = L - ARROW.headLen + 0.012;
  const stations = [[0, 0.0056], [0.014, 0.0050], [0.45, 0.0048], [shaftEnd, 0.0040]];
  const base0 = 0;
  for (let i = 0; i < stations.length; i++) for (let j = 0; j <= sides; j++) {
    const a = (j / sides) * Math.PI * 2, [z, r] = stations[i];
    P.push(Math.cos(a) * r, Math.sin(a) * r, z); N.push(Math.cos(a), Math.sin(a), 0); C.push(...(z < 0.02 ? nock : wood));
  }
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = base0 + i * (sides + 1) + j, b = a + 1, c = a + sides + 1, d = c + 1;
    I.push(a, b, c, b, d, c);
  }
  { const c = P.length / 3; P.push(0, 0, -0.001); N.push(0, 0, -1); C.push(...nock); for (let j = 0; j < sides; j++) I.push(c, base0 + j + 1, base0 + j); }
  // head: a flat leaf blade on a short socket, diamond section, standing in the YZ plane
  {
    const hz0 = L - ARROW.headLen, hw = 0.0105, ht = 0.0030;
    const prof = [[0, 0.0042, 0.0042], [0.022, hw, ht], [ARROW.headLen, 0.0004, 0.0004]];
    const b = P.length / 3;
    for (let i = 0; i < prof.length; i++) {
      const [dz, w, t] = prof[i], z = hz0 + dz;
      const cs = [[0, w], [t, 0], [0, -w], [-t, 0]];
      for (let j = 0; j < 4; j++) for (let k2 = 0; k2 < 2; k2++) {
        const [x, y] = cs[(j + k2) % 4];
        const fx = cs[j][0] + cs[(j + 1) % 4][0], fy = cs[j][1] + cs[(j + 1) % 4][1];
        const nx = Math.sign(fx) * w, ny = Math.sign(fy) * t, nl = Math.hypot(nx, ny) || 1;
        P.push(x, y, z); N.push(nx / nl, ny / nl, 0); C.push(...iron);
      }
    }
    for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < 4; j++) {
      const a = b + i * 8 + j * 2, bb = a + 1, c = a + 8, d = c + 1;
      I.push(a, bb, c, bb, d, c);
    }
  }
  // vanes: three feather shapes (a low front, a high back, cut square at the nock end)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2, cx = Math.cos(a), cy = Math.sin(a), r0 = ARROW.shaftR * 0.8;
    const b = P.length / 3, nx = -cy, ny = cx;
    const prof = [[0, 0.75], [0.25, 1], [0.75, 0.85], [1, 0.12]];       // along (0 = back), height share
    for (const [u, hh] of prof) {
      const z = ARROW.fletchFrom + (ARROW.fletchTo - ARROW.fletchFrom) * u, r1 = r0 + ARROW.fletchH * hh;
      P.push(cx * r0, cy * r0, z, cx * r1, cy * r1, z); N.push(nx, ny, 0, nx, ny, 0); C.push(...feather, ...(k === 0 ? tip : feather));
    }
    for (let i = 0; i < prof.length - 1; i++) { const q = b + i * 2; I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  return g;
}

/** Far arrows are thinner than a pixel: this material fattens the shaft and vanes (never the length) so they hold
 *  about `thick` px on screen. thicken.value = scale per metre of distance (arrows.update sets it). */
export function arrowMaterial({ thicken = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.0 });
  if (thicken) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uThick = thicken;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uThick;')
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
          #ifdef USE_INSTANCING
            vec4 arC = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, position.z, 1.0);
            float arS = clamp(-arC.z * uThick, 1.0, 60.0), arR = length(position.xy) + 1e-6, arK = min(arR, 0.0062);
            transformed.xy *= (arK * arS + (arR - arK) * min(arS, 7.0)) / arR;   // the feathers grow far less than the shaft
          #endif`);
    };
    m.customProgramCacheKey = () => 'meticulai-arrow-thick';
  }
  return m;
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {THREE.PerspectiveCamera} o.camera
 * @param {THREE.WebGLRenderer} o.renderer
 * @param {Array<object>} o.targets                 createTargets()
 * @param {(x:number,z:number)=>number} [o.heightAt]
 * @param {(x:number,z:number)=>[number,number,number]} [o.normalAt]
 * @param {(name:string, data:object)=>void} [o.emit]
 * @param {() => ({x,y,z}|null)} [o.listener]       the player's head, for 'arrow:near' and hero-or-volley
 * @param {() => ({x,y,z}|null)} [o.listenerVel]
 * @param {Partial<typeof ARROWS_DEFAULTS>} [o.options]
 * @param {{ sunDir?: THREE.Vector3, sunColor?: THREE.Color, skyColor?: THREE.Color, groundGLSL?: string }} [o.light]
 *        light for the GPU volley (it does its own lighting); groundGLSL: the body of `float ground(vec2 p)` for the
 *        volley shadows (default: flat at 0). Match your heightAt.
 * @param {number} [o.seed]
 */
export function createArrows({ scene, camera, renderer, targets, heightAt = () => 0, normalAt = null, emit = () => {}, listener = () => null, listenerVel = () => null, options = {}, light = {}, seed = 1 }) {
  const T = Object.assign(options, { ...ARROWS_DEFAULTS, ...options });
  const flight = createFlight({ targets, heightAt, normalAt });
  const nAt = flight.normalAt;
  const rng = makeRng(seed);
  let now = 0;
  const HERO = T.hero, VOLLEY = T.volley;

  // ---------------------------------------------------------------- hero arrows
  const thick = { value: 0.1 };
  const geo = arrowGeometry();
  const mat = arrowMaterial({ thicken: thick });
  const mesh = new THREE.InstancedMesh(geo, mat, HERO);
  mesh.name = 'arrows'; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < HERO; i++) mesh.setMatrixAt(i, ZERO);
  scene.add(mesh);

  const pool = [];
  for (let i = 0; i < HERO; i++) pool.push({ i, state: 0, rec: null, byPlayer: false, perfect: false, power: 1, near: false, wob: 0, wobAxis: 0, tStuck: 0, attach: null,
    local: new THREE.Matrix4(), world: new THREE.Matrix4(), tip: new THREE.Vector3(), quiver: 0, qAxis: new THREE.Vector3(1, 0, 0), spin: 0, kind: '', dist: 0, streak: null, born: 0 });
  const free = pool.map((a) => a.i).reverse();
  const flying = [], stuck = [], fading = [];
  let dirty = false;

  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m4 = new THREE.Matrix4(), s1 = new THREE.Vector3(1, 1, 1);
  const Z = new THREE.Vector3(0, 0, 1), v = new THREE.Vector3(), v2 = new THREE.Vector3(), nrm = new THREE.Vector3(), dirV = new THREE.Vector3(), posV = new THREE.Vector3();

  function alloc() {
    if (!free.length) {
      const old = stuck.shift() || fading.shift();
      if (!old) return null;
      const fi = fading.indexOf(old); if (fi >= 0) fading.splice(fi, 1);
      release(old);
    }
    return pool[free.pop()];
  }
  function release(a) { a.state = 0; a.attach = null; a.rec = null; endStreak(a, null); mesh.setMatrixAt(a.i, ZERO); dirty = true; free.push(a.i); }

  // place the instance: the model has its nock at the origin and its point at +Z; a.rec.pos is the point
  function setFlying(a, wobble) {
    dirV.copy(a.rec.dir); posV.copy(a.rec.pos);
    q.setFromUnitVectors(Z, dirV);
    if (wobble) { v.set(Math.cos(a.wobAxis), Math.sin(a.wobAxis), 0).applyQuaternion(q); q2.setFromAxisAngle(v, wobble); q.premultiply(q2); }
    if (a.spin) { q2.setFromAxisAngle(Z, a.spin); q.multiply(q2); }
    v2.set(0, 0, -ARROW.length).applyQuaternion(q).add(posV);
    m4.compose(v2, q, s1);
    mesh.setMatrixAt(a.i, m4); dirty = true;
  }

  function stick(a, hit, time) {
    const kind = hit.kind || 'target';
    const depth = (hit.depth ?? DEPTH[kind] ?? 0.1) * (0.6 + 0.4 * Math.min(1, a.rec.vel.length() / 55)) * (0.8 + 0.4 * rng());
    dirV.copy(a.rec.dir);
    a.tip.copy(hit.point).addScaledVector(dirV, depth);
    q.setFromUnitVectors(Z, dirV);
    q2.setFromAxisAngle(Z, a.spin); q.multiply(q2);
    v2.set(0, 0, -ARROW.length).applyQuaternion(q).add(a.tip);
    a.world.compose(v2, q, s1);
    a.state = 2; a.tStuck = time; a.kind = kind;
    a.quiver = 1; a.qAxis.set(rng() - 0.5, rng() - 0.5, 0).normalize();
    a.attach = hit.attach || null;
    if (a.attach) { if (a.attach.updateWorldMatrix) a.attach.updateWorldMatrix(true, false); m4.copy(a.attach.matrixWorld).invert(); a.local.multiplyMatrices(m4, a.world); }
    mesh.setMatrixAt(a.i, a.world); dirty = true;
    stuck.push(a);
  }

  function report(a, hit) {
    const kind = hit.kind || 'target', o = a.rec.origin;
    a.dist = Math.hypot(hit.point.x - o.x, hit.point.z - o.z);
    const data = {
      kind, pos: new THREE.Vector3().copy(hit.point), speed: a.rec.vel.length(), dist: a.dist, byPlayer: a.byPlayer, key: hit.key,
      dir: new THREE.Vector3().copy(a.rec.dir), normal: hit.normal ? new THREE.Vector3().copy(hit.normal) : null,
      targetId: hit.targetId ?? null, perfect: a.perfect, power: a.power, score: hit.score ?? null, guided: !!a.wasGuided,
    };
    Object.defineProperty(data, 'arrow', { value: a, enumerable: false });
    emit('arrow:hit', data);
    return data;
  }

  function fly(a, time, dt) {
    const r = a.rec;
    const res = flight.step(r, time, dt);
    if (res) {
      const h = res.hit, Tg = res.target;
      const idx = flying.indexOf(a); if (idx >= 0) flying.splice(idx, 1);
      endStreak(a, h.point, time);
      if (r.state === 1) {
        strike(a, h, time);
        const data = report(a, h);
        if (Tg?.onHit) { try { Tg.onHit(h, a, data); } catch (e) { console.error('target onHit failed', e); } }
      }
      if (h.stick === false && r.state === 1) {                    // glance off: tumble on to the ground
        flight.glance(r, h, time, rng); flying.push(a);
        return;
      }
      if (r.state === 4) {                                         // lies where it fell, flat on the ground
        const n = nAt(h.point.x, h.point.z); nrm.set(n[0], n[1], n[2]);
        dirV.copy(r.dir).addScaledVector(nrm, -dirV.copy(r.dir).dot(nrm)).normalize(); r.dir.copy(dirV);
        h.point.x += nrm.x * 0.012; h.point.y += nrm.y * 0.012; h.point.z += nrm.z * 0.012; h.depth = 0; h.attach = null;
        stick(a, h, time); a.quiver = 0;
        return;
      }
      stick(a, h, time);
      return;
    }
    if (time - a.born > 20 || r.pos.y < -400) { const idx = flying.indexOf(a); if (idx >= 0) flying.splice(idx, 1); release(a); return; }
    if (a.streak) pushStreak(a.streak, r.pos, time);
    a.wob *= Math.exp(-dt / 0.32);
    if (r.state === 4) { a.spin += dt * 9; q.setFromAxisAngle(v.set(1, 0.3, 0).normalize(), (time - r.t0) * 14); dirV.set(0, 0, 1).applyQuaternion(q); r.dir.copy(dirV); }
    else a.spin += dt * 5.5;                                       // the fletching turns the arrow slowly
    setFlying(a, r.state === 1 ? a.wob * Math.sin((time - a.born) * 82 + a.wobAxis) : 0);
    const e = listener();
    if (!a.byPlayer && !a.near && e && posV.copy(r.pos).distanceToSquared(e) < 16) { a.near = true; emit('arrow:near', { pos: posV.clone() }); }
  }

  // ---------------------------------------------------------------- the streak (every real arrow in flight)
  // Brightest at the arrow and gone `streakFade` seconds behind it; it outlives the strike by that long, so for an
  // instant a line joins the bow to the mark.
  const TR_ARROWS = 24;
  const ST = 28, ST_N = 14;
  const stGeo = new THREE.BufferGeometry();
  const stPos = new Float32Array(ST * ST_N * 2 * 3), stCol = new Float32Array(ST * ST_N * 2 * 4);
  { const idx = []; for (let a = 0; a < ST; a++) for (let i = 0; i < ST_N - 1; i++) { const o = (a * ST_N + i) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); } stGeo.setIndex(idx); }
  stGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3).setUsage(THREE.DynamicDrawUsage));
  stGeo.setAttribute('color', new THREE.BufferAttribute(stCol, 4).setUsage(THREE.DynamicDrawUsage));
  const trail = new THREE.Mesh(stGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true }));
  trail.frustumCulled = false; trail.name = 'arrow_streaks'; trail.renderOrder = 5; trail.visible = false;
  scene.add(trail);
  const streaks = [];
  for (let i = 0; i < ST; i++) streaks.push({ i, on: false, n: 0, k: 1, last: 0, drawn: false, p: new Float32Array(ST_N * 3), t: new Float32Array(ST_N) });
  function startStreak(a, time) {
    let s = null, oldest = 1e18;
    for (const c of streaks) { if (!c.on) { s = c; break; } if (c.last < oldest) { oldest = c.last; s = c; } }
    for (const o of flying) if (o.streak === s) o.streak = null;
    const p = a.rec.pos;
    s.on = true; s.n = 2; s.k = a.byPlayer ? 1 : T.streakOthers; s.last = time;
    for (let j = 0; j < 2; j++) { s.p[j * 3] = p.x; s.p[j * 3 + 1] = p.y; s.p[j * 3 + 2] = p.z; s.t[j] = time; }
    a.streak = s;
  }
  function pushStreak(s, pos, time) {
    let h = s.n - 1;
    if (time - s.t[h - 1] >= T.streakFade / (ST_N - 2)) {
      if (s.n === ST_N) { s.p.copyWithin(0, 3); s.t.copyWithin(0, 1); } else { s.n++; h++; }
    }
    s.p[h * 3] = pos.x; s.p[h * 3 + 1] = pos.y; s.p[h * 3 + 2] = pos.z; s.t[h] = time; s.last = time;
  }
  function endStreak(a, point, time) {
    const s = a.streak; if (!s) return;
    a.streak = null;
    if (point) pushStreak(s, point, time);
  }
  // the fletching's flash: a point of pale light on the tail of each arrow in flight that never shrinks below a
  // couple of pixels, so the eye can stay on the arrow all the way to the target
  const flGeo = new THREE.BufferGeometry();
  const flPos = new Float32Array(TR_ARROWS * 3), flCol = new Float32Array(TR_ARROWS * 4);
  flGeo.setAttribute('position', new THREE.BufferAttribute(flPos, 3).setUsage(THREE.DynamicDrawUsage));
  flGeo.setAttribute('color', new THREE.BufferAttribute(flCol, 4).setUsage(THREE.DynamicDrawUsage));
  const flMat = new THREE.PointsMaterial({ size: T.flashPx, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
  const flash = new THREE.Points(flGeo, flMat); flash.frustumCulled = false; flash.name = 'arrow_flash'; flash.renderOrder = 6; flash.visible = false;
  scene.add(flash);
  // Where the player's arrow struck: an arrow standing in something is seen almost end-on (a 9 mm dot at 20 m), so
  // its fletching carries a pale point for a couple of seconds after the strike, a few pixels wide at any distance.
  const MARKS = 12;
  const mkGeo = new THREE.BufferGeometry();
  const mkPos = new Float32Array(MARKS * 3), mkCol = new Float32Array(MARKS * 4), mkSize = new Float32Array(MARKS);
  mkGeo.setAttribute('position', new THREE.BufferAttribute(mkPos, 3).setUsage(THREE.DynamicDrawUsage));
  mkGeo.setAttribute('color', new THREE.BufferAttribute(mkCol, 4).setUsage(THREE.DynamicDrawUsage));
  mkGeo.setAttribute('aSize', new THREE.BufferAttribute(mkSize, 1).setUsage(THREE.DynamicDrawUsage));
  const mkMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`attribute float aSize; attribute vec4 color; varying vec4 vCol;
      void main() { vCol = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize; }`,
    fragmentShader: /* glsl */`varying vec4 vCol;
      void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = vCol.a * (1.0 - smoothstep(0.55, 1.0, r)); if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb * 1.6, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const marks = new THREE.Points(mkGeo, mkMat); marks.frustumCulled = false; marks.name = 'arrow_marks'; marks.renderOrder = 7; marks.visible = false;
  scene.add(marks);
  const mkV = new THREE.Vector3();
  function updateMarks(time) {
    let n = 0; const dpr = renderer.getPixelRatio?.() || 1;
    if (T.hitMark > 0.01) for (let i = stuck.length - 1; i >= 0 && n < MARKS; i--) {
      const a = stuck[i], age = time - a.tStuck;
      if (age > T.hitMarkSecs + 1) break;
      if (!a.byPlayer) continue;
      mkV.set(0, 0, 0.07).applyMatrix4(a.world);
      const fade = age < T.hitMarkSecs ? 1 : 1 - (age - T.hitMarkSecs), pop = 1 + 1.8 * Math.exp(-age / 0.14);
      mkSize[n] = T.hitMarkPx * pop * dpr;
      mkPos[n * 3] = mkV.x; mkPos[n * 3 + 1] = mkV.y; mkPos[n * 3 + 2] = mkV.z;
      mkCol[n * 4] = 1; mkCol[n * 4 + 1] = 0.96; mkCol[n * 4 + 2] = 0.84;
      mkCol[n * 4 + 3] = Math.min(1, T.hitMark * fade * (0.78 + 0.22 * Math.cos(age * 55) * Math.exp(-age / 0.3)));
      n++;
    }
    marks.visible = n > 0;
    if (n) { mkGeo.setDrawRange(0, n); mkGeo.attributes.position.needsUpdate = true; mkGeo.attributes.color.needsUpdate = true; mkGeo.attributes.aSize.needsUpdate = true; }
  }
  // THE STRIKE: where one of the player's arrows strikes anything but the ground, a burst flies out from the point for
  // a third of a second (sparks off mail, a ring off a helm, chips off wood, a soft puff off a body or a target),
  // held to a size on the screen so it reads the same at 150 m as at 30, riding with whatever was struck.
  const BURSTS = 10;
  const buGeo = new THREE.BufferGeometry();
  const buPos = new Float32Array(BURSTS * 3), buCol = new Float32Array(BURSTS * 4), buInfo = new Float32Array(BURSTS * 4);
  buGeo.setAttribute('position', new THREE.BufferAttribute(buPos, 3).setUsage(THREE.DynamicDrawUsage));
  buGeo.setAttribute('color', new THREE.BufferAttribute(buCol, 4).setUsage(THREE.DynamicDrawUsage));
  buGeo.setAttribute('aInfo', new THREE.BufferAttribute(buInfo, 4).setUsage(THREE.DynamicDrawUsage));   // size px, age 0..1, sparks, ring
  const buMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`attribute vec4 aInfo; attribute vec4 color; varying vec4 vCol; varying vec4 vInfo;
      void main() { vCol = color; vInfo = aInfo; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aInfo.x; }`,
    fragmentShader: /* glsl */`varying vec4 vCol; varying vec4 vInfo;
      float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
      void main() {
        vec2 p = (gl_PointCoord - 0.5) * 2.0; float r = length(p), th = atan(p.y, p.x);
        float age = vInfo.y, n = vInfo.z, out1 = 1.0 - (1.0 - age) * (1.0 - age);
        float a = 0.0;
        if (n > 0.5) {
          float k = floor(th / 6.2831853 * n + 0.5), hk = hash(k + n * 3.1), tk = k / n * 6.2831853 + (hk - 0.5) * 2.4 / n;
          float d = abs(th - tk); d = min(d, 6.2831853 - d);
          float head = out1 * (0.45 + 0.5 * hash(k * 7.7 + 1.0)), tail = head - (0.30 * (1.0 - age) + 0.03);
          float across = r * sin(min(d, 1.5)), w = 0.030 * (1.0 - 0.6 * age) + 0.010;
          a = smoothstep(w, w * 0.35, across) * smoothstep(tail - 0.03, tail + 0.03, r) * (1.0 - smoothstep(head - 0.02, head + 0.03, r)) * (0.55 + 0.45 * hk);
        }
        if (vInfo.w > 0.5) { float rr = 0.15 + 0.50 * out1, wr = 0.030 * (1.0 - 0.5 * age) + 0.010; a = max(a, 0.85 * smoothstep(wr, wr * 0.3, abs(r - rr))); }
        if (n < 0.5 && vInfo.w < 0.5) a = max(a, 0.5 * smoothstep(0.75, 0.1, r / (0.35 + 0.6 * out1)));
        a = max(a, (1.0 - smoothstep(0.0, 0.25, age)) * smoothstep(0.24, 0.02, r));
        a *= vCol.a * (1.0 - smoothstep(0.55, 1.0, age)) * (1.0 - smoothstep(0.9, 1.0, r));
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol.rgb * 1.7, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const burstPts = new THREE.Points(buGeo, buMat); burstPts.frustumCulled = false; burstPts.name = 'arrow_strikes'; burstPts.renderOrder = 8; burstPts.visible = false;
  scene.add(burstPts);
  const bursts = [];
  //             sparks  ring  size   r     g     b
  const BURST = { armor: [13, 0, 1.0, 1.0, 0.93, 0.72], helm: [11, 1, 1.15, 1.0, 0.97, 0.86], shield: [7, 0, 0.9, 0.98, 0.82, 0.55], wood: [7, 0, 0.9, 0.98, 0.82, 0.55],
    horse: [0, 0, 0.8, 0.97, 0.93, 0.84], body: [0, 0, 0.8, 0.97, 0.93, 0.84], target: [0, 1, 0.8, 1.0, 0.95, 0.82] };
  const buM = new THREE.Matrix4();
  function strike(a, hit, time) {
    if (!a.byPlayer || hit.kind === 'ground' || hit.kind === 'friend') return;
    burstAt(hit.kind, hit.point, a.rec.dir, hit.attach || null, time);
  }
  function burstAt(kind, point, dir, attach, time) {
    if (!(T.burst > 0.01)) return;
    const b = bursts.length < BURSTS ? {} : bursts.shift();
    b.kind = BURST[kind] ? kind : 'target'; b.t0 = time; b.attach = attach || null;
    // (a hand's breadth out from the surface, back along the arrow's own line: the sprite is flat to the eye)
    b.pos = (b.pos || new THREE.Vector3()).copy(point); if (dir) b.pos.addScaledVector(dir, -0.3);
    b.local = (b.local || new THREE.Vector3()).copy(b.pos);
    if (b.attach) b.local.applyMatrix4(buM.copy(b.attach.matrixWorld).invert());
    bursts.push(b);
  }
  function updateBursts(time) {
    let n = 0; const dpr = renderer.getPixelRatio?.() || 1, scale = Math.max(0.6, renderer.domElement.height / dpr / 1080) * dpr;
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], age = (time - b.t0) / Math.max(0.05, T.burstSecs);
      if (age >= 1 || age < 0 || b.attach?.userData?.gone === true) { bursts.splice(i, 1); continue; }
      if (b.attach) b.pos.copy(b.local).applyMatrix4(b.attach.matrixWorld);
      const K = BURST[b.kind], dist = b.pos.distanceTo(camera.position);
      // held to a size on the screen far off; close to (inside 12 m) it shrinks to a spark and lets the body be seen
      const nk = Math.max(0, Math.min(1, (dist - 12) / 28)), px = T.burstPx * K[2] * (T.burstNear + (1 - T.burstNear) * nk * nk * (3 - 2 * nk));
      buPos[n * 3] = b.pos.x; buPos[n * 3 + 1] = b.pos.y; buPos[n * 3 + 2] = b.pos.z;
      buCol[n * 4] = K[3]; buCol[n * 4 + 1] = K[4]; buCol[n * 4 + 2] = K[5]; buCol[n * 4 + 3] = Math.min(1, T.burst);
      buInfo[n * 4] = 2 * px * scale; buInfo[n * 4 + 1] = age; buInfo[n * 4 + 2] = K[0]; buInfo[n * 4 + 3] = K[1];
      n++;
    }
    burstPts.visible = n > 0;
    if (n) { buGeo.setDrawRange(0, n); buGeo.attributes.position.needsUpdate = true; buGeo.attributes.color.needsUpdate = true; buGeo.attributes.aInfo.needsUpdate = true; }
  }
  const tp = new THREE.Vector3(), tv = new THREE.Vector3(), side = new THREE.Vector3(), toCam = new THREE.Vector3();
  function updateStreaks(time) {
    const cam = camera.position;
    const pxAngle = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, renderer.domElement.height);
    const fade = Math.max(0.02, T.streakFade), Gl = T.streakGlow;
    let any = 0;
    for (let si = 0; si < ST; si++) {
      const s = streaks[si], base = si * ST_N * 2;
      if (s.on && time - s.last > fade) s.on = false;
      if (!s.on || T.streak <= 0.005) {
        if (s.drawn) { for (let i = 0; i < ST_N * 2; i++) stCol[(base + i) * 4 + 3] = 0; s.drawn = false; any++; }
        continue;
      }
      s.drawn = true; any++;
      const n = s.n;
      for (let i = 0; i < ST_N; i++) {
        const j = i < n ? i : n - 1, jn = Math.min(n - 1, j + 1), jp = Math.max(0, j - 1);
        tp.set(s.p[j * 3], s.p[j * 3 + 1], s.p[j * 3 + 2]);
        tv.set(s.p[jn * 3] - s.p[jp * 3], s.p[jn * 3 + 1] - s.p[jp * 3 + 1], s.p[jn * 3 + 2] - s.p[jp * 3 + 2]);
        toCam.subVectors(cam, tp);
        const dist = toCam.length();
        side.crossVectors(tv, toCam); const sl = side.length(); if (sl > 1e-9) side.multiplyScalar(1 / sl); else side.set(0, 1, 0);
        const age = Math.min(1, Math.max(0, (time - s.t[j]) / fade)), live = 1 - age;
        const wd = Math.max(0.004, dist * pxAngle * T.streakPx * 0.5) * (0.3 + 0.7 * live);
        const o = (base + i * 2) * 3, c = (base + i * 2) * 4;
        stPos[o] = tp.x + side.x * wd; stPos[o + 1] = tp.y + side.y * wd; stPos[o + 2] = tp.z + side.z * wd;
        stPos[o + 3] = tp.x - side.x * wd; stPos[o + 4] = tp.y - side.y * wd; stPos[o + 5] = tp.z - side.z * wd;
        // nothing of it is drawn close to the eye (seen from its tail a line is a ribbon across the frame)
        const nearK = dist < 1.6 ? 0 : dist > 6 ? 1 : (dist - 1.6) / 4.4;
        const al = i < n ? Math.min(1, T.streak * s.k * nearK * live ** 1.2) : 0;
        for (let e = 0; e < 2; e++) { stCol[c + e * 4] = 1.0 * Gl; stCol[c + e * 4 + 1] = 0.94 * Gl; stCol[c + e * 4 + 2] = 0.78 * Gl; stCol[c + e * 4 + 3] = al; }
      }
    }
    trail.visible = any > 0 && !(T.streak <= 0.005);
    if (any) { stGeo.attributes.position.needsUpdate = true; stGeo.attributes.color.needsUpdate = true; }
    let n = 0;
    for (let k = flying.length - 1; k >= 0 && n < TR_ARROWS; k--) {
      const a = flying[k], r = a.rec; if (r.state !== 1) continue;
      const tau = time - a.born, o = n * 3, c = n * 4, far = Math.min(1, Math.max(0, (posV.copy(r.pos).distanceTo(cam) - 8) / 14));
      flPos[o] = r.pos.x - r.dir.x * (ARROW.length - 0.09); flPos[o + 1] = r.pos.y - r.dir.y * (ARROW.length - 0.09); flPos[o + 2] = r.pos.z - r.dir.z * (ARROW.length - 0.09);
      flCol[c] = 1; flCol[c + 1] = 0.97; flCol[c + 2] = 0.9; flCol[c + 3] = T.flash * far * (0.62 + 0.38 * Math.sin(tau * 41 + a.wobAxis * 3));
      n++;
    }
    flash.visible = n > 0 && T.flash > 0.01;
    if (flash.visible) { flGeo.setDrawRange(0, n); flGeo.attributes.position.needsUpdate = true; flGeo.attributes.color.needsUpdate = true; flMat.size = T.flashPx * (renderer.getPixelRatio?.() || 1); }
  }

  // ---------------------------------------------------------------- volley arrows (GPU)
  const vg = new THREE.InstancedBufferGeometry();
  {
    // two crossed blades for the shaft and point, three small vanes: 10 triangles, +Z is the point, origin the nock
    const P = [], C = [], I = [];
    const quad = (ax, ay, bx, by, z0, z1, col0, col1) => { const b = P.length / 3; P.push(ax, ay, z0, bx, by, z0, ax, ay, z1, bx, by, z1); C.push(...col0, ...col0, ...col1, ...col1); I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); };
    const r = 0.005, wood = [0.50, 0.37, 0.20], dark = [0.07, 0.07, 0.08], fe = [0.86, 0.84, 0.78], fd = [0.20, 0.17, 0.15];
    quad(-r, 0, r, 0, 0, 0.78, wood, wood); quad(0, -r, 0, r, 0, 0.78, wood, wood);
    quad(-0.009, 0, 0.009, 0, 0.78, 0.84, dark, dark);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 2, cx = Math.cos(a), cy = Math.sin(a); quad(cx * 0.004, cy * 0.004, cx * 0.020, cy * 0.020, 0.03, 0.15, fd, fe); }
    vg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    vg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    vg.setIndex(I);
  }
  const vP0 = new THREE.InstancedBufferAttribute(new Float32Array(VOLLEY * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const vV0 = new THREE.InstancedBufferAttribute(new Float32Array(VOLLEY * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const vT = new THREE.InstancedBufferAttribute(new Float32Array(VOLLEY * 3).fill(-1e6), 3).setUsage(THREE.DynamicDrawUsage);   // t0, flight time, seed
  vg.setAttribute('aP0', vP0); vg.setAttribute('aV0', vV0); vg.setAttribute('aT', vT);
  vg.instanceCount = 0;
  const volleyVert = /* glsl */`
    attribute vec3 aP0; attribute vec3 aV0; attribute vec3 aT;
    uniform float uNow; uniform float uThick; uniform vec3 uVolley;
    const float DRAG = ${DRAG.toFixed(4)}; const float VT = ${VT.toFixed(4)};
    void arrowAt(out vec3 p, out vec3 dir, out float alive) {
      float age = uNow - aT.x;
      float tau = clamp(age, 0.0, aT.y);
      float E = exp(-DRAG * tau), f = (1.0 - E) / DRAG;
      p = vec3(aP0.x + aV0.x * f, aP0.y + VT * tau + (aV0.y - VT) * f, aP0.z + aV0.z * f);
      vec3 vel = vec3(aV0.x * E, VT + (aV0.y - VT) * E, aV0.z * E);
      dir = normalize(vel);
      float landed = age - aT.y;
      float sink = clamp((landed - ${VOLLEY_STAND.toFixed(1)}) / ${VOLLEY_SINK.toFixed(1)}, 0.0, 1.0);
      p += dir * (step(0.0, landed) * (0.10 + 0.08 * aT.z) + sink * 0.9);
      alive = step(0.0, age) * step(sink, 0.999);
    }
    vec3 arrowVertex(vec3 local, out vec3 wdir) {
      vec3 p, dir; float alive; arrowAt(p, dir, alive);
      vec3 ref = abs(dir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 sx = normalize(cross(ref, dir)), sy = cross(dir, sx);
      float spin = aT.z * 6.2831 + min(uNow - aT.x, aT.y) * 5.5;
      float cs = cos(spin), sn = sin(spin);
      vec2 xy = vec2(local.x * cs - local.y * sn, local.x * sn + local.y * cs);
      float dist = length(p - cameraPosition);
      float flying = 1.0 - step(aT.y, uNow - aT.x);
      // hold the shaft to a pixel or two at any distance; the feathers grow with it only a little
      float sc = clamp(dist * uThick * mix(1.0, uVolley.x, flying), 1.0, 80.0), rr = length(xy) + 1e-6, core = min(rr, 0.0055);
      xy *= (core * sc + (rr - core) * min(sc, 1.6)) / rr;
      // in the air a far arrow is stretched back along its flight so a sheet of them reads as strokes, not specks
      float len = mix(1.0, clamp(dist * uVolley.y, 1.0, uVolley.z), flying * smoothstep(0.08, 0.6, uNow - aT.x));
      wdir = dir;
      float back = (${ARROW.length.toFixed(3)} - local.z) * len;
      if (rr > 0.006 && local.z < 0.3) { back = ${ARROW.length.toFixed(3)} * len - local.z; xy *= 1.0 / (1.0 + (len - 1.0) * 0.6); }
      return (p + sx * xy.x + sy * xy.y - dir * back) * alive;
    }`;
  const sunDir = light.sunDir || new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  const volleyMat = new THREE.ShaderMaterial({
    uniforms: { uNow: { value: 0 }, uThick: thick, uVolley: { value: new THREE.Vector3(1.4, 0, 3) }, uDark: { value: 0.5 },
      uSunDir: { value: sunDir }, uSunColor: { value: light.sunColor || new THREE.Color(3.0, 2.8, 2.5) }, uSkyColor: { value: light.skyColor || new THREE.Color(0.8, 0.9, 1.1) } },
    vertexShader: /* glsl */`
      ${volleyVert}
      varying vec3 vColor; varying vec3 vDir;
      uniform float uDark;
      void main() {
        vec3 wdir; vec3 wp = arrowVertex(position, wdir);
        vColor = color * mix(1.0, uDark, 1.0 - step(aT.y, uNow - aT.x)); vDir = wdir;   // against the sky a shaft is a dark stroke
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying vec3 vDir;
      uniform vec3 uSunColor; uniform vec3 uSkyColor; uniform vec3 uSunDir;
      void main() {
        // a thin stick has no useful normal: light it as a cylinder would be, by how much it lies across the sun
        float across = sqrt(max(0.0, 1.0 - pow(dot(normalize(vDir), uSunDir), 2.0)));
        vec3 lit = vColor * (uSunColor * (0.10 + 0.26 * across) + uSkyColor * 0.5) * 0.3183;
        gl_FragColor = vec4(lit, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    vertexColors: true, side: THREE.DoubleSide,
  });
  const volley = new THREE.Mesh(vg, volleyMat);
  volley.frustumCulled = false; volley.name = 'volley_arrows'; volley.castShadow = true;
  volley.customDepthMaterial = new THREE.ShaderMaterial({
    uniforms: { uNow: volleyMat.uniforms.uNow, uThick: { value: 0 }, uVolley: { value: new THREE.Vector3(1, 0, 1) } },
    vertexShader: /* glsl */`${volleyVert}
      void main() { vec3 wdir; vec3 wp = arrowVertex(position, wdir); gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
    fragmentShader: /* glsl */`#include <packing>
      void main() { gl_FragColor = packDepthToRGBA(gl_FragCoord.z); }`,
    side: THREE.DoubleSide,
  });
  scene.add(volley);
  let vHead = 0, vCount = 0, vDirtyFrom = -1, vDirtyTo = -1, vLastLand = -1e9;

  // The shadows of a volley crossing the ground: each arrow in flight drops a soft dark fleck along the sun's ray,
  // wider and fainter the higher it is, so a sheet of arrows drags a moving dapple over the field.
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
  sg.setIndex([0, 1, 2, 1, 3, 2]);
  sg.setAttribute('aP0', vP0); sg.setAttribute('aV0', vV0); sg.setAttribute('aT', vT);
  sg.instanceCount = 0;
  const shadowMat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: volleyMat.uniforms.uSunDir, uNow: volleyMat.uniforms.uNow, uShadow: { value: new THREE.Vector4(T.shadow, T.shadowWidth, T.shadowSpread, T.shadowLen) } },
    vertexShader: /* glsl */`
      attribute vec3 aP0; attribute vec3 aV0; attribute vec3 aT;
      uniform float uNow; uniform vec3 uSunDir; uniform vec4 uShadow;
      const float DRAG = ${DRAG.toFixed(4)}; const float VT = ${VT.toFixed(4)};
      varying vec3 vQ;
      float ground(vec2 p) { ${light.groundGLSL || 'return 0.0;'} }
      void main() {
        float age = uNow - aT.x, tau = clamp(age, 0.0, aT.y);
        float E = exp(-DRAG * tau), f = (1.0 - E) / DRAG;
        vec3 p = vec3(aP0.x + aV0.x * f, aP0.y + VT * tau + (aV0.y - VT) * f, aP0.z + aV0.z * f);
        vec3 dir = normalize(vec3(aV0.x * E, VT + (aV0.y - VT) * E, aV0.z * E));
        float alive = step(0.0, age) * step(age, aT.y);
        vec3 e = p - dir * (1.0 - position.x) * ${ARROW.length.toFixed(3)} * uShadow.w;
        float t = 0.0; vec3 s = e;
        for (int i = 0; i < 3; i++) { t += (s.y - ground(s.xz) - 0.22) / uSunDir.y; s = e - uSunDir * t; }
        float height = max(0.0, t * uSunDir.y);
        vec3 sd = vec3(dir.x - uSunDir.x * dir.y / uSunDir.y, 0.0, dir.z - uSunDir.z * dir.y / uSunDir.y);
        sd = normalize(sd + vec3(1e-5, 0.0, 0.0));
        s.xz += vec2(-sd.z, sd.x) * position.y * uShadow.y * (1.0 + height * uShadow.z * 6.0);
        float dist = length(s - cameraPosition);
        vQ = vec3(position.x * 2.0 - 1.0, position.y, alive * uShadow.x / (1.0 + height * uShadow.z) * exp(-dist * 0.0035) * smoothstep(0.0, 0.25, age));
        gl_Position = projectionMatrix * viewMatrix * vec4(s * alive, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vQ;
      void main() {
        float a = vQ.z * (1.0 - vQ.y * vQ.y) * (1.0 - vQ.x * vQ.x * vQ.x * vQ.x);
        if (a < 0.004) discard;
        gl_FragColor = vec4(0.035, 0.045, 0.075, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const shadows = new THREE.Mesh(sg, shadowMat);
  shadows.frustumCulled = false; shadows.name = 'volley_shadows'; shadows.renderOrder = 2; shadows.visible = false;
  scene.add(shadows);

  const flightTime = (p0, v0) => flightTimeOn(p0, v0, heightAt);

  // 'arrow:near' for GPU arrows: at the loose, walk the first second and a half of the path and see whether it
  // passes close over the listener's head (who moves too); at most one every NEAR_GAP seconds.
  const nears = [], nearP = new THREE.Vector3(), NEAR_GAP = 0.16;
  let lastNear = -9;
  function watchNear(pos, vel, time) {
    const e = listener(), mv = listenerVel(); if (!e || nears.length > 24) return;
    const dx0 = pos.x - e.x, dz0 = pos.z - e.z, d0 = dx0 * dx0 + dz0 * dz0;
    if (d0 < 3.5 * 3.5 || d0 > 95 * 95) return;
    for (let k = 1; k <= 12; k++) {
      const t = k * 0.13; at(pos, vel, t, nearP);
      const ex = e.x + (mv ? mv.x * t : 0), ez = e.z + (mv ? mv.z * t : 0);
      const dx = nearP.x - ex, dy = nearP.y - e.y, dz = nearP.z - ez;
      if (dx * dx + dy * dy + dz * dz < 3.4 * 3.4) { nears.push({ at: time + t, pos: nearP.clone() }); return; }
    }
  }
  function spawnVolley(pos, vel, time) {
    const i = vHead; vHead = (vHead + 1) % VOLLEY; vCount = Math.min(VOLLEY, vCount + 1);
    const ft = flightTime(pos, vel);
    watchNear(pos, vel, time);
    vP0.setXYZ(i, pos.x, pos.y, pos.z); vV0.setXYZ(i, vel.x, vel.y, vel.z); vT.setXYZ(i, time, ft, rng());
    if (time + ft > vLastLand) vLastLand = time + ft;
    if (vDirtyFrom < 0) { vDirtyFrom = vDirtyTo = i; } else { vDirtyFrom = Math.min(vDirtyFrom, i); vDirtyTo = Math.max(vDirtyTo, i); }
    vg.instanceCount = vCount; sg.instanceCount = vCount;
    return null;
  }

  function spawn({ pos, vel, byPlayer = false, perfect = false, power = 1, hero, guide = null, time = now }) {
    let asHero = byPlayer || hero === true;
    const e = listener();
    if (!asHero && hero !== false && e && free.length > 120) {
      // will it come down near the listener? then it deserves to be a real arrow
      const t = flightTime(pos, vel), f = (1 - Math.exp(-DRAG * t)) / DRAG;
      const lx = pos.x + vel.x * f - e.x, lz = pos.z + vel.z * f - e.z;
      asHero = lx * lx + lz * lz < 30 * 30;
    }
    if (!asHero) return spawnVolley(pos, vel, time);
    const a = alloc(); if (!a) return null;
    a.rec = flight.launch({ pos, vel, time, guide, byPlayer });
    a.wasGuided = !!a.rec.guide;
    a.state = 1; a.byPlayer = byPlayer; a.perfect = perfect; a.power = power; a.near = false; a.attach = null; a.born = time;
    startStreak(a, time);
    a.wob = perfect ? 0.012 : 0.05; a.wobAxis = rng() * Math.PI * 2; a.spin = rng() * 6.28; a.quiver = 0;
    flying.push(a);
    setFlying(a, 0);
    return a;
  }

  function update(dt, time) {
    now = time;
    // keep about a pixel and a half of shaft on screen at any distance
    const px = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, renderer.domElement.height);
    thick.value = T.thick * px / (ARROW.shaftR * 2);
    volleyMat.uniforms.uNow.value = time;
    volleyMat.uniforms.uVolley.value.set(T.volleyThick, T.volleyMinLen * px / ARROW.length, T.volleyMaxStretch); volleyMat.uniforms.uDark.value = T.volleyDark;
    shadowMat.uniforms.uShadow.value.set(T.shadow, T.shadowWidth, T.shadowSpread, T.shadowLen);
    shadows.visible = T.shadow > 0.005 && time < vLastLand && vCount > 0;
    if (vDirtyFrom >= 0) {
      for (const attr of [vP0, vV0, vT]) { attr.clearUpdateRanges(); attr.addUpdateRange(vDirtyFrom * 3, (vDirtyTo - vDirtyFrom + 1) * 3); attr.needsUpdate = true; }
      vDirtyFrom = vDirtyTo = -1;
    }
    for (let i = nears.length - 1; i >= 0; i--) { const n = nears[i]; if (n.at > time) continue; nears.splice(i, 1); if (time - lastNear >= NEAR_GAP && time - n.at < 0.2) { lastNear = time; emit('arrow:near', { pos: n.pos }); } }
    while (pending.length && pending[pending.length - 1].at <= time) { const p = pending.pop(); spawn({ pos: p.pos, vel: p.vel, hero: p.hero, time }); }
    if (dt > 0) {
      for (let i = flying.length - 1; i >= 0; i--) fly(flying[i], time, dt);
      // keep a few slots free by letting the oldest standing arrows go
      while (free.length < 12 && stuck.length) { const a = stuck.shift(); a.state = 3; a.tStuck = time; fading.push(a); }
      for (let i = fading.length - 1; i >= 0; i--) {
        const a = fading[i], k = 1 - (time - a.tStuck) / 0.8;
        if (k <= 0) { fading.splice(i, 1); release(a); continue; }
        if (a.attach) a.world.multiplyMatrices(a.attach.matrixWorld, a.local);
        m4.copy(a.world).scale(v.set(k, k, k)); mesh.setMatrixAt(a.i, m4); dirty = true;
      }
      // arrows riding something that moves, and arrows still quivering from the hit
      for (let i = stuck.length - 1; i >= 0; i--) {
        const a = stuck[i];
        if (a.attach && a.attach.userData?.gone === true) {
          a.world.multiplyMatrices(a.attach.matrixWorld, a.local); a.attach = null;
          stuck.splice(i, 1); a.state = 3; a.tStuck = time; a.quiver = 0; fading.push(a); continue;
        }
        const moving = a.attach && a.attach.userData?.still !== true;
        if (!moving && a.quiver <= 0) continue;
        if (a.attach) a.world.multiplyMatrices(a.attach.matrixWorld, a.local);
        if (a.quiver > 0) {
          const tq = time - a.tStuck;
          const ang = 0.085 * Math.exp(-tq / 0.16) * Math.sin(tq * 150);
          if (tq > 0.9) { a.quiver = 0; mesh.setMatrixAt(a.i, a.world); dirty = true; continue; }
          // swing about the buried point: T(tip) R T(-tip) in the arrow's own frame (the tip is at +Z length)
          q.setFromAxisAngle(a.qAxis, ang);
          v.set(0, 0, ARROW.length); v2.copy(v).applyQuaternion(q); v.sub(v2);
          m4.compose(v, q, s1); m4.premultiply(a.world);
          mesh.setMatrixAt(a.i, m4);
        } else mesh.setMatrixAt(a.i, a.world);
        dirty = true;
      }
    }
    updateStreaks(time);
    updateMarks(time);
    updateBursts(time);
    if (dirty) { mesh.instanceMatrix.needsUpdate = true; dirty = false; }
  }

  // A whole volley in one call: `count` arrows from points scattered over a disc (x, z, radius) or a box (x, z,
  // width, depth, yaw), each aimed with the true ballistics at a point scattered over the target disc (tx, tz, tr),
  // loosed over `stagger` seconds. arc: loose at this elevation in degrees and let the speed be whatever carries that
  // far (35 to 42: up, a hang at the top, a rain; about 5 s for 180 m); without arc, `speed` (58) and high: true take
  // the lobbed solution, false the flat one. carry: the shooters' velocity, added to each arrow.
  const pending = [];
  const vFrom = new THREE.Vector3(), vTo = new THREE.Vector3(), vDir = new THREE.Vector3(), vVel = new THREE.Vector3();
  function volleyFrom(o) {
    const n = o.count | 0, speed = o.speed ?? 58, high = o.high !== false, r = o.seed !== undefined ? makeRng(hashSeed('volley:' + o.seed)) : rng;
    let flightSum = 0, done = 0;
    const cy = Math.cos(o.yaw || 0), sy = Math.sin(o.yaw || 0);
    for (let i = 0; i < n; i++) {
      let lx, lz;
      if (o.width) { lx = (r() - 0.5) * o.width; lz = (r() - 0.5) * (o.depth || 1); } else { const a = r() * 6.2832, rr = Math.sqrt(r()) * (o.radius ?? 20); lx = Math.cos(a) * rr; lz = Math.sin(a) * rr; }
      const x = o.x + lx * cy + lz * sy, z = o.z - lx * sy + lz * cy;
      vFrom.set(x, heightAt(x, z) + (o.height ?? 2.1), z);
      const a = r() * 6.2832, rr = Math.sqrt(r()) * (o.tr ?? 14), tx = o.tx + Math.cos(a) * rr, tz = o.tz + Math.sin(a) * rr;
      vTo.set(tx, heightAt(tx, tz) + 1.2, tz);
      let sp = speed * (0.965 + 0.07 * r()), ft = 0;
      if (o.arc) {
        const s = speedForArc(vFrom, vTo, o.arc + (r() - 0.5) * 3);
        sp = s.speed; ft = s.time; vDir.copy(s.dir);
      } else ft = solve(vFrom, vTo, sp, o.carry || null, null, vDir, high) || solve(vFrom, vTo, sp, o.carry || null, null, vDir, false);
      if (!ft) continue;
      vVel.copy(vDir).multiplyScalar(sp); if (o.carry) vVel.add(o.carry);
      pending.push({ at: now + (o.stagger ?? 0.35) * r(), pos: vFrom.clone(), vel: vVel.clone(), hero: o.hero });
      flightSum += ft; done++;
    }
    pending.sort((a, b) => b.at - a.at);
    return { flight: done ? flightSum / done : 0, count: done };
  }

  function anchor() {
    const m = new THREE.Matrix4();
    return { matrixWorld: m, userData: { still: false, gone: false },
      // rows: a row-major 3x4 (r00 r01 r02 tx  r10 r11 r12 ty  r20 r21 r22 tz)
      set12(r) { m.set(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], 0, 0, 0, 1); return this; } };
  }
  function stuckIn(attach) { let n = 0; for (let i = 0; i < stuck.length; i++) if (stuck[i].attach === attach) n++; return n; }

  function clear() {
    for (const a of [...flying, ...stuck, ...fading]) release(a);
    flying.length = stuck.length = fading.length = 0; pending.length = 0; nears.length = 0; bursts.length = 0; for (const st of streaks) st.on = false;
    vT.array.fill(-1e6); vT.needsUpdate = true; vT.clearUpdateRanges(); vCount = 0; vHead = 0; vg.instanceCount = 0; sg.instanceCount = 0; vLastLand = -1e9;
  }

  function dispose() {
    clear();
    for (const o of [mesh, trail, flash, marks, burstPts, volley, shadows]) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  }

  return {
    update, spawn, volley: volleyFrom, clear, dispose, anchor, stuckIn, flightTime, options: T, flight,
    predict: (a) => flight.predict(a.rec, now),
    strike: (kind, point, dir = null, attach = null) => burstAt(kind, point, dir, attach, now),
    get flying() { return flying.length; }, get standing() { return stuck.length; },
    state: () => ({ flying: flying.length, stuck: stuck.length, fading: fading.length, free: free.length, volley: vCount, targets: targets.length }),
  };
}
