import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, HERO, CHARGER, makeGaits, stepHorse, pickGait, maxYawRate, maxCurve, bendPoint, wrapAngle, leanFor, BEST_TURN_SPEED } from '../src/locomotion.js';

const one = () => ({ x: new Float64Array(1), z: new Float64Array(1), yaw: new Float64Array(1), speed: new Float64Array(1), curve: new Float64Array(1), yawRate: new Float64Array(1), phase: new Float64Array(1), phasePrev: new Float64Array(1), gait: new Uint8Array(1), gaitPrev: new Uint8Array(1), blend: new Float32Array([1]) });
const gaits = makeGaits();
const dt = 1 / 60;

test('the tuned numbers are the game\'s, unchanged', () => {
  assert.deepEqual({ ...LIMITS }, { R_MIN: 2.6, A_LAT: 4.0, YAW_ACCEL: 2.2, BEND_RATE: 0.15, ACCEL_LOW: 3.2, ACCEL_HIGH: 1.1, BRAKE: 4.2, V_MAX: 13.5, LEAN_MAX: 0.38, GAIT_BLEND: 0.32, UP: 1.05, DOWN: 0.93 });
  assert.equal(HERO.R_MIN, 1.9); assert.equal(HERO.A_LAT, 7.6); assert.equal(HERO.YAW_ACCEL, 5.0); assert.equal(HERO.BEND_RATE, 0.6);
  assert.equal(HERO.ACCEL_LOW, 4.6); assert.equal(HERO.ACCEL_HIGH, 2.0); assert.equal(HERO.BRAKE, 5.6);
  assert.equal(CHARGER.ACCEL_LOW, 5.2); assert.equal(CHARGER.ACCEL_HIGH, 2.4);
  assert.deepEqual(gaits.list.map((g) => g.stride), [1, 1.7, 2.4, 3.4, 5.2]);
  assert.equal(gaits.vmax, 13.5);
});

test('a standing horse cannot pivot', () => {
  const S = one();
  for (let k = 0; k < 120; k++) stepHorse(S, 0, Math.PI, 0, dt, gaits);
  assert.equal(S.yaw[0], 0); assert.equal(S.x[0], 0); assert.equal(S.z[0], 0);
});

test('it moves only along its facing and never turns faster than its speed allows', () => {
  const S = one(); S.speed[0] = 6;
  for (let k = 0; k < 600; k++) {
    const x0 = S.x[0], z0 = S.z[0], y0 = S.yaw[0], v0 = S.speed[0];
    stepHorse(S, 0, S.yaw[0] + (k % 200 < 100 ? 2 : -2), 3 + 9 * ((k / 100) % 1), dt, gaits);
    const ym = (y0 + S.yaw[0]) / 2, dx = S.x[0] - x0, dz = S.z[0] - z0;
    assert.ok(Math.abs(dx * Math.cos(ym) - dz * Math.sin(ym)) < 1e-9, 'no sideways motion');
    assert.ok(dx * Math.sin(ym) + dz * Math.cos(ym) >= 0, 'no backward motion');
    const w = Math.abs(S.yaw[0] - y0) / dt, v = Math.hypot(dx, dz) / dt;
    assert.ok(w <= Math.min(v / LIMITS.R_MIN, LIMITS.A_LAT / v) * 1.01 + 1e-6, `yaw rate ${w} at ${v} m/s`);
    assert.ok(S.speed[0] - v0 <= 3.2 * dt + 1e-9, 'bounded push');
  }
});

test('gaits change with hysteresis (no flicker at a boundary)', () => {
  const b = 0.5 * (gaits.list[3].max + gaits.list[4].min);      // canter / gallop
  assert.equal(pickGait(b, 3, gaits), 3);                         // just at the boundary: stays in canter
  assert.equal(pickGait(b * 1.06, 3, gaits), 4);
  assert.equal(pickGait(b, 4, gaits), 4);                         // and from gallop it stays in gallop
  assert.equal(pickGait(b * 0.92, 4, gaits), 3);
  assert.equal(pickGait(0, 1, gaits), 0);
});

test('turn limits: tight at a walk, wide at a gallop', () => {
  assert.equal(maxYawRate(0), 0);
  assert.ok(Math.abs(maxCurve(1) - 1 / 2.6) < 1e-12);
  assert.ok(1 / maxCurve(12) > 30, 'a galloping horse needs an arc tens of metres wide');
  assert.ok(Math.abs(BEST_TURN_SPEED - Math.sqrt(4 * 2.6)) < 1e-12);
  assert.ok(leanFor(12, 0.5) <= 0.38 + 1e-12);
});

test('the player\'s horse (HERO) comes about faster, as the game promised', () => {
  const about = (lim, v) => {
    const S = one(); S.speed[0] = v; let t = 0;
    while (Math.abs(wrapAngle(S.yaw[0] - Math.PI)) > 0.05 && t < 30) { stepHorse(S, 0, S.yaw[0] + 1.5, v, dt, gaits, 1, Infinity, lim); t += dt; }
    return t;
  };
  const gallop = about(HERO, 12), canter = about(HERO, 6.5), rank = about(LIMITS, 12);
  assert.ok(gallop > 4 && gallop < 6.5, `hero gallop about-turn ${gallop.toFixed(2)} s (about 5)`);
  assert.ok(canter < 3, `hero canter about-turn ${canter.toFixed(2)} s (under 3)`);
  assert.ok(rank > gallop * 1.5, `a horse in the ranks is slower to come about (${rank.toFixed(1)} s)`);
});

test('bendPoint: straight body is the model itself; a bent one keeps arc length', () => {
  const o = [0, 0, 0];
  bendPoint(0.3, 1.2, 0, 0, 0, 0, o); assert.ok(Math.abs(o[0] - 0.3) < 1e-12 && Math.abs(o[1] - 1.2) < 1e-12);
  bendPoint(0, 1.0, 0.2, 0, 0, 0, o);           // constant curvature: a circle of radius 5; chord = 2R sin(L / 2R)
  assert.ok(Math.abs(Math.hypot(o[0], o[1]) - 2 * 5 * Math.sin(0.1)) < 1e-6);
});
