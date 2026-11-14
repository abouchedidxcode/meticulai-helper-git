// Demo: fly a code-built flyer over a procedural island with the Dragon Aces flight model, mouse aim and chase
// camera. Three computer flyers share the same model and autopilot, racing round a loop of rings.
// Until you click, your flyer follows the loop by itself (so a headless screenshot shows it flying).
import * as THREE from 'three';
import { createFlightState, PRESETS, steerToward, stepFlight, bankOf } from '../src/flight.js';
import { qlook } from '../src/math.js';
import { createPilot } from '../src/pilot.js';
import { createInput } from '../src/input.js';
import { createChaseCamera } from '../src/chase-camera.js';

const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ renderer and scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9cc2e4);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 900, 5200);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 1, 9000);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x9a8f78, 1.9));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(-0.5, 0.8, 0.3);
scene.add(sun);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ a procedural island (value noise, no files)
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function heightAt(x, z) {
  let h = 0, amp = 1, f = 1 / 900;
  for (let o = 0; o < 5; o++) { h += (1 - Math.abs(noise(x * f, z * f) * 2 - 1)) * amp; amp *= 0.5; f *= 2.1; }
  const r = Math.hypot(x, z) / 3200;
  return h * 210 * Math.max(0, 1 - r * r) - 50;
}
const floorAt = (x, z) => Math.max(0, heightAt(x, z));
{
  const SIZE = 9000, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
    pos.setY(i, y);
    if (y < 6) c.set(0xd8c89a);
    else if (y < 120) c.set(0x6f8f4a).lerp(new THREE.Color(0x4f6e38), noise(x / 120, z / 120));
    else if (y < 210) c.set(0x8a8270);
    else c.set(0xf2f4f6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: 0x2f6f95 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.5;
  scene.add(sea);
}
// rock spires to fly round
{
  const mat = new THREE.MeshLambertMaterial({ color: 0xc2b398, flatShading: true });
  for (let i = 0; i < 46; i++) {
    const a = hash(i, 7) * Math.PI * 2, r = 600 + hash(i, 9) * 2200;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 220 + hash(i, 3) * 380;
    const geo = new THREE.CylinderGeometry(14 + hash(i, 5) * 10, 40 + hash(i, 6) * 20, h, 7, 4);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, floorAt(x, z) - 10, z);
    m.rotation.y = hash(i, 4) * 6;
    scene.add(m);
  }
}
// a loop of rings
const RINGS = [];
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  const x = Math.cos(a) * 1500, z = Math.sin(a) * 1100;
  RINGS.push(new THREE.Vector3(x, Math.max(floorAt(x, z) + 90, 200 + 90 * Math.sin(a * 2)), z));
}
{
  const geo = new THREE.TorusGeometry(26, 2.4, 8, 40);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: true });
  RINGS.forEach((p, i) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p);
    m.lookAt(RINGS[(i + 1) % RINGS.length]);
    scene.add(m);
  });
}

// ------------------------------------------------------------------ a code-built flyer (body, neck, wings, tail)
function makeFlyer(color) {
  const root = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), flatShading: true, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 7, 8), mat);
  body.rotation.x = Math.PI / 2;
  root.add(body);
  const neck = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.2, 8), mat);
  neck.rotation.x = -Math.PI / 2;
  neck.position.z = -5.4;
  root.add(neck);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 6), mat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 6.8;
  root.add(tail);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -2, 7.5, 0, -0.5, 0, 0, 2.6, 7.5, 0, -0.5, 6.5, 0, 2.2, 0, 0, 2.6], 3));
  wingGeo.computeVertexNormals();
  const wings = [];
  for (const side of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.8, 0.4, -0.6);
    const w = new THREE.Mesh(wingGeo, dark);
    w.scale.x = side;
    hinge.add(w);
    root.add(hinge);
    wings.push({ hinge, side });
  }
  root.scale.setScalar(1.4); // the game draws its flyers 1.4x so they read at range; the camera boom matches
  scene.add(root);
  let phase = 0;
  return {
    root,
    pose(fs, dt) {
      root.position.set(fs.p[0], fs.p[1], fs.p[2]);
      root.quaternion.set(fs.q[0], fs.q[1], fs.q[2], fs.q[3]);
      // flap with the throttle, harder on boost; glide with wings held in a dive
      const effort = fs.boosting ? 1.6 : 0.25 + fs.throttle;
      phase += dt * Math.PI * 2 * 1.4 * effort;
      const diving = fs.vel[1] < -25 ? 1 : 0;
      for (const w of wings) w.hinge.rotation.z = w.side * (Math.sin(phase) * 0.55 * effort * (1 - diving) + 0.08);
    },
  };
}

// ------------------------------------------------------------------ player and computer flyers
const PRESET_KEYS = ['balanced', 'heavy', 'fast', 'agile'];
let preset = PRESETS.balanced;
const start = RINGS[0].clone().add(new THREE.Vector3(-300, 40, -500));
const dir0 = RINGS[0].clone().sub(start).normalize();
const fs = createFlightState([start.x, start.y, start.z], qlook([0, 0, 0, 1], [dir0.x, dir0.y, dir0.z]));
let pilot = createPilot(fs, { breed: preset });
const me = makeFlyer(0xc8553d);
const input = createInput(renderer.domElement);
const cam = createChaseCamera(camera, { boom: 1.4, floorAt });
let selfFly = !params.has('manual');
let myRing = 0;

