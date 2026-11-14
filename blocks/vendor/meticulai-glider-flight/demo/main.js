// Demo: the Hezarfen glider over the sample world (a launch hill, a ridge, a lake, a landing field), with the thermals
// drawn as faint columns under little clouds. The autopilot flies the route until you touch a key or click; then it
// is yours. K switches to kite mode (Kite Race's arcade model) and back.
import * as THREE from 'three';
import { createGlider, TUNE } from '../src/glider.js';
import { createAutopilot, touchdown } from '../src/autopilot.js';
import { createInput } from '../src/input.js';
import { KiteGlider } from '../src/kite.js';
import { createSampleWorld, SAMPLE_ROUTE } from '../src/sample-world.js';

const params = new URLSearchParams(location.search);
const world = createSampleWorld();

// ------------------------------------------------------------------ renderer and scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xbcd3e6);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 700, 3600);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 6000);
scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x8a8468, 1.7));
const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
sun.position.set(0.4, 0.7, 0.5);
scene.add(sun);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ the world
const X0 = -900, X1 = 3400, Z0 = -1500, Z1 = 1500;
{
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 330, 230);
  geo.rotateX(-Math.PI / 2);
  geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grass = new THREE.Color(0x7d9a52), dry = new THREE.Color(0xb3a76a), rock = new THREE.Color(0x8c8577);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = world.heightAt(x, z);
    pos.setY(i, y);
    if (y < 1) c.set(0xcfc196);
    else c.copy(grass).lerp(dry, Math.max(0, Math.min(1, Math.sin(x * 0.004) * Math.cos(z * 0.005) * 0.5 + 0.4))).lerp(rock, Math.max(0, Math.min(1, (y - 110) / 60)));
    if (Math.hypot((x - world.landing.x) / 220, (z - world.landing.z) / 160) < 0.8) c.set(0xa9c46c); // the field
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshLambertMaterial({ color: 0x4f88a8 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  scene.add(water);
}
// trees: instanced cones, for a sense of height and speed
{
  const geo = new THREE.ConeGeometry(3.2, 11, 6);
  geo.translate(0, 5.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x4d6b3a, flatShading: true }), 2600);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; n < 2600 && i < 20000; i++) {
    const x = X0 + Math.random() * (X1 - X0), z = Z0 + Math.random() * (Z1 - Z0);
    const y = world.heightAt(x, z);
    if (y < 2 || y > 120 || Math.hypot((x - world.landing.x) / 260, (z - world.landing.z) / 200) < 1) continue;
    if (Math.sin(x * 0.011) * Math.cos(z * 0.009) < 0.1) continue; // in woods, not everywhere
    const s = 0.7 + Math.random() * 0.8;
    m.makeScale(s, s, s).setPosition(x, y - 0.5, z);
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  scene.add(mesh);
}
// thermals: faint columns that lean with the breeze, a small cloud on top
{
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8f99, transparent: true, opacity: 0.92, depthWrite: false });
  for (const t of world.thermals) {
    const ground = Math.max(0, world.heightAt(t.x, t.z));
    const h = t.top - ground;
    const geo = new THREE.CylinderGeometry(t.r * 0.55, t.r * 0.55, h, 32, 8, true);
    geo.translate(0, h / 2, 0);
    // lean: the core drifts downwind by 0.025 m per metre over 40 m (glider.js)
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const lean = Math.max(0, p.getY(i) + ground - 40) * 0.025;
      p.setX(i, p.getX(i) + world.wind.x * lean);
      p.setZ(i, p.getZ(i) + world.wind.z * lean);
    }
    const col = new THREE.Mesh(geo, mat);
    col.position.set(t.x, ground, t.z);
    scene.add(col);
    const lean = Math.max(0, t.top - 40) * 0.025;
    const cloud = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(t.r * (0.35 + Math.random() * 0.25), 12, 8), cloudMat);
      s.position.set((Math.random() - 0.5) * t.r * 1.2, Math.random() * t.r * 0.25, (Math.random() - 0.5) * t.r * 1.2);
      s.scale.y = 0.55;
      cloud.add(s);
    }
    cloud.position.set(t.x + world.wind.x * lean, t.top + 45, t.z + world.wind.z * lean);
    scene.add(cloud);
  }
}
// a windsock on the field
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.set(world.landing.x + 40, world.landing.ground + 3.5, world.landing.z + 30);
  scene.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff7a2a, side: THREE.DoubleSide }));
  sock.rotation.z = Math.PI / 2;
  sock.rotation.y = Math.atan2(-world.wind.z, world.wind.x);
  sock.position.set(pole.position.x + 1.5 * Math.sign(world.wind.x), pole.position.y + 3.2, pole.position.z);
  scene.add(sock);
}

