// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sphere, ellipsoid, roundCone, capsule, roundBox, cylinder, smin, smax, sunion, subtract, shell,
  meshSDF, meshParts, ellipsoidPart, roundConePart, evalParts,
  CaveField, makeCaveLayout, caveTube, buildChunk, chunkKey, chunkCoords, chunkOf, liveChunks,
} from '../src/index.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

/** For every triangle: face normal (from winding) should agree with the vertex normals. */
function windingAgreement(m) {
  const P = m.positions, N = m.normals, I = m.indices;
  let ok = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nz = N[a + 2] + N[b + 2] + N[c + 2];
    if (fx * nx + fy * ny + fz * nz > 0) ok++;
  }
  return ok / (I.length / 3);
}

test('primitive distances at known points', () => {
  close(sphere(0, 0, 0, 1)(2, 0, 0), 1);
  close(sphere(1, 2, 3, 0.5)(1, 2, 3), -0.5);
  close(roundBox(0, 0, 0, 1, 1, 1, 0)(3, 0, 0), 2);
  close(roundBox(0, 0, 0, 1, 1, 1, 0)(0, 0, 0), -1);
  close(roundBox(0, 0, 0, 1, 1, 1, 0.2)(2, 2, 0), Math.hypot(1.2, 1.2) - 0.2, 1e-9); // rounded corner
  close(capsule(0, 0, 0, 0, 2, 0, 0.5)(1, 1, 0), 0.5, 1e-5);
  close(capsule(0, 0, 0, 0, 2, 0, 0.5)(0, 3, 0), 0.5, 1e-5);
  close(roundCone(0, 0, 0, 0, 1, 0, 0.5, 0.5)(0, -1, 0), 0.5, 1e-9);
  close(cylinder(0, 0, 0, 1, 1)(2, 0, 0), 1);
  close(cylinder(0, 0, 0, 1, 1)(0, 3, 0), 2);
  // ellipsoid: exact on the axes' surface points, sphere when radii are equal
  close(ellipsoid(0, 0, 0, 2, 1, 1)(2, 0, 0), 0, 1e-9);
  close(ellipsoid(0, 0, 0, 1, 1, 1)(3, 0, 0), sphere(0, 0, 0, 1)(3, 0, 0), 1e-9);
  // parts versions agree with the functional ones
  close(ellipsoidPart([0, 0, 0], [2, 1, 1]).sdf(0, 0, 3), ellipsoid(0, 0, 0, 2, 1, 1)(0, 0, 3), 1e-9);
  close(roundConePart([0, 0, 0], [1, 0, 0], 0.3, 0.1).sdf(0.5, 1, 0), roundCone(0, 0, 0, 1, 0, 0, 0.3, 0.1)(0.5, 1, 0), 1e-9);
});

test('smooth union stays within its bounds', () => {
  for (const [a, b, k] of [[0.3, 0.5, 0.2], [1, 1, 0.5], [-0.2, 0.1, 0.3], [2, -1, 0.1], [0.4, 0.4, 0]]) {
    const s = smin(a, b, k);
    assert.ok(s <= Math.min(a, b) + 1e-12, 'never above the hard min');
    assert.ok(s >= Math.min(a, b) - k / 4 - 1e-12, 'never more than k/4 below it');
    close(smax(a, b, k), -smin(-a, -b, k));
  }
  // far apart (beyond k) it is exactly the hard min
  close(smin(0, 5, 1), 0);
  // a blended pair of spheres has a fatter waist than the hard union
  const hard = sunion(0, sphere(-1, 0, 0, 0.8), sphere(1, 0, 0, 0.8));
  const soft = sunion(0.5, sphere(-1, 0, 0, 0.8), sphere(1, 0, 0, 0.8));
  assert.ok(soft(0, 0.5, 0) < hard(0, 0.5, 0));
  // subtract and shell
  assert.ok(subtract(0, sphere(0, 0, 0, 1), sphere(0, 0, 0, 0.5))(0, 0, 0) > 0, 'hollowed centre is outside');
  assert.ok(shell(sphere(0, 0, 0, 1), 0.1)(0, 0, 0) > 0, 'shell centre is outside');
});

test('meshSDF: a sphere comes out closed, on the surface, wound outward', () => {
  const r = 0.5, cell = 0.04;
  const f = sphere(0, 0, 0, r);
  const m = meshSDF(f, [-0.6, -0.6, -0.6], [0.6, 0.6, 0.6], cell);
  const nv = m.positions.length / 3, nt = m.indices.length / 3;
  assert.ok(nt > 1000 && nt < 20000, `triangle count ${nt}`);
  let worst = 0;
  for (let v = 0; v < nv; v++) {
    const d = Math.abs(f(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]));
    worst = Math.max(worst, d);
    // normal points away from the centre
    const dot = m.positions[v * 3] * m.normals[v * 3] + m.positions[v * 3 + 1] * m.normals[v * 3 + 1] + m.positions[v * 3 + 2] * m.normals[v * 3 + 2];
    assert.ok(dot > 0);
  }
  assert.ok(worst < cell * 0.05, `vertices sit on the surface (worst ${worst})`);
  assert.ok(windingAgreement(m) > 0.999, 'faces wound outward');
  // closed: every edge is shared by exactly two triangles
  const edges = new Map();
  for (let t = 0; t < m.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = m.indices[t + e], b = m.indices[t + ((e + 1) % 3)];
      const k = a < b ? a * 1e7 + b : b * 1e7 + a;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  assert.ok([...edges.values()].every((c) => c === 2), 'watertight');
  // open convex shape: almost no occlusion
  const meanAo = m.ao.reduce((s, x) => s + x, 0) / nv;
  assert.ok(meanAo > 0.95, `ao on a sphere ${meanAo}`);
});

