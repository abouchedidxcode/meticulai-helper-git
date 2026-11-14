// Demo: your horse and a small herd on a plain steppe, every one under the movement law, drawn as code-built
// stand-ins (no model files). The hoofprints show the point: a planted hoof stays on its print, in turns too.
// A live checker (src/checker.js) judges every horse every step; the panel shows what it found.
import * as THREE from 'three';
import { createHerd, reins, HERO, LIMITS } from '../src/herd.js';
import { hoofAt, bodyAt, HOOVES, SHAPE, contacts } from '../src/footfall.js';
import { GAIT_NAMES, maxYawRate, inIntervals } from '../src/locomotion.js';
import { createMoveChecker } from '../src/checker.js';
import { makeRng } from '../src/rng.js';

const params = new URLSearchParams(location.search);
const rnd = makeRng(7);

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xc9d6dc);
scene.background = SKY; scene.fog = new THREE.Fog(SKY, 60, 420);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
scene.add(new THREE.HemisphereLight(0xdfe8ee, 0x8a7b55, 1.3));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(30, 40, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
scene.add(sun, sun.target);

// the steppe: a big flat plain with soft colour patches, and tufts for a sense of speed
{
  const g = new THREE.PlaneGeometry(2400, 2400, 240, 240); g.rotateX(-Math.PI / 2);
  const c = new Float32Array(g.attributes.position.count * 3), a = new THREE.Color(0xa59c62), b = new THREE.Color(0x7f8a4a), tmp = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i);
    const n = 0.5 + 0.25 * Math.sin(x * 0.021 + Math.sin(z * 0.013) * 2) + 0.25 * Math.sin(z * 0.017 - x * 0.006);
    tmp.copy(a).lerp(b, n); c.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; scene.add(ground);
  const tg = new THREE.ConeGeometry(0.07, 0.28, 4); tg.translate(0, 0.12, 0);
  const tufts = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0x77763e }), 14000), m = new THREE.Matrix4();
  for (let i = 0; i < tufts.count; i++) { const s = 0.5 + rnd() * 0.9; m.makeScale(s, s, s).setPosition((rnd() - 0.5) * 500, 0, (rnd() - 0.5) * 500); tufts.setMatrixAt(i, m); }
  scene.add(tufts);
}

// ---------------------------------------------------------------- the herd
const N = 9;
const herd = createHerd({ capacity: N });
const S = herd.S;
const PLAYER = herd.add({ x: 0, z: 0, yaw: 0.3, limits: HERO });
for (let k = 1; k < N; k++) { const a = rnd() * 6.28, r = 7 + rnd() * 16; herd.add({ x: Math.sin(a) * r, z: Math.cos(a) * r, yaw: rnd() * 6.28 }); }
const checker = createMoveChecker(herd);

