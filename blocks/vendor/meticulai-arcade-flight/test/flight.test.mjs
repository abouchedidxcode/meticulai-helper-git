// node --test test/   (pure maths: no browser, no three.js needed for these)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT, PRESETS, createFlightState, stepFlight, steerToward, forwardOf, bankOf, upOf } from '../src/flight.js';
import { createPilot } from '../src/pilot.js';

const DT = 1 / 30;
const level = () => createFlightState([0, 1000, 0], [0, 0, 0, 1]);
const hold = (s, input, secs, breed) => { for (let i = 0; i < secs / DT; i++) stepFlight(s, input, DT, breed); return s; };

test('the tuned numbers are the live game\'s', () => {
  assert.deepEqual(
    { ...FLIGHT, dodge: { ...FLIGHT.dodge } },
    { thrust: 30, topSpeed: 96, boost: 36, brakeDrag: 3.2, g: 9.81, stallSpeed: 30, maxSpeed: 190, ceiling: 1700, dodge: { duration: 0.75, cooldown: 2.6, stamina: 0.22 } },
  );
  assert.deepEqual(PRESETS.balanced, { speed: 1, turn: 1 });
  assert.deepEqual(PRESETS.fast, { speed: 1.09, turn: 1.12 });
});

// The same scripted 40 s flight was run through the game's own shared/flight.js (all four breeds matched bit for bit
// when this block was made); this is where the balanced flyer ended up.
test('matches the game\'s flight model on a scripted 40 s flight', () => {
  const s = createFlightState([0, 1000, 0], [0, 0, 0, 1]);
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, boost: false, brake: false, dodge: 0 };
  for (let i = 0; i < 30 * 40; i++) {
    const t = i / 30;
    steerToward(s, [Math.sin(t * 0.3), Math.sin(t * 0.17) * 0.4, -Math.cos(t * 0.3)], input, 1.15);
    input.throttle = t % 10 < 5 ? 1 : 0.1;
    input.boost = t % 7 < 1.5;
    input.brake = t % 13 > 11;
    input.dodge = i % 150 === 0 ? 1 : i % 211 === 0 ? -1 : 0;
    if (t > 30 && t < 34) { input.pitch = 1; input.throttle = 0; }
    if (t > 20 && t < 22) s.p[1] = 1900;
    stepFlight(s, input, DT, PRESETS.balanced);
  }
  const want = [22.916885987007856, 1643.3968212143932, -33.20198652952901, 0.04518036933810483, 0.346172350389342, -0.18674801559202617, 0.9182856945008081, 48.629603577080594, 0.5623333333333338];
  const got = [...s.p, ...s.q, s.speed, s.stamina];
  got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-6 * Math.max(1, Math.abs(want[i])), `value ${i}: ${v} vs ${want[i]}`));
});

test('autopilot turns toward a direction (the game\'s own test)', () => {
  const s = level();
  const input = { throttle: 0.6 };
  for (let i = 0; i < 30 * 6; i++) { steerToward(s, [1, 0, 0], input); stepFlight(s, input, DT, PRESETS.balanced); }
  const f = forwardOf(s.q);
  assert.ok(f[0] > 0.95, 'facing +X after 6 s, got ' + f.map((x) => x.toFixed(2)));
  assert.ok(Math.abs(s.p[1] - 1000) < 200, 'kept altitude roughly');
});

test('energy: a dive gains speed, a climb spends it', () => {
  const dive = createFlightState([0, 1500, 0], [-Math.sin(0.35), 0, 0, Math.cos(0.35)]); // nose 40 deg down
  const climb = createFlightState([0, 1000, 0], [Math.sin(0.35), 0, 0, Math.cos(0.35)]); // nose 40 deg up
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 };
  hold(dive, input, 4);
  hold(climb, input, 4);
  assert.ok(dive.speed > 85, 'dive speed ' + dive.speed);
  assert.ok(climb.speed < 72, 'climb speed ' + climb.speed); // started at 75
  assert.ok(dive.speed - climb.speed > 15, 'dive vs climb');
});

