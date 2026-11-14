// node --test test/   (no three.js needed: these modules are pure logic)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PS1_DEFAULTS, resolveOptions } from '../src/defaults.js';
import { PS1State, snapNdc, snapResolution, targetSize, letterbox } from '../src/ps1-state.js';
import { paintTexels, TEXEL_KINDS } from '../src/texels.js';

test("defaults are Don't Blink's numbers", () => {
  const d = PS1_DEFAULTS;
  assert.deepEqual([d.width, d.height, d.vertexSnap, d.affineStrength, d.colorLevels, d.ditherStrength, d.grain], [320, 240, 1, 0.85, 20, 1, 0.05]);
  assert.deepEqual([d.vignetteBase, d.vignettePulse, d.vignettePulseMs, d.fadeInMs, d.lidOpenMs], [0.35, 0.65, 450, 150, 190]);
  assert.deepEqual([d.afterimageStrength, d.afterimageFadeMs, d.punchVignette, d.punchDecaySec], [0.35, 1400, 0.5, 0.7]);
  assert.deepEqual(d.grade.tint, [0.94, 1.0, 0.8]);
});

test('resolveOptions merges nested groups and rejects typos', () => {
  const o = resolveOptions({ colorLevels: 8, grade: { saturation: 1 } });
  assert.equal(o.colorLevels, 8);
  assert.equal(o.grade.saturation, 1);
  assert.equal(o.grade.contrast, 0.35);
  assert.equal(PS1_DEFAULTS.grade.saturation, 0.55, 'defaults untouched');
  assert.throws(() => resolveOptions({ colourLevels: 8 }), /unknown option/);
  assert.throws(() => resolveOptions({ grade: { sat: 1 } }), /grade\.sat/);
});

test('vertex snap lands on the low-res pixel grid', () => {
  const [sx, sy] = snapResolution(320, 240, 1);
  assert.deepEqual([sx, sy], [320, 240]);
  for (const ndc of [-0.9871, -0.3, 0, 0.0021, 0.51234, 0.999]) {
    const s = snapNdc(ndc, sx);
    const px = ((s + 1) / 2) * 320; // to pixel units: a whole number
    assert.ok(Math.abs(px - Math.round(px)) < 1e-9, `${ndc} -> ${px}`);
    assert.ok(Math.abs(s - ndc) <= 1 / 320 + 1e-12);
  }
  // A coarser grid (vertexSnap 4) moves vertices further.
  assert.equal(snapNdc(0.01, snapResolution(320, 240, 4)[0]), 0);
});

test('letterbox keeps 4:3 centred; target size follows the screen when letterbox is off', () => {
  assert.deepEqual(letterbox(1280, 720, 4 / 3), { x: 160, y: 0, w: 960, h: 720 });
  assert.deepEqual(letterbox(800, 1000, 4 / 3), { x: 0, y: 200, w: 800, h: 600 });
  assert.deepEqual(targetSize(PS1_DEFAULTS, 1280, 720), [320, 240]);
  assert.deepEqual(targetSize({ ...PS1_DEFAULTS, letterbox: false }, 1280, 720), [427, 240]);
});

test('eyes: close goes black with an afterimage that fades; open uses eyelids and fade-in', () => {
  const s = new PS1State(resolveOptions());
  let f = s.step(1 / 60);
  assert.ok(f.renderScene);
  assert.equal(f.u.vignette, 0.35);
  s.setBlind(true);
  f = s.step(0.1);
  assert.equal(f.renderScene, false, 'the scene is not drawn while blind');
  assert.equal(f.u.black, 1);
  assert.ok(f.u.ghost > 0 && f.u.ghost < 0.35);
  f = s.step(1.4); // past afterimageFadeMs
  assert.equal(f, null, 'fully black: nothing to draw');
  s.setBlind(false);
  f = s.step(0.05);
  assert.ok(f.u.lid > 0 && f.u.lid < 1, 'eyelids opening');
  assert.ok(f.u.black > 0 && f.u.black < 1, 'fading in');
  assert.ok(f.u.vignette > 0.35, 'vignette pulse');
  f = s.step(1);
  assert.equal(f.u.lid, 1);
  assert.equal(f.u.black, 0);
  assert.equal(f.u.vignette, 0.35);
});

test('a quick blink opens faster than a long closure', () => {
  const s = new PS1State(resolveOptions());
  s.step(0.016);
  s.setBlind(true);
  s.step(0.1);
  s.setBlind(false);
  assert.equal(s.lidMs, 190 * 0.4);
  s.setBlind(true);
  s.step(1);
  s.setBlind(false);
  assert.equal(s.lidMs, 190);
});

test('closeEyes ends black, punch decays, shake moves in whole low-res pixels', () => {
  const s = new PS1State(resolveOptions({ afterimageStrength: 0 }));
  s.step(0.016);
  s.closeEyes(500);
  const mid = s.step(0.25);
  assert.ok(mid.u.lid < 1);
  assert.equal(s.step(0.3), null);
  assert.equal(s.blind, true);

  const p = new PS1State(resolveOptions());
  p.punch(1);
  const a = p.step(0.1).u.vignette;
  const b = p.step(0.1).u.vignette;
  assert.ok(a > b && b > 0.35);

  const k = new PS1State(resolveOptions());
  k.setShake(1);
  const f = k.step(0.016, () => 1);
  assert.deepEqual(f.u.shake, [10 / 320, 10 / 240]);
  k.setShake(0);
  assert.deepEqual(k.step(0.016).u.shake, [0, 0]);
});

test('textures are deterministic and opaque', () => {
  for (const kind of TEXEL_KINDS) {
    const a = paintTexels(kind);
    const b = paintTexels(kind);
    assert.equal(a.data.length, 32 * 32 * 4);
    assert.deepEqual(a.data, b.data);
    for (let i = 3; i < a.data.length; i += 4) assert.equal(a.data[i], 255);
  }
  assert.throws(() => paintTexels('marble'), /unknown texture/);
});