// ---------------------------------------------------------------- the stand-in horse, built from primitives
const COATS = [0x8a5a34, 0x3b2a20, 0xb89a72, 0x6b4a2e, 0xd8cbb0, 0x50362a, 0x9a6b3f, 0x2a211c, 0xa77d4f];
const unitSphere = new THREE.SphereGeometry(1, 14, 10), unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1); unitCyl.translate(0, 0.5, 0); unitCyl.rotateX(Math.PI / 2);
const DARK = new THREE.MeshLambertMaterial({ color: 0x1d1611 }), TACK = new THREE.MeshLambertMaterial({ color: 0x4a2e1b }), FELT = new THREE.MeshLambertMaterial({ color: 0x9a2f22 });
const SPINE = [[-0.74, 1.1, 0.08, 0.1], [-0.6, 1.07, 0.22, 0.24], [-0.4, 1.03, 0.275, 0.3], [-0.12, 0.99, 0.29, 0.31], [0.18, 0.99, 0.28, 0.31], [0.44, 1.04, 0.22, 0.28], [0.62, 1.1, 0.12, 0.17]];
const LEG = { fl: [0.30, 0.80], fr: [0.30, 0.80], hl: [0.56, 0.58], hr: [0.56, 0.58] };
function makeHorse(i) {
  const coat = new THREE.MeshStandardMaterial({ color: COATS[i % COATS.length], roughness: 0.85 });
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; scene.add(m); return m; };
  return {
    spine: SPINE.map(() => mk(unitSphere, coat)),
    neck: [mk(unitCyl, coat), mk(unitCyl, coat), mk(unitCyl, coat)], ears: [mk(unitCyl, coat), mk(unitCyl, coat)],
    mane: mk(unitCyl, DARK), tail: [mk(unitCyl, DARK), mk(unitCyl, DARK)],
    legs: HOOVES.map(() => [mk(unitCyl, coat), mk(unitCyl, coat), mk(unitCyl, DARK)]),
    saddle: i === PLAYER ? mk(unitSphere, TACK) : null, blanket: i === PLAYER ? mk(unitSphere, FELT) : null,
  };
}
const horses = Array.from({ length: N }, (_, i) => makeHorse(i));
const V = () => new THREE.Vector3(), w = [0, 0, 0];
const at = (i, x, y, z, out) => { herd.worldPoint(i, x, y, z, w); return out.set(w[0], w[1], w[2]); };
const _a = V(), _b = V(), _d = V(), _up = new THREE.Vector3(0, 1, 0);
function rod(mesh, a, b, r) { _d.subVectors(b, a); const L = _d.length(); mesh.position.copy(a); mesh.scale.set(r, r, L || 1e-4); mesh.lookAt(b); }
function blob(mesh, p, toward, rx, ry, rz) { mesh.position.copy(p); mesh.scale.set(rx, ry, rz); mesh.lookAt(toward); }

