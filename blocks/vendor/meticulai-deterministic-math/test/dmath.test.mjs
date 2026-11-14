// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { DMath, selfCheck, bitsHex, GOLDEN, mulberry32 } from '../src/index.js';
import { makePendulum, stepPendulum } from '../demo/pendulum.js';

const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('matches the built-in Math to within a few ulps on 20,000 random inputs (as in Trick Shot)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < 20000; i++) {
    const x = rnd() * 400, y = rnd() * 50;
    assert.ok(close(DMath.sin(x), Math.sin(x), 1e-15), `sin ${x}`);
    assert.ok(close(DMath.cos(x), Math.cos(x), 1e-15), `cos ${x}`);
    assert.ok(close(DMath.atan2(y, x), Math.atan2(y, x), 1e-15), `atan2 ${y} ${x}`);
    const p = Math.abs(rnd()) * 3;
    assert.ok(close(DMath.pow(p, 1.25), Math.pow(p, 1.25), 1e-14), `pow ${p}`);
    const u = rnd();
    assert.ok(close(DMath.asin(u), Math.asin(u), 1e-14), `asin ${u}`);
    assert.ok(close(DMath.acos(u), Math.acos(u), 1e-14), `acos ${u}`);
    assert.ok(close(DMath.exp(y * 0.5), Math.exp(y * 0.5), 1e-15), `exp ${y}`);
    assert.ok(close(DMath.log(p + 1e-3), Math.log(p + 1e-3), 1e-15), `log ${p}`);
    if (Math.abs(Math.cos(x)) > 1e-3) assert.ok(close(DMath.tan(x), Math.tan(x), 1e-13), `tan ${x}`);
  }
});

test('known values', () => {
  assert.equal(DMath.atan2(0, -1), Math.PI);
  assert.equal(DMath.sin(0), 0);
  assert.equal(DMath.cos(0), 1);
  assert.equal(DMath.exp(0), 1);
  assert.equal(DMath.log(1), 0);
  assert.equal(DMath.atan(1), Math.PI / 4);
  assert.equal(DMath.atan2(1, 1), Math.PI / 4);
  assert.equal(DMath.sin(Math.PI / 2), 1);
  assert.equal(DMath.pow(3, 2), 9);
  assert.equal(DMath.pow(2, 0.5), Math.SQRT2);
  assert.equal(DMath.pow(5, 0), 1);
  assert.equal(DMath.hypot(3, 4), 5);
  assert.ok(close(DMath.log(Math.E), 1, 1e-16));
  assert.ok(close(DMath.pow(-2, 3), -8, 1e-15));
  assert.ok(close(DMath.asin(1), Math.PI / 2, 1e-16));
  assert.ok(close(DMath.acos(-1), Math.PI, 1e-16));
});

test('special values: NaN, infinities, signed zero, out of domain', () => {
  for (const fn of ['sin', 'cos', 'tan']) {
    assert.ok(Number.isNaN(DMath[fn](NaN)) && Number.isNaN(DMath[fn](Infinity)), fn);
  }
  assert.ok(Object.is(DMath.sin(-0), -0));
  assert.equal(DMath.atan2(0, -0), Math.PI);
  assert.equal(DMath.atan2(-0, -1), -Math.PI);
  assert.equal(DMath.atan2(1, 0), Math.PI / 2);
  assert.equal(DMath.atan(Infinity), Math.PI / 2);
  assert.equal(DMath.exp(1000), Infinity);
  assert.equal(DMath.exp(-1000), 0);
  assert.equal(DMath.log(0), -Infinity);
  assert.ok(Number.isNaN(DMath.log(-1)));
  assert.ok(Number.isNaN(DMath.asin(1.5)));
  assert.ok(Number.isNaN(DMath.pow(-2, 0.5)));
});

test('golden bits: every GOLDEN case gives exactly the recorded bits (the cross-engine contract)', () => {
  const r = selfCheck();
  assert.equal(r.total, GOLDEN.length);
  assert.deepEqual(r.failed, []);
  assert.equal(bitsHex(1), '3ff0000000000000');
});

test('cross-call stability: results do not depend on what was called before (shared scratch buffers)', () => {
  const rnd = mulberry32(42);
  const xs = Array.from({ length: 2000 }, () => (rnd() - 0.5) * 2000);
  const fns = ['sin', 'cos', 'tan', 'atan', 'exp', 'log', 'atan2', 'pow'];
  const call = (fn, x) => (fn === 'atan2' ? DMath.atan2(x, 3) : fn === 'pow' ? DMath.pow(Math.abs(x) + 1, 0.7) : fn === 'log' ? DMath.log(Math.abs(x) + 1e-6) : fn === 'exp' ? DMath.exp(x / 100) : DMath[fn](x));
  const forward = fns.map((fn) => xs.map((x) => bitsHex(call(fn, x))));
  // Interleaved, reversed and repeated: every value must come back bit-identical.
  for (let i = xs.length - 1; i >= 0; i--) {
    for (let k = fns.length - 1; k >= 0; k--) {
      assert.equal(bitsHex(call(fns[k], xs[i])), forward[k][i]);
      call(fns[(k + 3) % fns.length], xs[(i * 7) % xs.length]);
    }
  }
});

test('a chaotic simulation re-run with DMath gives the same bits; the frozen object cannot be changed', () => {
  const run = () => {
    const p = makePendulum(DMath);
    for (let i = 0; i < 50000; i++) stepPendulum(p, 1 / 240);
    return [p.a1, p.a2, p.w1, p.w2].map(bitsHex).join('');
  };
  assert.equal(run(), run());
  assert.ok(Object.isFrozen(DMath));
  assert.throws(() => { 'use strict'; DMath.sin = Math.sin; });
});

test('accuracy holds up to |x| ~ 1e5 (range reduction is simplified past ~1e6)', () => {
  for (const x of [12345.678, -54321.5, 99999.9]) {
    assert.ok(Math.abs(DMath.sin(x) - Math.sin(x)) < 1e-11, `sin ${x}`);
    assert.ok(Math.abs(DMath.cos(x) - Math.cos(x)) < 1e-11, `cos ${x}`);
  }
});
