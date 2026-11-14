// The ripple pond without a GPU: grid sizes and wave speed per quality, how touches become drops and bodies, what a
// step sends to the shader, the pond shape, and that the materials are wired.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ripples, SIM_QUALITY, gridFor, waveSpeed, MAX_DROPS, MAX_BODIES, pondShore, createWaterMaterial, applyUnderwater, createWindTexture } from '../src/index.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ~ ${b}`);
function fakeRenderer() {
  const r = { target: null, renders: 0, uniformsSeen: [] };
  r.getRenderTarget = () => r.target;
  r.setRenderTarget = (t) => { r.target = t; };
  r.render = (mesh) => { r.renders++; r.uniformsSeen.push({ n: mesh.material.uniforms.uN.value, nb: mesh.material.uniforms.uNB.value }); };
  return r;
}

test('every quality keeps the same wave speed in world units (only the detail changes), inside the stable range', () => {
  const v = (q) => waveSpeed(SIM_QUALITY[q].cell, SIM_QUALITY[q].k, SIM_QUALITY[q].steps);
  near(v('low'), v('med'), 0.05);
  near(v('high'), v('med'), 1e-9);
  for (const q of Object.values(SIM_QUALITY)) assert.ok(q.k <= 1.8);
});

test('the game rectangle gets the game grids; a bigger pond gets more cells, not faster waves', () => {
  const game = { x0: -9.6, x1: 9.6, z0: -6.2, z1: 6.2 };
  assert.deepEqual([gridFor(game, 'low').w, gridFor(game, 'med').w, gridFor(game, 'high').w], [256, 384, 576]);
  assert.deepEqual([gridFor(game, 'med').h, gridFor(game, 'high').h], [248, 372]);
  const big = gridFor({ x0: 0, x1: 38.4, z0: 0, z1: 24.8 }, 'med');
  assert.equal(big.w, 768);
  assert.equal(big.k, 1.7);
});

test('a moving finger becomes bodies along its path: one every 7 cm, at most 5, deeper and wider with speed', () => {
  const r = new Ripples();
  r.stroke(0, 0, 0.3, 0, 0);
  assert.equal(r._bodies.length, 5);
  near(r._bodies[4].x, 0.3); near(r._bodies[0].x, 0.06);
  near(r._bodies[0].z, 0.16); near(r._bodies[0].w, 0.05);
  r._bodies.length = 0;
  r.stroke(0, 0, 0.05, 0, 10);
  assert.equal(r._bodies.length, 1);
  near(r._bodies[0].z, 0.16 + 0.06); near(r._bodies[0].w, 0.1);
});

test('drops and bodies are capped', () => {
  const r = new Ripples();
  for (let i = 0; i < MAX_DROPS + 5; i++) r.drop(i, 0, 0.1, 0.01);
  assert.equal(r._drops.length, MAX_DROPS);
  assert.equal(r._drops[0].x, 5); // the oldest go first
  for (let i = 0; i < MAX_BODIES + 5; i++) r.body(i, 0, 0.1, 0.01);
  assert.equal(r._bodies.length, MAX_BODIES);
});

test('a step: drops go in on the first sub-step only, bodies on every one, then both are cleared', () => {
  const r = new Ripples({ quality: 'high' }); // 3 sub-steps
  const fr = fakeRenderer();
  r.drop(0, 0, 0.3, 0.1); r.drop(1, 0, 0.3, 0.1);
  r.body(0, 0, 0.16, 0.05);
  const before = r.texture;
  r.step(fr);
  assert.equal(fr.renders, 3);
  assert.deepEqual(fr.uniformsSeen.map((u) => u.n), [2, 0, 0]);
  assert.deepEqual(fr.uniformsSeen.map((u) => u.nb), [1, 1, 1]);
  assert.equal(r._drops.length, 0);
  assert.equal(r._bodies.length, 0);
  assert.notEqual(r.texture, before); // ping-pong
  assert.equal(r.uniforms.uSim.value, r.texture);
});

test('damping: the same per second at every step count; calm water settles faster', () => {
  const perSecond = (q, calm) => { const r = new Ripples({ quality: q }); r.calm = calm; r.step(fakeRenderer()); return Math.pow(r.mat.uniforms.uDamp.value, r.steps * 60); };
  near(perSecond('med', 0), perSecond('high', 0), 1e-9);
  assert.ok(perSecond('med', 1) < perSecond('med', 0));
  const r = new Ripples(); r.step(fakeRenderer());
  near(r.mat.uniforms.uDamp.value, 0.998, 1e-12); // 0.9955 + 0.0025 at 2 steps
});

test('the pond shape: the game pond, deepest in the middle, dry on the bank', () => {
  const p = pondShore();
  assert.deepEqual(p.rect, { x0: -9.6, x1: 9.6, z0: -6.2, z1: 6.2 });
  assert.ok(p.sdf(0, 0) < -5);
  assert.ok(p.sdf(12, 0) > 0);
  near(p.depthAt(0, 0), 1.5, 0.05);
  assert.equal(p.depthAt(12, 0), 0);
  assert.ok(p.glsl.includes('float shoreSdf(vec2 p)'));
});

test('the water material reads the live simulation and the pond shore', () => {
  const p = pondShore();
  const r = new Ripples({ rect: p.rect, shoreGlsl: p.glsl });
  const m = createWaterMaterial(r, { shoreGlsl: p.glsl });
  assert.equal(m.uniforms.uSim, r.uniforms.uSim);
  assert.equal(m.uniforms.uRect, r.uniforms.uSimRect);
  assert.ok(m.fragmentShader.includes('float shoreSdf'));
  assert.ok(m.fragmentShader.includes('0.950')); // NORMAL_K
  assert.ok(r.mat.fragmentShader.includes('float shoreSdf'));
});

test('the bed patch adds caustics and absorption where three expects them', () => {
  const r = new Ripples();
  const mat = new THREE.MeshStandardMaterial();
  applyUnderwater(mat, r);
  const shader = { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms), vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  mat.onBeforeCompile(shader, null);
  assert.ok(shader.fragmentShader.includes('rippleFocus(cp, uwD)'));
  assert.ok(shader.fragmentShader.indexOf('outgoingLight = outgoingLight * tr') < shader.fragmentShader.indexOf('#include <opaque_fragment>'));
  assert.ok(shader.vertexShader.includes('vUwWorld = (modelMatrix'));
  assert.equal(shader.uniforms.uSim, r.uniforms.uSim);
});

test('the wind texture is tileable noise gradients', () => {
  const t = createWindTexture(32);
  assert.equal(t.image.width, 32);
  assert.equal(t.wrapS, THREE.RepeatWrapping);
  const d = t.image.data;
  let nonzero = 0;
  for (let i = 0; i < d.length; i++) if (d[i] !== 0) nonzero++;
  assert.ok(nonzero > d.length * 0.9);
});
