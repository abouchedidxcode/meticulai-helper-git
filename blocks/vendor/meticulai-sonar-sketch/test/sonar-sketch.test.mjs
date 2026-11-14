// The sonar sketch's logic, without a GPU: ray directions, when and where points are born, range, targets, fading,
// the ring buffer's partial uploads, the per-frame budget (on a fake clock, so it is not flaky), ghosts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_GHOST, KIND_TARGET, SonarSketch, rayDirs, fromSolidSdf, bodySketch } from '../src/index.js';
import { caveDensity } from '../demo/cave.js';

// a hollow sphere of open space radius R round c (positive = rock)
const room = (R, cx = 0, cy = 0, cz = 0) => (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - R;
const FWD = { x: 0, y: 0, z: -1 };

/** a sketch on a hand-driven clock */
function rig(capacity) {
  const c = new SonarSketch({ capacity });
  const clock = { t: 0 };
  c.now = () => clock.t;
  return { c, clock };
}
/** run frames of dt until the sketch is done (or a cap) */
function run(c, clock, dt = 1 / 60, speed = 46, cap = 600) {
  let frames = 0;
  do { clock.t += dt; c.update(speed, 1000); frames++; } while (c.busy && frames < cap);
  return frames;
}
function points(c) {
  const pos = c.points.geometry.getAttribute('position').array;
  const info = c.points.geometry.getAttribute('aInfo').array;
  const out = [];
  for (let i = 0; i < c.capacity; i++) {
    if (info[i * 4] < -1e5) continue;
    out.push({ x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2], birth: info[i * 4], dn: info[i * 4 + 1], kind: info[i * 4 + 2], facing: info[i * 4 + 3] });
  }
  return out;
}
const close = (a, b, digits) => assert.ok(Math.abs(a - b) < 0.5 * 10 ** -digits, `${a} ~ ${b}`);

test('ray directions are unit vectors', () => {
  const n = 900, d = rayDirs(n, FWD, 0.3, new Float32Array(n * 3));
  for (let i = 0; i < n; i++) close(Math.hypot(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]), 1, 5);
});

test('ray directions lean forward and toward the horizontal, but still cover every direction', () => {
  const n = 900, d = rayDirs(n, FWD, 0.3, new Float32Array(n * 3));
  let ahead = 0, behind = 0, flat = 0, up = 0, down = 0;
  for (let i = 0; i < n; i++) {
    const z = d[i * 3 + 2], y = d[i * 3 + 1];
    if (z < 0) ahead++; else behind++;
    if (Math.abs(y) < 0.5) flat++;
    if (y > 0.85) up++;
    if (y < -0.85) down++;
  }
  assert.ok(ahead > behind * 1.3);
  assert.ok(behind > n * 0.2);
  assert.ok(flat > n * 0.56); // a uniform sphere puts half within |y| < 0.5
  assert.ok(up > 5 && down > 5);
});

test('ray directions turn between pings so the sketches interleave', () => {
  const n = 900;
  const d = rayDirs(n, FWD, 0.3, new Float32Array(n * 3)), e = rayDirs(n, FWD, 1.1, new Float32Array(n * 3));
  assert.ok(Math.abs(e[0] - d[0]) + Math.abs(e[2] - d[2]) > 0.05);
});

test('draws the walls of a room, each point when the front reaches it', () => {
  const { c, clock } = rig();
  c.ping({ x: 0, y: 0, z: 0, t0: 0, range: 34 }, room(18), FWD);
  for (let k = 0; k < 18; k++) { clock.t += 1 / 60; c.update(46, 1000); } // front at 13.8 m: nothing yet
  assert.equal(points(c).length, 0);
  run(c, clock);
  const pts = points(c), s = c.stats();
  assert.equal(s.hitsLastPing, c.rays);
  assert.equal(s.raysLastPing, c.rays);
  assert.equal(pts.length, c.rays * 3); // one point per hit plus two satellites
  for (const p of pts) {
    assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 18) < 0.6);
    assert.ok(p.birth * 46 >= 17.5); // born no earlier than the front got there
    assert.ok(p.birth < 18 / 46 + 0.12); // and within a few frames of it
    close(p.dn, 18 / 34, 1);
  }
  for (const p of pts.filter((_, i) => i % 3 === 0)) assert.ok(p.facing > 0.95); // a sphere's wall faces its centre
});

