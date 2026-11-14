// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGlider, TUNE } from '../src/glider.js';
import { createSampleWorld } from '../src/sample-world.js';
import { simulate } from '../tools/sim.mjs';

// still air over a flat plain, high up: the wing alone
const calm = (extra = {}) => ({ heightAt: () => 0, wind: { x: 0, z: 0 }, thermals: [], ...extra });
const still = { ...TUNE, gustScale: 0, cityLift: 0, seaSink: 0, ridgeScale: 0 };
function glide(world, input, secs, { tune = still, y = 600, speed = 16, climb = -1.5 } = {}) {
  const g = createGlider(world, { ...tune });
  g.reset(new THREE.Vector3(0, y, 0), 90, speed, climb);
  for (let i = 0; i < secs * 120; i++) g.step(1 / 120, input);
  return g;
}
const hands = { pitch: 0, roll: 0, flare: 0 };

test('the tuned numbers are the live game\'s', () => {
  const pick = ({ mass, area, cl0, clPerDeg, alphaStall, cd0, kInduced, alphaTrim, alphaMin, alphaMax, alphaFlare, maxG, groundEffect, assistDrag, seaSink, cityLift }) =>
    ({ mass, area, cl0, clPerDeg, alphaStall, cd0, kInduced, alphaTrim, alphaMin, alphaMax, alphaFlare, maxG, groundEffect, assistDrag, seaSink, cityLift });
  assert.deepEqual(pick(TUNE), { mass: 95, area: 5.6, cl0: 0.26, clPerDeg: 0.082, alphaStall: 15, cd0: 0.03, kInduced: 0.07, alphaTrim: 5.3, alphaMin: -1.5, alphaMax: 14.2, alphaFlare: 19, maxG: 3.4, groundEffect: 0.5, assistDrag: 0.7, seaSink: 0.35, cityLift: 0.55 });
  const g = createGlider(calm());
  assert.ok(Math.abs(g.stallSpeed - 13.7) < 0.1, 'stall speed ' + g.stallSpeed);
});

test('hands off, the wing settles into its trim glide: about 20 m/s and better than 9:1 (the game\'s default drag)', () => {
  const g = glide(calm(), hands, 40);
  const ld = g.groundSpeed / -g.vspeed;
  assert.ok(g.speed > 17 && g.speed < 23, 'speed ' + g.speed);
  assert.ok(ld > 9 && ld < 16, 'L/D ' + ld);
  // the original tuned difficulty (drag x1): about 9-11:1, the figures the game measured
  const h = glide(calm(), hands, 40, { tune: { ...still, assistDrag: 1 } });
  const ld1 = h.groundSpeed / -h.vspeed;
  assert.ok(ld1 > 8.5 && ld1 < 11.5, 'L/D at drag 1: ' + ld1);
});

test('push for speed, pull to slow: height trades for speed', () => {
  const dive = glide(calm(), { pitch: -1, roll: 0, flare: 0 }, 8);
  const pull = glide(calm(), { pitch: 0.5, roll: 0, flare: 0 }, 8);
  assert.ok(dive.speed > 28, 'dive ' + dive.speed);
  assert.ok(pull.speed < 17, 'pull ' + pull.speed);
  assert.ok(dive.pos.y < pull.pos.y, 'the dive lost more height');
});

test('stall: slow and nose high, the wing lets go (nose drops, controls mushy) and recovers', () => {
  const g = createGlider(calm(), { ...still });
  g.reset(new THREE.Vector3(0, 600, 0), 90, 16, 6); // zooming up
  let broke = false;
  for (let i = 0; i < 6 * 120; i++) { g.step(1 / 120, { pitch: 1, roll: 0, flare: 0 }); if (g.stallBreak > 0) broke = true; }
  assert.ok(broke, 'a stall break happened');
  for (let i = 0; i < 8 * 120; i++) g.step(1 / 120, hands);
  assert.equal(g.stallBreak <= 0, true);
  assert.ok(g.speed > g.stallSpeed * 1.2, 'flying again at ' + g.speed);
});

test('the flare is the landing: past the stall on purpose, slow and draggy, no stall break', () => {
  const g = createGlider(calm(), { ...still });
  g.reset(new THREE.Vector3(0, 600, 0), 90, 18, -1);
  for (let i = 0; i < 3 * 120; i++) g.step(1 / 120, { pitch: 0.6, roll: 0, flare: 1 });
  assert.ok(g.alpha > TUNE.alphaStall, 'alpha ' + g.alpha);
  assert.equal(g.stallBreak <= 0, true);
  assert.ok(g.speed < 14, 'slowed to ' + g.speed);
});