// ------------------------------------------------------------------ the aircraft (built in code)
function makeHangGlider() {
  const g = new THREE.Group();
  const sail = new THREE.BufferGeometry();
  // a delta wing: nose forward (-Z), 10 m span
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -2.4, -5, 0, 1.2, 0, 0.25, 0.6, 0, 0, -2.4, 0, 0.25, 0.6, 5, 0, 1.2], 3));
  sail.computeVertexNormals();
  g.add(new THREE.Mesh(sail, new THREE.MeshLambertMaterial({ color: 0xe8573c, side: THREE.DoubleSide })));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  bar.position.set(0, -0.9, -0.3);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  const pilot = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.4, 4, 8), new THREE.MeshLambertMaterial({ color: 0x2d4f7a }));
  pilot.rotation.x = Math.PI / 2;
  pilot.position.set(0, -1.1, 0.4);
  g.add(pilot);
  return g;
}
function makeKite() {
  const g = new THREE.Group();
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -1.6, -1.1, 0, 0, 0, 0, 2.2, 0, 0, -1.6, 0, 0, 2.2, 1.1, 0, 0], 3));
  sail.computeVertexNormals();
  g.add(new THREE.Mesh(sail, new THREE.MeshLambertMaterial({ color: 0x3fa7d6, side: THREE.DoubleSide })));
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 4), new THREE.MeshLambertMaterial({ color: 0xffd23a }));
  tail.position.z = 4.2;
  g.add(tail);
  g.scale.setScalar(1.6);
  return g;
}
const hang = makeHangGlider();
const kiteMesh = makeKite();
scene.add(hang, kiteMesh);
kiteMesh.visible = false;

// ------------------------------------------------------------------ flight
const glider = createGlider(world, TUNE);
const kite = new KiteGlider();
const pilot = createAutopilot({ glider, world });
const input = createInput(renderer.domElement);
let mode = 'glider'; // 'glider' | 'kite'
let auto = !params.has('manual');
let result = null;
let resultT = 0;
const L = world.launch;
function launch() {
  glider.reset(new THREE.Vector3(L.x, L.y, L.z), L.heading, 15.5 * TUNE.speedScale, 2.4);
  kite.place(new THREE.Vector3(L.x, L.y, L.z), new THREE.Vector3(1, 0, 0), 15);
  if (auto) pilot.start(SAMPLE_ROUTE);
  result = null;
}
launch();
if (params.has('t')) {
  // jump ahead in the route (for screenshots): ?t=seconds
  const secs = +params.get('t');
  for (let i = 0; i < secs * 120; i++) {
    if (i % 2 === 0) pilot.update(1 / 60);
    glider.step(1 / 120, pilot.state);
  }
}
renderer.domElement.addEventListener('mousedown', () => { auto = false; pilot.stop(); input.requestLock(); });
addEventListener('keydown', (e) => {
  if (e.code === 'KeyK') { mode = mode === 'glider' ? 'kite' : 'glider'; auto = false; pilot.stop(); launch(); return; }
  if (e.code === 'KeyR') { launch(); return; }
  if (auto) { auto = false; pilot.stop(); }
});

// ------------------------------------------------------------------ chase camera: behind the flight path, eased
const camPos = new THREE.Vector3(L.x - 20, L.y + 6, L.z);
const look = new THREE.Vector3();
const _b = new THREE.Matrix4(), _up = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
function poseAircraft(obj, forward, right) {
  _f.copy(forward).normalize();
  _r.copy(right).normalize();
  _up.crossVectors(_r, _f).normalize();
  _b.makeBasis(_r, _up, _f.clone().negate());
  obj.quaternion.setFromRotationMatrix(_b);
}

// ------------------------------------------------------------------ HUD
const $ = (id) => document.getElementById(id);
const hud = { speed: $('speed'), vario: $('vario'), agl: $('agl'), ld: $('ld'), gl: $('gl'), warn: $('warn'), tag: $('tag') };
let vario = 0;

