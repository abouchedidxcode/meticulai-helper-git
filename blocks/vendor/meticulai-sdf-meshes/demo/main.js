// Demo: a bone, a little creature, a helmet, a rock and a cut-away cave block, all written as
// signed distance fields and meshed at load time. ?fly streams a generated cave from workers.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  sphere, ellipsoid, roundBox, tube, curve, sunion, subtract, intersect, shell, rough,
  meshSDF, meshParts, ellipsoidPart, roundConePart, basisFromAxis,
  CaveField, caveTube, makeCaveLayout,
} from '../src/index.js';
import { toGeometry, withBakedAO } from '../src/geometry.js';
import { CaveStreamer } from '../src/streamer.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const stats = { mode: 'shapes', items: [] };
const statsEl = document.getElementById('stats');
window.__demo = { state: () => stats };

/** mesh a shape, time it, and record its triangle count */
function timed(name, fn) {
  const t0 = performance.now();
  const data = fn();
  const ms = Math.round(performance.now() - t0);
  stats.items.push({ name, tris: data.indices.length / 3, ms });
  return toGeometry(data);
}

if (new URLSearchParams(location.search).has('fly')) fly();
else shapes();

// ------------------------------------------------------------------ shapes

function shapes() {
  scene.background = new THREE.Color(0x2a2d33);
  scene.fog = new THREE.Fog(0x2a2d33, 7, 16);
  camera.position.set(0.2, 1.75, 4.6);
  controls.target.set(0, 0.55, -0.1);

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3f36, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-3, 5, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 15 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xa8c4ff, 0.9);
  rim.position.set(3, 2, -4);
  scene.add(rim);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const mat = (color, roughness = 0.75, metalness = 0) => withBakedAO(new THREE.MeshStandardMaterial({ color, roughness, metalness }), 0.85);
  const place = (geo, material, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // 1. A bone (Dig Site style): a bent shaft along a curve with knobbly ends, roughened.
  const shaft = tube(curve([[-0.4, 0, 0, 0.075], [-0.15, 0.035, 0, 0.055], [0.15, 0.025, 0, 0.052], [0.4, 0, 0, 0.07]], 14), 0.02);
  const headL = sunion(0.04, sphere(-0.45, 0.04, 0.0, 0.1), ellipsoid(-0.43, -0.03, 0.0, 0.08, 0.07, 0.11));
  const headR = sunion(0.03, sphere(0.47, 0.0, 0.065, 0.075), sphere(0.47, 0.0, -0.065, 0.075), ellipsoid(0.42, 0.02, 0, 0.06, 0.07, 0.1));
  const bone = rough(sunion(0.06, shaft, headL, headR), 0.0025, 22);
  const boneGeo = timed('bone', () => meshSDF(bone, [-0.6, -0.15, -0.18], [0.6, 0.16, 0.18], 0.007));
  place(boneGeo, mat(0xe6dcc4, 0.85), -1.25, 0.075, 0.75, 0.45);

  // 2. A little creature (Orbitball style, a parts list): overlapping ellipsoids and tapered limbs.
  const parts = [
    { prim: ellipsoidPart([0, 0.3, 0], [0.22, 0.2, 0.2]), k: 0 },
    { prim: ellipsoidPart([0, 0.5, 0.06], [0.15, 0.13, 0.14]), k: 0.07 },
    { prim: ellipsoidPart([0, 0.46, 0.16], [0.07, 0.05, 0.06]), k: 0.04 }, // snout
    ...[-1, 1].flatMap((s) => [
      { prim: roundConePart([0.1 * s, 0.22, 0.05], [0.13 * s, 0.03, 0.08], 0.06, 0.045), k: 0.04 }, // legs
      { prim: roundConePart([0.08 * s, 0.6, 0.02], [0.16 * s, 0.76, -0.02], 0.045, 0.02), k: 0.03 }, // ears
      { prim: ellipsoidPart([0.06 * s, 0.54, 0.17], [0.028, 0.028, 0.02]), op: 'sub', k: 0.012 }, // eye sockets
    ]),
    { prim: roundConePart([0, 0.24, -0.16], [0, 0.42, -0.34], 0.05, 0.02), k: 0.05 }, // tail
    { prim: ellipsoidPart([0, 0.3, 0.08], [0.16, 0.14, 0.14], basisFromAxis([0, 1, 0.3])), k: 0.05 }, // belly
  ];
  const critter = timed('creature', () => meshParts(parts, { cell: 0.0065, ao: true }));
  place(critter, mat(0x4fa3a0, 0.55), -0.55, 0, 1.25, 0.35);
  // eyes: plain spheres in the sockets
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), eyeMat);
    eye.position.set(0.06 * s, 0.54, 0.165);
    scene.children[scene.children.length - 1].add(eye);
  }

  // 3. A helmet: an ellipsoid shell with a visor cut out and a crest blended on top.
  const dome = shell(ellipsoid(0, 0.22, 0, 0.2, 0.22, 0.23), 0.025);
  const cutBottom = roundBox(0, -0.05, 0, 0.4, 0.2, 0.4, 0);
  const visor = roundBox(0, 0.2, 0.2, 0.15, 0.06, 0.12, 0.04);
  const fin = roundBox(0, 0.36, -0.02, 0.016, 0.16, 0.28, 0.012);
  const crest = intersect(0.01, fin, ellipsoid(0, 0.22, 0, 0.225, 0.262, 0.262));
  const helmet = sunion(0.02, subtract(0.015, dome, cutBottom, visor), crest);
  const helmetGeo = timed('helmet', () => meshSDF(helmet, [-0.25, 0.1, -0.27], [0.25, 0.5, 0.27], 0.006));
  place(helmetGeo, mat(0xb8402f, 0.35, 0.1), 0.95, 0.0, 1.15, -0.5);

  // 4. A rock: lumpy blended spheres with relief.
  const rock = rough(sunion(0.08, sphere(0, 0.16, 0, 0.2), sphere(0.14, 0.1, 0.05, 0.14), sphere(-0.1, 0.09, -0.08, 0.15)), 0.025, 9);
  const rockGeo = timed('rock', () => meshSDF(rock, [-0.33, -0.05, -0.3], [0.37, 0.42, 0.3], 0.01));
  place(rockGeo, mat(0x8d8a82, 0.95), 1.6, -0.02, 0.55, 0.2);

  // 5. A cave block: a 24 m cube of rock with tunnels (a CaveField) cut through it, scaled down.
  const field = new CaveField({
    seed: 11,
    tubes: [
      caveTube([-16, 2, 4], [-2, -1, 1], 4.2, 5.2),
      caveTube([-2, -1, 1], [6, -4, -6], 5.2, 4.4),
      caveTube([6, -4, -6], [16, -6, -4], 4.4, 4),
      caveTube([2, 16, 4], [-1, 0, 1], 3.6, 4.2, 'neck'), // a shaft from the top
      caveTube([5, 4, 5], [7, 2, 7], 6, 5, 'chamber'),
      caveTube([-4, -6, -16], [-3, -5, -4], 3.4, 3.8),
    ],
  });
  // the rock cube, roughened, with one corner cut away so you can see the tunnels inside
  const cube = rough(roundBox(0, 0, 0, 12, 12, 12, 0.8), 0.35, 0.22);
  const block = subtract(0.3, intersect(0, cube, (x, y, z) => field.sdf(x, y, z)), roundBox(7, 7, 7, 7, 7, 7, 0.3));
  const caveGeo = timed('cave block', () => meshSDF(block, [-12.2, -12.2, -12.2], [12.2, 12.2, 12.2], 0.4, { narrowBand: false, aoDist: 3 }));
  const cave = place(caveGeo, mat(0xb39a7c, 0.95), 0.25, 0.75, -0.7, -0.55);
  cave.scale.setScalar(0.062);
  // a warm light inside the tunnels so the cut-away reads
  const glow = new THREE.PointLight(0xffb066, 1.6, 1.4, 1.5);
  glow.position.set(0.25, 0.72, -0.62);
  scene.add(glow);

  let turn = 0;
  const spinners = [cave];
  statsEl.textContent = stats.items.map((i) => `${i.name}: ${i.tris} tris, ${i.ms} ms`).join(' | ');
  renderer.setAnimationLoop((t) => {
    turn = t / 1000;
    for (const s of spinners) s.rotation.y = -0.55 + Math.sin(turn * 0.25) * 0.2;
    controls.update();
    renderer.render(scene, camera);
  });
}

