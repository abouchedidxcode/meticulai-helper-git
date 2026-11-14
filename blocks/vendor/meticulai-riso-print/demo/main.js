// Riso print demo: the shared looks test scene, its roles mapped to inks, drawn as a three-ink print.
// Keys: L switch look (riso <-> plain), P next ink set, F focus, E energy (misregistration), S speed streaks,
// W ink wipe. URL: ?look=plain, ?palette=teal, ?shot=1 (frozen pose for screenshots, no HUD).
import * as THREE from 'three';
import { createTestScene, COLORS } from './test-scene.js';
import { createLookSwitch, risoLook, createPlainLook, skyDome, inkUniforms, INK, MODE, PALETTES } from '../src/index.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
document.body.appendChild(renderer.domElement);

const startPalette = PALETTES[params.get('palette')] ? params.get('palette') : 'classic';
const looks = createLookSwitch({
  looks: { riso: risoLook({ palette: startPalette }), plain: createPlainLook({ sky: COLORS.sky }) },
  renderer,
});

// The test scene asks for materials by its own roles; this table says which ink role each one plays.
// Pink means "this matters / can hurt you", yellow "yours", blue everything else.
function roleFor(role, color) {
  switch (role) {
    case 'ground': return [INK.FLOOR, MODE.FLOOR]; // printed tile grid
    case 'stone': return [INK.WALL, MODE.PLAIN];
    case 'far': return [INK.DISTANT, MODE.PLAIN];
    case 'accent': return [INK.PICKUP, MODE.PLAIN];
    case 'figure': return [INK.PLAYER, MODE.PLAIN];
    case 'skin': return [INK.PAPER, MODE.PLAIN];
    case 'prop':
      if (color === COLORS.cream) return [INK.PAPER, MODE.PLAIN];
      return [INK.ENEMY, MODE.PLAIN]; // the box and the cone: pink, outlined in pink
    default: return [INK.SCENERY, MODE.PLAIN];
  }
}
const t = createTestScene({ makeMaterial: (role, color) => looks.mat(...roleFor(role, color)) });
t.scene.add(skyDome(looks));
inkUniforms.uSunDir.value.set(-0.62, 0.1, -1); // put the printed sun low on the left, where the scene's sun is

const demo = (window.__demo = { ready: false, frames: 0, info: { look: looks.name, palette: startPalette } });
const hud = document.getElementById('hud');
const paletteNames = Object.keys(PALETTES);
let paletteIndex = paletteNames.indexOf(startPalette);
const fxOn = { focus: 0, energy: 0, speed: 0 };
let wipeStart = -1;

function setHud() {
  demo.info = { look: looks.name, palette: paletteNames[paletteIndex] };
  hud.textContent = shot ? '' :
    `Riso print look: ${looks.name}${looks.name === 'riso' ? ` (${paletteNames[paletteIndex]})` : ''}  ·  L look  ·  P inks  ·  F focus  ·  E energy  ·  S speed  ·  W wipe`;
}

function resize() {
  looks.view.resize(innerWidth, innerHeight);
  t.camera.aspect = innerWidth / innerHeight;
  t.camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'l') { looks.next(t.scene); resize(); }
  if (k === 'p') {
    paletteIndex = (paletteIndex + 1) % paletteNames.length;
    looks.view.setPalette(paletteNames[paletteIndex]);
  }
  if (k === 'f') fxOn.focus = 1 - fxOn.focus;
  if (k === 'e') fxOn.energy = 1 - fxOn.energy;
  if (k === 's') fxOn.speed = 1 - fxOn.speed;
  if (k === 'w') wipeStart = timer.getElapsed();
  setHud();
});

resize();
setHud();
renderer.compile(t.scene, t.camera);

const timer = new THREE.Timer();
const smooth = { focus: 0, energy: 0, speed: 0 };
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const time = shot ? 1.3 : timer.getElapsed();
  t.update(time);
  const v = looks.view;
  for (const k in smooth) smooth[k] += (fxOn[k] - smooth[k]) * Math.min(1, dt * 6);
  if (v.fx) {
    v.fx.focus = smooth.focus;
    v.fx.energy = shot ? 0.4 : smooth.energy;
    v.fx.speed = smooth.speed;
    const w = wipeStart < 0 ? 0 : (time - wipeStart) / 1.2;
    v.fx.wipe = w > 0 && w < 2 ? (w < 1 ? w : 2 - w) : 0;
  }
  v.tickPalette(dt);
  v.render(t.scene, t.camera);
  if (++demo.frames > 3) demo.ready = true;
});
