// The CPU side of the sand and wet maps, on a fake renderer (no GPU in node): where the square sits and how it
// scrolls, what the shader is told each frame (groove, berms, crater, decays), and that the ground material patch
// lands in three's shader.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SandMap, SAND_DEFAULTS, WetMap, WET_DEFAULTS, applySandTrails } from '../src/index.js';

function fakeRenderer() {
  const r = { target: null, renders: 0, clears: 0 };
  r.getRenderTarget = () => r.target;
  r.setRenderTarget = (t) => { r.target = t; };
  r.setClearColor = () => {};
  r.clear = () => { r.clears++; };
  r.render = () => { r.renders++; };
  return r;
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ~ ${b}`);

test('the game numbers are the defaults', () => {
  assert.equal(SAND_DEFAULTS.size, 512);
  assert.equal(SAND_DEFAULTS.span, 12);
  assert.deepEqual([SAND_DEFAULTS.dryHeightTau, SAND_DEFAULTS.wetHeightTau, SAND_DEFAULTS.wetnessTau, SAND_DEFAULTS.filmTau], [2.2, 45, 60, 1.6]);
  assert.deepEqual([WET_DEFAULTS.size, WET_DEFAULTS.span, WET_DEFAULTS.dryTau], [512, 44, 70]);
});

test('the sand map scrolls by whole texels, keeping the trail behind a moving body in view', () => {
  const s = new SandMap(fakeRenderer());
  const texel = 12 / 512;
  const x0 = s.rect.value.x, z0 = s.rect.value.y;
  s.update(1 / 60, 0, 0, 6, 0, 0.2, 1, 6);
  const rect = s.rect.value;
  // moved by whole texels (the trail never blurs)
  near((rect.x - x0) / texel, Math.round((rect.x - x0) / texel), 1e-6);
  near((rect.y - z0) / texel, Math.round((rect.y - z0) / texel), 1e-6);
  // moving +x: the body sits ahead of the centre, by 22% of the span
  const cx = rect.x + 6;
  near(0 - cx, 12 * 0.22, texel);
  // the next frame scrolls by the texels moved, and tells the shader in uv
  s.update(1 / 60, 0.1, 0, 6, 0, 0.2, 1, 6);
  const sh = s.mat.uniforms.uShift.value;
  near(sh.x * 512, Math.round(sh.x * 512), 1e-9);
  assert.ok(sh.x > 0);
});

test('a teleport (new run) clears the map instead of scrolling it', () => {
  const r = fakeRenderer();
  const s = new SandMap(r);
  s.update(1 / 60, 0, 0, 0, 0, 0.2, 1, 0);
  const clears = r.clears;
  s.update(1 / 60, 100, 0, 0, 0, 0.2, 1, 0);
  assert.ok(r.clears > clears);
  assert.equal(s.mat.uniforms.uShift.value.x, 0);
  assert.equal(s.hasLast, true);
});

test('the groove: deeper and with taller berms the faster it ploughs, and along the path since the last frame', () => {
  const s = new SandMap(fakeRenderer());
  s.update(1 / 60, 0, 0, 0, 0, 0.2, 1, 0);
  const slow = s.mat.uniforms.uPress.value.clone();
  near(slow.z, 0.2 * 0.1); near(slow.w, 0.2 * 0.025);
  s.update(1 / 60, 0.2, 0, 12, 0, 0.2, 1, 12);
  const fast = s.mat.uniforms.uPress.value.clone();
  near(fast.z, 0.2 * 0.2); near(fast.w, 0.2 * 0.075);
  near(fast.x, 0.2 / 12);
  const seg = s.mat.uniforms.uSeg.value, rect = s.rect.value;
  near(seg.x * 12 + rect.x, 0, 1e-5);
  near(seg.z * 12 + rect.x, 0.2, 1e-5);
  // airborne: no contact
  s.update(1 / 60, 0.4, 0, 12, 0, 0.2, 0, 12);
  assert.equal(s.mat.uniforms.uPress.value.y, 0);
});

test('a landing leaves one crater, on the next update only', () => {
  const s = new SandMap(fakeRenderer());
  s.update(1 / 60, 0, 0, 0, 0, 0.2, 1, 0);
  s.land(0.5, 0.5, 0.3, 0.02);
  s.update(1 / 60, 0, 0, 0, 0, 0.2, 1, 0);
  const im = s.mat.uniforms.uImpact.value;
  near(im.w, 0.02);
  near(im.z, 0.3 / 12);
  near(im.x * 12 + s.rect.value.x, 0.5, 1e-5);
  s.update(1 / 60, 0, 0, 0, 0, 0.2, 1, 0);
  assert.equal(s.mat.uniforms.uImpact.value.w, 0);
});

test('slow decays come in tenth-of-a-second steps (one frame would round away in half floats)', () => {
  const s = new SandMap(fakeRenderer());
  const seen = [];
  for (let i = 0; i < 12; i++) { s.update(1 / 60, 0, 0, 0, 0, 0.2, 1, 0); seen.push(s.mat.uniforms.uDecay.value.x); }
  const steps = seen.filter((v) => v < 1);
  assert.equal(steps.length, 1);
  near(steps[0], Math.exp(-0.1 / 2.2), 0.01);
  // slumping and wicking per frame, scaled to 60 Hz
  near(s.mat.uniforms.uSlump.value.x, 0.12, 1e-9);
  near(s.mat.uniforms.uSlump.value.y, 0.14, 1e-9);
  near(s.mat.uniforms.uFilm.value.y, Math.exp(-(1 / 60) / 1.6));
});

test('quality: configure(null) turns it off, and the material sees it', () => {
  const r = fakeRenderer();
  const s = new SandMap(r);
  assert.equal(s.on.value, 1);
  s.configure(null);
  assert.equal(s.on.value, 0);
  const renders = r.renders;
  s.update(1 / 60, 0, 0, 0, 0, 0.2, 1, 0);
  assert.equal(r.renders, renders);
  s.configure({ size: 256, span: 12 });
  near(s.rect.value.w, 12 / 256);
});

test('the wet map recentres only once the body wanders, by whole texels, and keeps one render a frame', () => {
  const r = fakeRenderer();
  const w = new WetMap(r);
  const x0 = w.rect.value.x;
  w.update(1 / 60, 3, 0, 0.2, 1);
  assert.equal(w.rect.value.x, x0); // within 18% of the span: no move
  w.update(1 / 60, 9, 0, 0.2, 1);
  assert.ok(w.rect.value.x > x0);
  const texel = 44 / 512;
  near((w.rect.value.x - x0) / texel, Math.round((w.rect.value.x - x0) / texel), 1e-6);
  assert.equal(r.renders, 2);
});

test('applySandTrails patches a standard material where three expects it', () => {
  const s = new SandMap(fakeRenderer());
  const w = new WetMap(fakeRenderer());
  const mat = new THREE.MeshStandardMaterial();
  const { uniforms } = applySandTrails(mat, { sand: s, wet: w });
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  mat.onBeforeCompile(shader, null);
  assert.ok(shader.vertexShader.includes('vSandWorld = (modelMatrix'));
  assert.ok(shader.fragmentShader.includes('uniform sampler2D tSand'));
  assert.ok(shader.fragmentShader.includes('reflectedLight.directDiffuse *= sandShade'));
  assert.ok(shader.fragmentShader.indexOf('float sandShade') > shader.fragmentShader.indexOf('#include <normal_fragment_maps>'));
  assert.equal(shader.uniforms.tSand, s.tex);
  assert.equal(shader.uniforms.uSandRect, s.rect);
  assert.equal(uniforms.tWet.value, w.texture);
  assert.equal(uniforms.uWetOn.value, 1);
  assert.ok(mat.customProgramCacheKey().includes('meticulai-sand-trails'));
});
