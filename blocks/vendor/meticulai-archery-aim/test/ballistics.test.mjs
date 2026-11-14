import test from 'node:test';
import assert from 'node:assert/strict';
import { at, solve, flightTime, speedForArc, G, DRAG } from '../src/ballistics.js';

const P = (x, y, z) => ({ x, y, z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('at() matches a small-step integration of gravity + linear drag', () => {
  const p0 = P(0, 2, 0), v0 = P(30, 40, 10);
  const p = { ...p0 }, v = { ...v0 }, h = 1e-4;
  for (let t = 0; t < 3 - 1e-9; t += h) {
    v.x += -DRAG * v.x * h; v.y += (-G - DRAG * v.y) * h; v.z += -DRAG * v.z * h;
    p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
  }
  const outP = P(0, 0, 0), outV = P(0, 0, 0);
  at(p0, v0, 3, outP, outV);
  assert.ok(dist(outP, p) < 0.02, `closed form ${JSON.stringify(outP)} vs integrated ${JSON.stringify(p)}`);
  assert.ok(dist(outV, v) < 0.01);
});

test('solve() sends the arrow through a standing point (flat and lobbed)', () => {
  const from = P(0, 2, 0), to = P(120, 1.5, 40), speed = 58, d = P(0, 0, 0), p = P(0, 0, 0);
  for (const high of [false, true]) {
    const t = solve(from, to, speed, null, null, d, high);
    assert.ok(t > 0);
    assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9, 'unit direction');
    at(from, P(d.x * speed, d.y * speed, d.z * speed), t, p);
    assert.ok(dist(p, to) < 0.01, `${high ? 'lobbed' : 'flat'} miss ${dist(p, to)}`);
  }
  const tFlat = solve(from, to, speed, null, null, d, false), tHigh = solve(from, to, speed, null, null, d, true);
  assert.ok(tHigh > tFlat * 3, 'the lobbed path takes far longer');
});

test('solve() includes the shooter\'s own velocity and the target\'s', () => {
  const from = P(0, 2.4, 0), to = P(10, 1.9, 80), speed = 120;
  const carry = P(0, 0, 12.5), tvel = P(-12.5, 0, 0), d = P(0, 0, 0), p = P(0, 0, 0);
  const t = solve(from, to, speed, carry, tvel, d);
  assert.ok(t > 0);
  const v0 = P(d.x * speed + carry.x, d.y * speed + carry.y, d.z * speed + carry.z);
  at(from, v0, t, p);
  const there = P(to.x + tvel.x * t, to.y, to.z + tvel.z * t);
  assert.ok(dist(p, there) < 0.01, `miss ${dist(p, there)} m`);
});

test('solve() says 0 when the point is out of reach', () => {
  const d = P(0, 0, 0);
  assert.equal(solve(P(0, 0, 0), P(2000, 0, 0), 60, null, null, d), 0);
  // a lob from a 120 m/s bow would stay up longer than the 14 s the search covers: no answer rather than a wrong one
  assert.equal(solve(P(0, 2, 0), P(120, 1.5, 40), 120, null, null, d, true), 0);
});

test('a full draw (120 m/s) at a 300 m point flies about 2.9 s, nearly flat', () => {
  const d = P(0, 0, 0), t = solve(P(0, 2, 0), P(300, 2, 0), 120, null, null, d);
  assert.ok(t > 2.4 && t < 3.2, `flight ${t}`);
  assert.ok(Math.asin(d.y) * 180 / Math.PI < 8, 'aimed only a few degrees up');
});

test('flightTime() lands on the ground, on a slope too', () => {
  const p0 = P(0, 2, 0), v0 = P(40, 30, 0), p = P(0, 0, 0);
  const flat = flightTime(p0, v0, () => 0);
  at(p0, v0, flat, p); assert.ok(Math.abs(p.y) < 0.01);
  const hill = (x) => x * 0.1;
  const t = flightTime(p0, v0, hill);
  at(p0, v0, t, p); assert.ok(Math.abs(p.y - hill(p.x)) < 0.1, `on the slope: ${p.y} vs ${hill(p.x)}`);
});

test('speedForArc() finds the speed that carries a volley that far', () => {
  const from = P(0, 2.1, 0), to = P(180, 1.2, 0);
  const s = speedForArc(from, to, 40);
  const p = P(0, 0, 0);
  at(from, P(s.dir.x * s.speed, s.dir.y * s.speed, s.dir.z * s.speed), s.time, p);
  assert.ok(dist(p, to) < 0.5, `lands ${dist(p, to)} m off`);
  assert.ok(s.time > 4 && s.time < 6.5, `about 5 s in the air for 180 m (${s.time})`);
});
