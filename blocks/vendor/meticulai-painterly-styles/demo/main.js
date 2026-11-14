// Demo: the shared Meticulai looks test scene in Kite Race's three styles.
// Keys: S next style (remembered), 1 golden, 2 morning, 3 night. URL: ?style=gouache|miniature|clean|none,
// ?look=golden|morning|night, ?shot=1 (frozen pose, no HUD), ?bench=1 (rough cost per style in __demo.info.bench).
import * as THREE from 'three';
import { createTestScene } from './test-scene.js';
import {
  createPainterlyStyles, createStyleSky, patchStyleMaterial, BASE_LOOKS, STYLE_LABELS, nextStyle,
} from '../src/index.js';

const q = new URLSearchParams(location.search);
const shot = q.has('shot');
const bench = q.has('bench');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// Which kind of surface each role of the test scene is (see HOW-TO-USE.md "Surface kinds"); everything else 'flat'.
// (A game's star object, like Kite Race's kites, would be 'hero': it keeps its own paint.)
const KIND = { ground: 'ground', figure: 'figure', skin: 'figure' };
const t = createTestScene({
  makeMaterial: (role, color) =>
    patchStyleMaterial(new THREE.MeshStandardMaterial({ color, roughness: role === 'accent' ? 0.35 : 0.8, metalness: 0 }), KIND[role] ?? 'flat'),
});
t.scene.background = null; // the sky dome paints it
const sky = createStyleSky();
t.scene.add(sky);

const styles = createPainterlyStyles(renderer, {
  storageKey: 'meticulai-demo.style',
  remember: !shot && !bench,
  // the test scene is ~150 m deep, Kite Race's city 4 km: thicker fog per metre, and the styles' haze bands pushed in
  fogDensityScale: 2,
  fogDistanceScale: 8,
});
const looks = { golden: BASE_LOOKS.golden, morning: BASE_LOOKS.morning, night: BASE_LOOKS.night };
let lookName = looks[q.get('look')] ? q.get('look') : 'golden';
const targets = { sun: t.sun, hemi: t.hemi, scene: t.scene, sky };
styles.applyLook(looks[lookName], targets);

const hud = document.getElementById('hud');
if (shot) hud.style.display = 'none';
let ms = 0;
function showHud() {
  hud.textContent = `${STYLE_LABELS[styles.style]} (${styles.style}), ${lookName}  |  S: next style  1/2/3: golden/morning/night` +
    (ms ? `  |  ~${ms.toFixed(1)} ms/frame` : '');
}
showHud();

addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') styles.choose(nextStyle(styles.style));
  const pick = { 1: 'golden', 2: 'morning', 3: 'night' }[e.key];
  if (pick) { lookName = pick; styles.applyLook(looks[lookName], targets); }
  showHud();
});

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  t.camera.aspect = innerWidth / innerHeight;
  t.camera.updateProjectionMatrix();
  styles.setSize();
}
addEventListener('resize', resize);
resize();
styles.warmUp(t.scene, t.camera);

const demo = (window.__demo = { ready: false, frames: 0, info: { style: styles.style, look: lookName } });
const timer = new THREE.Timer();
const gl = renderer.getContext();
const px = new Uint8Array(4);
let last = performance.now();

// Rough cost: per style, 30 synced frames (readPixels waits for the GPU), 3 interleaved rounds, keep the fastest.
// Shared or busy machines make this noisy; compare styles with each other, not with other blocks.
function runBench() {
  const names = ['none', 'clean', 'miniature', 'gouache'];
  const out = {};
  const keep = styles.style;
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (const s of names) { styles.setStyle(s); for (let i = 0; i < 5; i++) styles.render(t.scene, t.camera, 1.3); sync(); }
  for (let round = 0; round < 3; round++) {
    for (const s of names) {
      styles.setStyle(s);
      sync();
      const t0 = performance.now();
      for (let i = 0; i < 30; i++) { styles.render(t.scene, t.camera, 1.3); sync(); }
      const v = (performance.now() - t0) / 30;
      out[s] = Math.min(out[s] ?? Infinity, +v.toFixed(2));
    }
  }
  styles.setStyle(keep);
  return out;
}

renderer.setAnimationLoop(() => {
  timer.update();
  const time = shot ? 1.3 : timer.getElapsed();
  t.update(time);
  sky.material.uniforms.uTime.value = time;
  styles.render(t.scene, t.camera, time);
  const now = performance.now();
  ms = ms ? ms * 0.95 + (now - last) * 0.05 : now - last;
  last = now;
  demo.frames++;
  if (demo.frames === 4 && bench) demo.info.bench = { size: [renderer.domElement.width, renderer.domElement.height], ms: runBench() };
  if (demo.frames > 3) demo.ready = true;
  demo.info.style = styles.style;
  demo.info.look = lookName;
  if (demo.frames % 30 === 0 && !shot) showHud();
});
