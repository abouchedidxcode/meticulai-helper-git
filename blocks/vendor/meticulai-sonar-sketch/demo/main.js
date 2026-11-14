// Demo: a dark procedural cave. Every ping sketches its walls in glowing points that fade; amber knots mark things
// to find; G sends a ping that also finds a big body swimming beyond the rock.
import * as THREE from 'three';
import { SonarSketch, SONAR_DEFAULTS, bodySketch } from '../src/index.js';
import { caveDensity, CAVE_TARGETS } from './cave.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x01060a);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
camera.position.set(1, 0.5, 7);
let yaw = 0.18, pitch = -0.06;

const sketch = new SonarSketch();
scene.add(sketch.points);

// a faint shell for the ping front itself, so you can see the sound travel
const front = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 24),
  new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uK; varying vec3 vN; varying vec3 vV; void main() { float r = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(0.1, 0.5, 0.5) * pow(r, 3.0) * (1.0 - uK) * 0.5, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  }),
);
front.visible = false;
scene.add(front);
let frontAt = null;

const ghostShape = bodySketch({ length: 40 });
let pings = 0;

function ping(withGhost = false) {
  const t = sketch.time.value;
  const p = camera.position;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  sketch.ping({ x: p.x, y: p.y, z: p.z, t0: t, range: SONAR_DEFAULTS.range }, caveDensity, fwd, CAVE_TARGETS);
  if (withGhost) {
    // a 40 m body ~40 m off, beyond the rock, swimming across the line of the ping
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
    const head = p.clone().addScaledVector(fwd, 42).addScaledVector(side, -12).add(new THREE.Vector3(0, -4, 0));
    const vel = side.clone().multiplyScalar(6);
    sketch.ghost({ ping: { x: p.x, y: p.y, z: p.z, t0: t }, head, vel, at: t, shape: ghostShape, length: 40, sway: 1.3, echoes: 2, echoGap: 1, gain: 1 });
  }
  frontAt = { t, x: p.x, y: p.y, z: p.z };
  pings++;
}

// input: drag to look, click to ping, WASD to swim
const keys = new Set();
let drag = null, moved = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  moved += Math.abs(dx) + Math.abs(dy);
  yaw -= dx * 0.004; pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', () => { if (drag && moved < 6) ping(false); drag = null; idle = 0; });
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { ping(false); e.preventDefault(); }
  if (e.code === 'KeyG') ping(true);
  idle = 0;
});
addEventListener('keyup', (e) => keys.delete(e.code));

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// attract mode: until someone touches it, ping by itself every 2.5 s (the first one with a ghost)
let idle = 99, auto = 0.6;
const stats = document.getElementById('stats');
const clock = new THREE.Timer();
const tmp = new THREE.Vector3(), size = new THREE.Vector2();

function frame() {
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  sketch.time.value += dt;
  idle += dt;
  if (idle > 6) {
    auto -= dt;
    if (auto <= 0) { ping(pings % 3 === 0); auto = 2.5; }
  }
  // swim
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const v = new THREE.Vector3();
  if (keys.has('KeyW') || keys.has('ArrowUp')) v.add(f);
  if (keys.has('KeyS') || keys.has('ArrowDown')) v.sub(f);
  if (keys.has('KeyD') || keys.has('ArrowRight')) v.add(r);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) v.sub(r);
  if (v.lengthSq() > 0) {
    tmp.copy(camera.position).addScaledVector(v.normalize(), 7 * dt);
    if (caveDensity(tmp.x, tmp.y, tmp.z) < -0.8) camera.position.copy(tmp); // don't swim into the rock
  }
  sketch.update(SONAR_DEFAULTS.speed, renderer.getDrawingBufferSize(size).y);
  if (frontAt) {
    const age = sketch.time.value - frontAt.t, R = age * SONAR_DEFAULTS.speed;
    front.visible = R < SONAR_DEFAULTS.range;
    front.position.set(frontAt.x, frontAt.y, frontAt.z);
    front.scale.setScalar(Math.max(0.01, R));
    front.material.uniforms.uK.value = R / SONAR_DEFAULTS.range;
  }
  renderer.render(scene, camera);
  const s = sketch.stats();
  stats.textContent = `points ${s.live}  rays ${s.hitsLastPing}/${s.raysLastPing} hit  ${s.msAvg.toFixed(2)} ms/frame`;
  requestAnimationFrame(frame);
}
window.__sketch = sketch;
window.__ping = ping;
window.__view = (x, y, z, yw, pt) => { camera.position.set(x, y, z); yaw = yw; pitch = pt; };
requestAnimationFrame(frame);
