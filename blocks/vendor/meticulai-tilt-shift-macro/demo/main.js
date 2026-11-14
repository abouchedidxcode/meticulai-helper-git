// Demo: the Meticulai looks test scene shot as a macro photograph of a toy diorama.
// Keys: T tilt off / on / strong, F band (tilt-shift) or diorama (shallow real focus), Q quality, N night,
// Space flash, P pause the orbit. URL: ?shot=1 (fixed pose for screenshots), ?q=high|medium|low, ?tilt=off|on|strong,
// ?mode=band|diorama.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTestScene } from './test-scene.js';
import { TiltShiftLens, createLensRenderer, TILT_PREF, TILT_SHOTS } from '../src/lens.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');

// Toy materials: lacquered paint on the props and the figure, a matte felt ground (a painted toy reads as a toy).
function toyMaterial(role, color) {
  if (role === 'ground') return new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  if (role === 'stone' || role === 'far') return new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 });
}

const renderer = createLensRenderer();
document.body.appendChild(renderer.domElement);
const t = createTestScene({ makeMaterial: toyMaterial });
const { scene, camera, sun } = t;

// A soft procedural room for reflections on the lacquer (no image files).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
pmrem.dispose();

// High, looking down, on a fairly long lens: the classic tilt-shift miniature viewpoint.
camera.fov = 32;
const target = t.focus.clone();
const orbit = { angle: 0.72, radius: 10.5, height: 4.6 };
function placeCamera() {
  camera.position.set(target.x + Math.sin(orbit.angle) * orbit.radius, orbit.height, target.z + Math.cos(orbit.angle) * orbit.radius);
  camera.lookAt(target.x, target.y + 0.75, target.z - 1.5);
}
placeCamera();
t.hemi.intensity = 0.6; // a little less sky fill so the sun models the toys

const lens = new TiltShiftLens(renderer, scene, camera, {
  quality: params.get('q') || 'high',
  sun,
  adaptive: !shot, // screenshots: keep full resolution even on a slow headless machine
  tilt: TILT_PREF[params.get('tilt')] ?? TILT_PREF.on,
  exposure: 1.15, // this scene is lit by a sun and a sky light, not a photographed room: a little brighter
});
let mode = params.get('mode') === 'diorama' ? 'diorama' : 'band';
let paused = shot;

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  lens.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

const hud = document.getElementById('hud');
const prefName = () => Object.keys(TILT_PREF).find((k) => TILT_PREF[k] === lens.tiltPref);
function showHud() {
  if (shot) {
    hud.style.display = 'none';
    return;
  }
  hud.textContent = `Tilt-shift macro: ${mode} | tilt ${prefName()} | quality ${lens.quality} x${lens.resScale.toFixed(2)}`
    + ` | T tilt, F band/diorama, Q quality, N night, Space flash, P orbit`;
}
showHud();
lens.onQualityChange = showHud;

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 't') {
    const order = ['off', 'on', 'strong'];
    lens.tiltPref = TILT_PREF[order[(order.indexOf(prefName()) + 1) % 3]];
  } else if (k === 'f') mode = mode === 'band' ? 'diorama' : 'band';
  else if (k === 'q') {
    const order = ['high', 'medium', 'low'];
    lens.setQuality(order[(order.indexOf(lens.quality) + 1) % 3]);
  } else if (k === 'n') {
    lens.setNight(!lens.night);
    sun.intensity = lens.night ? 0.3 : 2.6;
    t.hemi.intensity = lens.night ? 0.15 : 0.6;
  } else if (k === ' ') lens.flash(1);
  else if (k === 'p') paused = !paused;
  showHud();
});

// Focus on the figure every frame; the band follows it across the screen.
function aimLens(time) {
  if (mode === 'diorama') {
    // Shallow real focus a little behind the figure (toward the props), band only at the frame's edges.
    const ahead = target.clone().add(new THREE.Vector3(0.6, 0, -1.2));
    lens.focusOn(ahead, 'diorama');
  } else {
    lens.focusOn(target, 'establishing', { roll: TILT_SHOTS.establishing.roll * Math.sin(time * 0.2) });
  }
}

lens.warmUp();
const demo = (window.__demo = { ready: false, frames: 0, info: null });
const timer = new THREE.Timer();
let orbitTime = 0;
let first = true;
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const time = shot ? 1.3 : timer.getElapsed();
  if (!paused) {
    orbitTime += dt;
    orbit.angle = 0.72 + Math.sin(orbitTime * 0.12) * 0.5;
    placeCamera();
  }
  t.update(time);
  aimLens(time);
  if (first || shot) {
    lens.settle();
    first = false;
  }
  lens.render(dt);
  demo.frames++;
  if (demo.frames > 3) demo.ready = true;
  demo.info = { quality: lens.quality, resScale: lens.resScale, mode, tilt: lens.tiltPref };
  if (demo.frames % 30 === 0) showHud();
});
