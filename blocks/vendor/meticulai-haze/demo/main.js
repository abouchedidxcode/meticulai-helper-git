// Demo: the shared looks test scene outdoors at dawn, with far ridges added here so the haze has distance to work on.
// Keys: H haze on/off, [ ] thinner/thicker, T tone map (neutral/agx/aces), D dive streak, R sun shafts.
import * as THREE from 'three';
import { createTestScene, COLORS } from './test-scene.js';
import { createHazeAtmosphere, createHazePost, hazeUniform, dirFromAngles, halfwayDistance } from '../src/index.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const hud = document.getElementById('hud');
if (shot) hud.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const t = createTestScene();
const { scene, camera } = t;
scene.remove(t.sun, t.sun.target, t.hemi); // the haze atmosphere brings its own key and fill
scene.background = null; // the sky dome draws the background
camera.far = 9000;
camera.lookAt(0, 1.6, -0.6);
camera.updateProjectionMatrix();

// The sun disc sits low on the left, above the hills, so the haze on that side glows gold. The light comes from higher up
// and further round (the same cheat Hezarfen uses: long shadows, yet the faces we see are lit).
const sunDir = dirFromAngles(-48, 11);
const lightDir = dirFromAngles(-118, 21);
// The test scene is small (hills at 50-150 m), so the demo treats one unit as 10 m: the same air, at diorama scale.
// Hezarfen itself runs at metresPerUnit 1 over a 7 km city. ?scale=1 shows the real-scale numbers.
const metresPerUnit = Number(params.get('scale') ?? 10);
const atmo = createHazeAtmosphere({
  scene, renderer, sunDir, lightDir, metresPerUnit,
  shadowSize: 2048, shadowRadius: 16, shadowDistance: 60,
});

// ---- far land: a big ground and layered ridges behind the test scene's hills (this is what the haze is for) ----
const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.9 });
const farGround = new THREE.Mesh(new THREE.CircleGeometry(7000, 64).rotateX(-Math.PI / 2), groundMat);
farGround.position.y = -0.02;
farGround.receiveShadow = true;
scene.add(farGround);

// Every kind of material goes through the same air: standard, lambert, basic and a custom ShaderMaterial(fog: true).
const ridgeMats = [
  new THREE.MeshStandardMaterial({ color: COLORS.far, roughness: 0.95 }),
  new THREE.MeshLambertMaterial({ color: 0x6f8a78 }),
  new THREE.MeshStandardMaterial({ color: 0x86977a, roughness: 0.95 }),
  new THREE.MeshLambertMaterial({ color: 0x7c8f84 }),
];
const custom = new THREE.ShaderMaterial({
  fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(0x5d6f66) } }]),
  vertexShader: /* glsl */ `
    #include <fog_pars_vertex>
    varying float vH;
    void main() {
      vH = position.y;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    varying float vH;
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(uColor * (0.55 + 0.45 * vH), 1.0);
      #include <fog_fragment>
    }`,
});
const hillGeo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const heading = Math.atan2(-(camera.position.x - 0), camera.position.z + 0.6); // the camera looks this way (bearing, radians)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rows = [
  [180, 9, 30, 1], [260, 11, 42, 2], [380, 12, 60, 'custom'], [600, 13, 90, 3],
];
for (const [dist, n, h, m] of rows) {
  for (let i = 0; i < n; i++) {
    const spread = (i / (n - 1) - 0.5) * 2.2; // radians either side of the view
    const a = heading + spread + (rnd() - 0.5) * 0.12;
    const d = dist * (0.9 + rnd() * 0.2);
    const hill = new THREE.Mesh(hillGeo, m === 'custom' ? custom : ridgeMats[m]);
    hill.position.set(Math.sin(a) * d, 0, -Math.cos(a) * d);
    hill.scale.set(dist * (0.16 + rnd() * 0.12), h * (0.6 + rnd() * 0.7), dist * 0.1);
    hill.rotation.y = -a;
    scene.add(hill);
  }
}
// a line of posts (MeshBasicMaterial: unlit, but still hazed) marching away
const postMat = new THREE.MeshBasicMaterial({ color: 0x3a3430 });
const postGeo = new THREE.CylinderGeometry(0.3, 0.35, 9, 8);
for (let i = 0; i < 14; i++) {
  const d = 22 * Math.pow(1.25, i);
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.set(-12 - d * 0.45, 4.5, -8 - d);
  scene.add(post);
}

// ---- the final picture ----
const post = createHazePost({ renderer, scene, camera });
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h, renderer.getPixelRatio());
}
addEventListener('resize', resize);
resize();

const toneMaps = ['neutral', 'agx', 'aces'];
let tm = 0;
let hazeOn = true;
let density = Number(params.get('density') ?? 1);
let dive = 0;
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'h') hazeOn = !hazeOn;
  if (k === '[') density = Math.max(0, density - 0.25);
  if (k === ']') density = Math.min(4, density + 0.25);
  if (k === 't') post.toneMap = toneMaps[(tm = (tm + 1) % 3)];
  if (k === 'd') dive = dive ? 0 : 1;
  if (k === 'r') post.rays.enabled = !post.rays.enabled;
});

renderer.compile(scene, camera);
const demo = (window.__demo = { ready: false, frames: 0, info: null });
const timer = new THREE.Timer();
const focus = new THREE.Vector3(0, 0, -1);
renderer.setAnimationLoop(() => {
  timer.update();
  const time = shot ? 1.3 : timer.getElapsed();
  const dt = shot ? 1 / 60 : Math.min(timer.getDelta(), 0.1);
  t.update(time);
  scene.fog.density = hazeOn ? density : 0;
  atmo.update(time, focus);
  post.speed += ((dive ? 1 : 0) - post.speed) * Math.min(1, dt * 3);
  post.updateSun(atmo.sunDir);
  post.render(dt, time);
  demo.frames++;
  if (demo.frames === 4) {
    demo.ready = true;
    demo.info = {
      programs: renderer.info.programs.length,
      materials: [...new Set(renderer.info.programs.map((p) => p.type || p.name))],
      halfwayAtEyeHeight: Math.round(halfwayDistance(hazeUniform.value, 1.7)), // in world units
    };
  }
  if (!shot && demo.frames % 15 === 0) {
    hud.textContent = `Haze (from Hezarfen) - H haze ${hazeOn ? 'on' : 'off'}  [ ] thickness ${density.toFixed(2)}  T tone map ${toneMaps[tm]}  D dive streak  R sun shafts ${post.rays.enabled ? 'on' : 'off'}`;
  }
});