// where hoof h is in model space for the horse's current gait (cross-faded while the gait changes)
const contact = contacts();
const H1 = { x: 0, y: 0, z: 0, down: false }, H2 = { x: 0, y: 0, z: 0, down: false };
function hoofModel(i, h, out) {
  const g = S.gait[i], hoof = HOOVES[h];
  const place = (gait, phase, o) => { if (gait === 0) { o.x = (hoof[1] === 'l' ? 1 : -1) * SHAPE.halfTrack; o.y = SHAPE.ankle; o.z = hoof[0] === 'f' ? 0.44 : -0.4; o.down = true; } else hoofAt(GAIT_NAMES[gait], hoof, phase, o); };
  place(g, S.phase[i], out);
  if (S.blend[i] < 1) { place(S.gaitPrev[i], S.phasePrev[i], H2); const b = S.blend[i], k = b * b * (3 - 2 * b); out.x = H2.x + (out.x - H2.x) * k; out.y = H2.y + (out.y - H2.y) * k; out.z = H2.z + (out.z - H2.z) * k; }
  return out;
}
const pivot = V(), knee = V(), hoofW = V(), toe = V(), body = { bob: 0, pitch: 0 };
function drawHorse(i) {
  const h = horses[i], g = S.gait[i];
  if (g > 0) bodyAt(GAIT_NAMES[g], S.phase[i], body); else { body.bob = 0.006 * Math.sin(S.phase[i] * 12.57); body.pitch = 0; }
  const lift = (y, z) => y + body.bob + body.pitch * z;
  // the barrel, laid along the trail
  const P = SPINE.map(([z, y]) => at(i, 0, lift(y, z), z, V()));
  SPINE.forEach(([, , rx, ry], k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)]; blob(h.spine[k], P[k], _a.copy(P[k]).add(_b.subVectors(b, a)), rx, ry, 0.27); });
  // neck and head (the nod comes from the gait)
  const fast = [0, 0, 0.25, 0.6, 1][g], nod = g ? 0.05 * Math.sin(S.phase[i] * 6.283 * 2) : 0.02 * Math.sin(S.phase[i] * 6.283);
  const n0 = at(i, 0, lift(1.1, 0.5), 0.5, V()), n1 = at(i, 0, lift(1.5 - fast * 0.18 + nod, 0.82), 0.82 + fast * 0.12, V()), n2 = at(i, 0, lift(1.56 - fast * 0.2 + nod, 0.9), 0.92 + fast * 0.14, V()), mz = at(i, 0, lift(1.28 - fast * 0.18 + nod, 1.2), 1.24 + fast * 0.18, V());
  rod(h.neck[0], n0, n1, 0.15); rod(h.neck[1], n1, n2, 0.095); rod(h.neck[2], n2, mz, 0.075);
  rod(h.mane, at(i, 0, lift(1.26, 0.48), 0.48, V()), at(i, 0, lift(1.62 - fast * 0.18 + nod, 0.86), 0.86 + fast * 0.12, V()), 0.05);
  for (const s of [0, 1]) rod(h.ears[s], at(i, s ? 0.05 : -0.05, lift(1.6 - fast * 0.2 + nod, 0.9), 0.9 + fast * 0.14, V()), at(i, s ? 0.08 : -0.08, lift(1.74 - fast * 0.2 + nod, 0.86), 0.86 + fast * 0.14, V()), 0.025);
  const t0 = at(i, 0, lift(1.18, -0.72), -0.72, V()), t1 = at(i, 0, lift(1.0 + fast * 0.25, -0.86 - fast * 0.2), -0.86 - fast * 0.2, V()), t2 = at(i, 0, lift(0.45 + fast * 0.55, -0.92 - fast * 0.55), -0.92 - fast * 0.55, V());
  rod(h.tail[0], t0, t1, 0.045); rod(h.tail[1], t1, t2, 0.04);
  if (h.saddle) { const s0 = at(i, 0, lift(1.33, -0.06), -0.06, V()); blob(h.saddle, s0, at(i, 0, lift(1.33, 0.4), 0.4, V()), 0.17, 0.06, 0.26); blob(h.blanket, at(i, 0, lift(1.0, -0.08), -0.08, V()), at(i, 0, lift(1.0, 0.4), 0.4, V()), 0.3, 0.33, 0.34); }
  // legs: two-bone IK in the leg's own plane (model space), every joint then bent along the trail like the body
  for (let k = 0; k < 4; k++) {
    const hoof = HOOVES[k], front = hoof[0] === 'f', sx = hoof[1] === 'l' ? 1 : -1, [L1, L2] = LEG[hoof];
    const pz = front ? SHAPE.shoulder.z : SHAPE.hip.z, py = lift(front ? SHAPE.shoulder.y : SHAPE.hip.y, pz);
    hoofModel(i, k, H1);
    let dy = H1.y - py, dz = H1.z - pz, d = Math.hypot(dy, dz); const max = (L1 + L2) * 0.999; if (d > max) { dy *= max / d; dz *= max / d; d = max; }
    const phi = Math.atan2(dz, -dy), al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))), th1 = phi - al;
    at(i, sx * 0.16, py, pz, pivot); at(i, sx * 0.16, py - Math.cos(th1) * L1, pz + Math.sin(th1) * L1, knee); at(i, sx * 0.16, py + dy, pz + dz, hoofW); at(i, sx * 0.16, Math.max(0, H1.y - 0.07), H1.z + 0.03, toe);
    rod(h.legs[k][0], pivot, knee, front ? 0.075 : 0.1); rod(h.legs[k][1], knee, hoofW, 0.045); rod(h.legs[k][2], hoofW, toe, 0.055);
  }
}

