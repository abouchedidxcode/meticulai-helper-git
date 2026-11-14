// Demo: an army of mounted archers (3,000 by default, ?n=6000 for more) wheels and changes pace across a plain,
// facing a line of knights and a loose herd. Every horse is skinned and animated on the GPU from a baked bone
// texture; riders read their horse's saddle bone, so they never drift off it. All models are built in code.
import * as THREE from 'three';
import { createCrowd } from '../src/crowd.js';
import { buildHorse, buildArcher, buildKnight } from '../src/standin.js';
import { createHerd } from '../src/herd.js';
import { DEFAULT_GAITS, wrapAngle } from '../src/locomotion.js';
import { leadFromModel, gaitRows, writeHorse } from '../src/herd-draw.js';

const params = new URLSearchParams(location.search);
const N = Math.max(100, Math.min(8000, +(params.get('n') || 3000)));
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const HAZE = new THREE.Color(0xd9d4c4);
scene.background = HAZE; scene.fog = new THREE.Fog(HAZE, 120, 900);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 3000);
scene.add(new THREE.HemisphereLight(0xe6ecf0, 0x8d7a50, 1.25));
const sun = new THREE.DirectionalLight(0xffe7c4, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
{
  const g = new THREE.PlaneGeometry(6000, 6000, 300, 300); g.rotateX(-Math.PI / 2);
  const c = new Float32Array(g.attributes.position.count * 3), a = new THREE.Color(0xb3a56c), b = new THREE.Color(0x8b8f52), t = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i);
    t.copy(a).lerp(b, 0.5 + 0.3 * Math.sin(x * 0.011 + Math.sin(z * 0.007) * 2) + 0.2 * Math.sin(z * 0.013 - x * 0.004)); c.set([t.r, t.g, t.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); ground.receiveShadow = true; scene.add(ground);
}

// ---------------------------------------------------------------- models (built in code) and crowd sets
const crowd = createCrowd({ scene, camera });
const mHorse = await crowd.register('horse', buildHorse({ name: 'horse', gaits: DEFAULT_GAITS }));
const mDestrier = await crowd.register('destrier', buildHorse({ name: 'destrier', gaits: DEFAULT_GAITS, scale: 1.17, heavy: true }));
const mArcher = await crowd.register('archer', buildArcher());
const mKnight = await crowd.register('knight', buildKnight({ seatHeight: mDestrier.meta.seatRest[1] }), null, { lod3: false });
const K = Math.min(600, Math.round(N / 6)), LOOSE = Math.min(400, Math.round(N / 10));
const horseSet = crowd.createSet('horse', N + LOOSE), riderSet = crowd.createSet('archer', N, { mount: 'horse' });
const destSet = crowd.createSet('destrier', K), knightSet = crowd.createSet('knight', K, { mount: 'destrier', radius: 3.6 });
const horseRows = gaitRows(mHorse), destRows = gaitRows(mDestrier);

// ---------------------------------------------------------------- the herds, under the movement law
const army = createHerd({ capacity: N + LOOSE, lead: leadFromModel(mHorse) });
const knights = createHerd({ capacity: K, lead: leadFromModel(mDestrier) });
const COATS = [[0.55, 0.36, 0.22], [0.25, 0.17, 0.12], [0.78, 0.66, 0.5], [0.42, 0.28, 0.18], [0.9, 0.86, 0.78], [0.33, 0.24, 0.18], [0.62, 0.45, 0.28]];
const CLOTH = [[0.62, 0.18, 0.12], [0.2, 0.32, 0.5], [0.75, 0.7, 0.6], [0.35, 0.42, 0.3], [0.55, 0.4, 0.2]];
const COLS = Math.round(Math.sqrt(N * 1.6)), DX = 2.7, DZ = 4.2;           // the army's block: wide, not deep
const slots = [];
for (let i = 0; i < N; i++) {
  const c = i % COLS, r = Math.floor(i / COLS), sx = (c - (COLS - 1) / 2) * DX + (rnd() - 0.5) * 0.8, sz = -r * DZ + (rnd() - 0.5) * 1.2;
  slots.push([sx, sz]);
  army.add({ x: sx, z: sz, yaw: 0, size: 0.96 + rnd() * 0.08 });
  horseSet.set(i, { tint: COATS[Math.floor(rnd() * COATS.length)], hair: 0.35 + rnd() * 0.5, seed: rnd() });
  riderSet.set(i, { tint: CLOTH[Math.floor(rnd() * CLOTH.length)], seed: rnd() });
}
// a loose herd grazing off to one side
const looseHome = [];
for (let k = 0; k < LOOSE; k++) {
  const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 45, hx = -260 + Math.sin(a) * r, hz = 140 + Math.cos(a) * r;
  looseHome.push({ x: hx, z: hz, tx: hx, tz: hz, v: 0, next: rnd() * 8 });
  army.add({ x: hx, z: hz, yaw: rnd() * 6.28, size: 0.9 + rnd() * 0.15 });
  horseSet.set(N + k, { tint: COATS[Math.floor(rnd() * COATS.length)], hair: 0.4 + rnd() * 0.5, seed: rnd() });
}
// knights, drawn up in a line far ahead, waiting
const KCOLS = Math.ceil(K / 3);
for (let k = 0; k < K; k++) {
  const c = k % KCOLS, r = Math.floor(k / KCOLS);
  knights.add({ x: (c - KCOLS / 2) * 3.0, z: 420 + r * 5, yaw: Math.PI, size: 1 });
  destSet.set(k, { tint: [0.85, 0.82, 0.76], tintB: CLOTH[k % CLOTH.length], hair: 0.5, seed: rnd() });
  knightSet.set(k, { tint: CLOTH[k % CLOTH.length], tintB: [0.9, 0.88, 0.8], seed: rnd() });
}
horseSet.count = N + LOOSE; riderSet.count = N; destSet.count = K; knightSet.count = K;

// ---------------------------------------------------------------- the army's march: a moving anchor, each rider rides to his place
const ROUTE = [[6, 0, 6.5], [7, 0.16, 11], [5, 0, 11], [6, -0.14, 6.5], [4, 0, 3.2], [4, 0, 1.6], [3, 0, 0], [5, 0.1, 6.5]];   // [seconds, turn rad/s, speed m/s]
const ROUTE_T = ROUTE.reduce((s, r) => s + r[0], 0);
const anchor = { x: 0, z: 0, yaw: 0, v: 0 };
function routeAt(t) { let u = t % ROUTE_T; for (const r of ROUTE) { if (u < r[0]) return r; u -= r[0]; } return ROUTE[0]; }
const S = army.S;
let simMs = 0, clock = 0;
function step(dt) {
  const t0 = performance.now();
  clock += dt;
  const [, turn, v] = routeAt(clock);
  anchor.v += Math.max(-2.2 * dt, Math.min(1.6 * dt, v - anchor.v));
  anchor.yaw += turn * dt * Math.min(1, anchor.v / 6);
  anchor.x += Math.sin(anchor.yaw) * anchor.v * dt; anchor.z += Math.cos(anchor.yaw) * anchor.v * dt;
  const cs = Math.cos(anchor.yaw), sn = Math.sin(anchor.yaw);
  for (let i = 0; i < N; i++) {
    const [sx, sz] = slots[i];
    const tx = anchor.x + sx * cs + sz * sn, tz = anchor.z - sx * sn + sz * cs;            // my place in the block
    const dx = tx - S.mx[i], dz = tz - S.mz[i], ahead = dx * sn + dz * cs, side = dx * cs - dz * sn;
    // ride parallel to the block, bearing toward my place; faster when behind it, slower when ahead
    let wy = anchor.yaw + Math.max(-0.6, Math.min(0.6, side * 0.12)), ws = anchor.v + Math.max(-3, Math.min(3, ahead * 0.6));
    if (anchor.v < 0.3 && Math.hypot(dx, dz) < 1.2) ws = 0;
    if (ws < 0.3) { ws = 0; wy = S.yaw[i]; }
    army.step(i, wy, Math.min(13, ws), dt);
  }
  for (let k = 0; k < LOOSE; k++) {      // the loose herd: amble to a spot, graze, startle now and then
    const i = N + k, h = looseHome[k];
    if (clock > h.next) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 45; h.tx = -260 + Math.sin(a) * r; h.tz = 140 + Math.cos(a) * r; h.v = rnd() < 0.15 ? 9 : rnd() < 0.5 ? 1.6 : 0; h.next = clock + 6 + rnd() * 12; }
    const dx = h.tx - S.x[i], dz = h.tz - S.z[i], d = Math.hypot(dx, dz);
    if (h.v === 0 || d < 1.5) army.step(i, S.yaw[i], 0, dt);
    else army.step(i, Math.atan2(dx, dz), Math.min(h.v, Math.sqrt(2 * 3.4 * d)), dt);
  }
  for (let k = 0; k < K; k++) knights.step(k, knights.S.yaw[k], 0, dt);
  simMs = simMs * 0.95 + (performance.now() - t0) * 0.05;
}
function draw() {
  for (let i = 0; i < N; i++) writeHorse(army, i, horseSet, horseRows, i, 0, 0, riderSet, mArcher.row('ride', clock / 2.03 + i * 0.37), 0);
  for (let k = 0; k < LOOSE; k++) {
    const i = N + k; writeHorse(army, i, horseSet, horseRows, i, 0, 0);
    if (S.gait[i] === 0 && S.blend[i] >= 1) { const o = i * 24; horseSet.buf[o + 9] = horseSet.buf[o + 8]; horseSet.buf[o + 8] = mHorse.rowAt('graze', clock + k * 1.7); horseSet.buf[o + 10] = 0.85; }   // heads down
  }
  for (let k = 0; k < K; k++) writeHorse(knights, k, destSet, destRows, k, 0, 0, knightSet, mKnight.row('ride', clock / 2.4 + k * 0.29), 0);
}

