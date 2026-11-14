// Demo: an ink figure runs about (toward the mouse on the ground, or laps of a circle when the mouse is still) and
// hops now and then. Everything that trails is a Chain3 with Inkbound's preset numbers scaled to metres: two scarf
// tails, a ponytail, two headband ribbons and two sash ends, in the game's wind. A glowing orb loops overhead
// dragging three long ribbons. Nothing is animated by hand: the chains only know where they are pinned.
import * as THREE from 'three';
import { Chain3, PRESETS, gameWind, scaled } from '../src/index.js';
import { RibbonMesh } from '../src/ribbon-mesh.js';

const U = 0.007; // metres per game pixel (a 250 px fighter = 1.75 m)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e0cc);
scene.fog = new THREE.Fog(0xe9e0cc, 14, 40);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 100);

scene.add(new THREE.HemisphereLight(0xfff6e6, 0xb8a888, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-4, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
scene.add(sun, sun.target);

// Paper ground with faint ink rings so motion reads.
const cv = document.createElement('canvas');
cv.width = cv.height = 512;
const g2 = cv.getContext('2d');
g2.fillStyle = '#efe6d2';
g2.fillRect(0, 0, 512, 512);
g2.strokeStyle = 'rgba(60,45,35,0.10)';
g2.lineWidth = 3;
for (let i = 0; i < 9; i++) { g2.beginPath(); g2.arc(256, 256, 30 + i * 28, 0, 7); g2.stroke(); }
const tex = new THREE.CanvasTexture(cv);
tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
tex.repeat.set(12, 12);
tex.colorSpace = THREE.SRGBColorSpace;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------- the figure (primitives)
const ink = new THREE.MeshStandardMaterial({ color: 0x23201e, roughness: 0.7 });
const fig = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 6, 12), ink);
body.position.y = 1.08;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), ink);
head.position.y = 1.62;
const legGeo = new THREE.CapsuleGeometry(0.075, 0.6, 4, 8);
const legL = new THREE.Mesh(legGeo, ink), legR = new THREE.Mesh(legGeo, ink);
legL.position.set(0.1, 0.42, 0); legR.position.set(-0.1, 0.42, 0);
const armGeo = new THREE.CapsuleGeometry(0.06, 0.5, 4, 8);
const armL = new THREE.Mesh(armGeo, ink), armR = new THREE.Mesh(armGeo, ink);
armL.position.set(0.27, 1.12, 0); armR.position.set(-0.27, 1.12, 0);
for (const m of [body, head, legL, legR, armL, armR]) { m.castShadow = true; fig.add(m); }
scene.add(fig);

// ---------------------------------------------------------------- chains
const RED = new THREE.MeshStandardMaterial({ color: 0xc23b2a, roughness: 0.75, side: THREE.DoubleSide });
const CREAM = new THREE.MeshStandardMaterial({ color: 0xf7f1e3, roughness: 0.8, side: THREE.DoubleSide });
const DARK = new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.6, side: THREE.DoubleSide });
const NAVY = new THREE.MeshStandardMaterial({ color: 0x2f4a7a, roughness: 0.8, side: THREE.DoubleSide });
// [preset, pin in figure space (x right, y up, z forward), material]
const WEAR = [
  ['scarf', [0.05, 1.42, -0.12], RED],
  ['scarf2', [-0.05, 1.40, -0.12], RED],
  ['ponytail', [0, 1.7, -0.13], DARK],
  ['headbandRibbon', [0.04, 1.66, -0.14], CREAM],
  ['headbandRibbon2', [-0.04, 1.65, -0.14], CREAM],
  ['sash', [0.08, 0.92, -0.2], NAVY],
  ['sashShort', [-0.06, 0.9, -0.2], NAVY],
];
const worn = WEAR.map(([name, pin, mat]) => {
  const p = scaled(PRESETS[name], U);
  const ch = new Chain3(p.n, p.seg, p.grav, p.drag, p.stiff);
  const mesh = new RibbonMesh(ch, { w0: p.w0, w1: p.w1, tip: p.tip, material: mat });
  mesh.castShadow = true;
  scene.add(mesh);
  return { p, ch, mesh, pin: new THREE.Vector3(...pin) };
});

// The orb: three long, light ribbons (headband ribbons made 12 nodes long).
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb340, emissiveIntensity: 1.2 }));
orb.castShadow = true;
scene.add(orb);
const orbTails = [CREAM, RED, NAVY].map((mat, i) => {
  const p = scaled(PRESETS.headbandRibbon, U * 1.4);
  const ch = new Chain3(12, p.seg, p.grav, p.drag, 0);
  const mesh = new RibbonMesh(ch, { w0: p.w0 * 2.4, w1: p.w1 * 1.5, tip: p.tip, material: mat });
  scene.add(mesh);
  return { ch, mesh, off: (i - 1) * 0.07 };
});

