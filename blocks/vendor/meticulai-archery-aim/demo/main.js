// Demo: you ride a cantering stand-in horse round a plain; enemy riders gallop across it; practice boards and a
// swinging dummy stand by the track. Hold the mouse to draw, let go to loose: the arrow goes where the crosshair was.
// Until you click, the computer rides and shoots (so the page shows the block working on its own).
// Everything here is built in code: no model, texture or sound files.
import * as THREE from 'three';
import {
  createAim, createBow, aimShot, createTargets, bodiesTarget, segmentBox, segmentSphere,
  createArrows, PLAYED_SETTINGS, BOW_DEFAULTS, AIM_DEFAULTS, Vec3,
} from '../src/index.js';

const params = new URLSearchParams(location.search);
const cine = params.has('cine');

// ------------------------------------------------------------------ the land
const heightAt = (x, z) => 1.2 * Math.sin(x * 0.013) * Math.cos(z * 0.011) + 0.6 * Math.sin((x + z) * 0.031);
const groundGLSL = 'return 1.2 * sin(p.x * 0.013) * cos(p.y * 0.011) + 0.6 * sin((p.x + p.y) * 0.031);';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('preview') });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xb9cddc);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 160, 720);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);

scene.add(new THREE.HemisphereLight(0xcfe0ef, 0x6e5b3c, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
const sunDir = new THREE.Vector3(-0.45, 0.62, 0.4).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

{
  const S = 1400, N = 220, g = new THREE.PlaneGeometry(S, S, N, N);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const dry = new THREE.Color(0xb7a46a), green = new THREE.Color(0x7d8f4c), dark = new THREE.Color(0x5d6e3a);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.05 - x * 0.01);
    c.copy(green).lerp(dry, n * 0.8).lerp(dark, Math.max(0, Math.sin(x * 0.17) * Math.sin(z * 0.13)) * 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);
  // stones and tussocks, so the eye has something to measure speed and distance by
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8c8678, roughness: 0.9, flatShading: true }), 500);
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.35, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x8a8a4a, roughness: 1, flatShading: true }), 1600);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) { p.set((r() - 0.5) * 900, 0, (r() - 0.5) * 900); p.y = heightAt(p.x, p.z) + 0.1; const k = 0.4 + r() * 1.6; s.set(k, k * 0.6, k); q.setFromEuler(new THREE.Euler(r(), r() * 6, r())); rock.setMatrixAt(i, m.compose(p, q, s)); }
  for (let i = 0; i < 1600; i++) { p.set((r() - 0.5) * 700, 0, (r() - 0.5) * 700); p.y = heightAt(p.x, p.z) + 0.3; const k = 0.6 + r() * 0.9; s.set(k, k, k); q.identity(); tuft.setMatrixAt(i, m.compose(p, q, s)); }
  rock.castShadow = rock.receiveShadow = true;
  scene.add(rock, tuft);
}