// ------------------------------------------------------------------ loop: fixed 120 Hz steps, as the game
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
let time = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  const st = input.update(dt);
  const controls = auto ? pilot.update(dt) : st;
  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    if (mode === 'glider' && !result) {
      glider.step(STEP, controls);
      result = touchdown(glider, world);
      if (result) resultT = time;
    } else if (mode === 'kite') {
      const air = glider.airAt(kite.pos.x, kite.pos.y, kite.pos.z, time, new THREE.Vector3(), (kite._info ||= {}));
      kite.step(STEP, { turn: controls.roll, climb: controls.pitch }, { power: 0, lift: Math.max(0, kite._info.lift), draft: 0 });
      const floor = Math.max(0, world.heightAt(kite.pos.x, kite.pos.z)) + 3;
      if (kite.pos.y < floor) { kite.pos.y = floor; if (kite.pitch < 0) kite.pitch = 0; } // skims the ground, never ends
    }
  }
  if (result && time - resultT > 5) { if (params.has('t')) result = null; else launch(); }

  let pos, vel, fwd, right, speed, vs, agl;
  if (mode === 'glider') {
    hang.visible = true; kiteMesh.visible = false;
    hang.position.copy(glider.pos);
    poseAircraft(hang, glider.nose, glider.wingRight);
    pos = glider.pos; vel = glider.vel; speed = glider.speed; vs = glider.vspeed; agl = glider.agl();
  } else {
    hang.visible = false; kiteMesh.visible = true;
    kiteMesh.position.copy(kite.pos);
    _r.set(Math.cos(kite.yaw), 0, Math.sin(kite.yaw)).applyAxisAngle(kite.fwd, kite.bank);
    poseAircraft(kiteMesh, kite.fwd, _r);
    pos = kite.pos; vel = kite.vel; speed = kite.speed; vs = kite.vel.y; agl = pos.y - Math.max(0, world.heightAt(pos.x, pos.z));
  }
  // camera: 13 m behind along the horizontal flight path, 3.5 m up, eased (?cam=far: further back, for a wide view)
  fwd = _f.set(vel.x, 0, vel.z);
  if (fwd.lengthSq() < 1e-4) fwd.set(1, 0, 0);
  fwd.normalize();
  const far = params.get('cam') === 'far';
  const want = new THREE.Vector3().copy(pos).addScaledVector(fwd, far ? -30 : -13).add(new THREE.Vector3(0, far ? 9 : 3.5, 0));
  camPos.lerp(want, 1 - Math.exp(-3 * dt));
  const ground = Math.max(0, world.heightAt(camPos.x, camPos.z)) + 1.5;
  if (camPos.y < ground) camPos.y = ground;
  look.copy(pos).addScaledVector(fwd, 30).add(new THREE.Vector3(0, -2, 0));
  camera.position.copy(camPos);
  camera.lookAt(look);

  vario += (vs - vario) * (1 - Math.exp(-2 * dt));
  hud.speed.textContent = Math.round(speed * 3.6);
  hud.vario.textContent = (vario >= 0 ? '+' : '') + vario.toFixed(1);
  hud.vario.className = 'n ' + (vario > 0.2 ? 'up' : vario < -1.5 ? 'down' : '');
  hud.agl.textContent = Math.round(agl);
  const gs = Math.hypot(vel.x, vel.z);
  hud.ld.textContent = vario < -0.5 ? (gs / -vario).toFixed(1) : vario > 0.2 ? 'climb' : '-';
  hud.gl.textContent = mode === 'glider' ? glider.gLoad.toFixed(1) : '-';
  const stalled = mode === 'glider' && (glider.stallBreak > 0 || glider.buffet > 0.35);
  hud.warn.textContent = result ? result.toUpperCase() : stalled ? 'STALL' : '';
  const th = mode === 'glider' ? glider.info.thermal : null;
  hud.tag.textContent = mode === 'kite' ? 'kite mode (arcade: never stalls)' : th ? `in a thermal: ${th.id}` : glider.groundEffect > 0.3 ? 'ground effect' : auto ? 'autopilot' : '';
  renderer.render(scene, camera);
  window.__demo = { mode, auto, speed, alt: pos.y, agl, result, step: pilot.current()?.do || null, frames: (window.__demo?.frames || 0) + 1 };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
