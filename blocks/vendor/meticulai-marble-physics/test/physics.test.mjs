// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  World, makeBody, makeCollider, stepWorld, stepSingle, stateHash, copyBody, restoreBody, poseAt, testCollider,
  lastHit, matYPR, makeCtl, controlStep, DEFAULT_STATS, BTN_JUMP, GRAVITY, MAX_SPEED, TICK_DT, useMath,
} from '../src/index.js';
import { buildSampleTrack } from '../src/sample-track.js';

function race(seed, ticks, { inputs = null } = {}) {
  const track = buildSampleTrack(seed);
  const world = new World(track.colliders);
  const bodies = [];
  for (let i = 0; i < 20; i++) {
    const b = makeBody(i);
    const s = track.spawn(i);
    b.x = s[0]; b.y = s[1]; b.z = s[2];
    bodies.push(b);
  }
  const ctls = bodies.map(() => makeCtl());
  const hashes = [];
  for (let t = 0; t < ticks; t++) {
    if (inputs) bodies.forEach((b, i) => controlStep(b, ctls[i], inputs(t, i), DEFAULT_STATS, null));
    stepWorld(world, bodies, t * world.tickDt);
    if (t % 60 === 59) hashes.push(stateHash(bodies));
  }
  return { hashes, bodies, world, track };
}

test('same seed and inputs give the same state hash every second (determinism)', () => {
  const steer = (t, i) => ({ mx: Math.sin(t * 0.05 + i) * 0.6, mz: 0.8, btn: t % 97 === i ? BTN_JUMP : 0 });
  const a = race(3, 600, { inputs: steer });
  const b = race(3, 600, { inputs: steer });
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(a.hashes.length, 10);
});

test('a different seed or a different input gives a different result', () => {
  const a = race(3, 300);
  const b = race(4, 300);
  assert.notEqual(a.hashes.at(-1), b.hashes.at(-1));
  const c = race(3, 300, { inputs: (t, i) => ({ mx: i === 5 && t === 10 ? 1 : 0, mz: 0, btn: 0 }) });
  assert.notEqual(a.hashes.at(-1), c.hashes.at(-1));
});

test('snapshot and restore mid-run continues bit-identically (rollback / replay checkpoints)', () => {
  const track = buildSampleTrack(5);
  const world = new World(track.colliders);
  const bodies = [];
  for (let i = 0; i < 12; i++) {
    const b = makeBody(i);
    const s = track.spawn(i);
    b.x = s[0]; b.y = s[1]; b.z = s[2];
    bodies.push(b);
  }
  for (let t = 0; t < 200; t++) stepWorld(world, bodies, t * world.tickDt);
  const snap = bodies.map(copyBody);
  for (let t = 200; t < 400; t++) stepWorld(world, bodies, t * world.tickDt);
  const straight = stateHash(bodies);
  bodies.forEach((b, i) => restoreBody(b, snap[i]));
  for (let t = 200; t < 400; t++) stepWorld(world, bodies, t * world.tickDt);
  assert.equal(stateHash(bodies), straight);
});

test('kinematic obstacles are pure functions of time', () => {
  const spin = makeCollider('box', { c: [1, 2, 3], hx: 2, hy: 0.3, hz: 0.2, motion: { type: 'spin', axis: [0, 1, 0], speed: 1.7, phase: 0.3 } });
  poseAt(spin, 4.25);
  const a = [...spin.R, ...spin.c];
  poseAt(spin, 1.0);
  poseAt(spin, 4.25);
  assert.deepEqual([...spin.R, ...spin.c], a);
  const drop = makeCollider('box', { c: [0, 0, 0], hx: 1, hy: 0.2, hz: 1, motion: { type: 'drop', period: 4, phase: 0, closedFrac: 0.5, depth: 3 } });
  poseAt(drop, 1);
  assert.equal(drop.enabled, true);
  poseAt(drop, 3);
  assert.equal(drop.enabled, false);
});

test('a marble comes to rest on a flat floor at its radius, without jitter', () => {
  const floor = makeCollider('box', { c: [0, -0.5, 0], hx: 10, hy: 0.5, hz: 10 });
  const world = new World([floor]);
  const b = makeBody(0);
  b.y = 3;
  for (let t = 0; t < 240; t++) stepWorld(world, [b], t * world.tickDt);
  assert.ok(Math.abs(b.y - 0.5) < 0.01, `y = ${b.y}`);
  assert.ok(b.grounded);
  const y0 = b.y;
  for (let t = 240; t < 300; t++) stepWorld(world, [b], t * world.tickDt);
  assert.ok(Math.abs(b.y - y0) < 1e-3 && Math.abs(b.vy) < 0.5, `drifted to ${b.y}, vy ${b.vy}`);
});