// ------------------------------------------------------------------ fly through a streamed cave

function fly() {
  stats.mode = 'fly';
  scene.background = new THREE.Color(0x0a1418);
  scene.fog = new THREE.Fog(0x0a1418, 20, 75);
  scene.add(new THREE.HemisphereLight(0x8fb7c8, 0x2a2018, 1.8));
  const lamp = new THREE.PointLight(0xfff0d8, 160, 60, 1.6);
  scene.add(lamp);
  const layout = makeCaveLayout(1234);
  const material = withBakedAO(new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.95 }), 0.9);
  const streamer = new CaveStreamer({ seed: layout.seed, tubes: layout.tubes, floorY: layout.floorY }, { material });
  scene.add(streamer.group);
  const path = new THREE.CatmullRomCurve3(layout.path.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  const len = path.getLength();
  const p = new THREE.Vector3(), ahead = new THREE.Vector3();
  controls.enabled = false;
  const t0 = performance.now();
  renderer.setAnimationLoop(() => {
    const s = ((performance.now() - t0) / 1000) * 7; // 7 m/s
    const u = Math.min(0.999, (s % len) / len);
    path.getPointAt(u, p);
    path.getPointAt(Math.min(1, u + 0.01), ahead);
    camera.position.copy(p).add(new THREE.Vector3(0, 1.5, 0));
    camera.lookAt(ahead);
    lamp.position.copy(camera.position);
    streamer.update(p);
    stats.chunks = streamer.ready;
    stats.workers = streamer.workers.length;
    stats.inRock = streamer.field.density(camera.position.x, camera.position.y, camera.position.z) > 0;
    statsEl.textContent = `chunks built: ${streamer.ready}, workers: ${streamer.workers.length}`;
    renderer.render(scene, camera);
  });
}