// ---------------------------------------------------------------- camera: a slow orbit over the army
const hud = document.getElementById('hud');
let [camAng, zoom] = (params.get('cam') || '2.4,1').split(',').map(Number), drag = null;      // ?cam=angle,zoom
addEventListener('pointerdown', (e) => { drag = e.clientX; });
addEventListener('pointermove', (e) => { if (drag !== null) { camAng -= (e.clientX - drag) * 0.005; drag = e.clientX; } });
addEventListener('pointerup', () => { drag = null; });
addEventListener('wheel', (e) => { zoom = Math.max(0.25, Math.min(2.5, zoom * (e.deltaY > 0 ? 1.1 : 0.9))); });
const look = new THREE.Vector3();
function placeCamera(dt) {
  if (drag === null && !params.has('shot')) camAng += dt * 0.025;
  const cx = anchor.x - Math.sin(anchor.yaw) * 30, cz = anchor.z - Math.cos(anchor.yaw) * 30;      // the middle of the block
  look.set(cx, 0, cz);
  const d = 105 * zoom, h = 30 * zoom;
  camera.position.set(cx + Math.sin(camAng) * d, h, cz + Math.cos(camAng) * d); camera.lookAt(look.x, 2, look.z);
  sun.position.set(look.x + 120, 160, look.z - 90); sun.target.position.copy(look);
}