// ------------------------------------------------------------------ stand-in riders (code-built)
function makeRider(coat, cloth, helm) {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const horse = M(coat), dark = M(0x2a211b), clothM = M(cloth), skin = M(0xc79a76), helmM = new THREE.MeshStandardMaterial({ color: helm, roughness: 0.4, metalness: 0.6 });
  const add = (geo, mat, x, y, z, rx = 0, parent = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; parent.add(o); return o; };
  add(new THREE.CapsuleGeometry(0.38, 1.05, 4, 10), horse, 0, 1.28, 0, Math.PI / 2);
  add(new THREE.CapsuleGeometry(0.19, 0.6, 4, 8), horse, 0, 1.72, 0.86, 0.65);
  add(new THREE.BoxGeometry(0.22, 0.26, 0.58), horse, 0, 1.98, 1.28, 0.95);
  add(new THREE.BoxGeometry(0.08, 0.55, 0.12), dark, 0, 1.84, 0.74, 0.65);               // mane
  add(new THREE.CapsuleGeometry(0.07, 0.6, 3, 6), dark, 0, 1.15, -0.95, 0.5);           // tail
  const legs = [];
  for (const [x, z, ph] of [[0.2, 0.62, 0], [-0.2, 0.62, 0.5], [0.2, -0.62, 2.4], [-0.2, -0.62, 2.9]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.1, z); g.add(pivot);
    add(new THREE.CapsuleGeometry(0.075, 0.82, 3, 6), horse, 0, -0.5, 0, 0, pivot);
    add(new THREE.BoxGeometry(0.15, 0.1, 0.17), dark, 0, -0.98, 0.02, 0, pivot);       // hoof
    legs.push({ pivot, ph });
  }
  // the rider: chest at y 1.95 (the aim point), head at 2.45
  add(new THREE.CapsuleGeometry(0.22, 0.42, 4, 10), clothM, 0, 1.98, -0.05);
  add(new THREE.SphereGeometry(0.13, 12, 10), skin, 0, 2.42, -0.03);
  add(new THREE.ConeGeometry(0.15, 0.24, 10), helmM, 0, 2.6, -0.03);
  add(new THREE.CapsuleGeometry(0.08, 0.36, 3, 6), clothM, 0.24, 1.6, 0.05, 0.2);      // legs over the barrel
  add(new THREE.CapsuleGeometry(0.08, 0.36, 3, 6), clothM, -0.24, 1.6, 0.05, 0.2);
  g.userData.legs = legs;
  return g;
}
function gallop(g, phase, amp) {
  for (const l of g.userData.legs) l.pivot.rotation.x = Math.sin(phase + l.ph) * amp;
}

// ------------------------------------------------------------------ the targets
const targets = createTargets();

// enemy riders: each gallops round its own wide loop, crossing the player's track
const enemies = [];
const bodies = [];
const ENEMY_COUNT = 9;
function spawnEnemy(i, e = { i }) {
  if (e.group) { e.group.userData.gone = true; const old = e.group; setTimeout(() => scene.remove(old), 1200); }
  const g = makeRider(0x6b4a33 + (i % 3) * 0x101008, 0x7a2b22, 0xb8b8b8);
  scene.add(g);
  const rr = 48 + (i % 4) * 11, cx = Math.cos(i * 2.3) * 34, cz = Math.sin(i * 2.3) * 34;
  Object.assign(e, { group: g, cx, cz, rr, ang: i * 0.7 + 0.4, dir: i % 2 ? 1 : -1, speed: 11 + (i % 3) * 1.5, phase: i, hits: 0, alive: true, fallT: 0 });
  e.body = { key: i, alive: true, center: new Vec3(), vel: new Vec3(), radius: 0.3, kind: 'body', attach: g,
    capsule: { a: new Vec3(), b: new Vec3(), r: 0.24 },
    extra: [{ kind: 'horse', seekBody: true, center: new Vec3(), radius: 0.5, capsule: { a: new Vec3(), b: new Vec3(), r: 0.4 } }] };
  bodies[i] = e.body;
  enemies[i] = e;
  return e;
}
for (let i = 0; i < ENEMY_COUNT; i++) spawnEnemy(i);
targets.add(bodiesTarget({ id: 'riders', bodies: () => bodies }));

// practice boards on posts, facing the track, and a straw dummy swinging on a frame
const boards = [];
for (let k = 0; k < 3; k++) {
  const a = 0.6 + k * 2.1, x = Math.cos(a) * 92, z = Math.sin(a) * 92, yaw = Math.atan2(-x, -z), y = heightAt(x, z);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 0.14), new THREE.MeshStandardMaterial({ color: 0x5a4632 }));
  post.position.set(x, y + 0.9, z); post.castShadow = true;
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 24), [new THREE.MeshStandardMaterial({ color: 0x9a7a52 }), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 })]);
  board.rotation.set(Math.PI / 2, 0, 0, 'YXZ'); board.rotation.y = yaw;
  board.position.set(x, y + 2.0, z); board.castShadow = true; board.userData.still = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0x9b2d22 }));
  ring.position.set(0, 0.051, 0); ring.rotation.x = -Math.PI / 2; board.add(ring);
  scene.add(post, board);
  const c = board.position.clone();
  targets.add({ id: 'board' + k, center: c, radius: 1.2, test: (p0, p1) => { const h = segmentBox(p0, p1, c, 0.62, 0.62, 0.05, yaw); return h && { ...h, kind: 'wood', attach: board }; } });
  boards.push(board);
}
const dummy = (() => {
  const x = -30, z = 58, y = heightAt(x, z);
  const frame = new THREE.Group(); frame.position.set(x, y, z); scene.add(frame);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632 });
  for (const s of [-1.4, 1.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.2, 0.16), wood); p.position.set(s, 2.1, 0); p.castShadow = true; frame.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 0.16), wood); bar.position.set(0, 4.2, 0); frame.add(bar);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 1 }));
  ball.castShadow = true; scene.add(ball);
  const t = { id: 'dummy', center: new Vec3(), vel: new Vec3(), radius: 0.9, test: (p0, p1) => { const h = segmentSphere(p0, p1, t.center, 0.5); return h && { ...h, kind: 'target', attach: ball }; } };
  targets.add(t);
  return { t, ball, x, y, z };
})();