test('reaches no further than the ping', () => {
  const { c, clock } = rig();
  c.ping({ x: 0, y: 0, z: 0, t0: 0, range: 34 }, room(60), FWD);
  run(c, clock);
  assert.equal(points(c).length, 0);
  assert.equal(c.busy, false);
});

test('marks targets in range in amber, skipping taken and out-of-range ones; decoys draw nothing', () => {
  const { c, clock } = rig();
  c.ping({ x: 0, y: 0, z: 0, t0: 0, range: 34, decoy: true }, room(18), FWD);
  run(c, clock);
  assert.equal(points(c).length, 0);
  c.ping({ x: 0, y: 0, z: 0, t0: clock.t, range: 34 }, room(18), FWD, [
    { pos: { x: 10, y: 0, z: 0 } }, { pos: { x: 0, y: 5, z: 0 }, taken: true }, { pos: { x: 0, y: 0, z: 50 } },
  ]);
  run(c, clock);
  const amber = points(c).filter((p) => p.kind === KIND_TARGET);
  assert.equal(amber.length, 12);
  for (const p of amber) assert.ok(Math.hypot(p.x - 10, p.y - 0.35, p.z) < 0.8);
});

test('fades out: nothing live once the glow has run its course', () => {
  const { c, clock } = rig();
  c.ping({ x: 0, y: 0, z: 0, t0: 0, range: 34 }, room(12), FWD, [{ pos: { x: 5, y: 0, z: 0 } }]);
  run(c, clock);
  assert.equal(c.stats().live, c.rays * 3 + 12);
  clock.t += c.life + 0.1;
  assert.equal(c.stats().live, 12); // target marks last longer
  clock.t += c.life;
  assert.equal(c.stats().live, 0);
});

test('ring-buffers: a small pool keeps the newest points and uploads only what changed', () => {
  const { c, clock } = rig(1000);
  c.ping({ x: 0, y: 0, z: 0, t0: 0, range: 34 }, room(15), FWD);
  run(c, clock);
  assert.equal(c.stats().live, 1000);
  const attr = c.points.geometry.getAttribute('aInfo');
  clock.t += 1 / 60;
  c.ping({ x: 0, y: 0, z: 0, t0: clock.t, range: 34 }, room(15), FWD);
  clock.t += 15 / 46 + 0.01;
  c.update(46, 1000);
  let words = 0;
  for (const r of attr.updateRanges) words += r.count;
  assert.ok(words > 0);
  assert.ok(words <= 1000 * 4);
});

test('keeps each frame inside its budget on a slow field, catching up over the next frames (fake clock)', () => {
  const { c, clock } = rig();
  c.budgetMs = 1;
  // the wall clock advances 0.002 ms per density call: deterministic, unlike timing a real machine
  let ms = 0;
  c.clock = () => ms;
  const base = room(18);
  const slow = (x, y, z) => { ms += 0.002; return base(x, y, z); };
  c.ping({ x: 0, y: 0, z: 0, t0: 0, range: 34 }, slow, FWD);
  clock.t = 1; // jump straight past the wall: everything is due at once
  let maxMs = 0, frames = 0;
  while (c.busy && frames < 2000) { c.update(46, 1000); maxMs = Math.max(maxMs, c.stats().msFrame); frames++; }
  assert.equal(c.busy, false);
  assert.ok(frames > 2, `took ${frames} frames`);
  assert.equal(c.stats().hitsLastPing, c.rays);
  // at most one 24-ray batch past the budget
  assert.ok(maxMs < 1 + 24 * 40 * 0.002, `worst frame ${maxMs} ms`);
});

test('is cheap on a real cave field: most rays find a wall, few samples a ray', () => {
  let worst = 0, hits = 0, rays = 0;
  for (const o of [[0, 0, 0], [3, -1, -12], [20, 1, 2], [-12, 3, 5], [-4, -12, -14]]) {
    const { c, clock } = rig();
    c.ping({ x: o[0], y: o[1], z: o[2], t0: 0, range: 34 }, caveDensity, FWD);
    let calls = 0;
    while (c.busy) { clock.t += 1 / 60; c.update(46, 1000); calls += c.stats().callsFrame; }
    worst = Math.max(worst, calls / c.rays);
    hits += c.stats().hitsLastPing; rays += c.rays;
  }
  assert.ok(hits / rays > 0.5, `hit ratio ${hits / rays}`);
  assert.ok(worst < 45, `worst ${worst} samples a ray`);
});

