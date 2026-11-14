// The pure rules, ported from the game's own tests.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Grip, TUNING, VALUE, addToJar, classifyClose, closeDuration, duskAt, jarGlow, newStats, pairCaught, raresDue, screenDist, targetCommon, verdict, within } from '../src/rules.js';

/** Feeds a linear openness ramp from 1 to 0 over `ms` at `dt` ms per frame; returns the close event. */
function ramp(ms, dt = 33) {
  const g = new Grip();
  let t = 0, ev = null;
  for (let i = 0; i < 10; i++) { t += dt; g.update(1, t); }
  const n = Math.max(1, Math.round(ms / dt));
  for (let i = 1; i <= n + 3; i++) { t += dt; const r = g.update(Math.max(0, 1 - i / n), t); if (r) ev = r; }
  return ev;
}

describe('grip', () => {
  test('a slow close is a catch, a snatch is frantic', () => {
    assert.equal(ramp(400).kind, 'slow');
    assert.equal(ramp(250).kind, 'slow');
    assert.equal(ramp(60).kind, 'frantic');
    assert.equal(ramp(90, 16.7).kind, 'frantic');
    assert.equal(ramp(400).type, 'close');
  });
  test('the estimate tracks the real close time at 30 and 60 fps', () => {
    for (const dt of [33, 16.7]) {
      const e = ramp(400, dt);
      assert.ok(e.durationMs > 300 && e.durationMs < 520, `${e.durationMs}`);
    }
  });
  test('opening after a close reports open; a hand that appears closed does not fire a close', () => {
    const g = new Grip();
    assert.equal(g.update(0.1, 0), null);
    assert.equal(g.state, 'closed');
    assert.deepEqual(g.update(0.9, 33), { type: 'open' });
  });
  test('hysteresis: wobbling between the thresholds fires nothing', () => {
    const g = new Grip();
    g.update(1, 0);
    for (let i = 1; i < 30; i++) assert.equal(g.update(i % 2 ? 0.45 : 0.55, i * 33), null);
  });
  test('closeDuration handles a hand that never opened fully', () => {
    const d = closeDuration([{ t: 0, o: 0.65 }, { t: 100, o: 0.55 }, { t: 200, o: 0.45 }, { t: 300, o: 0.35 }], 0.4);
    assert.ok(d > 300);
  });
  test('classifyClose threshold', () => {
    assert.equal(classifyClose(TUNING.franticMs - 1), 'frantic');
    assert.equal(classifyClose(TUNING.franticMs + 1), 'slow');
  });
});

describe('space and scoring', () => {
  test('screen distance is measured in screen heights', () => {
    assert.ok(Math.abs(screenDist({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 2) - 1) < 1e-9);
    assert.deepEqual(within({ x: 0.5, y: 0.5 }, [{ x: 0.9, y: 0.5 }, { x: 0.52, y: 0.5 }, { x: 0.5, y: 0.6 }], 0.15, 16 / 9), [1, 2]);
  });
  test('the pair needs two different hands close in time', () => {
    assert.equal(pairCaught({ hand: 0, t: 0 }, { hand: 1, t: 500 }), true);
    assert.equal(pairCaught({ hand: 0, t: 0 }, { hand: 0, t: 100 }), false);
    assert.equal(pairCaught({ hand: 0, t: 0 }, { hand: 1, t: TUNING.pairWindowMs + 1 }), false);
    assert.equal(pairCaught(null, { hand: 1, t: 0 }), false);
  });
  test('jar scoring by kind', () => {
    const s = newStats();
    assert.equal(addToJar(s, ['common', 'gold', 'blue', 'pair', 'pair']), 1 + 5 + 3 + 4 + 4);
    assert.equal(s.caught, 5);
    assert.equal(s.byKind.pair, 2);
    assert.ok(VALUE.gold > VALUE.blue);
  });
  test('jar glow rises and saturates', () => {
    assert.equal(jarGlow(0), 0);
    assert.ok(jarGlow(10) > jarGlow(5));
    assert.ok(jarGlow(200) <= 1);
  });
  test('verdicts climb', () => {
    assert.notEqual(verdict(0), verdict(70));
  });
});

describe('the evening', () => {
  test('dusk changes fast early (visible in a short clip), reaches night mid-session, endless drifts', () => {
    assert.equal(duskAt(0, false), 0);
    assert.ok(duskAt(15, false) > 0.2);
    assert.ok(duskAt(30, false) > 0.4);
    assert.ok(Math.abs(duskAt(TUNING.nightS, false) - 1) < 1e-9);
    assert.equal(duskAt(TUNING.sessionS, false), 1);
    assert.equal(duskAt(1e5, false), 1);
    for (let t = 0; t < 2000; t += 7) { const e = duskAt(t, true); assert.ok(e > 0.4 && e < 0.85); }
  });
  test('every rare spawns once per session, endless repeats them', () => {
    const all = raresDue(0, TUNING.sessionS, false);
    assert.deepEqual(all.map((s) => s.kind).sort(), ['blue', 'blue', 'blue', 'gold', 'gold', 'pair', 'pair']);
    assert.equal(raresDue(0, TUNING.sessionS * 2, true).length, 14);
    assert.deepEqual(raresDue(10, 30, false), [{ t: 22, kind: 'blue' }]);
  });
  test('more fireflies as it darkens', () => {
    assert.ok(targetCommon(1) > targetCommon(0));
  });
  test('the tuning numbers are the ones the game shipped with', () => {
    assert.deepEqual({ ...TUNING }, {
      openAbove: 0.6, closedBelow: 0.4, franticMs: 120, captureRadius: 0.14, startleRadius: 0.34, jarRadius: 0.2,
      holdMs: 7000, slipWarnMs: 5000, sessionS: 180, nightS: 90, pairWindowMs: 1000, curiousRadius: 0.32,
    });
  });
});
