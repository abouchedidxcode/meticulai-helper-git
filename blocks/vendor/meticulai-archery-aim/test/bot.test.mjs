import test from 'node:test';
import assert from 'node:assert/strict';
import { runBand } from '../tools/bot.mjs';

// The source game's own bot measured 91 to 97 % at 30 to 150 m for a person-like aim at riders galloping across.
// This headless version (simpler bodies: no shields, no bob) must at least keep that promise.
test('a person-like aim from a cantering horse hits riders crossing at 12.5 m/s, 30 to 150 m', () => {
  for (const dist of [30, 60, 100, 150]) {
    const r = runBand({ dist, mode: 'human', shots: 120, seed: 3 });
    assert.ok(r.rider >= 0.9, `${dist} m: ${(r.rider * 100).toFixed(0)} % on the one aimed at`);
  }
});

test('the help is what makes long shots fair: without it a person misses most at 150 m', () => {
  const on = runBand({ dist: 150, mode: 'human', shots: 120, seed: 5 });
  const off = runBand({ dist: 150, mode: 'human', shots: 120, seed: 5, help: false });
  assert.ok(on.rider - off.rider > 0.4, `with ${(on.rider * 100).toFixed(0)} %, without ${(off.rider * 100).toFixed(0)} %`);
});

test('a careless aim (0.7 degrees off) still hits most at 60 m', () => {
  const r = runBand({ dist: 60, mode: 'careless', shots: 120, seed: 9 });
  assert.ok(r.any >= 0.75, `${(r.any * 100).toFixed(0)} %`);
});