// ---------------------------------------------------------------- hoofprints: dropped where a hoof lands
const PRINTS = 1600, prints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.075, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a2c1c, transparent: true, opacity: 0.75, depthWrite: false }), PRINTS);
prints.count = 0; prints.frustumCulled = false; scene.add(prints);
let printHead = 0; const wasDown = new Uint8Array(N * 4), pm = new THREE.Matrix4();
function stampPrints(i) {
  const g = S.gait[i];
  for (let k = 0; k < 4; k++) {
    const iv = g ? contact[GAIT_NAMES[g]]['hoof_' + HOOVES[k]] : [[0, 1]];
    const down = S.blend[i] >= 1 && inIntervals(S.phase[i], iv) && S.speed[i] > 0.05;
    if (down && !wasDown[i * 4 + k]) {
      hoofModel(i, k, H1); herd.worldPoint(i, H1.x, 0, H1.z, w);
      pm.makeTranslation(w[0], 0.012, w[2]); prints.setMatrixAt(printHead, pm); printHead = (printHead + 1) % PRINTS; prints.count = Math.min(PRINTS, prints.count + 1); prints.instanceMatrix.needsUpdate = true;
    }
    wasDown[i * 4 + k] = down ? 1 : 0;
  }
}

// ---------------------------------------------------------------- input, autopilot, the others
const keys = new Set(); let lastKey = -1e9, level = 2;
addEventListener('keydown', (e) => { keys.add(e.code); lastKey = clock; if (e.code === 'KeyW') level = Math.min(3, level + 1); if (e.code === 'KeyS') level = Math.max(0, level - 1); });
addEventListener('keyup', (e) => keys.delete(e.code));
let orbit = 1.0, drag = null;
addEventListener('pointerdown', (e) => { drag = e.clientX; });
addEventListener('pointermove', (e) => { if (drag !== null) { orbit -= (e.clientX - drag) * 0.006; drag = e.clientX; } });
addEventListener('pointerup', () => { drag = null; });
// the autopilot rides the same reins a player has: gallop, hard turns, a halt, a turn from the stand, a canter circle
const SCRIPT = [[4, 0, 3], [2.5, 1, 3], [3, 0, 3], [2, -1, 2], [3, 0, 0], [2.5, 1, 0], [2, 0, 1], [5, -1, 2], [2, 0, 3], [3, -1, 3], [1.5, 0, 3]];
const SCRIPT_T = SCRIPT.reduce((s, r) => s + r[0], 0);
function autopilot(t) { let u = t % SCRIPT_T; for (const [d, turn, lv] of SCRIPT) { if (u < d) return { turn, level: lv, burst: false }; u -= d; } return { turn: 0, level: 2, burst: false }; }
// The law does not keep horses apart: steering must. A horse with another close ahead of it slows to that one's pace
// and bears away from it (it still turns only as the law allows).
function giveWay(i, wnt) {
  for (let j = 0; j < N; j++) {
    if (j === i) continue;
    const dx = S.mx[j] - S.mx[i], dz = S.mz[j] - S.mz[i], d = Math.hypot(dx, dz);
    if (d > 4.5) continue;
    const ahead = (dx * Math.sin(S.myaw[i]) + dz * Math.cos(S.myaw[i])) / (d || 1);
    if (ahead < 0.2) continue;
    const side = dx * Math.cos(S.myaw[i]) - dz * Math.sin(S.myaw[i]);         // + = the other is to my right
    wnt.speed = Math.min(wnt.speed, d < 2.6 ? 0 : S.speed[j] * 0.85);
    wnt.yaw = S.yaw[i] + (side > 0 ? 0.9 : -0.9);
  }
}
const want = { yaw: 0, speed: 0 }, plans = Array.from({ length: N }, () => ({ next: 0, tx: 0, tz: 0, v: 0 }));

