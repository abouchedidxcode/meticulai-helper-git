// Guards the shader patches against three.js upgrades: each test fails if three renamed the chunk lines the
// engine splices into. If one fails after an upgrade, the engine still renders, but without that feature.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { adoptMaterial, boxProjectedEnvChunk, pcssShadowChunk } from '../src/photoreal/patch.js';
import { createGroundMaterial, polyHavenMaps } from '../src/photoreal/surfaces.js';

const physical = () => ({
  uniforms: {},
  vertexShader: THREE.ShaderLib.physical.vertexShader,
  fragmentShader: THREE.ShaderLib.physical.fragmentShader,
});
const expand = (src) => src.replace(/#include <(\w+)>/g, (m, k) => THREE.ShaderChunk[k] ?? m);

test(`three r${THREE.REVISION}: the basic shadow filter is replaced by PCSS`, () => {
  const out = pcssShadowChunk();
  assert.notEqual(out, THREE.ShaderChunk.shadowmap_pars_fragment);
  assert.match(out, /PR_BLOCKER_SAMPLES/);
  assert.match(out, /SHADOWMAP_TYPE_PCF/, 'the rest of the chunk is kept');
});

test(`three r${THREE.REVISION}: environment reflections are box projected`, () => {
  const out = boxProjectedEnvChunk();
  assert.match(out, /reflectVec = prBoxProject\( reflectVec \);/);
});

test('an unknown chunk is left alone (plain shadows, plain reflections) instead of breaking the shader', () => {
  assert.equal(pcssShadowChunk('void main() {}'), 'void main() {}');
  assert.equal(boxProjectedEnvChunk('void main() {}'), 'void main() {}');
});

test('adoptMaterial splices every patch into a standard material', () => {
  const mat = adoptMaterial(new THREE.MeshStandardMaterial());
  const shader = physical();
  mat.onBeforeCompile(shader, null);
  assert.match(shader.vertexShader, /vPrWorld = \( modelMatrix \* prW \)\.xyz;/);
  assert.match(shader.fragmentShader, /uniform vec2 prPcss;/);
  assert.match(shader.fragmentShader, /PR_PCF_SAMPLES/);
  assert.match(shader.fragmentShader, /prBoxProject\( reflectVec \)/);
  assert.equal(shader.uniforms.prPcss.value.isVector2, true);
  assert.equal(adoptMaterial(mat), mat, 'adopting twice is harmless');
  assert.match(mat.customProgramCacheKey(), /^pr1\|/);
});

test('ground material: puddles, grime and world-space UVs reach the shader (with and without textures)', () => {
  for (const maps of [null, { diff: new THREE.Texture(), nor: new THREE.Texture(), arm: new THREE.Texture(), disp: new THREE.Texture() }]) {
    const mat = createGroundMaterial({ maps, wetness: 0.4, quality: { pom: true } });
    const shader = physical();
    mat.onBeforeCompile(shader, null);
    const frag = expand(shader.fragmentShader);
    assert.match(frag, /srPuddle = srWet \*/);
    assert.doesNotMatch(frag, /roughnessFactor = mix\( roughnessFactor, 0\.09, srPuddle \);/, 'CANDID shipped without these');
    assert.match(shader.vertexShader, /vSrWorld = srW\.xyz;/);
    if (maps) {
      for (const v of ['vMapUv', 'vNormalMapUv', 'vRoughnessMapUv', 'vMetalnessMapUv', 'vAoMapUv']) {
        assert.ok(!new RegExp(`texture2D\\( \\w+, ${v} \\)`).test(shader.fragmentShader), `${v} still sampled`);
      }
      assert.match(shader.fragmentShader, /parallax occlusion/);
      assert.equal(mat.metalness, 1);
    } else {
      assert.equal(mat.metalness, 0, 'no arm map: not a metal');
    }
    assert.match(shader.fragmentShader, /prBoxProject/, 'ground is adopted too');
    assert.equal(mat.userData.surface.srWet.value, 0.4);
  }
});

test('smoothPuddles: puddles turn mirror-smooth and flat in the material too', () => {
  const mat = createGroundMaterial({ maps: { diff: new THREE.Texture(), nor: new THREE.Texture() }, wetness: 0.4, smoothPuddles: true });
  const shader = physical();
  mat.onBeforeCompile(shader, null);
  assert.match(shader.fragmentShader, /roughnessFactor = mix\( roughnessFactor, 0\.09, srPuddle \);/);
  assert.match(shader.fragmentShader, /normal = normalize\( mix\( normal, normalize\( \( viewMatrix \* vec4\( 0\.0, 1\.0, 0\.0, 0\.0 \) \)\.xyz \), srPuddle \) \);/);
  assert.ok(!/texture2D\( normalMap, vNormalMapUv \)/.test(shader.fragmentShader));
  assert.match(mat.customProgramCacheKey(), /\|1\|/);
});

test('Poly Haven texture URLs use the OpenGL normal map', () => {
  const m = polyHavenMaps('asphalt_04');
  assert.equal(m.nor, 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_04/asphalt_04_nor_gl_1k.jpg');
  assert.match(m.arm, /asphalt_04_arm_1k\.jpg$/);
});