// ------------------------------------------------------------------ the archery
const presets = { measured: { bow: {}, aim: {} }, played: PLAYED_SETTINGS };
let preset = params.get('settings') === 'played' ? 'played' : 'measured';
const bowOpts = { ...presets[preset].bow }, aimOpts = { ...presets[preset].aim };
let time = 0;
const player = { group: makeRider(0x8a6a48, 0x2d4f6e, 0x9a8248), ang: 0, r: 70, speed: 8, pos: new Vec3(), vel: new Vec3(), yaw: 0, phase: 0 };
scene.add(player.group);
const aim = createAim({ targets, heightAt, options: aimOpts, now: () => time, carrierVel: () => player.vel });
const bow = createBow(bowOpts);
let hits = 0, shots = 0, longest = 0;
const arrows = createArrows({
  scene, camera, renderer, targets, heightAt, seed: 3,
  listener: () => camera.position, listenerVel: () => player.vel,
  light: { sunDir, groundGLSL },
  emit(name, d) {
    if (name !== 'arrow:hit' || !d.byPlayer || d.kind === 'ground') return;
    hits++; longest = Math.max(longest, d.dist);
    if (d.targetId === 'riders' && d.key !== undefined) { const e = enemies[d.key]; if (e && e.alive && ++e.hits >= 2) { e.alive = false; e.body.alive = false; e.fallT = 0; } }
  },
});