test('a marble speeds up down a slope (gravity 46 along the slope, less friction loss)', () => {
  const pitch = 0.2;
  const R = matYPR(0, pitch);
  const plank = makeCollider('box', { c: [0, 0, 0], R, hx: 3, hy: 0.25, hz: 40 });
  const world = new World([plank]);
  const b = makeBody(0);
  const top = [R[1] * 0.75 + R[2] * -30, R[4] * 0.75 + R[5] * -30, R[7] * 0.75 + R[8] * -30];
  b.x = top[0]; b.y = top[1]; b.z = top[2];
  for (let t = 0; t < 60; t++) stepWorld(world, [b], t * world.tickDt);
  const v = Math.hypot(b.vx, b.vy, b.vz);
  const ideal = GRAVITY * Math.sin(pitch) * 1; // 1 second, no losses
  assert.ok(v > ideal * 0.85 && v <= ideal * 1.01, `v = ${v}, ideal ${ideal}`);
  assert.ok(b.vz > 0);
});

test('speed is capped at MAX_SPEED and World options override the defaults', () => {
  const world = new World([]);
  const b = makeBody(0);
  b.vy = -100;
  stepWorld(world, [b], 0);
  assert.ok(Math.hypot(b.vx, b.vy, b.vz) <= MAX_SPEED + 1e-9);
  const moon = new World([], { gravity: 8, maxSpeed: 20, substeps: 2 });
  const m = makeBody(1);
  stepWorld(moon, [m], 0);
  assert.ok(Math.abs(m.vy + 8 * TICK_DT) < 1e-12, `vy ${m.vy}`);
});

test('lathe and helix contacts push the marble out of the shell, normal facing it', () => {
  const bowl = makeCollider('lathe', { c: [0, 0, 0], profile: [[0, 0], [5, 0], [6, 2]] });
  assert.ok(testCollider(bowl, 2, 0.6, 1, 0.5));
  assert.ok(lastHit.ny > 0.99 && lastHit.depth > 0.2);
  const loop = makeCollider('helix', { c: [0, 0, 0], profile: [[3, -1], [3, 1]], a0: 0, a1: Math.PI * 2, rise: 4 });
  // Inside the tube wall at the start of the winding: normal points inward (toward the axis).
  assert.ok(testCollider(loop, 2.4, 0, 0, 0.5));
  assert.ok(lastHit.nx < -0.9, `nx ${lastHit.nx}`);
});

test('marble-marble hits conserve momentum for equal masses and report bumps', () => {
  const world = new World([]);
  const a = makeBody(0), b = makeBody(1);
  a.gravity = b.gravity = 0;
  a.x = -1; a.vx = 6;
  b.x = 0.2;
  const events = [];
  for (let t = 0; t < 4; t++) stepWorld(world, [a, b], t * world.tickDt, events);
  assert.ok(Math.abs(a.vx + b.vx - 6) < 1e-9);
  assert.ok(b.vx > a.vx);
  assert.deepEqual(events.slice(0, 2), [0, 1]);
});

test('controller: holding forward on flat ground settles near topSpeed; jump leaves the ground', () => {
  const floor = makeCollider('box', { c: [0, -0.5, 0], hx: 400, hy: 0.5, hz: 400 });
  const world = new World([floor]);
  const b = makeBody(0);
  b.y = 0.5;
  const ctl = makeCtl();
  for (let t = 0; t < 600; t++) {
    controlStep(b, ctl, { mx: 0, mz: 1, btn: 0 }, DEFAULT_STATS, null);
    stepWorld(world, [b], t * world.tickDt);
  }
  assert.ok(b.vz > DEFAULT_STATS.topSpeed * 0.8 && b.vz < DEFAULT_STATS.topSpeed * 1.05, `vz ${b.vz}`);
  const fired = controlStep(b, ctl, { mx: 0, mz: 1, btn: BTN_JUMP }, DEFAULT_STATS, null);
  assert.equal(fired, 'jump');
  stepWorld(world, [b], 600 * world.tickDt);
  assert.ok(b.vy > 5 && !b.grounded);
});

test('stepSingle (client prediction) agrees with stepWorld for a lone marble', () => {
  const { track } = race(2, 0);
  const w1 = new World(track.colliders), w2 = new World(buildSampleTrack(2).colliders);
  const a = makeBody(0), b = makeBody(0);
  const s = track.spawn(3);
  for (const m of [a, b]) { m.x = s[0]; m.y = s[1]; m.z = s[2]; }
  for (let t = 0; t < 300; t++) {
    stepWorld(w1, [a], t * w1.tickDt);
    stepSingle(w2, b, t * w2.tickDt, null);
  }
  assert.equal(stateHash([a]), stateHash([b]));
});

test('useMath swaps the Math the physics uses (for a cross-engine deterministic Math)', () => {
  let calls = 0;
  const spy = new Proxy(Math, { get: (t, k) => { calls++; return t[k]; } });
  useMath(spy);
  try {
    race(1, 5);
  } finally {
    useMath(Math);
  }
  assert.ok(calls > 0);
});

test('the sample track drains marbles through the bowl (the demo loop works)', () => {
  const { bodies, track } = race(1, 60 * 25);
  const drained = bodies.filter((b) => b.y < track.killY).length;
  assert.ok(drained >= 10, `only ${drained} of 20 drained in 25 s`);
});
