// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Flock, DEFAULT_PARAMS, SphereCollider, CapsuleCollider, BoxCollider } from '../src/index.js';

const DT = 1 / 60;
function hover(n = 1500, seed = 1) {
  const f = new Flock(n + 50, { seed });
  f.flow = [0, 0, 0];
  f.target = [0, 40, 0];
  f.spawn(n, 0, 40, 0, 10);
  return f;
}
const run = (f, seconds, world) => { for (let i = 0; i < seconds * 60; i++) f.step(DT, world); };

test('same seed, same calls: identical flock (bit for bit, on one engine)', () => {
  const a = hover(800, 5), b = hover(800, 5);
  run(a, 3); run(b, 3);
  assert.deepEqual(a.pos, b.pos);
  assert.deepEqual(a.vel, b.vel);
  const c = hover(800, 6);
  run(c, 3);
  assert.notDeepEqual(a.pos, c.pos);
});

test('the counting-sort spatial hash lists every bird exactly once', () => {
  const f = hover(2000);
  f._buildGrid(2);
  const seen = new Uint8Array(f.count);
  for (let k = 0; k < f.count; k++) seen[f.sorted[k]]++;
  assert.ok(seen.every((v) => v === 1));
  for (let i = 0; i < f.count; i += 97) {
    const h = f.cellOf[i];
    let found = false;
    for (let k = f.cellStart[h]; k < f.cellStart[h + 1]; k++) if (f.sorted[k] === i) found = true;
    assert.ok(found, `bird ${i} in its cell`);
  }
});

test('a loose flock holds a cloud around the target, about the core radius', () => {
  const f = hover(2000);
  run(f, 8);
  const [cx, cy, cz] = f.centroid;
  assert.ok(Math.hypot(cx, cy - 40, cz) < 12, `centroid ${f.centroid}`);
  const core = f.coreRadius(0);
  assert.ok(f.radius > core * 0.5 && f.radius < core * 2, `radius ${f.radius} core ${core}`);
  assert.equal(f.count, 2000);
});

test('gathering pulls it into a much tighter ball; letting go blooms it back out', () => {
  const f = hover(2000);
  run(f, 5);
  const loose = f.radius;
  f.tightness = 1;
  run(f, 5);
  assert.ok(f.radius < loose * 0.5, `gathered ${f.radius} vs loose ${loose}`);
  f.tightness = 0;
  run(f, 6);
  assert.ok(f.radius > loose * 0.7, `bloomed ${f.radius}`);
});

test('the cloud follows a moved target', () => {
  const f = hover(1200);
  run(f, 3);
  f.target = [40, 45, 0];
  run(f, 10);
  assert.ok(f.centroid[0] > 25, `centroid x ${f.centroid[0]}`);
});

test('scatter bursts it outward and the scatter fades in about a second', () => {
  const f = hover(1500);
  run(f, 4);
  const before = f.radius;
  f.burst();
  assert.equal(f.scatter, 1);
  run(f, 0.5);
  assert.ok(f.radius > before * 1.3, `after burst ${f.radius} vs ${before}`);
  run(f, 1);
  assert.equal(f.scatter, 0);
});

test('a flowing flock travels with the flyway and never flies backwards along it', () => {
  const f = new Flock(1000, { seed: 2 });
  f.flow = [0, 0, 13]; // the title screen's speed
  f.target = [0, 40, 14];
  f.spawn(800, 0, 40, 0, 8, 0, 0, 13);
  for (let i = 0; i < 300; i++) {
    f.target[2] += 13 * DT;
    f.step(DT);
  }
  for (let i = 0; i < f.count; i++) assert.ok(f.vel[i * 3 + 2] >= 13 * 0.45 - 1e-3, `bird ${i} vz ${f.vel[i * 3 + 2]}`);
  assert.ok(f.centroid[2] > 40, `travelled ${f.centroid[2]}`);
});

test('birds avoid colliders, die inside them or on the ground, and report deaths', () => {
  const f = hover(1500);
  const deaths = [];
  f.onDeath = (x, y, z, vx, vy, vz, cause) => deaths.push(cause);
  const tree = new CapsuleCollider([0, 0, 0], [0, 60, 0], 3);
  run(f, 6, { colliders: [tree], groundAt: () => 0 });
  assert.ok(f.count < 1500 && f.count > 1200, `alive ${f.count}`);
  assert.equal(deaths.length, 1500 - f.count);
  assert.ok(deaths.every((c) => c === 1 || c === 2));
  const g = hover(1500);
  run(g, 6, { colliders: [tree], groundAt: () => 0, immortal: true });
  assert.equal(g.count, 1500);
});

test('collider signed distances and normals', () => {
  const out = new Float32Array(4);
  assert.ok(new SphereCollider(0, 0, 0, 2).sdf(3, 0, 0, out));
  assert.ok(Math.abs(out[0] - 1) < 1e-6 && Math.abs(out[1] - 1) < 1e-6);
  assert.equal(new SphereCollider(0, 0, 0, 2).sdf(50, 0, 0, out), false); // quick reject
  assert.ok(new CapsuleCollider([0, 0, 0], [0, 10, 0], 1).sdf(0, 5, 2, out));
  assert.ok(Math.abs(out[0] - 1) < 1e-6 && Math.abs(out[3] - 1) < 1e-6);
  const box = new BoxCollider(0, 0, 0, 2, 1, 3, Math.PI / 2);
  assert.ok(box.sdf(0, 0, 3, out)); // yawed 90 degrees: z now meets the 2 half extent
  assert.ok(Math.abs(out[0] - 1) < 1e-5 && Math.abs(out[3] - 1) < 1e-5, `${out}`);
  assert.ok(box.sdf(0, 0, 0, out) && out[0] < 0);
});

test('a predator makes nearby birds flee (the ripple)', () => {
  const a = hover(1500, 3), b = hover(1500, 3);
  run(a, 3); run(b, 3);
  const p = { x: a.centroid[0], y: a.centroid[1], z: a.centroid[2], r: 11, k: 260 };
  const near = (f) => { let c = 0; for (let i = 0; i < f.count; i++) if (Math.hypot(f.pos[i * 3] - p.x, f.pos[i * 3 + 1] - p.y, f.pos[i * 3 + 2] - p.z) < 6) c++; return c; };
  run(a, 1, { predators: [p] });
  run(b, 1);
  assert.ok(near(a) < near(b) * 0.6, `with falcon ${near(a)} vs without ${near(b)}`);
});

test('kill() swap-removes so live birds stay contiguous; spawn respects capacity', () => {
  const f = new Flock(10, { seed: 1 });
  assert.equal(f.spawn(15, 0, 0, 0), 10);
  const lastX = f.pos[9 * 3];
  f.kill(2, 0, true);
  assert.equal(f.count, 9);
  assert.equal(f.pos[2 * 3], lastX);
});

test('3,000 birds step in well under a frame on the CPU', () => {
  const f = hover(3000);
  run(f, 1);
  const t0 = performance.now();
  run(f, 1);
  const ms = (performance.now() - t0) / 60;
  assert.ok(ms < 12, `${ms.toFixed(2)} ms per step`);
  assert.equal(DEFAULT_PARAMS.wSep, 34);
});
