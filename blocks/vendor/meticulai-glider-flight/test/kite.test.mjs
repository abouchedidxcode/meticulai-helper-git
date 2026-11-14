// Kite mode: the game's own tests (Kite Race tests/glide.test.ts), moved from vitest to node:test.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KiteGlider, KITE, softLimit } from '../src/kite.js';

const calm = { power: 0, lift: 0, draft: 0 };
const fly = (g, secs, inp = { turn: 0, climb: 0 }, env = calm) => { for (let i = 0; i < secs * 60; i++) g.step(1 / 60, inp, env); return g; };
const fresh = () => { const g = new KiteGlider(); g.place(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, 0, -1), KITE.cruise); return g; };
const gt = (a, b, m = '') => assert.ok(a > b, `${m} ${a} > ${b}`);
const lt = (a, b, m = '') => assert.ok(a < b, `${m} ${a} < ${b}`);

test('cruises straight and level with the stick at rest', () => {
  const g = fly(fresh(), 3);
  assert.ok(Math.abs(g.speed - KITE.cruise) < 0.5);
  assert.ok(Math.abs(g.pos.y - 50) < 0.05);
  lt(Math.abs(g.pos.x), 0.01);
  lt(g.pos.z, -42);
});

test('turns right at about the turn rate, at once, banking gently into it', () => {
  const g = fresh();
  fly(g, 0.25, { turn: 1, climb: 0 });
  gt(g.yawRate, KITE.turnRate * 0.8);
  gt(g.bank, 0.3);
  fly(g, 0.75, { turn: 1, climb: 0 });
  assert.ok(g.bank <= KITE.maxBank + 1e-6);
  gt(g.bank, 0.55);
  gt(g.yaw, 1.0);
  gt(g.pos.x, 0);
});

test('climbing costs speed gently (never under the floor); diving gains it', () => {
  const up = fly(fresh(), 2, { turn: 0, climb: 1 });
  const down = fly(fresh(), 2, { turn: 0, climb: -1 });
  gt(up.pos.y, 60); lt(up.speed, KITE.cruise - 0.5); gt(up.speed, KITE.floor - 0.5);
  lt(down.pos.y, 40); gt(down.speed, KITE.cruise + 3);
  gt(down.speed - KITE.cruise, KITE.cruise - up.speed, 'the dive gains more than the climb costs');
});

test('racing never hovers: after a hard wall hit the kite is back over the floor within ~1.2 s', () => {
  const g = fresh();
  g.speed = KITE.min;
  fly(g, 1.2);
  gt(g.speed, KITE.floor);
});

test('the speeds: plain ~15 m/s (54 km/h), a stream 1.25-1.45x that, a gust in a stream ~24-28 (~95 km/h)', () => {
  const plain = fly(fresh(), 4);
  gt(plain.speed, 14.5); lt(plain.speed, 16);
  for (const power of [1, 1.3]) {
    const st = fly(fresh(), 5, { turn: 0, climb: 0 }, { power, lift: 0, draft: 0 });
    gt(st.speed, 19, `stream ${power}`); lt(st.speed, 22);
    gt(st.speed / plain.speed, 1.25); lt(st.speed / plain.speed, 1.45);
    st.gust(); fly(st, 2, { turn: 0, climb: 0 }, { power, lift: 0, draft: 0 });
    gt(st.speed, 23, `gust in stream ${power}`); lt(st.speed, 28);
  }
});

test('no flat cap: a soft limiter, so more push always shows (and never passes the ceiling)', () => {
  const ceil = KITE.top + 2;
  let last = 0;
  for (let v = KITE.knee; v <= 80; v += 2) { const o = softLimit(v, KITE.knee, ceil); gt(o, last); lt(o, ceil); last = o; }
  const a = fresh(), b = fresh();
  a.gust(); b.gust();
  fly(a, 2, { turn: 0, climb: 0 }, { power: 1.3, lift: 0, draft: 0 });
  fly(b, 2, { turn: 0, climb: 0 }, { power: 1.3, lift: 0, draft: 1 });
  gt(b.speed - a.speed, 0.4);
});

test('a wind stream swells in, never sags while ridden, and bleeds back after', () => {
  const inS = { power: 1, lift: 0, draft: 0, stream: 1 };
  const g = fly(fresh(), 1);
  const v0 = g.speed;
  fly(g, 0.4, { turn: 0, climb: 0 }, inS);
  gt(g.speed / v0, 1.12, '0.4 s in'); lt(g.speed / v0, 1.3, '0.4 s in');
  lt(g.streamT, 0.45);
  let last = g.speed, fell = 0;
  for (let i = 0; i < 120; i++) {
    g.step(1 / 60, { turn: 0.8, climb: 0.6 }, { ...inS, power: 1 - 0.15 * (i / 120) });
    fell = Math.max(fell, last - g.speed); last = g.speed;
  }
  assert.equal(fell, 0, 'a fall in the stream');
  const held = g.speed;
  fly(g, 0.3);
  gt(g.speed, held - (held - v0) * 0.4, 'not dropped at once');
  fly(g, 2.2);
  lt(g.speed, v0 + (held - v0) * 0.4, 'mostly bled back by 2.5 s');
  const h = fly(fresh(), 2, { turn: 0, climb: 0 }, inS);
  const ride = h.speed;
  h.gust(); fly(h, 6, { turn: 0, climb: 0 }, inS);
  gt(h.speed, ride - 0.05); lt(h.speed, ride + 2);
});

test('the gust swells in and runs out after ~2.6 s, under the ceiling', () => {
  const g = fresh();
  g.gust();
  gt(g.speed, KITE.cruise + 0.5); lt(g.speed, KITE.cruise + 2);
  fly(g, 1);
  gt(g.speed, KITE.cruise + 3);
  assert.equal(g.gusting, true);
  fly(g, 1.7);
  assert.equal(g.gusting, false);
  const s = fresh(); s.gust(); fly(s, 1.5, { turn: 0, climb: -1 }, { power: 1.3, lift: 0, draft: 1 });
  lt(s.speed, KITE.top + 2);
});

test('a thermal lifts without costing speed', () => {
  const g = fly(fresh(), 2, { turn: 0, climb: 0 }, { power: 0, lift: 6, draft: 0 });
  gt(g.pos.y, 60);
  assert.ok(Math.abs(g.speed - KITE.cruise) < 0.5);
});

test('a wall contact pushes out, slides along it and costs ~20% speed head-on, less glancing', () => {
  const g = fresh();
  g.speed = 30;
  const lost = g.collide(new THREE.Vector3(0, 0, 1), 0.3, true);
  gt(g.pos.z, 0.29);
  gt(lost / 30, 0.15); lt(lost / 30, 0.25);
  const h = fresh();
  h.place(h.pos, new THREE.Vector3(0.95, 0, -0.3).normalize(), 30);
  const lost2 = h.collide(new THREE.Vector3(0, 0, 1), 0.1, true);
  lt(lost2, lost);
  assert.ok(h.fwd.z >= -1e-6, 'no longer heading into the wall');
  gt(h.fwd.x, 0.9, 'slides on along it');
});