test('g limit: a hard pull at speed is held to about 3.4 g', () => {
  const g = createGlider(calm(), { ...still });
  g.reset(new THREE.Vector3(0, 600, 0), 90, 40, -5);
  let maxG = 0;
  for (let i = 0; i < 0.5 * 120; i++) g.step(1 / 120, { pitch: 1, roll: 0, flare: 0 }); // the angle of attack eases in
  for (let i = 0; i < 2 * 120; i++) { g.step(1 / 120, { pitch: 1, roll: 0, flare: 0 }); maxG = Math.max(maxG, g.gLoad); }
  assert.ok(maxG < 3.55 && maxG > 2.5, 'peak g ' + maxG);
});

test('a banked turn circles without bleeding the height away (turn assist)', () => {
  const lvl = glide(calm(), hands, 20);
  const turn = glide(calm(), { pitch: 0, roll: 0.8, flare: 0 }, 20);
  assert.ok(lvl.pos.y - turn.pos.y < 40, `level ${lvl.pos.y.toFixed(0)} vs turning ${turn.pos.y.toFixed(0)}`);
  assert.ok(turn.bank > 0.5, 'banked ' + turn.bank);
});

test('a thermal lifts: circling in its core climbs', () => {
  const world = calm({ thermals: [{ id: 't', x: 0, z: 0, r: 85, strength: 10.5, top: 212 }] });
  const g = createGlider(world, { ...still });
  g.reset(new THREE.Vector3(-40, 100, 0), 0, 17, 0); // a right turn circles round the core
  let seen = false;
  for (let i = 0; i < 30 * 120; i++) { g.step(1 / 120, { pitch: 0, roll: 0.75, flare: 0 }); if (g.info.thermal?.id === 't') seen = true; }
  assert.ok(g.pos.y > 160, 'climbed to ' + g.pos.y.toFixed(0));
  assert.ok(g.pos.y < 230, 'and stopped near its top: ' + g.pos.y.toFixed(0));
  assert.ok(seen, 'info.thermal named it');
});

test('ridge lift on the windward face, sink on the lee side', () => {
  const world = calm({ wind: { x: -2.2, z: 0 }, heightAt: (x) => Math.max(0, 100 - Math.abs(x) * 0.5) });
  const g = createGlider(world, { ...still, ridgeScale: 1 });
  const out = new THREE.Vector3(), info = {};
  g.airAt(80, 80, 0, 0, out, info); // east face: the breeze blows up it
  const windward = info.lift;
  g.airAt(-80, 80, 0, 0, out, info);
  assert.ok(windward > 1, 'windward ' + windward);
  assert.ok(info.lift < -0.5, 'lee ' + info.lift);
});

test('ground effect: skimming low stretches the glide', () => {
  const world = calm();
  const fly = (y) => {
    const g = createGlider(world, { ...still });
    g.reset(new THREE.Vector3(0, y, 0), 90, 26, 0);
    for (let i = 0; i < 6 * 120; i++) g.step(1 / 120, hands);
    return g;
  };
  const low = fly(3.2), high = fly(300);
  assert.ok(low.pos.y > 1.6, 'still clear of the surface: ' + low.pos.y.toFixed(1));
  assert.ok(low.speed > high.speed - 0.5 || low.pos.y - 3.2 > high.pos.y - 300, 'kept more energy low');
  assert.ok(low.groundEffect > 0.5, 'in ground effect');
});

test('speedScale: every speed x k, the same glide angle', () => {
  const a = glide(calm(), hands, 40);
  const b = glide(calm(), hands, 40, { tune: { ...still, speedScale: 1.4 }, speed: 22 });
  assert.ok(Math.abs(b.speed / a.speed - 1.4) < 0.05, `${b.speed} vs ${a.speed}`);
  assert.ok(Math.abs(b.glideAngle() - a.glideAngle()) < 0.01);
});

test('the autopilot flies the sample route and lands on the field', () => {
  const { result } = simulate();
  assert.equal(result.kind, 'landed', JSON.stringify(result));
  assert.ok(result.fromGoal < 60, 'from the field centre ' + result.fromGoal);
});

test('the tension is real: hands off, or straight at the field with no lift, falls short', () => {
  for (const plan of [[{ do: 'idle' }], [{ do: 'dive', secs: 1.6 }, { do: 'land' }]]) {
    const { result } = simulate({ plan });
    assert.ok(result.fromGoal > 1000, JSON.stringify(result));
  }
});

test('the sample world is what the demo draws: a lake under water, a field to land on', () => {
  const w = createSampleWorld();
  assert.ok(w.heightAt(w.lake.x, w.lake.z) < -3);
  assert.ok(Math.abs(w.heightAt(w.landing.x, w.landing.z) - w.landing.ground) < 0.5);
});
