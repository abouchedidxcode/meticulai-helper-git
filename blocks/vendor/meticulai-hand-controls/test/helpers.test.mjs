// Pure helpers: One Euro filter, mirroring, screen mapping, pinch hysteresis, grip speed, hold zone.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OneEuroFilter, OneEuroFilter2D, CURSOR_FILTER, fromMediaPipe, toScreen, fromScreen, DEFAULT_REGION,
  PinchClick, Grip, HoldZone, cameraProblem, PRIVACY_LINE, syntheticHand, SYNTHETIC_POSES, mixPoses,
} from '../src/index.js';

describe('One Euro filter', () => {
  it('passes the first sample through and kills small jitter at rest', () => {
    const f = new OneEuroFilter(CURSOR_FILTER);
    assert.equal(f.filter(0.5, 0), 0.5);
    let seed = 7, maxDev = 0;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    for (let i = 1; i < 120; i++) maxDev = Math.max(maxDev, Math.abs(f.filter(0.5 + rnd() * 0.01, i / 30) - 0.5));
    assert.ok(maxDev < 0.003, `jitter left: ${maxDev}`);
  });

  it('follows a fast move with little lag', () => {
    const f = new OneEuroFilter(CURSOR_FILTER);
    let out = 0;
    for (let i = 0; i <= 15; i++) out = f.filter(i / 15, i / 30); // 1 screen in 0.5 s
    assert.ok(out > 0.85, `lagged to ${out}`);
  });

  it('survives duplicate timestamps and long stalls', () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    assert.ok(Number.isFinite(f.filter(1, 0)));
    assert.ok(Number.isFinite(f.filter(1, 100)));
  });

  it('2D: a straight diagonal stays straight', () => {
    const f = new OneEuroFilter2D();
    for (let i = 0; i <= 20; i++) {
      const p = f.filter(i / 20, (i / 20) * 0.5, i / 30);
      if (i > 0) assert.ok(Math.abs(p.y / p.x - 0.5) < 1e-9);
    }
  });
});

describe('mirroring and mapping', () => {
  it('fromMediaPipe mirrors x and flips the handedness label', () => {
    const raw = [{ landmarks: [{ x: 0.2, y: 0.3, z: 0 }], world: [{ x: 0.01, y: 0, z: 0 }], label: 'Left', score: 0.9 }];
    const [h] = fromMediaPipe(raw, 16 / 9);
    assert.ok(Math.abs(h.landmarks[0].x - 0.8) < 1e-12);
    assert.equal(h.world[0].x, -0.01);
    assert.equal(h.handedness, 'Right');
    const [u] = fromMediaPipe(raw, 1, { mirror: false, flipLabel: false });
    assert.equal(u.landmarks[0].x, 0.2);
    assert.equal(u.handedness, 'Left');
  });

  it('toScreen maps the comfortable region to the full screen, clamped; fromScreen inverts it', () => {
    assert.deepEqual(toScreen({ x: DEFAULT_REGION.x0, y: DEFAULT_REGION.y0 }), { x: 0, y: 0 });
    assert.deepEqual(toScreen({ x: 1, y: 1 }), { x: 1, y: 1 });
    const p = fromScreen({ x: 0.3, y: 0.6 });
    const q = toScreen(p);
    assert.ok(Math.abs(q.x - 0.3) < 1e-12 && Math.abs(q.y - 0.6) < 1e-12);
  });

  it('syntheticHand puts the palm centre where you ask', () => {
    const h = syntheticHand(0.3, 0.7, SYNTHETIC_POSES.open);
    const palm = [0, 5, 9, 13, 17];
    const cx = palm.reduce((a, i) => a + h.landmarks[i].x, 0) / 5, cy = palm.reduce((a, i) => a + h.landmarks[i].y, 0) / 5;
    assert.ok(Math.abs(cx - 0.3) < 1e-9 && Math.abs(cy - 0.7) < 1e-9);
    assert.equal(h.landmarks.length, 21);
    assert.deepEqual(mixPoses(SYNTHETIC_POSES.open, SYNTHETIC_POSES.fist, 0.5).curl, [0.5, 0.5, 0.5, 0.5, 0.5]);
  });
});

describe('pinch hysteresis', () => {
  it('clicks once on the way in, ignores wobble, re-arms only after a clear release', () => {
    const p = new PinchClick();
    const seq = [0.1, 0.5, 0.73, 0.6, 0.5, 0.75, 0.45, 0.4, 0.8];
    assert.deepEqual(seq.map((s) => p.update(s)), [false, false, true, false, false, false, false, false, true]);
  });
  it('losing the hand releases it', () => {
    const p = new PinchClick();
    p.update(0.9);
    p.update(null);
    assert.equal(p.update(0.9), true);
  });
});

describe('grip (open <-> fist) with close speed', () => {
  const closeOver = (ms) => {
    const g = new Grip();
    let ev = null;
    for (let t = 0; t <= 1000 + ms + 100; t += 1000 / 30) {
      const o = t < 1000 ? 1 : Math.max(0, 1 - (t - 1000) / ms);
      ev = g.update(o, t) ?? ev;
      if (ev) break;
    }
    return ev;
  };
  it('a slow close is a catch, a snatch is frantic', () => {
    const slow = closeOver(400), fast = closeOver(60);
    assert.equal(slow.type, 'close');
    assert.equal(slow.kind, 'slow');
    assert.ok(slow.durationMs > 250 && slow.durationMs < 550, `slow ${slow.durationMs}`);
    assert.equal(fast.kind, 'frantic');
  });
  it('a hand that appears closed does not fire a close; opening fires open', () => {
    const g = new Grip();
    assert.equal(g.update(0.1, 0), null);
    assert.equal(g.state, 'closed');
    assert.equal(g.update(0.5, 33), null); // between the thresholds: no chatter
    assert.deepEqual(g.update(0.7, 66), { type: 'open' });
  });
});

describe('hold zone', () => {
  it('fills while inside, forgives a short dropout, drains when you leave', () => {
    const z = new HoldZone(1.2, 0.25);
    let done = false;
    for (let i = 0; i < 30; i++) done = z.update(true, 1 / 30) || done; // 1.0 s
    z.update(false, 0.2); // dropout shorter than grace
    assert.ok(z.progress > 0.8);
    for (let i = 0; i < 8 && !done; i++) done = z.update(true, 1 / 30);
    assert.equal(done, true);
  });
});

describe('player-facing text', () => {
  it('camera messages are plain and always point at a fallback', () => {
    for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'NotSupportedError', 'Weird']) {
      const m = cameraProblem({ name }, 'the mouse');
      assert.match(m, /You can still play with the mouse\.$/);
    }
    assert.match(cameraProblem({ name: 'NotSupportedError' }), /https/);
    assert.match(PRIVACY_LINE, /never leaves this device/);
  });
});