// ---------------------------------------------------------------- loop (fixed 60 Hz steps)
let clock = 0, acc = 0, last = performance.now(), auto = true;
const DT = 1 / 60;
function step() {
  clock += DT;
  auto = params.has('auto') || clock - lastKey > 3;
  const a = auto ? autopilot(clock) : { turn: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), level, burst: keys.has('ShiftLeft') || keys.has('ShiftRight') };
  reins(S.yaw[PLAYER], a.turn, a.level, a.burst, herd.gaits, want);
  herd.step(PLAYER, want.yaw, want.speed, DT);
  for (let i = 1; i < N; i++) {
    const p = plans[i];                   // the others graze about: walk, trot or canter to a spot, stop
    {
      if (clock >= p.next) { const ang = rnd() * 6.28, r = 8 + rnd() * 20; p.tx = S.mx[PLAYER] + Math.sin(ang) * r; p.tz = S.mz[PLAYER] + Math.cos(ang) * r; p.v = [1.6, 3.5, 6.5, 11][Math.floor(rnd() * 4)]; p.next = clock + 5 + rnd() * 7; }
      herd.seek(i, p.tx, p.tz, p.v, want); giveWay(i, want);
    }
    herd.step(i, want.yaw, want.speed, DT);
  }
  checker.afterStep(DT, clock);
  for (let i = 0; i < N; i++) stampPrints(i);
}
const hud = document.getElementById('hud'), camPos = new THREE.Vector3(), look = new THREE.Vector3();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= DT) { step(); acc -= DT; }
  for (let i = 0; i < N; i++) drawHorse(i);
  // chase camera: behind and to the side, smoothed
  const yaw = S.myaw[PLAYER] + orbit, d = 6.8;
  const tx = S.mx[PLAYER] - Math.sin(yaw) * d, tz = S.mz[PLAYER] - Math.cos(yaw) * d;
  camPos.lerp(_a.set(tx, 2.6, tz), clock < 0.1 ? 1 : 0.06); camera.position.copy(camPos);
  look.lerp(_b.set(S.mx[PLAYER], 1.0, S.mz[PLAYER]), clock < 0.1 ? 1 : 0.2); camera.lookAt(look);
  sun.position.set(S.mx[PLAYER] + 30, 40, S.mz[PLAYER] + 20); sun.target.position.set(S.mx[PLAYER], 0, S.mz[PLAYER]);
  renderer.render(scene, camera);
  const v = S.speed[PLAYER], wr = Math.abs(S.yawRate[PLAYER]), lim = Math.min(v / HERO.R_MIN, HERO.A_LAT / Math.max(v, 1e-6)), rep = checker.report(), law = rep.failed.filter((f) => f !== 'overlap'), sl = checker.checks['hoof slide'].worst;
  hud.innerHTML = `<b>${GAIT_NAMES[S.gait[PLAYER]]}</b> &middot; <b>${v.toFixed(1)}</b> m/s ${auto ? '(autopilot)' : ''}<br>`
    + `turn <b>${wr.toFixed(2)}</b> rad/s of <b>${v > 0 ? lim.toFixed(2) : '0'}</b> allowed &middot; circle <b>${Math.abs(S.curve[PLAYER]) > 1e-3 ? (1 / Math.abs(S.curve[PLAYER])).toFixed(1) + ' m' : 'straight'}</b><br>`
    + `lean <b>${(S.roll[PLAYER] * 57.3).toFixed(1)}</b>&deg; &middot; worst hoof slide <b>${(sl * 1000).toFixed(1)} mm</b><br>`
    + `movement law, ${N} horses, every step: <b class="${law.length ? 'bad' : 'ok'}">${law.length ? 'BROKEN: ' + law.join(', ') : 'obeyed'}</b><br>`
    + `horses kept apart (the steering's job): <b class="${rep.failed.includes('overlap') ? 'bad' : 'ok'}">${rep.failed.includes('overlap') ? 'no' : 'yes'}</b>`;
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
// test hooks: window.__demo.advance(seconds) runs the sim without waiting for real time
window.__demo = { herd, checker, advance(s) { for (let k = 0; k < Math.round(s / DT); k++) step(); }, ready: true, LIMITS };
requestAnimationFrame(frame);
