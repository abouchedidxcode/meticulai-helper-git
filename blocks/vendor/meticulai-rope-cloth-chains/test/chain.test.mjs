// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Chain, chainPath, Chain3, PRESETS, gameWind, scaled } from '../src/index.js';

const DT = 1 / 60;
const len2 = (c) => { let L = 0; for (let i = 1; i < c.n; i++) L += Math.hypot(c.x[i] - c.x[i - 1], c.y[i] - c.y[i - 1]); return L; };

test('the first step hangs the chain along its rest direction at rest', () => {
  const c = new Chain(5, 10, 1500, 0.9);
  c.step(100, 200, 0, -1, DT, 0, 0, -1e6);
  for (let i = 0; i < 5; i++) {
    assert.equal(c.x[i], 100);
    assert.equal(c.y[i], 200 - 10 * i);
  }
});

test('hanging still, gravity pulls it straight down and the links keep their length', () => {
  const c = new Chain(6, 12, 1500, 0.9);
  c.step(0, 0, 0.7, -0.7, DT, 0, 0, -1e6); // starts tilted
  for (let i = 0; i < 600; i++) c.step(0, 0, 0.7, -0.7, DT, 0, 0, -1e6);
  const tip = c.n - 1;
  assert.ok(Math.abs(c.x[tip]) < 0.5, `tip x ${c.x[tip]}`);
  assert.ok(Math.abs(len2(c) - 60) < 0.6, `length ${len2(c)}`);
});

test('moving the pin sideways, the chain trails behind it (follow-through)', () => {
  const c = new Chain(7, 13, 1300, 0.9);
  c.step(0, 0, 0, -1, DT, 0, 0, -1e6);
  let x = 0;
  for (let i = 0; i < 30; i++) { x += 8; c.step(x, 0, 0, -1, DT, 0, 0, -1e6); }
  assert.ok(c.x[c.n - 1] < x - 20, `tip ${c.x[c.n - 1]} vs pin ${x}`);
  // ...and swings past and settles back under the pin once it stops.
  for (let i = 0; i < 900; i++) c.step(x, 0, 0, -1, DT, 0, 0, -1e6);
  assert.ok(Math.abs(c.x[c.n - 1] - x) < 1, `settled tip ${c.x[c.n - 1]}`);
});

test('light, low-drag ribbons trail further than heavy sashes at the same speed', () => {
  const run = (p) => {
    const c = new Chain(p.n, p.seg, p.grav, p.drag, p.stiff);
    c.step(0, 0, 0, -1, DT, 0, 0, -1e6);
    let x = 0;
    for (let i = 0; i < 120; i++) { x += 6; c.step(x, 0, 0, -1, DT, 0, 0, -1e6); }
    const t = c.n - 1;
    return Math.atan2(x - c.x[t], -c.y[t]); // angle from straight down toward behind
  };
  assert.ok(run(PRESETS.headbandRibbon) > run(PRESETS.sash) + 0.2);
});

test('stiffness holds the rest shape (a ponytail sweeps back with no motion)', () => {
  const p = PRESETS.ponytail;
  const stiff = new Chain(p.n, p.seg, p.grav, p.drag, p.stiff);
  const limp = new Chain(p.n, p.seg, p.grav, p.drag, 0);
  for (const c of [stiff, limp]) for (let i = 0; i < 600; i++) c.step(0, 0, -0.8, -0.6, DT, 0, 0, -1e6);
  assert.ok(stiff.x[p.n - 1] < limp.x[p.n - 1] - 5, `stiff ${stiff.x[p.n - 1]} limp ${limp.x[p.n - 1]}`);
});

test('the floor stops nodes 2 units above it', () => {
  const c = new Chain(8, 15, 2000, 0.85);
  for (let i = 0; i < 300; i++) c.step(0, 40, 0, -1, DT, 0, 0, 0);
  for (let i = 1; i < c.n; i++) assert.ok(c.y[i] >= 2 - 1e-4, `node ${i} y ${c.y[i]}`);
});