// ------------------------------------------------------------------ the view and the input
const view = { yaw: 0.9, pitch: -0.02 };   // the view's own turn, relative to the horse when the string is slack
let human = false, held = false, lastHorseYaw = 0;
addEventListener('mousedown', (e) => {
  if (!human) { human = true; held = false; }
  if (document.pointerLockElement !== renderer.domElement) { renderer.domElement.requestPointerLock?.(); return; }
  if (e.button === 0) held = true;
  if (e.button === 2) bow.cancel();
});
addEventListener('mouseup', (e) => { if (e.button === 0) held = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const k = 0.0022 * camera.fov / 50;
  view.yaw -= e.movementX * k; view.pitch = Math.max(-0.5, Math.min(0.6, view.pitch - e.movementY * k));
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV') loosesVolley();
  if (e.code === 'Digit1' || e.code === 'Digit2') {
    preset = e.code === 'Digit1' ? 'measured' : 'played';
    Object.assign(bowOpts, BOW_DEFAULTS, presets[preset].bow); Object.assign(aimOpts, AIM_DEFAULTS, presets[preset].aim);
  }
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const aimDir = new Vec3(), eye = new Vec3(), hand = new Vec3(), tmp = new THREE.Vector3(), right = new Vec3();
function viewDir(out) {
  const yaw = player.yaw + view.yaw;
  return out.set(Math.sin(yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(yaw) * Math.cos(view.pitch));
}

function loosesVolley() {
  // your side's volley: 1,500 arrows from a line beside you onto the riders' loop ahead
  // (onto the ground about 120 m out along the view, from a line behind you)
  const fx = aimDir.x, fz = aimDir.z, l = Math.hypot(fx, fz) || 1, yaw = Math.atan2(fx, fz);
  const tx = player.pos.x + fx / l * 120, tz = player.pos.z + fz / l * 120;
  arrows.volley({ x: player.pos.x - fx / l * 15, z: player.pos.z - fz / l * 15, width: 60, depth: 14, yaw, tx, tz, tr: 26, count: 1500, arc: 40 });
}

// ------------------------------------------------------------------ the computer plays until you click
const bot = { target: -1, readyFor: 0, err: { y: 0, p: 0 }, next: 0 };
function botStep(dt) {
  // choose the rider that takes the least turning of the head, 20 to 140 m
  viewDir(aimDir);
  let best = bot.target >= 0 && enemies[bot.target].alive ? bot.target : -1;
  if (best < 0 && time > bot.next) {
    let bs = 1e9;
    for (const e of enemies) {
      if (!e.alive) continue;
      tmp.set(e.body.center.x - eye.x, e.body.center.y - eye.y, e.body.center.z - eye.z);
      const d = tmp.length(); if (d < 16 || d > (cine ? 45 : 80)) continue;
      const turn = Math.acos(Math.max(-1, Math.min(1, tmp.dot(aimDir) / d)));
      if (turn + d * 0.004 < bs) { bs = turn + d * 0.004; best = e.i; }
    }
    bot.target = best; bot.err.y = (Math.random() - 0.5) * 0.006; bot.err.p = (Math.random() - 0.5) * 0.004;
  }
  if (best < 0) { held = false; return; }
  const c = enemies[best].body.center;
  const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
  const wantYaw = Math.atan2(dx, dz) - player.yaw + bot.err.y, wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + bot.err.p;
  let dyaw = wantYaw - view.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const k = Math.min(1, dt * 7);
  view.yaw += dyaw * k; view.pitch += (wantPitch - view.pitch) * k;
  const off = Math.abs(dyaw) + Math.abs(wantPitch - view.pitch);
  if (bow.state.ready) bot.readyFor += dt; else bot.readyFor = 0;
  held = off < 0.15 && !(bow.state.ready && bot.readyFor > 0.08 && off < 0.03);
}

// ------------------------------------------------------------------ the HUD
const ticks = document.querySelectorAll('#reticle i'), markEl = document.getElementById('mark'), rangeEl = document.getElementById('range');
ticks.forEach((t, i) => Object.assign(t.style, i < 2 ? { width: '7px', height: '1.5px', top: '-0.75px' } : { width: '1.5px', height: '7px', left: '-0.75px' }));
const infoEl = document.getElementById('info'), statsEl = document.getElementById('stats');
function hud() {
  const drawn = bow.state.draw, ready = bow.state.ready, gap = ready ? 3 : 5 + 9 * (1 - drawn), col = ready ? '#e9b860' : '#efe6d0';
  ticks[0].style.left = `${-gap - 7}px`; ticks[1].style.left = `${gap}px`; ticks[2].style.top = `${-gap - 7}px`; ticks[3].style.top = `${gap}px`;
  ticks.forEach((t) => { t.style.background = col; t.style.opacity = String(0.55 + 0.45 * drawn); });
  const m = aim.follow(eye);
  if (m && !cine) {
    tmp.set(m.point.x, m.point.y, m.point.z).project(camera);
    const px = (tmp.x * 0.5 + 0.5) * innerWidth, py = (-tmp.y * 0.5 + 0.5) * innerHeight;
    const size = Math.max(16, Math.min(80, 1.1 / Math.max(1, m.dist) / Math.tan(camera.fov * Math.PI / 360) * innerHeight));
    Object.assign(markEl.style, { display: tmp.z < 1 ? 'block' : 'none', left: `${px}px`, top: `${py}px`, width: `${size}px`, height: `${size}px` });
    rangeEl.textContent = `${m.dist.toFixed(0)} m`;
  } else { markEl.style.display = 'none'; rangeEl.textContent = ''; }
  infoEl.innerHTML = human
    ? 'Hold the left button to draw, let go to loose. Right button lets the string down. <b>V</b> a volley. <b>1</b> measured settings, <b>2</b> the settings it was last played with.'
    : 'The computer is riding and shooting. <b>Click</b> to take the bow (the mouse turns your view).';
  statsEl.innerHTML = `${bow.state.quiver} arrows<br>${hits} hits of ${shots} shots, longest ${longest.toFixed(0)} m<br><span style="opacity:.7">${preset === 'played' ? 'settings: as last played' : 'settings: measured'}</span>`;
}

// ------------------------------------------------------------------ the loop (fixed 60 Hz steps)
const DT = 1 / 60;
let acc = 0, last = performance.now(), tickN = 0, nextVolley = 2.5;
function stepWorld(dt) {
  time += dt;
  // the player canters round his circle (anticlockwise)
  player.ang += player.speed / player.r * dt;
  const px = Math.cos(player.ang) * player.r, pz = Math.sin(player.ang) * player.r;
  player.vel.set(-Math.sin(player.ang) * player.speed, 0, Math.cos(player.ang) * player.speed);
  player.yaw = Math.atan2(player.vel.x, player.vel.z);
  player.pos.set(px, heightAt(px, pz), pz);
  player.phase += dt * 9;
  // the view rides round with the horse, but never while the string is drawn: then the aim holds still in the world
  const dYaw = player.yaw - lastHorseYaw; lastHorseYaw = player.yaw;
  if (bow.state.phase === 'drawing') view.yaw -= Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
  player.group.position.set(px, player.pos.y + Math.abs(Math.sin(player.phase)) * 0.06, pz);
  player.group.rotation.y = player.yaw;
  gallop(player.group, player.phase, 0.5);
  // enemies
  for (const e of enemies) {
    if (e.alive) {
      e.ang += e.dir * e.speed / e.rr * dt;
      const x = e.cx + Math.cos(e.ang) * e.rr, z = e.cz + Math.sin(e.ang) * e.rr, y = heightAt(x, z);
      e.body.vel.set(-Math.sin(e.ang) * e.speed * e.dir, 0, Math.cos(e.ang) * e.speed * e.dir);
      e.phase += dt * 13;
      e.group.position.set(x, y + Math.abs(Math.sin(e.phase)) * 0.09, z);
      e.group.rotation.set(0, Math.atan2(e.body.vel.x, e.body.vel.z), 0);
      gallop(e.group, e.phase, 0.8);
    } else {
      // down: horse and rider topple together (the arrows in them go down too), then a fresh rider comes
      e.fallT += dt; e.body.vel.set(0, 0, 0);
      e.group.rotation.z = Math.min(1, e.fallT / 0.7) ** 2 * Math.PI / 2 * 0.95;
      e.group.position.y = heightAt(e.group.position.x, e.group.position.z) - Math.min(1, e.fallT / 0.7) * 0.5;
      if (e.fallT > 6) spawnEnemy(e.i, e);
    }
    e.group.updateMatrixWorld(true);
    const b = e.body;
    tmp.set(0, 1.98, -0.05).applyMatrix4(e.group.matrixWorld); b.center.copy(tmp);
    tmp.set(0, 1.62, -0.05).applyMatrix4(e.group.matrixWorld); b.capsule.a.copy(tmp);
    tmp.set(0, 2.55, -0.05).applyMatrix4(e.group.matrixWorld); b.capsule.b.copy(tmp);
    const h = b.extra[0];
    tmp.set(0, 1.28, -0.6).applyMatrix4(e.group.matrixWorld); h.capsule.a.copy(tmp);
    tmp.set(0, 1.5, 1.1).applyMatrix4(e.group.matrixWorld); h.capsule.b.copy(tmp);
    tmp.set(0, 1.3, 0).applyMatrix4(e.group.matrixWorld); h.center.copy(tmp);
  }
  // the dummy swings
  const sw = Math.sin(time * 1.6) * 1.1, swv = Math.cos(time * 1.6) * 1.6 * 1.1;
  dummy.ball.position.set(dummy.x + sw, dummy.y + 2.0 - Math.abs(sw) * 0.12, dummy.z);
  dummy.t.center.copy(dummy.ball.position); dummy.t.vel.set(swv, 0, 0);
  // the eye (over the right shoulder) and the bow hand
  viewDir(aimDir);
  right.set(Math.cos(player.yaw + view.yaw), 0, -Math.sin(player.yaw + view.yaw));
  eye.set(px, player.pos.y + 3.4, pz).addScaledVector(aimDir, -4.2).addScaledVector(right, -1.15);
  hand.set(px, player.pos.y + 2.25, pz).addScaledVector(aimDir, 0.7).addScaledVector(right, -0.2);
  if (!human) botStep(dt);
  viewDir(aimDir);
  if (tickN++ % 6 === 0) aim.track(eye, aimDir, time);
  const shot = bow.update(dt, held);
  if (shot) {
    const s = aimShot({ aim, eye, aimDir, from: hand, carry: player.vel, speed: shot.speed, options: bowOpts });
    arrows.spawn({ pos: hand, vel: s.vel, byPlayer: true, perfect: shot.perfect, power: shot.power, guide: s.guide, time });
    shots++;
    if (bow.state.quiver < 5) bow.refill();
  }
  if (!human && time > nextVolley) { loosesVolley(); nextVolley = time + 14; }
  scene.updateMatrixWorld();
  arrows.update(dt, time);
}

// ?cine: a film camera beside the rider, looking past him at the one he shoots at (for pictures of the block;
// the crosshair is hidden there because the view is not the aim)
if (cine) for (const id of ['reticle', 'mark', 'range']) document.getElementById(id).style.display = 'none';
const cineLook = new THREE.Vector3(), cinePos = new THREE.Vector3(), cineWant = new THREE.Vector3();
let cineInit = false;
function cineCam(fdt) {
  const e = enemies[bot.target]?.alive ? enemies[bot.target] : null;
  const tgt = e ? e.body.center : { x: player.pos.x + aimDir.x * 50, y: 2, z: player.pos.z + aimDir.z * 50 };
  const fx = tgt.x - player.pos.x, fz = tgt.z - player.pos.z, l = Math.hypot(fx, fz) || 1, ux = fx / l, uz = fz / l;
  cineWant.set(player.pos.x - ux * 5.5 - uz * 2.6, player.pos.y + 2.9, player.pos.z - uz * 5.5 + ux * 2.6);
  const k = cineInit ? Math.min(1, fdt * 2.5) : 1; cineInit = true;
  cinePos.copy(cineWant);
  cineLook.lerp(tmp.set(player.pos.x + (tgt.x - player.pos.x) * 0.45, 1.5 + player.pos.y, player.pos.z + (tgt.z - player.pos.z) * 0.45), k);
  camera.position.copy(cinePos); camera.fov = 40; camera.updateProjectionMatrix(); camera.lookAt(cineLook);
}

// THE LENS (from the source game): 50 degrees at rest, closing to 38 over the draw in 0.28 s, opening over 0.7 s
const LENS = { fov: 50, fovDrawn: 38, zoomIn: 0.28, zoomOut: 0.7 };
let zoom = 0;
function frame(now) {
  const fdt = Math.min(0.25, (now - last) / 1000);
  acc = Math.min(0.25, acc + fdt); last = now;
  while (acc >= DT) { stepWorld(DT); acc -= DT; }
  const kept = bow.state.phase === 'drawing' || bow.state.phase === 'loosed' || bow.state.phase === 'nocking';
  zoom = kept ? Math.min(1, zoom + fdt / LENS.zoomIn) : Math.max(0, zoom - fdt / LENS.zoomOut);
  const ez = zoom * zoom * (3 - 2 * zoom);
  camera.fov = LENS.fov + (LENS.fovDrawn - LENS.fov) * ez; camera.updateProjectionMatrix();
  if (cine) cineCam(fdt);
  else {
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(eye.x + aimDir.x, eye.y + aimDir.y, eye.z + aimDir.z);
  }
  sun.position.set(player.pos.x + sunDir.x * 150, player.pos.y + sunDir.y * 150, player.pos.z + sunDir.z * 150);
  sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  hud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
stepWorld(DT);
requestAnimationFrame(frame);

// for tools: state and a manual stepper
window.__demo = {
  state: () => ({ time, shots, hits, longest, human, preset, arrows: arrows.state(), mark: aim.mark ? aim.mark.thing ?? aim.mark.targetId : null }),
  step: (secs) => { for (let t = 0; t < secs; t += DT) stepWorld(DT); },
};
