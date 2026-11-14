// Demo: the shared Meticulai test scene drawn as pixel art. Every mesh is lit through a palette ramp, the view renders
// at 12 art pixels per world unit with a dimetric (2:1) orthographic camera snapped to the art grid, and sprites made
// in code (mushrooms, a crystal, curios, butterflies) stand in the scene as pixel billboards.
// URL: ?zoom=1..6, ?shot=1 frozen frame for screenshots.
// Keys: arrows / WASD pan, Q E turn 45 degrees, + - zoom, O outlines, T dither mode, Space sparkle burst.
import * as THREE from 'three';
import { createTestScene, COLORS } from './test-scene.js';
import { PixelView, pixelMaterial, setDither, PxBillboard, PxParticles, sprites, hexToRgb, rampHex } from '../src/index.js';

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const hud = document.getElementById('hud');

// ?shared=1: reuse a renderer set up like the kit's starter (ACES, sRGB output, pixel ratio up to 2) to check the
// palette still reaches the screen exactly.
let shared = null;
if (params.has('shared')) {
  shared = new THREE.WebGLRenderer({ antialias: true });
  shared.outputColorSpace = THREE.SRGBColorSpace;
  shared.toneMapping = THREE.ACESFilmicToneMapping;
  shared.toneMappingExposure = 1.1;
  shared.setPixelRatio(Math.min(devicePixelRatio, 2));
  shared.setSize(innerWidth, innerHeight);
  addEventListener('resize', () => shared.setSize(innerWidth, innerHeight));
}
const view = new PixelView({
  renderer: shared ?? undefined,
  mode: '3d',
  zoom: Number(params.get('zoom')) || 4,
  yaw: Math.PI / 4,
  pitch: Math.PI / 6, // 30 degrees down + 45 degrees round = 2:1 dimetric pixel lines
  depth: 200,
  outline: true,
  sky: 'skyDay',
});
if (!view.canvas.parentNode) document.body.appendChild(view.canvas);
view.renderer.shadowMap.enabled = true;
view.renderer.shadowMap.type = THREE.PCFShadowMap;

// Map the test scene's roles to palette ramps (lo..hi = which tones the light walks through).
const RAMP_FOR = {
  ground: ['grass', 1, 4, 0.1],
  stone: ['stone', 0, 4],
  accent: ['gold', 1, 6],
  figure: ['fruit', 1, 4],
  skin: ['bark', 2, 6],
  far: ['hillsNear', 0, 2],
};
const materials = [];
function makeMaterial(role, color) {
  let spec = RAMP_FOR[role];
  if (role === 'prop') spec = color === COLORS.cream ? ['birch', 1, 5] : color === COLORS.blue ? ['water', 0, 4] : ['clay', 0, 4];
  const [ramp, lo, hi, grain = 0] = spec;
  const m = pixelMaterial(ramp, { lo, hi, view, grain });
  materials.push(m);
  return m;
}
const t = createTestScene({ makeMaterial });
const scene = t.scene;
scene.background = null; // the view draws the palette sky
view.follow(0.2, 0.7, -0.4);
view.snapToGoal();

// Sprites built in code, standing in the 3D scene.
const billboards = [];
function bb(sprite, x, y, z) {
  const b = new PxBillboard(view).set(sprite).place(x, y, z);
  scene.add(b.mesh);
  billboards.push(b);
  return b;
}
bb(sprites.mushrooms(3, 3), 1.6, 0, 3.4);
bb(sprites.mushrooms(8, 3), -4.2, 0, 1.6);
bb(sprites.mushrooms(5, 2), 4.4, 0, -2.6);
bb(sprites.crystal(2, 'violet', 4, 1), -4.4, 0, -1.2);
bb(sprites.crystal(7, 'rose', 3, 0), 3.9, 0, 2.6);
bb(sprites.curio('snail', 4), -1.6, 0.4, 3.4); // curio anchor = sprite centre, so lift it a little
bb(sprites.curio('bottle', 2), -2.9, 0.45, 3.0);
const flies = [0, 1, 2].map((i) => ({ b: bb(sprites.butterfly(i + 1, 0), 0, 2, 0), seed: i + 1, phase: i * 2.1 }));