test('meshSDF: narrow band gives the same mesh as the full grid on a true SDF', () => {
  const f = sunion(0.1, sphere(-0.2, 0, 0, 0.3), roundBox(0.25, 0, 0, 0.2, 0.2, 0.2, 0.05));
  const a = meshSDF(f, [-0.6, -0.4, -0.4], [0.6, 0.4, 0.4], 0.03, { ao: false });
  const b = meshSDF(f, [-0.6, -0.4, -0.4], [0.6, 0.4, 0.4], 0.03, { ao: false, narrowBand: false });
  assert.equal(a.indices.length, b.indices.length);
});

test('meshParts: a parts list meshes like the same shape written as a function', () => {
  const parts = [
    { prim: ellipsoidPart([0, 0, 0], [0.3, 0.2, 0.2]), k: 0 },
    { prim: roundConePart([0.2, 0, 0], [0.6, 0.1, 0], 0.08, 0.04), k: 0.05 },
    { prim: ellipsoidPart([0, 0.2, 0], [0.1, 0.1, 0.1]), op: 'sub', k: 0.02 },
  ];
  const m = meshParts(parts, { cell: 0.02 });
  assert.ok(m.indices.length / 3 > 500);
  let worst = 0;
  for (let v = 0; v < m.positions.length; v += 3) worst = Math.max(worst, Math.abs(evalParts(parts, m.positions[v], m.positions[v + 1], m.positions[v + 2])));
  assert.ok(worst < 0.002, `on the surface (worst ${worst})`);
  assert.ok(windingAgreement(m) > 0.99);
});

test('cave field is deterministic for a seed', () => {
  const L1 = makeCaveLayout(1234), L2 = makeCaveLayout(1234), L3 = makeCaveLayout(99);
  assert.deepEqual(L1.tubes, L2.tubes);
  assert.notDeepEqual(L1.tubes, L3.tubes);
  const f1 = new CaveField({ seed: 1234, tubes: L1.tubes, floorY: L1.floorY });
  const f2 = new CaveField({ seed: 1234, tubes: L2.tubes, floorY: L2.floorY });
  for (let i = 0; i < 200; i++) {
    const x = Math.sin(i) * 40, y = -i * 3, z = -i * 2;
    assert.equal(f1.density(x, y, z), f2.density(x, y, z));
  }
  // the route itself is open space and it heads down and away (toward -z)
  const p = L1.path;
  let open = 0, n = 0;
  for (let i = 1; i < p.length; i++)
    for (let t = 0; t < 1; t += 0.25) {
      n++;
      if (f1.density(p[i - 1].x + (p[i].x - p[i - 1].x) * t, p[i - 1].y + (p[i].y - p[i - 1].y) * t, p[i - 1].z + (p[i].z - p[i - 1].z) * t) < -1) open++;
    }
  assert.ok(open / n > 0.95, `route open ${open}/${n}`);
  assert.ok(p[p.length - 1].z < -150);
  assert.ok(f1.density(1000, 0, 1000) > 0, 'far away is rock');
});

test('chunk keys round-trip', () => {
  for (const [i, j, k] of [[0, 0, 0], [-3, -32, 5], [12, -1, -40]]) assert.deepEqual(chunkCoords(chunkKey(i, j, k)), { i, j, k });
});

test('a cave chunk meshes in Node, wound outward, and neighbours tile without gaps', () => {
  const field = new CaveField({ seed: 7, tubes: [caveTube([-30, 0, 0], [30, 0, 0], 6, 6), caveTube([0, 0, 0], [0, 0, -30], 5, 4, 'neck')] });
  assert.ok(field.density(0, 0, 0) < 0 && field.density(0, 20, 0) > 0);
  const live = liveChunks(field);
  const keyA = chunkKey(chunkOf(-1), chunkOf(0), chunkOf(0));
  const keyB = chunkKey(chunkOf(1), chunkOf(0), chunkOf(0));
  assert.ok(live.has(keyA) && live.has(keyB));
  const t0 = performance.now();
  const a = buildChunk(field, keyA);
  const ms = performance.now() - t0;
  const b = buildChunk(field, keyB);
  assert.ok(a.indices.length / 3 > 300, `tris ${a.indices.length / 3}`);
  assert.ok(ms < 2000, `chunk took ${ms} ms`);
  assert.ok(windingAgreement(a) > 0.97, `winding ${windingAgreement(a)}`);
  // the shared face at x = 0: both chunks have vertices there, so there is no crack
  const near0 = (m) => { let c = 0; for (let v = 0; v < m.positions.length; v += 3) if (Math.abs(m.positions[v]) < 1) c++; return c; };
  assert.ok(near0(a) > 10 && near0(b) > 10);
  // an all-rock chunk is empty and cheap
  const far = buildChunk(field, chunkKey(20, 20, 20));
  assert.equal(far.indices.length, 0);
});
