// Palette blending maths (pure; no three.js needed): node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  srgbToLinear, linearToSrgb, hexToLinear, linearToHex, ease, toLive, mixLive, createPaletteBlend, EXAMPLE_PALETTES,
} from '../src/palette-blend.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('sRGB <-> linear matches the standard curve and round-trips', () => {
  near(srgbToLinear(0), 0);
  near(srgbToLinear(1), 1, 1e-5);
  near(srgbToLinear(0.5), 0.2140, 1e-4);
  for (let i = 0; i <= 255; i += 15) near(linearToSrgb(srgbToLinear(i / 255)), i / 255, 1e-3);
});

test('hex colours convert to linear and back', () => {
  assert.deepEqual(hexToLinear('#000000'), [0, 0, 0]);
  for (const hex of ['#1d2340', '#fff4e0', '#ff8a3d', '#05061a']) assert.equal(linearToHex(hexToLinear(hex)), hex);
  assert.throws(() => hexToLinear('red'));
});

test('ease is smoothstep: 0, 0.5, 1 and flat at the ends', () => {
  near(ease(0), 0);
  near(ease(0.5), 0.5);
  near(ease(1), 1);
  assert.ok(ease(0.05) < 0.05 && ease(0.95) > 0.95);
});

test('toLive normalises *Dir arrays and copies other arrays', () => {
  const src = { sunDir: [3, 4, 0], offset: [3, 4, 0], hatch: 0.1, name: 'x' };
  const live = toLive(src);
  near(Math.hypot(...live.sunDir), 1);
  assert.deepEqual(live.offset, [3, 4, 0]);
  assert.notEqual(live.offset, src.offset);
  assert.equal(live.name, 'x');
});

test('mixLive blends colours in linear space, numbers linearly, keeps directions unit length', () => {
  const a = toLive({ c: '#000000', h: 0.14, sunDir: [1, 0, 0], name: 'a' });
  const b = toLive({ c: '#ffffff', h: 0.07, sunDir: [0, 1, 0], name: 'b' });
  const m = mixLive(a, b, 0.5);
  assert.deepEqual(m.c.map((v) => +v.toFixed(6)), [0.5, 0.5, 0.5]);
  near(m.h, 0.105);
  near(Math.hypot(...m.sunDir), 1);
  near(m.sunDir[0], Math.SQRT1_2);
  assert.equal(m.name, 'a');
  assert.equal(mixLive(a, b, 1).name, 'b');
});

test('a blend runs for its duration, eased, then stops', () => {
  const pal = createPaletteBlend(EXAMPLE_PALETTES);
  assert.equal(pal.index, 0);
  const start = pal.live.hatch;
  const end = EXAMPLE_PALETTES[2].hatch;
  assert.equal(pal.update(0.1), false, 'settled palettes do not move');
  pal.set(2, 4);
  assert.equal(pal.update(2), true);
  near(pal.live.hatch, start + (end - start) * 0.5);
  pal.update(1);
  near(pal.live.hatch, start + (end - start) * ease(0.75));
  pal.update(5);
  near(pal.live.hatch, end);
  assert.deepEqual(pal.live.ink.map((v) => +v.toFixed(6)), hexToLinear(EXAMPLE_PALETTES[2].ink).map((v) => +v.toFixed(6)));
  assert.equal(pal.update(0.1), false);
});

test('changing palette mid-blend starts from the current values (no jump)', () => {
  const pal = createPaletteBlend(EXAMPLE_PALETTES);
  pal.set(2, 4);
  pal.update(1);
  const before = pal.live.sky.slice();
  pal.set(1, 4);
  pal.update(1e-6);
  pal.live.sky.forEach((v, i) => near(v, before[i], 1e-4));
});

test('live arrays are reused (safe to hold references)', () => {
  const pal = createPaletteBlend(EXAMPLE_PALETTES);
  const ref = pal.live.ground;
  pal.set(1, 1);
  pal.update(0.5);
  assert.equal(pal.live.ground, ref);
});

test('index is clamped and every example palette has the same keys', () => {
  const pal = createPaletteBlend(EXAMPLE_PALETTES, { start: 9 });
  assert.equal(pal.index, 2);
  pal.set(-3, 1);
  assert.equal(pal.index, 0);
  const keys = Object.keys(EXAMPLE_PALETTES[0]).sort().join();
  for (const p of EXAMPLE_PALETTES) assert.equal(Object.keys(p).sort().join(), keys);
  assert.throws(() => createPaletteBlend([]));
});
