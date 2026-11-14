// Demo: a ball rolls over flat sand at golden hour, leaving a groove with berms, a damp wicking trail and craters
// where it lands. It drives itself along a loop until you press a key.
import * as THREE from 'three';
import { SandMap, WetMap, applySandTrails } from '../src/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8c9a0);
scene.fog = new THREE.Fog(0xe8c9a0, 18, 60);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

// a low sun: the groove's walls throw shadows in it
const sunDir = new THREE.Vector3(0.6, 0.35, 0.7).normalize();
const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0xc89060, 0.9));

// sand: a procedural grain texture (no image files)
function grainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 0.86 + rnd() * 0.18 - (rnd() < 0.04 ? 0.25 : 0);
    img.data[i * 4] = 214 * v; img.data[i * 4 + 1] = 168 * v; img.data[i * 4 + 2] = 118 * v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const groundMat = new THREE.MeshStandardMaterial({ map: grainTexture(), roughness: 0.92, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), groundMat);
ground.receiveShadow = true;
scene.add(ground);

const sand = new SandMap(renderer);           // 512 texels over 12 m, the game's desktop setting
const wet = new WetMap(renderer);             // 512 texels over 44 m
applySandTrails(groundMat, { sand, wet }, { sunDir });

// the ball: a two-tone texture so you can see it roll
const R = 0.3;
const ballTex = (() => {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e9eef2'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#2f6fa8'; for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 14, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35 }));
ball.castShadow = true;
scene.add(ball);

const pos = new THREE.Vector3(0, R, 0), vel = new THREE.Vector3(5, 0, 0);
let high = new URLSearchParams(location.search).has('high');
let vy = 0, airborne = false, wetBall = true, auto = true, autoT = 0, nextHop = 3.2;
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyC') high = !high;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) auto = false;
  if (e.code === 'Space' && !airborne) { vy = 4.2; airborne = true; e.preventDefault(); }
  if (e.code === 'KeyF') wetBall = !wetBall;
});
addEventListener('keyup', (e) => keys.delete(e.code));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const camPos = new THREE.Vector3(-4, 3, 4), look = new THREE.Vector3();
const axis = new THREE.Vector3(), q = new THREE.Quaternion();
const timer = new THREE.Timer();

function step(dt) {
  if (auto) {
    // a figure-of-eight at a steady 5-6 m/s, with a hop now and then
    autoT += dt;
    const w = 0.42;
    const want = new THREE.Vector3(Math.cos(autoT * w) * 6, 0, Math.cos(autoT * w * 2) * 2.6 * 2).sub(new THREE.Vector3(Math.cos((autoT - 0.05) * w) * 6, 0, Math.cos((autoT - 0.05) * w * 2) * 5.2)).multiplyScalar(1 / 0.05);
    vel.lerp(want.setLength(Math.max(4, want.length())), Math.min(1, dt * 3));
    if (autoT > nextHop && !airborne) { vy = 3.6; airborne = true; nextHop = autoT + 5.5; }
  } else {
    const f = new THREE.Vector3(), cf = new THREE.Vector3();
    camera.getWorldDirection(cf); cf.y = 0; cf.normalize();
    const cr = new THREE.Vector3(-cf.z, 0, cf.x);
    if (keys.has('KeyW') || keys.has('ArrowUp')) f.add(cf);
    if (keys.has('KeyS') || keys.has('ArrowDown')) f.sub(cf);
    if (keys.has('KeyD') || keys.has('ArrowRight')) f.add(cr);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) f.sub(cr);
    vel.addScaledVector(f, 14 * dt);
    vel.multiplyScalar(Math.exp(-dt * 0.6));
    if (vel.length() > 12) vel.setLength(12);
  }
  pos.addScaledVector(vel, dt);
  let landing = 0;
  if (airborne) {
    vy -= 14 * dt;
    pos.y += vy * dt;
    if (pos.y <= R) { landing = -vy; pos.y = R; vy = 0; airborne = false; }
  }
  // roll
  const sp = Math.hypot(vel.x, vel.z);
  if (sp > 1e-4) {
    axis.set(vel.z, 0, -vel.x).normalize();
    q.setFromAxisAngle(axis, (sp * dt) / R);
    ball.quaternion.premultiply(q);
  }
  ball.position.copy(pos);
  if (landing > 0) sand.land(pos.x, pos.z, R * Math.min(1.5, 0.7 + landing * 0.05), R * Math.min(0.2, 0.02 + landing * 0.012));
  const contact = airborne ? 0 : 1;
  // the same calls the game makes every frame: contact radius 0.62 R for the sand, 0.66 R for the long wet trail
  sand.update(dt, pos.x, pos.z, vel.x, vel.z, R * 0.62, contact, sp, wetBall ? (sp > 0.5 ? 1 : 0.5) : 0);
  wet.update(dt, pos.x, pos.z, R * 0.66, wetBall ? contact : 0, sp > 0.5 ? 1 : 0.5);
}

function frame() {
  timer.update();
  const dt = Math.min(1 / 30, timer.getDelta());
  step(dt);
  // a chase camera, high and behind, looking down at the trail
  const back = vel.lengthSq() > 0.01 ? vel.clone().setY(0).normalize() : new THREE.Vector3(1, 0, 0);
  const want = high
    ? pos.clone().addScaledVector(back, -2.5).add(new THREE.Vector3(0, 5.5, 0)).addScaledVector(new THREE.Vector3(-back.z, 0, back.x), 3.5)
    : pos.clone().addScaledVector(back, -3.4).add(new THREE.Vector3(0, 2.1, 0)).addScaledVector(new THREE.Vector3(-back.z, 0, back.x), 1.2);
  camPos.lerp(want, 1 - Math.exp(-dt * 2.5));
  camera.position.copy(camPos);
  look.lerp(pos.clone().addScaledVector(back, high ? -2.2 : -0.9), 1 - Math.exp(-dt * 6));
  camera.lookAt(look);
  sun.position.copy(pos).addScaledVector(sunDir, 20);
  sun.target.position.copy(pos);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
window.__demo = { renderer, sand, wet, setAuto: (v) => { auto = v; }, get t() { return autoT; }, get pos() { return pos.toArray(); } };
requestAnimationFrame(frame);