const bots = [0x4a7fc1, 0x5fa35a, 0xb08ad6].map((color, i) => {
  const p = RINGS[(i * 3 + 2) % RINGS.length];
  const nxt = RINGS[(i * 3 + 3) % RINGS.length];
  const d = nxt.clone().sub(p).normalize();
  const s = createFlightState([p.x, p.y + 20, p.z], qlook([0, 0, 0, 1], [d.x, d.y, d.z]));
  return { fs: s, view: makeFlyer(color), ring: (i * 3 + 3) % RINGS.length, preset: PRESETS[PRESET_KEYS[i + 1]], input: { throttle: 0.7 } };
});

renderer.domElement.addEventListener('mousedown', () => { selfFly = false; });
addEventListener('keydown', (e) => {
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0) {
    preset = PRESETS[PRESET_KEYS[n]];
    const { aimYaw, aimPitch } = pilot;
    pilot = createPilot(fs, { breed: preset });
    pilot.aimYaw = aimYaw; pilot.aimPitch = aimPitch;
  }
});

const _to = new THREE.Vector3();
function nextRing(p, i) {
  _to.copy(RINGS[i]).sub(new THREE.Vector3(...p));
  return _to.length() < 60 ? (i + 1) % RINGS.length : i;
}
function ringDir(p, i) {
  _to.copy(RINGS[i]).sub(new THREE.Vector3(...p)).normalize();
  // keep clear of the ground: lift the aim when low
  const agl = p[1] - floorAt(p[0], p[2]);
  if (agl < 90) _to.y = Math.max(_to.y, 0.25);
  return _to;
}

// ------------------------------------------------------------------ HUD
const $ = (id) => document.getElementById(id);
const hud = { speed: $('speed'), alt: $('alt'), thr: $('thr'), sta: $('sta'), stall: $('stall'), aim: $('aim'), nose: $('nose') };
const _v = new THREE.Vector3();
function screen(el, x, y, z) {
  _v.set(x, y, z).project(camera);
  el.style.display = _v.z < 1 ? 'block' : 'none';
  el.style.left = ((_v.x + 1) / 2) * innerWidth + 'px';
  el.style.top = ((1 - _v.y) / 2) * innerHeight + 'px';
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let time = 0;
const aim = [0, 0, 0];
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  const c = input.read();
  if (selfFly) {
    // the demo's own pilot: point the aim at the next ring, the same way a mouse would
    myRing = nextRing(fs.p, myRing);
    const d = ringDir(fs.p, myRing);
    pilot.aimYaw = Math.atan2(-d.x, -d.z);
    pilot.aimPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    c.aimDx = c.aimDy = 0;
    c.throttleUp = true;
    c.boost = time % 9 > 7.2;
  }
  pilot.fly(dt, c);
  // ground: bounce up rather than end the demo
  const fl = floorAt(fs.p[0], fs.p[2]) + 4;
  if (fs.p[1] < fl) { fs.p[1] = fl; fs.vel[1] = Math.abs(fs.vel[1]) * 0.3; }
  me.pose(fs, dt);

  for (const b of bots) {
    b.ring = nextRing(b.fs.p, b.ring);
    const d = ringDir(b.fs.p, b.ring);
    steerToward(b.fs, [d.x, d.y, d.z], b.input, 1);
    b.input.throttle = 0.85;
    stepFlight(b.fs, b.input, dt, b.preset);
    const bf = floorAt(b.fs.p[0], b.fs.p[2]) + 4;
    if (b.fs.p[1] < bf) b.fs.p[1] = bf;
    b.view.pose(b.fs, dt);
  }

  pilot.aimDir(aim);
  cam.update(dt, fs, aim);
  hud.speed.textContent = Math.round(fs.speed * 3.6);
  hud.alt.textContent = `alt ${Math.round(fs.p[1])} m  bank ${Math.round((bankOf(fs.q) * 180) / Math.PI)}°`;
  hud.thr.style.width = Math.round(fs.throttle * 100) + '%';
  hud.sta.style.width = Math.round(fs.stamina * 100) + '%';
  hud.stall.style.opacity = fs.speed < 45 ? String(0.6 + 0.4 * Math.sin(time * 14)) : '0';
  screen(hud.aim, camera.position.x + aim[0] * 1000, camera.position.y + aim[1] * 1000, camera.position.z + aim[2] * 1000);
  const f = [0, 0, -1];
  const q = new THREE.Quaternion(...fs.q);
  _v.set(...f).applyQuaternion(q);
  screen(hud.nose, fs.p[0] + _v.x * 300, fs.p[1] + _v.y * 300, fs.p[2] + _v.z * 300);
  renderer.render(scene, camera);
  window.__demo = { speed: fs.speed, p: [...fs.p], frames: (window.__demo?.frames || 0) + 1 };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
