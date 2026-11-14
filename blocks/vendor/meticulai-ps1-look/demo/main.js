// PS1 look demo: the shared Meticulai looks test scene drawn through the PS1 pipeline.
// ?dread=1 starts with dread on, ?blind=1 closes the eyes after a few frames (shows the afterimage).
// ?preset=dusk (default: the test scene's daylight, sky-coloured fog) or ?preset=horror (Don't Blink's own air:
// black fog, a flashlight, almost no ambient). ?shot=1 freezes time for screenshots.
// Keys: Space (hold) eyes closed, C close eyes slowly, F flash, S shake, D dread on/off, P punch,
//       G horror grade on/off, L letterbox on/off, W affine warp on/off.
import * as THREE from 'three';
import { createTestScene, COLORS } from './test-scene.js';
import {
  PS1Pipeline, createPS1Material, makePS1Texture, applyPS1Atmosphere, PS1_DEFAULTS, NEUTRAL_GRADE, GAME_NOTES,
} from '../src/index.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const preset = params.get('preset') === 'horror' ? 'horror' : 'dusk';

const ps1 = new PS1Pipeline({ container: document.body });
const renderer = ps1.renderer;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// Each role of the test scene gets a tiny nearest-filtered texture, tinted by the role colour.
const LOOK = {
  ground: ['tiles', [60, 60]],
  stone: ['bricks', [2, 2]],
  prop: ['planks', [1, 1]],
  accent: ['noise', [4, 1]],
  figure: ['cloth', [1, 1]],
  skin: ['skin', [1, 1]],
  far: ['grass', [6, 3]],
};
const t = createTestScene({
  makeMaterial: (role, color) => {
    const [kind, repeat] = LOOK[role] ?? ['noise', [1, 1]];
    return createPS1Material({ map: makePS1Texture(kind), color, repeat });
  },
});
const { scene, camera } = t;

if (preset === 'horror') {
  applyPS1Atmosphere(scene);
  t.sun.intensity = 0;
  t.hemi.intensity = 0;
  const fl = GAME_NOTES.flashlight;
  const lamp = new THREE.SpotLight(fl.color, fl.intensity, fl.distance, THREE.MathUtils.degToRad(fl.angleDeg), fl.penumbra, fl.decay);
  lamp.position.set(0.12, -0.1, 0);
  lamp.target.position.set(0, -0.05, -1);
  camera.add(lamp, lamp.target);
  scene.add(camera);
  camera.position.set(2.2, 1.6, 4.6);
  camera.lookAt(-0.6, 0.9, -0.4);
  t.flicker = (time) => (lamp.intensity = fl.intensity * (1 - fl.flickerDepth * 0.5 * (1 + Math.sin(time * 23) * Math.sin(time * 7.3))));
} else {
  scene.fog = new THREE.FogExp2(COLORS.sky, 0.011);
}
camera.fov = 55; // the 4:3 frame is narrower than the shared 16:9 one
camera.updateProjectionMatrix();

// Controls (the game's render test room used Space / F / S).
const fx = { blind: false, flash: 0, shake: 0, dread: params.has('dread') ? 1 : 0, dreadOn: params.has('dread'), grade: true, letterbox: true, warp: true };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') fx.blind = true;
  if (e.code === 'KeyF') fx.flash = 1;
  if (e.code === 'KeyS') fx.shake = 1;
  if (e.code === 'KeyP') ps1.punch(1);
  if (e.code === 'KeyC') ps1.closeEyes(1500);
  if (e.code === 'KeyD') fx.dreadOn = !fx.dreadOn;
  if (e.code === 'KeyG') ps1.set({ grade: (fx.grade = !fx.grade) ? PS1_DEFAULTS.grade : NEUTRAL_GRADE });
  if (e.code === 'KeyL') ps1.set({ letterbox: (fx.letterbox = !fx.letterbox) });
  if (e.code === 'KeyW') ps1.set({ affineStrength: (fx.warp = !fx.warp) ? PS1_DEFAULTS.affineStrength : 0 });
  hud();
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') fx.blind = false;
});

const hudEl = document.getElementById('hud');
function hud() {
  if (shot) return void (hudEl.textContent = '');
  hudEl.textContent = `PS1 look (${preset}) | Space hold: eyes closed  C: close slowly  F: flash  S: shake  ` +
    `D: dread ${fx.dreadOn ? 'on' : 'off'}  P: punch  G: grade ${fx.grade ? 'on' : 'off'}  ` +
    `L: letterbox ${fx.letterbox ? 'on' : 'off'}  W: warp ${fx.warp ? 'on' : 'off'}`;
}
hud();

const demo = (window.__demo = { ready: false, frames: 0, info: { preset } });
const timer = new THREE.Timer();
let time = 0;
renderer.compile(scene, camera);
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(0.1, timer.getDelta());
  time = shot ? 1.3 : time + dt;
  t.update(time);
  t.flicker?.(time);
  if (!shot) camera.position.x += Math.sin(time * 0.4) * 0.002; // a slow drift shows the vertex snap jitter
  if (params.has('blind') && demo.frames === 10) fx.blind = true;
  ps1.setBlind(fx.blind);
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
  fx.shake = Math.max(0, fx.shake - dt * 2);
  fx.dread += ((fx.dreadOn ? 1 : 0) - fx.dread) * Math.min(1, dt * 3);
  ps1.setFlash(fx.flash);
  ps1.setShake(fx.shake);
  ps1.setDread(fx.dread);
  ps1.render(scene, camera, shot && !params.has('blind') ? 0 : dt);
  if (++demo.frames > 3) demo.ready = true;
});
