import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptBlend, adaptScale, dofFocusRange, exposureEV } from '../src/photoreal/maths.js';

test('depth of field: a 50° lens on full frame is about 26 mm, and focus range grows with distance and f-number', () => {
  const d = dofFocusRange({ fovDeg: 50, aperture: 4, focusDistance: 5 });
  assert.ok(Math.abs(d.focalLength - 0.02573) < 0.0002, `focal length ${d.focalLength}`);
  assert.ok(d.near < 5 && d.far > 5 && d.range > 0);
  const far = dofFocusRange({ fovDeg: 50, aperture: 4, focusDistance: 2 });
  assert.ok(far.range < d.range, 'closer focus = shallower depth of field');
  const stopped = dofFocusRange({ fovDeg: 50, aperture: 11, focusDistance: 2 });
  assert.ok(stopped.range > far.range, 'smaller aperture = deeper depth of field');
  const tele = dofFocusRange({ fovDeg: 12, aperture: 4, focusDistance: 5 });
  assert.ok(tele.range < d.range, 'telephoto = shallower');
});

test('depth of field: focusing beyond the hyperfocal distance keeps everything sharp, capped at 500 m', () => {
  const d = dofFocusRange({ fovDeg: 50, aperture: 4, focusDistance: 1000 });
  assert.equal(d.far, 1e4);
  assert.equal(d.range, 500);
  assert.equal(dofFocusRange({ fovDeg: 50, aperture: 4, focusDistance: 0 }).focus, 0.1);
});

test('dynamic resolution: slow frames drop the scale 10 % every 2 s down to 60 %, fast ones climb back 5 %', () => {
  const s = { scale: 1 };
  const seen = [];
  for (let i = 0; i < 30 * 20; i++) if (adaptScale(s, 1 / 30)) seen.push(Math.round(s.scale * 100)); // 20 s at 30 fps
  assert.deepEqual(seen.slice(0, 4), [90, 80, 70, 60]);
  assert.ok(seen.every((v) => v >= 60));
  const fast = { scale: 0.6, frameAvg: 1 / 120 };
  for (let i = 0; i < 120 * 4.1; i++) adaptScale(fast, 1 / 120);
  assert.equal(Math.round(fast.scale * 100), 70);
});

test('dynamic resolution: ignores tab stalls and leaves a steady 45 fps alone', () => {
  const s = { scale: 1 };
  assert.equal(adaptScale(s, 0.5), false);
  assert.equal(s.frameAvg, undefined);
  for (let i = 0; i < 45 * 10; i++) adaptScale(s, 1 / 45);
  assert.equal(s.scale, 1);
});

test('auto exposure: mid grey stays put, bright scenes darken, the range clamps, and adaptation is gradual', () => {
  assert.ok(Math.abs(exposureEV(0.16)) < 1e-9);
  assert.ok(exposureEV(10) < -5);
  assert.equal(exposureEV(1e-9), 8);
  assert.equal(exposureEV(1e-9, { maxEV: 3.9 }), 3.9); // CANDID's night ceiling
  assert.equal(exposureEV(0.16, { compensation: 0.15 }), 0.15);
  const b = adaptBlend(1 / 60);
  assert.ok(b > 0.02 && b < 0.03, `blend ${b}`);
  assert.equal(adaptBlend(5), adaptBlend(0.25));
});