test('a teleport resets instead of whipping; kill() re-hangs on the next step', () => {
  const c = new Chain(5, 10, 1500, 0.9);
  c.step(0, 0, 0, -1, DT, 0, 0, -1e6);
  c.step(1000, 0, 0, -1, DT, 0, 0, -1e6);
  assert.equal(c.x[4], 1000);
  c.kill();
  c.step(5, 5, 1, 0, DT, 0, 0, -1e6);
  assert.equal(c.x[4], 45);
});

test('long frames are capped (1/24 s) and split, so a hitch does not explode the chain', () => {
  const c = new Chain(6, 12, 1500, 0.9);
  c.step(0, 0, 0, -1, DT, 0, 0, -1e6);
  for (let i = 0; i < 20; i++) c.step(i * 30, 0, 0, -1, 0.5, 300, 0, -1e6);
  for (let i = 0; i < c.n; i++) assert.ok(Number.isFinite(c.x[i]) && Number.isFinite(c.y[i]));
  assert.ok(len2(c) < 60 * 1.2);
});

test('Chain3 in the z = 0 plane matches the 2D chain', () => {
  const a = new Chain(7, 13, 520, 0.84), b = new Chain3(7, 13, 520, 0.84);
  b.snap = 420; b.floorGap = 2;
  for (let i = 0; i < 400; i++) {
    const x = Math.sin(i * 0.05) * 80, y = Math.cos(i * 0.03) * 20 + 50;
    const [wx, wy] = gameWind(i * DT, 1);
    a.step(x, y, -0.95, -0.3, DT, wx, wy, 0);
    b.step([x, y, 0], [-0.95, -0.3, 0], DT, [wx, wy, 0], 0);
  }
  for (let i = 0; i < 7; i++) {
    assert.ok(Math.abs(a.x[i] - b.x[i]) < 1e-3 && Math.abs(a.y[i] - b.y[i]) < 1e-3, `node ${i}`);
    assert.equal(b.z[i], 0);
  }
});

test('Chain3 trails in 3D and keeps its length; accepts Vector3-like objects', () => {
  const p = scaled(PRESETS.scarf, 0.007);
  const c = new Chain3(p.n, p.seg, p.grav, p.drag, p.stiff);
  const pin = { x: 0, y: 1.4, z: 0 };
  for (let i = 0; i < 120; i++) { pin.z += 5 * DT; c.step(pin, { x: 0, y: -0.5, z: -0.86 }, DT, { x: 0, y: 0, z: 0 }, 0); }
  assert.ok(c.z[c.n - 1] < pin.z - 0.3, 'tip behind');
  assert.ok(Math.abs(c.length() - p.seg * (p.n - 1)) < p.seg * (p.n - 1) * 0.06, `length ${c.length()}`);
  assert.ok(Math.abs(p.grav - 3.92) < 1e-9 && p.drag === 0.87 && p.stiff === 46);
});

test('chainPath outlines a tapered strip (2n points plus a tip) on a Canvas-like context', () => {
  const pts = [];
  const ctx = { moveTo: (x, y) => pts.push(['M', x, y]), lineTo: (x, y) => pts.push(['L', x, y]), closePath: () => pts.push(['Z']) };
  const c = new Chain(5, 10, 1500, 0.9);
  c.step(0, 0, 0, -1, DT, 0, 0, -1e6);
  chainPath(ctx, c, 0, 0, 4, 2, 6);
  assert.equal(pts.length, 5 * 2 + 1 + 1);
  assert.equal(pts[0][0], 'M');
  assert.equal(pts.at(-1)[0], 'Z');
  // Half-width 4 at the pin, 2 at the end (hanging straight down: offsets are along x).
  assert.ok(Math.abs(Math.abs(pts[0][1]) - 4) < 1e-6);
  assert.ok(Math.abs(Math.abs(pts[4][1]) - 2) < 1e-6);
});