// ---------------------------------------------------------------- motion
const pos = new THREE.Vector3(5.5, 0, 0), vel = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, 1);
const target = new THREE.Vector3();
let hopT = 0, hopV = 0, hopY = 0, time = 0, mouseT = -10, nextHop = 1.2;
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
const mouseGround = new THREE.Vector3();
addEventListener('pointermove', (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, mouseGround)) mouseT = time;
});

const tmp = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const rest = new THREE.Vector3(), wind = new THREE.Vector3();
const camPos = new THREE.Vector3(1.6, 2.0, 4.4), camSide = new THREE.Vector3(-1, 0, 0);

function update(dt) {
  time += dt;
  // Target: the mouse on the ground, or a figure-of-eight.
  if (time - mouseT < 2) target.copy(mouseGround);
  else target.set(Math.cos(time * 0.9 + 0.7) * 5.5, 0, Math.sin(time * 0.9 + 0.7) * 5.5); // laps of a circle
  tmp.subVectors(target, pos).setY(0);
  const dist = tmp.length();
  const want = dist > 0.3 ? tmp.multiplyScalar(Math.min(5.5, dist * 3) / dist) : tmp.set(0, 0, 0);
  vel.lerp(want, 1 - Math.exp(-dt * 4));
  pos.addScaledVector(vel, dt);
  const speed = vel.length();
  if (speed > 0.3) fwd.lerp(tmp.copy(vel).normalize(), 1 - Math.exp(-dt * 8)).normalize();
  // Hops.
  nextHop -= dt;
  if (nextHop <= 0 && hopY === 0) { hopV = 4.2; nextHop = 1.6 + (Math.sin(time * 7.1) + 1) * 0.8; }
  if (hopV !== 0 || hopY > 0) { hopV -= 18 * dt; hopY = Math.max(0, hopY + hopV * dt); if (hopY === 0) hopV = 0; }
  hopT += dt * speed * 2.2;

  // Pose the figure: face along fwd, lean into speed, stride.
  fig.position.set(pos.x, hopY + Math.abs(Math.sin(hopT)) * 0.05 * Math.min(1, speed / 3), pos.z);
  fig.rotation.set(0, Math.atan2(fwd.x, fwd.z), 0);
  body.rotation.x = Math.min(0.35, speed * 0.06);
  const stride = Math.sin(hopT) * Math.min(0.9, speed * 0.2);
  legL.rotation.x = stride; legR.rotation.x = -stride;
  armL.rotation.x = -stride * 0.8; armR.rotation.x = stride * 0.8;
  fig.updateMatrixWorld(true);

  // Wind: the game's gusts (px/s^2 -> m/s^2), sideways along world X, the facing push against fwd, lift up.
  right.crossVectors(up, fwd).normalize();
  const [wx, wy] = gameWind(time, 1);
  for (const w of worn) {
    const pin = tmp.copy(w.pin).applyMatrix4(fig.matrixWorld);
    // Rest direction: the preset's (back, down), turned to face the way the figure faces.
    rest.copy(fwd).multiplyScalar(w.p.rest[0]).addScaledVector(up, w.p.rest[1]).normalize();
    wind.set((wx + 60) * U * w.p.wind, wy * U * w.p.wind, 0).addScaledVector(fwd, -60 * U * w.p.wind);
    w.ch.step(pin, rest, dt, wind, 0);
  }
  // Orb: loops above and around, its tails trailing.
  const a = time * 1.5;
  orb.position.set(Math.cos(a) * 2 + pos.x + camSide.x * 3, 2.2 + Math.sin(a * 2.3) * 0.4, Math.sin(a) * 2 + pos.z + camSide.z * 3);
  for (const t of orbTails) {
    t.ch.step([orb.position.x + t.off, orb.position.y, orb.position.z + t.off], [0, -1, 0], dt, [wx * U, wy * U * 0.3, 0], 0);
  }
  // Camera: a loose follow from the figure's side (where trailing cloth reads best), swinging round slowly.
  camSide.lerp(right, 1 - Math.exp(-dt * 3)).normalize();
  camPos.lerp(tmp.copy(pos).addScaledVector(camSide, -4.6).addScaledVector(fwd, 1.2).setY(2.0), 1 - Math.exp(-dt * 6));
  camera.position.copy(camPos);
  camera.lookAt(pos.x, 1.35, pos.z);
  sun.position.set(pos.x - 4, 9, pos.z + 5);
  sun.target.position.copy(pos);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  for (const w of worn) w.mesh.update(camera);
  for (const t of orbTails) t.mesh.update(camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const hud = document.getElementById('hud');
hud.innerHTML = '<b>Rope and cloth chains</b> &middot; move the mouse over the ground to lead the runner';

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__demo = {
  state: () => ({ t: +time.toFixed(2), speed: +vel.length().toFixed(2), scarfLen: +worn[0].ch.length().toFixed(3), restLen: +(worn[0].p.seg * (worn[0].p.n - 1)).toFixed(3) }),
};