test('fromSolidSdf flips an SDF of solids into the rock-positive field', () => {
  const ball = (x, y, z) => Math.hypot(x, y, z) - 2; // a solid ball
  const f = fromSolidSdf(ball);
  assert.ok(f(0, 0, 0) > 0);
  assert.ok(f(5, 0, 0) < 0);
});

const shape = bodySketch({ length: 40 });
const n = shape.length / 3;
const ghost = (c) => c.ghost({
  ping: { x: 0, y: 0, z: 0, t0: 0 }, head: { x: 0, y: 0, z: -40 }, vel: { x: 6, y: 0, z: 0 }, at: 40 / 46,
  shape, length: 40, sway: 1.3, echoes: 2, echoGap: 1, gain: 1,
});
const ghosts = (c) => points(c).filter((p) => p.kind === KIND_GHOST);

test('the stand-in body is a few hundred points, as long as asked', () => {
  assert.ok(n > 250 && n < 500);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, shape[i * 3]); hi = Math.max(hi, shape[i * 3]); }
  assert.ok(hi < 1);
  assert.ok(hi - lo > 40 * 0.95);
});

test('a ghost appears as the front reaches it, then fainter returns follow further along its path', () => {
  const { c, clock } = rig();
  ghost(c);
  clock.t = 0.5; c.update(46, 1000);
  assert.equal(ghosts(c).length, 0); // the front is at 23 m, the body 40-60 m out
  clock.t = 1.0; c.update(46, 1000);
  const early = ghosts(c).length;
  assert.ok(early > 0 && early < n);
  run(c, clock);
  const all = ghosts(c);
  assert.ok(all.length > n * 1.6);
  const first = all.filter((p) => p.facing === 1);
  assert.equal(first.length, n);
  const near = first.filter((p) => Math.hypot(p.x, p.y, p.z) < 44), far = first.filter((p) => Math.hypot(p.x, p.y, p.z) > 52);
  assert.ok(Math.max(...near.map((p) => p.birth)) < Math.min(...far.map((p) => p.birth))); // nearer part first
  const xs = first.map((p) => p.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 40 * 0.9); // spans the body, across the ping's line
  const echo = all.filter((p) => p.facing < 1);
  assert.ok(echo.length > n * 0.6);
  assert.ok(Math.max(...echo.map((p) => p.facing)) < 0.6);
  const mean = (a) => a.reduce((k, p) => k + p.x, 0) / a.length;
  assert.ok(mean(echo) > mean(first) + 4); // further along (+x, the way it swims)
  assert.ok(Math.min(...echo.map((p) => p.birth)) > Math.max(...first.map((p) => p.birth)) - 0.1);
});

test('a ghost drifts with the swimmer as it fades; the rock does not; it shows faintly through rock', () => {
  const { c, clock } = rig();
  c.ping({ x: 0, y: 0, z: 0, t0: 0, range: 34 }, room(20), FWD);
  ghost(c);
  run(c, clock);
  const vel = c.points.geometry.getAttribute('aVel').array, info = c.points.geometry.getAttribute('aInfo').array;
  let rock = 0, gh = 0;
  for (let i = 0; i < c.capacity; i++) {
    if (info[i * 4] < -1e5) continue;
    if (info[i * 4 + 2] === KIND_GHOST) { close(vel[i * 3], 6 * 0.85, 4); gh++; } else { assert.equal(vel[i * 3], 0); rock++; }
  }
  assert.ok(rock > 100 && gh > n);
  assert.equal(c.mat.depthTest, true);
  assert.ok(c.mat.vertexShader.includes('position + aVel * age'));
  assert.equal(c.points.children[0], c.xray);
  assert.equal(c.xrayMat.depthTest, false);
  assert.equal(c.xrayMat.uniforms.uXray.value, 1);
  assert.equal(c.mat.uniforms.uXray.value, 0);
  assert.equal(c.xrayMat.uniforms.uTime, c.mat.uniforms.uTime);
  assert.equal(c.xrayMat.uniforms.uPx, c.mat.uniforms.uPx);
  clock.t += c.life + 0.5;
  assert.equal(c.stats().live, 0);
});

test('clear() forgets a ghost still to come', () => {
  const { c, clock } = rig();
  ghost(c);
  assert.equal(c.busy, true);
  c.clear();
  assert.equal(c.busy, false);
  run(c, clock);
  assert.equal(ghosts(c).length, 0);
});