// Gold sparkles from the crystal (palette colours, blink out instead of fading).
const parts = new PxParticles(scene, view, { n: 600, depthTest: true });
const sparkCols = [4, 5, 6].map((i) => hexToRgb(rampHex('gold', i)).map((c) => c / 255));
function sparkle(n) {
  for (let k = 0; k < n; k++) parts.emit({ x: -4.4 + (Math.random() - 0.5) * 0.8, y: 0.6 + Math.random() * 0.6, z: -1.2 + (Math.random() - 0.5) * 0.8, vy: 0.3 + Math.random() * 0.4, life: 1 + Math.random(), size: Math.random() < 0.3 ? 2 : 1, color: sparkCols[k % 3], drag: 1 });
}

// Input
const keys = new Set();
const ditherModes = ['band', 'full', 'none'];
let ditherIdx = 0;
addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  const k = e.key.toLowerCase();
  if (k === 'q' || k === 'e') {
    view.yaw += (k === 'q' ? -1 : 1) * (Math.PI / 4);
    view.updateOrientation();
  }
  if (k === '+' || k === '=') view.zoomStep(-1);
  if (k === '-' || k === '_') view.zoomStep(1);
  if (k === 'o') view.outline = !view.outline;
  if (k === 't') {
    ditherIdx = (ditherIdx + 1) % 3;
    for (const m of materials) setDither(m, ditherModes[ditherIdx]);
  }
  if (k === ' ') sparkle(40);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const demo = (window.__demo = { ready: false, frames: 0, info: null });
const timer = new THREE.Timer();
let last = 0;
let sparkT = 0;
view.warmUp(scene);
view.renderer.setAnimationLoop(() => {
  timer.update();
  const now = shot ? 1.3 : timer.getElapsed();
  const dt = shot ? 1 / 60 : Math.min(0.05, now - last);
  last = now;
  t.update(now);

  // pan in the camera's ground plane
  const { right, forward } = view.axes;
  const fx = forward.x, fz = forward.z, fl = Math.hypot(fx, fz) || 1;
  const pan = 6 * dt;
  const mx = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
  const mz = (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
  if (mx || mz) view.follow(view.goal.x + (right.x * mx + (fx / fl) * mz) * pan, view.goal.y, view.goal.z + (right.z * mx + (fz / fl) * mz) * pan);
  view.updateCamera(dt);

  // butterflies circle the knot, flapping every 0.15 s
  for (const f of flies) {
    const a = now * 0.9 + f.phase;
    f.b.set(sprites.butterfly(f.seed, Math.floor(now / 0.15 + f.phase) % 2));
    f.b.place(0.5 + Math.cos(a) * 3.2, 2.6 + Math.sin(a * 1.7) * 0.5, 0.6 + Math.sin(a) * 2.6);
  }
  for (const b of billboards) b.update();
  if (shot) {
    if (demo.frames === 0) {
      Math.random = mulberry(7); // deterministic sparkles for the preview
      sparkle(30);
      for (let i = 0; i < 40; i++) parts.update(1 / 60);
    }
  } else {
    sparkT -= dt;
    if (sparkT < 0) {
      sparkT = 0.25;
      sparkle(2);
    }
    parts.update(dt);
  }

  view.render(scene);
  demo.frames++;
  if (demo.frames > 3) demo.ready = true;
  demo.info = { zoom: view.zoom, art: [view.tw, view.th], ppu: view.ppu, outline: view.outline, dither: ditherModes[ditherIdx] };
  if (!shot) hud.textContent = `Pixel 3D | art ${view.tw}x${view.th} px at ${view.k}x | arrows/WASD pan, Q E turn, + - zoom, O outlines (${view.outline ? 'on' : 'off'}), T dither (${ditherModes[ditherIdx]}), Space sparkles`;
});

function mulberry(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
