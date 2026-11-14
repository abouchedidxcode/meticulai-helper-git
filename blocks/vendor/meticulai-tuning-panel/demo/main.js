// Demo: a bouncing ball and a ring of pillars, every number on the tuning panel.
// It uses the block the same way the kit's starter does (createStarterSettings + tuning.json), then registers a few
// more controls straight on the registry (a THREE.Color, a button, readouts), plus presets and a plain-words list.
import * as THREE from 'three';
import tuningFile from './tuning.json';
import { createStarterSettings } from '../src/starter.js';

const PRESETS = [
  { name: 'Moon', about: 'Low gravity and a soft, slow bounce. The ball hangs at the top of each hop.', values: { 'ball.gravity': 6, 'ball.bounce': 0.85, 'ball.kick': 7, 'look.mood': 'night', 'look.fog': 0.02 } },
  { name: 'Heavy', about: 'A lead ball: falls hard, barely bounces, squashes flat.', values: { 'ball.gravity': 48, 'ball.bounce': 0.3, 'ball.squash': 0.6, 'ball.size': 1.6 } },
  { name: 'Carousel', about: 'Many pillars spinning fast in a wide ring, in daylight.', values: { 'ring.count': 32, 'ring.radius': 9, 'ring.spin': 1.6, 'look.mood': 'day' } },
];
const ESSENTIALS = [
  ['The ball', [['How heavy it feels', 'ball.gravity', 'More = it falls faster.'], ['How bouncy', 'ball.bounce'], ['How high it jumps', 'ball.kick']]],
  ['The world', [['Pillars', 'ring.count'], ['How fast they turn', 'ring.spin'], ['Light', 'look.mood'], ['Brightness', 'look.exposure']]],
];

const { tune, tuning, installSettingsPanel } = createStarterSettings(tuningFile, {
  storageKey: 'meticulai-tuning-demo',
  presets: PRESETS,
  essentials: ESSENTIALS,
  panel: { title: 'Tuning demo' },
});

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a2f2a, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(hemi, sun);

const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: 0x4b5a46, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const look = { pillarColour: new THREE.Color('#8fb3d9') }; // a THREE.Color edited in place by the panel
const ballMat = new THREE.MeshStandardMaterial({ color: tune.look.ballColour, roughness: 0.35 });
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 40, 24), ballMat);
ball.castShadow = true;
scene.add(ball);

const pillarGeo = new THREE.BoxGeometry(0.6, 1, 0.6);
const pillarMat = new THREE.MeshStandardMaterial({ color: look.pillarColour, roughness: 0.6 });
const ring = new THREE.Group();
scene.add(ring);
let pillarCount = -1;
function syncPillars() {
  const n = Math.round(tune.ring.count);
  if (n === pillarCount) return;
  pillarCount = n;
  ring.clear();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pillarGeo, pillarMat);
    m.castShadow = m.receiveShadow = true;
    ring.add(m);
  }
}

const MOODS = {
  day: { sky: '#9cc4ec', sun: '#fff4e0', sunI: 2.6, hemiI: 1.1 },
  dusk: { sky: '#e08a6a', sun: '#ffb27a', sunI: 2.0, hemiI: 0.7 },
  night: { sky: '#1b2140', sun: '#9fb4ff', sunI: 0.9, hemiI: 0.35 },
};

// ---------------------------------------------------------------- extra controls straight on the registry
const debug = { slowMo: false, shadows: true };
const ballState = { y: 4, vy: 0, squash: 0, bounces: 0 };
tuning.color('Look', 'Pillar colour', look, 'pillarColour', { id: 'look.pillarColour' });
tuning.group('Debug')
  .bool('Slow motion (this visit only)', debug, 'slowMo', { save: false })
  .bool('Shadows', debug, 'shadows')
  .button('Kick the ball', () => { ballState.vy = tune.ball.kick * 1.3; })
  .button('Drop from high', () => { ballState.y = 9; ballState.vy = 0; })
  .readout('Ball height', () => `${ballState.y.toFixed(2)} m, ${ballState.bounces} bounces`)
  .readout('Frame rate', () => `${fps.toFixed(0)} fps`);

