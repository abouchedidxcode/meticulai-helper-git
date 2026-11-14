import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAWN, DAWN_SUN, makeLook, packHaze, dirFromAngles, hzLayer, opticalDepth, transmittance, halfwayDistance, cloudShadowAt } from '../src/haze-math.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('the dawn numbers are exactly the ones Hezarfen ships', () => {
  assert.equal(DAWN.fogHeight, 24);
  assert.equal(DAWN.fogDensity0, 0.00137);
  assert.equal(DAWN.fogUniform, 0.000166);
  assert.equal(DAWN.fogHeight2, 180);
  assert.equal(DAWN.fogDensity1, 0.00013);
  assert.equal(DAWN.fogBanks, 0.75);
  assert.deepEqual(DAWN.horizonSun, [1.32, 1.0, 0.68]);
  assert.equal(DAWN.sunIntensity, 8.6);
  assert.equal(DAWN.exposure, 1.05);
  assert.deepEqual({ ...DAWN_SUN }, { azimuthDeg: 132, elevationDeg: 2.6, lightElevationDeg: 21 });
});

test('packHaze lays out the 16 floats the shaders read', () => {
  const P = packHaze(DAWN);
  assert.equal(P.length, 16);
  near(P[3], 24); near(P[7], 0.00137); near(P[8], 0.000166); near(P[9], 180); near(P[10], 0.00013); near(P[11], 0.75);
  near(P[12], 1 / 560); near(P[13], 0.6); near(P[14], 4);
  near(P[0], 0.8); near(P[4], 1.32);
});

test('metresPerUnit rescales distances but not the look', () => {
  const P1 = packHaze(DAWN, 1);
  const P10 = packHaze(DAWN, 10);
  const eye = [0, 1.7, 0];
  // 50 units at 10 m per unit is the same air as 500 m at 1 m per unit (heights scale too)
  near(transmittance(P10, [0, 0.17, 0], [50, 0.17, 0]), transmittance(P1, eye, [500, 1.7, 0]), 1e-5);
  near(P10[0], P1[0]);
});

test('makeLook copies (editing it never changes DAWN)', () => {
  const look = makeLook({ fogBanks: 0 });
  look.horizonAway[0] = 99;
  assert.equal(look.fogBanks, 0);
  assert.equal(DAWN.horizonAway[0], 0.8);
});

test('dirFromAngles: azimuth 0 is north (-Z), 90 is east (+X)', () => {
  const n = dirFromAngles(0, 0);
  near(n[0], 0); near(n[2], -1);
  const e = dirFromAngles(90, 0);
  near(e[0], 1); near(e[2], 0, 1e-9);
  near(Math.hypot(...dirFromAngles(132, 2.6)), 1);
});

test('hzLayer: level ray integrates density * distance, rising rays see less', () => {
  near(hzLayer(0, 0, 100, 24), 100);
  assert.ok(hzLayer(0, 0.5, 1000, 24) < hzLayer(0, 0, 1000, 24));
  assert.ok(hzLayer(100, 0, 1000, 24) < hzLayer(0, 0, 1000, 24)); // higher eye: thinner mist
});

test('haze grows with distance and thins with altitude; density 0 is clear air', () => {
  const P = packHaze(DAWN);
  const e = [0, 1.7, 0];
  const t1 = transmittance(P, e, [200, 1.7, 0]);
  const t2 = transmittance(P, e, [2000, 1.7, 0]);
  assert.ok(t1 > t2 && t1 < 1 && t2 > 0);
  assert.ok(transmittance(P, [0, 400, 0], [2000, 400, 0]) > t2);
  assert.equal(transmittance(P, e, [2000, 1.7, 0], 0), 1);
  near(opticalDepth(P, e, [2000, 1.7, 0], 2), 2 * opticalDepth(P, e, [2000, 1.7, 0]));
});

test('halfwayDistance: at eye height Hezarfen\'s air hides half a colour at about 440 m', () => {
  const d = halfwayDistance(packHaze(DAWN), 1.7);
  near(transmittance(packHaze(DAWN), [0, 1.7, 0], [d, 1.7, 0]), 0.5, 1e-4);
  assert.ok(d > 400 && d < 480, String(d));
});

test('cloud shadows stay between cloudShadowDark and full sun, and drift with time', () => {
  const P = packHaze(DAWN);
  const L = dirFromAngles(132, 21);
  let lo = 1, hi = 0, moved = false;
  for (let i = 0; i < 400; i++) {
    const x = i * 97, z = i * 53;
    const a = cloudShadowAt(P, L, x, 0, z, 0);
    lo = Math.min(lo, a); hi = Math.max(hi, a);
    if (Math.abs(cloudShadowAt(P, L, x, 0, z, 30) - a) > 1e-3) moved = true;
  }
  assert.ok(lo >= 0.6 - 1e-9 && hi <= 1 + 1e-9);
  assert.ok(hi - lo > 0.2);
  assert.ok(moved);
});
