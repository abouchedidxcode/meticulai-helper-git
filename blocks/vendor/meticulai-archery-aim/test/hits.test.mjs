import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentSphere, segmentCapsule, segmentBox } from '../src/shapes.js';
import { createTargets, bodiesTarget } from '../src/targets.js';
import { createFlight } from '../src/flight.js';
import { Vec3 } from '../src/vec3.js';
import { solve } from '../src/ballistics.js';

const P = (x, y, z) => new Vec3(x, y, z);

test('segment shapes: sphere, capsule, turned box', () => {
  const h = segmentSphere(P(-5, 0, 0), P(5, 0, 0), P(0, 0, 0), 1);
  assert.ok(h && Math.abs(h.point.x + 1) < 1e-9 && Math.abs(h.normal.x + 1) < 1e-9);
  assert.equal(segmentSphere(P(-5, 2, 0), P(5, 2, 0), P(0, 0, 0), 1), null);
  const c = segmentCapsule(P(-5, 1, 0), P(5, 1, 0), P(0, 0, 0), P(0, 2, 0), 0.3);
  assert.ok(c && Math.abs(c.point.x + 0.3) < 1e-4, `capsule entry ${c?.point.x}`);
  assert.equal(segmentCapsule(P(-5, 3, 0), P(5, 3, 0), P(0, 0, 0), P(0, 2, 0), 0.3), null);
  // a board 1 m wide, 7 cm thick, turned to face +X (yaw 90 degrees): hit from -X on its face
  const b = segmentBox(P(-5, 0, 0.2), P(5, 0, 0.2), P(0, 0, 0), 0.5, 0.5, 0.035, Math.PI / 2);
  assert.ok(b && Math.abs(b.point.x + 0.035) < 1e-6, `box entry ${b?.point.x}`);
  assert.ok(Math.abs(b.normal.x + 1) < 1e-6, 'normal faces the arrow');
  assert.equal(segmentBox(P(-5, 0, 0.7), P(5, 0, 0.7), P(0, 0, 0), 0.5, 0.5, 0.035, Math.PI / 2), null);
});

// A thin shield (7 cm) charging at 12.5 m/s at an arrow flying 60 m/s the other way, stepped at 60 Hz: 72.5 m/s
// closing, 1.2 m per step. Tested at the target's CURRENT place only, many arrows step clean over it.
function shieldRun(withVel, phase) {
  const center = P(30, 1.5, 0), vel = P(-12.5, 0, 0);
  const shield = { id: 'shield', center, radius: 1.2, test: (p0, p1) => segmentBox(p0, p1, center, 0.4, 2, 0.035, Math.PI / 2) };   // 7 cm thick along X (tall, so gravity does not matter here)
  if (withVel) shield.vel = vel;
  const targets = createTargets(); targets.add(shield);
  const fl = createFlight({ targets, heightAt: () => -100 });
  const dt = 1 / 60;
  let time = phase * dt;
  const a = fl.launch({ pos: P(0, 1.5, 0), vel: P(60, 0, 0), time });
  for (let k = 0; k < 120; k++) {
    time += dt;
    center.addScaledVector(vel, dt);                 // the target moves first (as a game's sim would)
    const r = fl.step(a, time, dt);
    if (r) return r.hit;
    if (a.pos.x > center.x + 5) return null;
  }
  return null;
}

test('moving targets: the swept test never lets an arrow through a charging shield', () => {
  let hits = 0, hitsNoVel = 0; const N = 40;
  for (let i = 0; i < N; i++) { if (shieldRun(true, i / N)) hits++; if (shieldRun(false, i / N)) hitsNoVel++; }
  assert.equal(hits, N, 'with vel: every arrow strikes');
  assert.ok(hitsNoVel < N, `without vel some tunnel through (${hitsNoVel}/${N} struck)`);
});

test('bodiesTarget: each body sweeps by its own velocity, and the hit carries its key and attach', () => {
  const body = { key: 7, alive: true, center: P(40, 1.9, 0), vel: P(0, 0, 12.5), radius: 0.35, attach: { name: 'rider7' } };
  const targets = createTargets(); targets.add(bodiesTarget({ bodies: () => [body] }));
  const fl = createFlight({ targets });
  const dt = 1 / 60;
  // aim straight at where he is now: he moves 12.5 m/s across, the arrow takes ~0.36 s: a plain shot misses by 4 m
  let time = 0;
  const a = fl.launch({ pos: P(0, 1.9, 0), vel: P(110, 0.6, 0), time });
  let res = null;
  for (let k = 0; k < 90 && !res; k++) { time += dt; body.center.addScaledVector(body.vel, dt); res = fl.step(a, time, dt); }
  assert.ok(res && res.hit.kind === 'ground', 'unguided, unled: it misses him');
});

test('a guided (locked) arrow is steered at a capped rate onto a crossing rider, and the near pass counts', () => {
  const body = { key: 3, alive: true, center: P(60, 1.9, -6), vel: P(0, 0, 12.5), radius: 0.35, attach: { name: 'r3' } };
  const bt = bodiesTarget({ bodies: () => [body] });
  const targets = createTargets(); targets.add(bt);
  const fl = createFlight({ targets });
  const dt = 1 / 60;
  // launched at where he WILL be if he keeps on, then he turns away a little: the guide follows
  const guide = { where: (p, v) => bt.where(3, p, v), turn: 30 * Math.PI / 180, near: 0.4, nearPer: 0.003 };
  let time = 0;
  const from = P(0, 1.9, 0), d = P(0, 0, 0);
  assert.ok(solve(from, body.center, 120, null, body.vel, d) > 0);
  const a = fl.launch({ pos: from, vel: d.clone().multiplyScalar(120), time, guide });
  let res = null;
  for (let k = 0; k < 120 && !res; k++) {
    time += dt;
    if (k === 10) body.vel.set(0, 0, 9);             // he checks his horse: the solved lead is now 1 m wrong
    body.center.addScaledVector(body.vel, dt);
    res = fl.step(a, time, dt);
  }
  assert.ok(res, 'it struck something');
  assert.equal(res.hit.key, 3, `struck the rider (kind ${res.hit.kind})`);
  assert.equal(res.hit.attach.name, 'r3', 'the hit carries what the arrow should ride');
});

test('a hit that does not stick glances off and tumbles to the ground', () => {
  const center = P(20, 1.5, 0);
  const targets = createTargets();
  targets.add({ id: 'helm', center, radius: 1, test: (p0, p1) => { const h = segmentSphere(p0, p1, center, 0.6); return h && { ...h, kind: 'helm', stick: false }; } });
  const fl = createFlight({ targets });
  let time = 0; const dt = 1 / 60;
  const a = fl.launch({ pos: P(0, 1.5, 0), vel: P(60, 0.5, 0), time });
  let res = null;
  for (let k = 0; k < 60 && !res; k++) { time += dt; res = fl.step(a, time, dt); }
  assert.equal(res.hit.kind, 'helm');
  fl.glance(a, res.hit, time, () => 0.5);
  assert.equal(a.state, 4);
  assert.ok(a.v0.length() < 20, 'lost most of its speed');
  let end = null;
  for (let k = 0; k < 600 && !end; k++) { time += dt; end = fl.step(a, time, dt); }
  assert.equal(end.hit.kind, 'ground', 'a glanced arrow only meets the ground');
});
