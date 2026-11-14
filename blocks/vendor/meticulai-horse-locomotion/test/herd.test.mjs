import test from 'node:test';
import assert from 'node:assert/strict';
import { createHerd, reins, paceSpeeds, HERO } from '../src/herd.js';
import { hoofAt, leadFromHooves, contacts } from '../src/footfall.js';

test('the body is drawn behind the forehand, along the trail', () => {
  const h = createHerd({ capacity: 2 }), i = h.add({ x: 0, z: 0, yaw: 0 });
  assert.ok(Math.abs(h.S.mz[i]) < 1e-9 && Math.abs(h.S.z[i] - h.lead) < 1e-9);
  for (let k = 0; k < 600; k++) h.step(i, h.S.yaw[i] + 1, 4, 1 / 60);      // a steady left turn
  assert.ok(h.S.b1[i] > 0.05, 'the body bends into the turn');
  assert.ok(Math.abs(h.S.b1[i] - h.S.curve[i]) < 0.02, 'its bend at the middle is the path\'s curvature');
  assert.ok(h.S.roll[i] > 0.05, 'it leans into the turn');
});

test('the player\'s reins use the game\'s paces', () => {
  const h = createHerd(); const p = paceSpeeds(h.gaits);
  assert.deepEqual(p.map((v) => +v.toFixed(3)), [0, 1.584, 6.5, 12.128]);
  const o = reins(0, 1, 0, false, h.gaits);
  assert.equal(o.speed, 1.9, 'a turn from a stand walks round');
  assert.equal(o.yaw, -1.3);
  assert.ok(Math.abs(reins(0, 0, 1, true, h.gaits).speed - 13.5 * 0.985) < 1e-9);
  h.add({ x: 0, z: 0, limits: HERO }); assert.equal(h.S.lim[0], HERO);
});

test('a planted stand-in hoof moves straight back at one stride per cycle', () => {
  const o = { x: 0, y: 0, z: 0, down: false };
  for (const g of ['walk', 'trot', 'canter', 'gallop']) {
    const [[a, b]] = contacts()[g].hoof_fl, z0 = hoofAt(g, 'fl', a, o).z;
    const z1 = hoofAt(g, 'fl', b, o).z;
    const stride = { walk: 1.7, trot: 2.4, canter: 3.4, gallop: 5.2 }[g];
    assert.ok(Math.abs((z0 - z1) - stride * (b - a)) < 1e-9);
  }
  assert.ok(leadFromHooves() > 0.9 && leadFromHooves() < 1.0);
});