// ---------------------------------------------------------------- the loop, with the hooks the panel freezes and steps
const DT = 1 / 60;
let paused = false, acc = 0, last = 0, time = 0, frames = 0, fps = 60;
function tick(dt) {
  dt *= debug.slowMo ? 0.25 : 1;
  time += dt;
  const b = tune.ball;
  ballState.vy -= b.gravity * dt;
  ballState.y += ballState.vy * dt;
  const r = 0.7 * b.size;
  if (ballState.y < r) {
    ballState.y = r;
    if (Math.abs(ballState.vy) < 2.5) ballState.vy = b.kick; // settled: kick it again
    else ballState.vy = -ballState.vy * b.bounce;
    ballState.squash = b.squash * Math.min(1, Math.abs(ballState.vy) / 10 + 0.3);
    ballState.bounces++;
  }
  ballState.squash *= Math.exp(-dt * 10);
  ring.rotation.y += (tune.ring.spin * Math.PI * 2 / 10) * dt;
}
function draw() {
  syncPillars();
  const b = tune.ball;
  const s = ballState.squash;
  ball.scale.set(b.size * (1 + s * 0.6), b.size * (1 - s), b.size * (1 + s * 0.6));
  ball.position.y = ballState.y - 0.7 * b.size * s;
  ballMat.color.set(tune.look.ballColour);
  pillarMat.color.copy(look.pillarColour);
  const n = ring.children.length;
  ring.children.forEach((m, i) => {
    const a = (i / n) * Math.PI * 2;
    const h = 1.2 + (tune.ring.wave ? 1.1 * (0.5 + 0.5 * Math.sin(time * 2 + a * 3)) : 0.6);
    m.scale.set(1, h, 1);
    m.position.set(Math.cos(a) * tune.ring.radius, h / 2, Math.sin(a) * tune.ring.radius);
  });
  const mood = MOODS[tune.look.mood] ?? MOODS.dusk;
  scene.background = new THREE.Color(mood.sky);
  scene.fog = new THREE.FogExp2(mood.sky, tune.look.fog);
  sun.color.set(mood.sun);
  sun.intensity = mood.sunI;
  hemi.intensity = mood.hemiI;
  renderer.shadowMap.enabled = debug.shadows;
  renderer.toneMappingExposure = tune.look.exposure;
  const c = tune.camera;
  if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
  camera.position.set(-c.distance * 0.35, c.height, c.distance);
  camera.lookAt(0, 1.6, 0);
  renderer.render(scene, camera);
  frames++;
}
function frame(now) {
  requestAnimationFrame(frame);
  const wall = last ? Math.min(0.25, (now - last) / 1000) : 0;
  last = now;
  if (wall > 0) fps += (1 / wall - fps) * 0.05;
  if (!paused) { acc += wall; let k = 0; while (acc >= DT && k++ < 8) { tick(DT); acc -= DT; } if (k >= 8) acc = 0; }
  draw();
}
requestAnimationFrame(frame);

window.__game = {
  get ready() { return frames > 2; },
  get frames() { return frames; },
  get time() { return time; },
  pause() { paused = true; },
  resume() { paused = false; acc = 0; },
  step(n = 1) { paused = true; for (let i = 0; i < n; i++) tick(DT); draw(); return time; },
  capture: () => renderer.domElement.toDataURL('image/png'),
};
window.__tuning = tuning;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// The starter shows the panel only on the dev server and ?test=1 pages; this demo always shows it.
// "Save for my agent" needs the dev server (vite.config.js answers POST /__helper/tuning, like the starter's plugin).
installSettingsPanel({ enabled: true, canSave: import.meta.env.DEV });
