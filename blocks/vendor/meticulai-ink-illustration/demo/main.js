// Demo: the shared Meticulai looks test scene, drawn as a pen-and-ink illustration.
// Keys: P or Space = next palette (4 s blend), H = hurt, F = flash, G = desaturate, O = ink on/off.
// URL: ?shot=1 freezes the pose for screenshots, ?palette=1 starts on another palette, ?blendTo=2 starts a blend.
import * as THREE from 'three';
import { createTestScene, COLORS } from './test-scene.js';
import { createInkPost } from '../src/ink-post.js';
import { inkToon } from '../src/toon.js';
import { createPaletteBlend, EXAMPLE_PALETTES } from '../src/palette-blend.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const pal = createPaletteBlend(EXAMPLE_PALETTES, { start: Number(params.get('palette')) || 0 });

// Every material is a three-tone toon material; remember which palette key colours it.
const byKey = new Map();
function makeMaterial(role, color) {
  const key = color === COLORS.cream ? 'cream' : color === COLORS.blue ? 'blue' : role;
  const m = inkToon({ color });
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(m);
  return m;
}

const t = createTestScene({ makeMaterial });
t.hemi.intensity = 1.6; // Pop Quiz's light levels
t.sun.intensity = 2.4;
t.scene.fog = new THREE.Fog(0xffffff, 40, 300);

const ink = createInkPost(renderer);

const sunDir = new THREE.Vector3();
function applyPalette() {
  const p = pal.live;
  for (const [key, mats] of byKey) if (p[key]) for (const m of mats) m.color.fromArray(p[key]);
  t.scene.background.fromArray(p.sky);
  t.scene.fog.color.fromArray(p.fog);
  t.hemi.color.fromArray(p.hemiSky);
  t.hemi.groundColor.fromArray(p.hemiGround);
  t.sun.color.fromArray(p.sunLight);
  sunDir.fromArray(p.sunDir);
  t.sun.position.copy(t.sun.target.position).addScaledVector(sunDir, 20);
  ink.uniforms.ink.value.fromArray(p.ink);
  ink.uniforms.paper.value.fromArray(p.paper);
  ink.uniforms.hatchLevel.value = p.hatch;
}
applyPalette();
if (params.has('blendTo')) pal.set(Number(params.get('blendTo')), 4);

const hud = document.getElementById('hud');
let inkOn = true;
function showHud() {
  if (shot) { hud.textContent = ''; return; }
  hud.textContent = `Ink illustration (Pop Quiz) - palette: ${EXAMPLE_PALETTES[pal.index].name}. ` +
    `P next palette, H hurt, F flash, G grey, O ink ${inkOn ? 'off' : 'on'}`;
}
showHud();

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'p' || k === ' ') pal.set((pal.index + 1) % pal.count, 4);
  if (k === 'h') ink.fx.hurt = Math.min(1, ink.fx.hurt + 0.5);
  if (k === 'f') { ink.fx.flash = 0.55; ink.fx.flashColor.set('#ffffff'); }
  if (k === 'g') ink.fx.desat = ink.fx.desat > 0 ? 0 : 0.75;
  if (k === 'o') inkOn = !inkOn;
  showHud();
});

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  t.camera.aspect = innerWidth / innerHeight;
  t.camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

renderer.compile(t.scene, t.camera);
const demo = (window.__demo = { ready: false, frames: 0, info: { look: 'ink', palette: EXAMPLE_PALETTES[pal.index].name } });
const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = shot ? 0 : Math.min(timer.getDelta(), 0.1);
  t.update(shot ? 1.3 : timer.getElapsed());
  if (pal.update(dt)) applyPalette();
  ink.fx.hurt = Math.max(0, ink.fx.hurt - dt * 0.9); // the game's decay rates
  ink.fx.flash = Math.max(0, ink.fx.flash - dt * 1.4);
  if (inkOn) ink.render(t.scene, t.camera, dt);
  else renderer.render(t.scene, t.camera);
  if (++demo.frames >= 3) demo.ready = true;
  demo.info.palette = EXAMPLE_PALETTES[pal.index].name;
});