test('level speed settles: about 96 m/s at full flap, slower at cruise throttle', () => {
  const full = hold(level(), { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, 30);
  const cruise = hold(level(), { pitch: 0, roll: 0, yaw: 0, throttle: 0.62 }, 30);
  assert.ok(full.speed > 85 && full.speed < 100, 'full ' + full.speed);
  assert.ok(cruise.speed < full.speed - 5 && cruise.speed > 60, 'cruise ' + cruise.speed);
});

test('boost burns stamina and is faster; stamina refills', () => {
  const b = hold(level(), { pitch: 0, roll: 0, yaw: 0, throttle: 1, boost: true }, 3);
  const n = hold(level(), { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, 3);
  assert.ok(b.speed > n.speed + 10, `boost ${b.speed} vs ${n.speed}`);
  assert.ok(b.stamina < 0.35, 'stamina ' + b.stamina);
  hold(b, { pitch: 0, roll: 0, yaw: 0, throttle: 0.3 }, 3);
  assert.ok(b.stamina > 0.6, 'refilled ' + b.stamina);
});

test('stall: slow and nose high, the nose drops and the flyer sinks', () => {
  const s = createFlightState([0, 1000, 0], [Math.sin(0.5), 0, 0, Math.cos(0.5)]); // nose 57 deg up
  s.speed = 25;
  hold(s, { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, 2.5);
  assert.ok(forwardOf(s.q)[1] < 0.5, 'nose fell to ' + forwardOf(s.q)[1].toFixed(2));
  assert.ok(s.sink < -2, 'sinking ' + s.sink);
});

test('barrel roll: one full turn in 0.75 s, costs stamina, then a cooldown', () => {
  const s = level();
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, dodge: 1 };
  stepFlight(s, input, DT);
  input.dodge = 0;
  assert.ok(Math.abs(s.stamina - 0.78) < 0.01, 'stamina ' + s.stamina);
  let minUp = 1;
  for (let i = 0; i < 0.8 / DT; i++) { stepFlight(s, input, DT); minUp = Math.min(minUp, upOf(s.q)[1]); }
  assert.ok(minUp < -0.8, 'went inverted mid-roll');
  assert.ok(Math.abs(bankOf(s.q)) < 0.35, 'wings back near level, bank ' + bankOf(s.q));
  input.dodge = 1;
  const before = s.stamina;
  stepFlight(s, input, DT);
  assert.equal(s.dodge <= 0, true, 'no second roll during the cooldown');
  assert.ok(s.stamina >= before, 'no stamina spent');
});

test('thin air above the ceiling: less thrust, a slow sink', () => {
  const lo = hold(level(), { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, 6);
  const hi = createFlightState([0, 2100, 0], [0, 0, 0, 1]);
  hold(hi, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, 6);
  assert.ok(hi.speed < lo.speed - 5, `high ${hi.speed} vs low ${lo.speed}`);
  assert.ok(hi.p[1] < 2100 - 8, 'sank ' + (2100 - hi.p[1]));
});

test('pilot: the mouse aim swings the flyer round; W/S spool the throttle', () => {
  const s = level();
  const pilot = createPilot(s);
  pilot.look(Math.PI / 2, 0); // mouse right: aim 90 deg right (+X)
  for (let i = 0; i < 30 * 6; i++) pilot.fly(DT, {});
  assert.ok(forwardOf(s.q)[0] > 0.9, 'turned right toward the aim');
  for (let i = 0; i < 30 * 1; i++) pilot.fly(DT, { throttleUp: true });
  assert.ok(pilot.input.throttle > 0.95, 'throttle open ' + pilot.input.throttle);
  pilot.fly(DT, { throttleDown: true });
  assert.ok(pilot.input.throttle < 0.95 && pilot.input.brake, 'closing and braking');
});

test('presets: the fast preset outruns the heavy one', () => {
  const f = hold(level(), { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, 20, PRESETS.fast);
  const h = hold(level(), { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, 20, PRESETS.heavy);
  assert.ok(f.speed > h.speed + 8, `fast ${f.speed} heavy ${h.speed}`);
});
