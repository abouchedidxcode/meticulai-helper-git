import test from 'node:test';
import assert from 'node:assert/strict';
import { createAim, AIM_DEFAULTS } from '../src/aim.js';
import { createTargets, bodiesTarget } from '../src/targets.js';
import { segmentSphere, segmentBox } from '../src/shapes.js';
import { Vec3 } from '../src/vec3.js';

const P = (x, y, z) => new Vec3(x, y, z);
const eye = P(0, 2.4, 0);
const toward = (p, offDeg = 0) => {           // a ray at p, turned offDeg degrees to the side
  const d = new Vec3().subVectors(p, eye).normalize(), a = offDeg * Math.PI / 180;
  return P(d.x * Math.cos(a) - d.z * Math.sin(a), d.y, d.x * Math.sin(a) + d.z * Math.cos(a)).normalize();
};
function world(extra = {}) {
  const bodies = [{ key: 'A', alive: true, center: P(0, 1.95, 80), vel: P(12.5, 0, 0), radius: 0.3 }];
  const targets = createTargets(); targets.add(bodiesTarget({ bodies: () => bodies }));
  let time = 0;
  const aim = createAim({ targets, now: () => time, ...extra });
  return { bodies, targets, aim, tick: (dt) => { time += dt; for (const b of bodies) b.center.addScaledVector(b.vel, dt); return time; } };
}

test('the tuned numbers are the source game\'s', () => {
  assert.equal(AIM_DEFAULTS.assistDeg, 1.1);
  assert.equal(AIM_DEFAULTS.assistBody, 0.4);
  assert.equal(AIM_DEFAULTS.aimFar, 300);
  assert.equal(AIM_DEFAULTS.seekBodyFrom, 35);
});

test('the crosshair ON an enemy locks the shot to that spot of him, moving with him', () => {
  const { aim, bodies } = world();
  const spot = P(0, 2.1, 80);                                  // a hand above his chest
  const pk = aim.pick(eye, toward(spot));
  assert.equal(pk.kind, 'enemy'); assert.equal(pk.key, 'A'); assert.ok(pk.direct && pk.lock);
  assert.ok(Math.abs(pk.vel.x - 12.5) < 1e-9, 'it knows how he moves');
  bodies[0].center.x += 5;
  const p = P(0, 0, 0), v = P(0, 0, 0);
  pk.lock.where(p, v);
  assert.ok(Math.abs(p.x - 5) < 0.05 && Math.abs(p.y - 2.1) < 0.05, 'the lock rides with him, at the spot aimed at');
});

test('beside him: within 1.1 degrees (+0.4 m of him) it locks, further out it does not', () => {
  const { aim } = world();
  const c = P(0, 1.95, 80);
  const near = aim.pick(eye, toward(c, 1.1));
  assert.equal(near.kind, 'enemy', 'a degree off is still him');
  assert.ok(!near.direct);
  const far = aim.pick(eye, toward(c, 2.5));
  assert.notEqual(far.kind, 'enemy');
});

test('nothing there: the far point 300 m out, or the ground', () => {
  const { aim } = world();
  const up = aim.pick(eye, P(0, 0.1, -1).normalize());
  assert.equal(up.kind, 'far'); assert.ok(Math.abs(up.dist - 300) < 1e-9);
  const down = aim.pick(eye, P(0, -0.2, -1).normalize());
  assert.equal(down.kind, 'ground'); assert.ok(Math.abs(down.point.y) < 0.05);
});

test('the ground hides: no help through a hill', () => {
  const hill = (x, z) => (z > 30 && z < 50 ? 6 : 0);
  const { aim } = world({ heightAt: hill });
  const pk = aim.pick(eye, toward(P(0, 1.95, 80), 0.8));
  assert.notEqual(pk.kind, 'enemy');
});

test('a crosshair on his horse (seekBody) sends the arrow at the rider', () => {
  const bodies = [{ key: 'K', alive: true, center: P(0, 1.95, 60), vel: P(0, 0, 0), radius: 0.3, extra: [{ center: P(0, 1.0, 60), radius: 0.6, kind: 'horse', seekBody: true }] }];
  const targets = createTargets(); targets.add(bodiesTarget({ bodies: () => bodies }));
  const aim = createAim({ targets });
  const pk = aim.pick(eye, toward(P(0, 0.9, 60)));
  assert.equal(pk.kind, 'enemy');
  assert.ok(Math.abs(pk.point.y - 1.95) < 1e-6, 'aimed at his chest, not the horse');
});

test('a practice target that moves is locked as a whole; one standing still is just a point', () => {
  const targets = createTargets();
  const c1 = P(10, 2, 50), c2 = P(-10, 2, 50);
  targets.add({ id: 'cart', center: c1, radius: 1, vel: P(0, 0, 4), test: (a, b) => segmentSphere(a, b, c1, 0.8) });
  targets.add({ id: 'board', center: c2, radius: 1, test: (a, b) => segmentBox(a, b, c2, 0.6, 0.6, 0.05) });
  const aim = createAim({ targets });
  const m = aim.pick(eye, toward(c1));
  assert.equal(m.kind, 'target'); assert.ok(m.lock); assert.equal(m.vel.z, 4);
  const s = aim.pick(eye, toward(c2));
  assert.equal(s.kind, 'target'); assert.equal(s.lock, null);
});

test('friends are never aim points', () => {
  const targets = createTargets(); const c = P(0, 2, 40);
  targets.add({ id: 'ally', friend: true, center: c, radius: 1, test: (a, b) => segmentSphere(a, b, c, 0.5) });
  const aim = createAim({ targets });
  assert.notEqual(aim.pick(eye, toward(c)).kind, 'target');
});

test('the mark holds steady between two riders side by side, and keeps the shot', () => {
  const bodies = [
    { key: 'L', alive: true, center: P(-0.9, 1.95, 100), vel: P(0, 0, 0), radius: 0.3 },
    { key: 'R', alive: true, center: P(0.9, 1.95, 100), vel: P(0, 0, 0), radius: 0.3 },
  ];
  const targets = createTargets(); targets.add(bodiesTarget({ bodies: () => bodies }));
  const aim = createAim({ targets });
  // the crosshair comes to rest between them, a hair nearer L, then wanders a hair nearer R
  let t = 0;
  for (let i = 0; i < 6; i++) aim.track(eye, toward(P(-0.05, 1.95, 100)), t += 0.1);
  assert.equal(aim.mark.thing, 'L');
  for (let i = 0; i < 10; i++) aim.track(eye, toward(P(0.05, 1.95, 100)), t += 0.1);
  assert.equal(aim.mark.thing, 'L', 'a hair nearer is not CLEARLY nearer: the mark stays');
  const shot = aim.resolve(eye, toward(P(0.05, 1.95, 100)));
  assert.equal(shot.key, 'L', 'what was shown is what happens');
  assert.equal(shot.kept, true);
  // clearly nearer R, held: R takes it
  for (let i = 0; i < 4; i++) aim.track(eye, toward(P(0.6, 1.95, 100)), t += 0.1);
  assert.equal(aim.mark.thing, 'R');
});
