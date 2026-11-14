// Demo: a small yard after the rain, lit only by a real sky (a CC0 Poly Haven HDRI loaded at runtime), drawn
// through the whole photographic camera. Nothing here is game art: the shapes are three.js primitives and the
// only textures are Poly Haven's CC0 asphalt, fetched from its CDN (?flat=1 skips them).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PhotoRenderer, adoptObject, createGroundMaterial, polyHavenHdri, polyHavenMaps } from '../src/photoreal/index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const status = document.getElementById('status');
const pr = new PhotoRenderer({ canvas }); // quality from the device, or ?q=
const { scene, camera } = pr;
window.__demo = { ready: false, frames: 0, quality: pr.quality, errors: [] };
window.__pr = pr; // for poking at it from the console
addEventListener('error', (e) => window.__demo.errors.push(String(e.message)));

camera.fov = 42;
camera.position.set(4.2, 1.35, 6.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-0.4, 0.8, -1.2);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 2;
controls.maxDistance = 25;
controls.update();

// --- the yard ---------------------------------------------------------------------------------
const world = new THREE.Group();
scene.add(world);

// distance (metres) from a ground point to the nearest wall: grime collects there and puddles keep off it
const edgeGlsl = /* glsl */ `float srEdge( vec3 p ) { return min( abs( p.z + 4.0 ), abs( p.x + 6.0 ) ); }`;
const flat = params.get('flat') === '1';
const ground = createGroundMaterial({
  maps: flat ? null : polyHavenMaps('asphalt_04', '1k'),
  tile: 3,
  pomDepth: 0.012,
  wetness: 0.55,
  edgeGlsl,
  tint: flat ? 0x3a3936 : 0x8f8b86,
  quality: pr.q,
});
pr.setWetGround({ edgeGlsl }); // screen-space reflections in the same puddles
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), ground);
floor.receiveShadow = true;
world.add(floor);

const std = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function add(geo, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  world.add(m);
  return m;
}
// two plaster walls meeting in a corner
const plaster = std(0xc9c0b2, 0.92);
add(new THREE.BoxGeometry(16, 4.2, 0.3), plaster, 2, 2.1, -4.15);
add(new THREE.BoxGeometry(0.3, 4.2, 10), plaster, -6.15, 2.1, 1);
add(new THREE.BoxGeometry(16, 0.25, 0.36), std(0x8a8378, 0.85), 2, 0.125, -3.95); // skirting
// concrete columns
const concrete = std(0xa9a397, 0.82);
for (const [x, z] of [[-3.2, -2.6], [3.6, -2.4], [6.8, -1.4]]) add(new THREE.CylinderGeometry(0.28, 0.3, 4.2, 40), concrete, x, 2.1, z);
// crates, a painted steel cabinet, a red drum
const wood = std(0x7a5a3c, 0.74);
add(new THREE.BoxGeometry(1, 1, 1), wood, -1.6, 0.5, -1.8, 0.3);
add(new THREE.BoxGeometry(0.8, 0.8, 0.8), wood, -1.45, 1.4, -1.85, 0.75);
add(new THREE.BoxGeometry(0.9, 1.9, 0.55), std(0x2f5a7a, 0.38, 0.55), 1.2, 0.95, -3.6);
add(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 48), std(0x9a1f17, 0.42, 0.3), 2.6, 0.44, -1.3);
// spheres: mirror steel, copper, white plastic
add(new THREE.SphereGeometry(0.5, 64, 32), std(0xffffff, 0.04, 1), 0.2, 0.5, 0.2);
add(new THREE.SphereGeometry(0.38, 64, 32), std(0xb87333, 0.28, 1), 1.55, 0.38, 0.9);
add(new THREE.SphereGeometry(0.3, 64, 32), std(0xf2f0ea, 0.45), -0.85, 0.3, 1.1);
adoptObject(world); // PCSS shadows + box-projected reflections for every standard material

// --- light: one real sky -----------------------------------------------------------------------
const sky = params.get('sky') || 'kloofendal_48d_partly_cloudy_puresky';
await pr.setSky(polyHavenHdri(sky, params.get('res') || '1k'), {
  sunAzimuth: 0.45, // radians, 0 = +x, PI/2 = +z: low from the right, so shadows rake across the yard onto the walls
  sunScale: 1.6, // CANDID's afternoon
  haze: 0.002,
  glow: 0.25,
});
pr.setWetness(0.55);
pr.setShadowArea(new THREE.Box3(new THREE.Vector3(-8, -0.5, -5), new THREE.Vector3(10, 5, 6)));
status.textContent = 'capturing the bounce light...';
await pr.captureProbe(new THREE.Vector3(0.5, 1.8, 0), new THREE.Vector3(-6, 0, -4), new THREE.Vector3(10, 8, 12));
status.textContent = `quality: ${pr.quality}`;

// --- controls -----------------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
$('wet').oninput = (e) => {
  const w = Number(e.target.value);
  ground.userData.surface.srWet.value = w;
  pr.setWetness(w);
};
$('ev').oninput = (e) => (pr.exposure.compensation = Number(e.target.value));
$('fstop').oninput = (e) => {
  pr.aperture = Number(e.target.value);
  $('fval').textContent = pr.aperture;
};
addEventListener('keydown', (e) => e.code === 'KeyH' && $('panel').classList.toggle('hide'));
if (params.get('ui') === '0') $('panel').classList.add('hide');

// click to focus: depth of field on what you clicked
const ray = new THREE.Raycaster();
let focusPoint = controls.target.clone();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(world.children, false)[0];
  if (hit) focusPoint = hit.point;
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  controls.update();
  pr.focusOn(focusPoint);
  pr.render(dt);
  window.__demo.frames++;
  if (window.__demo.frames > 5) window.__demo.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
