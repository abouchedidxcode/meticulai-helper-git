// Demo: 30 marbles pour down a seeded run (pegs, a spinner, a banked helix turn, a coin-funnel bowl) at the
// game's 60 Hz with 4 substeps. A second, hidden copy of the world runs the same ticks; the HUD compares the two
// state hashes every tick to show the simulation is deterministic. ?seed=N picks another run. Drag to orbit.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World, makeBody, stepWorld, stateHash } from '../src/index.js';
import { buildSampleTrack } from '../src/sample-track.js';
import { colliderMesh, syncMesh } from '../src/view.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 1);
const COUNT = 30;
const STALL_S = 6; // a marble that barely moves for this long goes back to the top (the game used 12 s)

// ---------------------------------------------------------------- simulation (twice, to compare)
function makeSim() {
  const track = buildSampleTrack(SEED);
  const world = new World(track.colliders);
  const bodies = [];
  const stall = new Float64Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const b = makeBody(i);
    b.r = 0.5;
    place(track, b);
    // Stagger the start: later marbles wait a little above their slot (kept inactive).
    b.active = i < 10;
    bodies.push(b);
  }
  let tick = 0;
  function step() {
    // Release the waiting marbles in two waves.
    if (tick === 90) for (let i = 10; i < 20; i++) bodies[i].active = true;
    if (tick === 180) for (let i = 20; i < COUNT; i++) bodies[i].active = true;
    stepWorld(world, bodies, tick * world.tickDt);
    tick++;
    for (const b of bodies) {
      if (!b.active) continue;
      const slow = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz < 0.16;
      stall[b.id] = slow ? stall[b.id] + world.tickDt : 0;
      if (b.y < track.killY || stall[b.id] > STALL_S) {
        place(track, b);
        stall[b.id] = 0;
      }
    }
  }
  return { track, world, bodies, step, get tick() { return tick; } };
}

function place(track, b) {
  const s = track.spawn(b.id % 20);
  b.x = s[0]; b.y = s[1]; b.z = s[2];
  b.vx = b.vy = b.vz = 0;
  b.groundT = 1;
}

const sim = makeSim();
const twin = makeSim();

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2520);
scene.fog = new THREE.Fog(0x2a2520, 70, 140);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
camera.position.set(33, 30, -9);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(3, 11, 14);
controls.enableDamping = true;
controls.update();

scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3b2f25, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-18, 40, 10);
sun.target.position.set(3, 8, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// A floor far below (a table top) so the run reads as a toy.
const table = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 }));
table.rotation.x = -Math.PI / 2;
table.position.y = sim.track.bowl.c[1] - 14;
table.receiveShadow = true;
scene.add(table);

const MATS = {
  floor: new THREE.MeshStandardMaterial({ color: 0xd9b27c, roughness: 0.65 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.7 }),
  peg: new THREE.MeshStandardMaterial({ color: 0xc8432f, roughness: 0.45 }),
  spinner: new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.4 }),
  turn: new THREE.MeshStandardMaterial({ color: 0xe8d8b8, roughness: 0.55 }),
  post: new THREE.MeshStandardMaterial({ color: 0xe0b23a, roughness: 0.5 }),
  slick: new THREE.MeshStandardMaterial({ color: 0x2e8c7e, roughness: 0.25, metalness: 0.05 }),
  tray: new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.7 }),
};
const moving = [];
for (const col of sim.track.colliders) {
  const mesh = colliderMesh(col, MATS[col.tag] || MATS.floor);
  scene.add(mesh);
  if (col.motion) moving.push([mesh, col]);
}

// Marbles: one instanced mesh, glassy colours.
const marbleGeo = new THREE.SphereGeometry(0.5, 24, 16);
const marbleMat = new THREE.MeshPhysicalMaterial({ roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0 });
const marbles = new THREE.InstancedMesh(marbleGeo, marbleMat, COUNT);
marbles.castShadow = true;
const palette = [0xe85d4a, 0xf2b134, 0x4fb3bf, 0x7d5ba6, 0x5aa36a, 0xf07c9e, 0x3d7cc9, 0xf5f0e6];
const tmpC = new THREE.Color();
for (let i = 0; i < COUNT; i++) marbles.setColorAt(i, tmpC.setHex(palette[i % palette.length]));
scene.add(marbles);
const m4 = new THREE.Matrix4();
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------------------------------------------------------------- loop
const hud = document.getElementById('hud');
let acc = 0, last = performance.now(), match = true, firstMismatch = -1, hash = '';
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= sim.world.tickDt) {
    sim.step();
    twin.step();
    hash = stateHash(sim.bodies);
    if (match && hash !== stateHash(twin.bodies)) { match = false; firstMismatch = sim.tick; }
    acc -= sim.world.tickDt;
  }
  for (const [mesh, col] of moving) syncMesh(mesh, col);
  for (const b of sim.bodies) {
    if (b.active) m4.makeTranslation(b.x, b.y, b.z);
    marbles.setMatrixAt(b.id, b.active ? m4 : hidden);
  }
  marbles.instanceMatrix.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
  hud.innerHTML = `<b>Marble physics</b> &middot; seed ${SEED} &middot; tick ${sim.tick}<br>state hash ${hash} &middot; twin simulation: ${match ? 'identical every tick' : 'DIFFERENT from tick ' + firstMismatch}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__demo = {
  state: () => ({ tick: sim.tick, hash, twinMatch: match, active: sim.bodies.filter((b) => b.active).length }),
};