// ---------------------------------------------------------------- loop
const DT = 1 / 60; let acc = 0, last = performance.now(), fps = 60;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now; fps = fps * 0.95 + (1 / Math.max(real, 1e-3)) * 0.05;
  acc += real; while (acc >= DT) { step(DT); acc -= DT; }
  draw(); placeCamera(real);
  renderer.render(scene, camera);
  const st = crowd.stats;
  hud.innerHTML = `<b>${(N + LOOSE + K).toLocaleString()}</b> horses, <b>${(N + K).toLocaleString()}</b> riders &middot; ${renderer.info.render.calls} draw calls<br>`
    + `drawn ${st.drawn.toLocaleString()} (near ${st.lod[0]}, mid ${st.lod[1]}, low ${st.lod[2]}, far ${st.lod[3]}) &middot; shadows ${st.shadow}<br>`
    + `movement law ${simMs.toFixed(1)} ms &middot; lists ${st.prepMs.toFixed(2)} ms &middot; ${fps.toFixed(0)} fps`;
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
// compile every shader before the first frame (no hitch when the first horse comes close)
draw(); placeCamera(0); crowd.warm(() => renderer.compile(scene, camera));
window.__demo = {
  crowd, army, ready: true,
  advance(s) { for (let k = 0; k < Math.round(s / DT); k++) step(DT); },
  view(ang, z) { camAng = ang; zoom = z; },
  info: () => ({ stats: { ...crowd.stats }, calls: renderer.info.render.calls, simMs, fps }),
};
requestAnimationFrame(frame);
